import { ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api';
import { captureText, messageText, requestMessages, safeValue, usageAttributes } from './capture.mjs';

export class HarnessCollector {
  constructor(tracer, { captureContent = true, maxChars = 16000, clock = Date.now, logger = console } = {}) {
    this.tracer = tracer;
    this.captureContent = captureContent;
    this.maxChars = maxChars;
    this.clock = clock;
    this.logger = logger;
    this.sessions = new Map();
    this.open = new Map();
  }

  safe(fn) {
    try { return fn(); }
    catch (error) { this.logger.warn('[dsh-probe] capture failed: ' + String(error?.name ?? 'Error')); }
  }

  state(sessionId) {
    if (!this.sessions.has(sessionId)) this.sessions.set(sessionId, { lastSeq: -1, turn: null });
    return this.sessions.get(sessionId);
  }

  make(key, parent, kind, name, time, sessionId) {
    if (this.open.has(key)) return this.open.get(key);
    if (this.open.size >= 1024) {
      this.logger.warn('[dsh-probe] active span limit reached');
      return null;
    }
    const context = parent ? trace.setSpan(ROOT_CONTEXT, parent.span) : ROOT_CONTEXT;
    const span = this.tracer.startSpan(name, {
      startTime: new Date(time),
      attributes: { 'openinference.span.kind': kind, 'session.id': sessionId, 'dsh.node.id': key },
    }, context);
    const entry = { key, span, start: time, sessionId, kind, ended: false };
    this.open.set(key, entry);
    return entry;
  }

  content(entry, direction, value) {
    if (!entry || entry.ended) return;
    const captured = captureText(value, { enabled: this.captureContent, maxChars: this.maxChars });
    entry.span.setAttribute(direction + '.value', captured.text);
    entry.span.setAttribute(direction + '.mime_type', 'text/plain');
    if (captured.truncated) entry.span.setAttribute('dsh.capture.truncated', true);
  }

  failure(entry, error) {
    if (!entry || entry.ended) return;
    const message = captureText(error?.message ?? error?.reason ?? error ?? 'Operation failed', { maxChars: 2000 }).text;
    const name = captureText(error?.name ?? error?.code ?? 'OperationError', { maxChars: 200 }).text;
    entry.span.setStatus({ code: SpanStatusCode.ERROR, message });
    entry.span.setAttribute('error.type', name);
    if (error?.code) entry.span.setAttribute('dsh.error.code', String(error.code));
    entry.span.recordException({
      name, message,
      ...(error?.stack ? { stack: captureText(error.stack, { maxChars: 8000 }).text } : {}),
    });
  }

  finish(entry, time, outcome = 'ok', error) {
    if (!entry || entry.ended) return;
    if (outcome === 'error') this.failure(entry, error);
    else if (outcome === 'ok') entry.span.setStatus({ code: SpanStatusCode.OK });
    else {
      entry.span.setAttribute('dsh.incomplete', true);
      entry.span.setAttribute('dsh.end_reason', outcome);
    }
    entry.ended = true;
    this.open.delete(entry.key);
    const end = Math.max(entry.start, time);
    if (time < entry.start) entry.span.setAttribute('dsh.clock_adjusted', true);
    entry.span.end(new Date(end));
    const ids = entry.span.spanContext();
    // Content is deliberately omitted from terminal logs.
    this.logger.log('[dsh-span]', JSON.stringify({
      traceId: ids.traceId, spanId: ids.spanId, kind: entry.kind,
      durationMs: end - entry.start, outcome,
    }));
  }

  closeChildren(prefix, time, reason) {
    let count = 0;
    for (const entry of [...this.open.values()].sort((a, b) => b.key.length - a.key.length)) {
      if (entry.key.startsWith(prefix + '/')) {
        entry.span.setAttribute('dsh.end_time.estimated', true);
        this.finish(entry, time, reason);
        count++;
      }
    }
    return count;
  }

  onEvent(session, event) {
    const sessionId = String(session.id), state = this.state(sessionId);
    if (Number.isInteger(event.seq)) {
      if (event.seq <= state.lastSeq) return;
      state.lastSeq = event.seq;
    }
    const data = event.data ?? {}, time = Number.isFinite(event.time) ? event.time : this.clock();
    if (event.type === 'turn/start') {
      if (state.turn) this.closeSession(sessionId, 'superseded', time, false);
      const key = sessionId + '/turn/' + data.turn;
      const root = this.make(key, null, 'AGENT', 'Turn ' + data.turn, time, sessionId);
      if (root) state.turn = { number: data.turn, key, root, step: null, inputs: [] };
      return;
    }
    const turn = state.turn;
    if (!turn) return;
    // A user/message payload IS the message, and carries no turn/step.
    if (event.type === 'user/message') {
      if (data.source?.kind === 'user' || data.source?.kind === undefined) {
        const text = captureText(messageText(data), { enabled: this.captureContent, maxChars: this.maxChars }).text;
        if (turn.inputs.length < 32) turn.inputs.push(text);
        this.content(turn.root, 'input', turn.inputs.join('\n\n'));
      }
      return;
    }
    if (data.turn !== turn.number) return;
    const stepKey = turn.key + '/step/' + data.step;
    switch (event.type) {
      case 'step/start': {
        if (turn.step) {
          this.closeChildren(turn.step.key, time, 'missing-step-end');
          this.finish(turn.step.entry, time, 'missing-step-end');
        }
        const entry = this.make(stepKey, turn.root, 'CHAIN', 'Step ' + data.step, time, sessionId);
        turn.step = entry ? { key: stepKey, number: data.step, entry, attempt: 0, toolError: false, modelError: false } : null;
        break;
      }
      case 'assistant/message':
        if (!data.interrupted) this.content(turn.root, 'output', messageText(data.message));
        else {
          this.content(turn.root, 'output', messageText(data.message));
          turn.root.span.setAttribute('dsh.interrupted', true);
        }
        break;
      case 'tool/call': {
        if (!turn.step || data.step !== turn.step.number || !data.callId) break;
        const entry = this.make(stepKey + '/tool/' + data.callId, turn.step.entry, 'TOOL', data.name, time, sessionId);
        if (!entry) break;
        entry.span.setAttribute('tool.name', data.name);
        entry.span.setAttribute('dsh.call_id', data.callId);
        this.content(entry, 'input', data.arguments);
        break;
      }
      case 'tool/result': {
        const entry = this.open.get(stepKey + '/tool/' + data.message?.toolCallId);
        if (!entry) { this.logger.warn('[dsh-probe] tool result without matching start'); break; }
        this.content(entry, 'output', data.message.content);
        const failed = data.message.isError === true;
        if (failed && turn.step) turn.step.toolError = true;
        this.finish(entry, time, failed ? 'error' : 'ok',
          data.error ? { ...data.error, message: data.error.reason ?? messageText(data.message) }
            : { name: 'ToolError', message: messageText(data.message) || 'Tool execution failed' });
        break;
      }
      case 'step/end': {
        const step = turn.step;
        if (!step || step.number !== data.step) break;
        const incomplete = this.closeChildren(step.key, time, 'missing-end-event');
        const failed = step.toolError || step.modelError;
        this.finish(step.entry, time, failed ? 'error' : incomplete ? 'missing-end-event' : 'ok',
          { name: 'StepError', message: 'This step contains an unsuccessful operation' });
        turn.step = null;
        break;
      }
      case 'turn/end': {
        this.closeChildren(turn.key, time, data.reason?.kind ?? 'missing-end-event');
        turn.root.span.setAttribute('dsh.turn.end_reason', data.reason?.kind ?? 'unknown');
        if (data.reason?.reason) turn.root.span.setAttribute('dsh.turn.cancel_cause',
          captureText(data.reason.reason, { maxChars: 1000 }).text);
        const reason = data.reason?.kind;
        this.finish(turn.root, time, reason === 'completed' ? 'ok' : reason === 'error' ? 'error' : reason ?? 'unknown',
          data.reason?.error);
        state.turn = null;
        break;
      }
    }
  }

  wrapStream(options, next) {
    let invoked = false;
    const nextOnce = () => { invoked = true; return next(); };
    try { return this.traceStream(options, nextOnce); }
    catch (error) {
      if (invoked) throw error;
      this.logger.warn('[dsh-probe] model capture setup failed; forwarding request');
      return nextOnce();
    }
  }

  traceStream(options, next) {
    const state = this.sessions.get(String(options.sessionId));
    const turn = state?.turn, step = turn?.step;
    // Auxiliary calls (titles/compaction) have separate purposes and are not attached to a conversational step.
    if (!step || options.purpose) return next();
    const entry = this.make(step.key + '/llm/' + (++step.attempt), step.entry,
      'LLM', 'LLM ' + options.model, this.clock(), String(options.sessionId));
    if (!entry) return next();
    entry.span.setAttribute('llm.model_name', String(options.model));
    entry.span.setAttribute('llm.provider', String(options.provider));
    entry.span.setAttribute('llm.system', String(options.provider));
    entry.span.setAttribute('dsh.llm.attempt', step.attempt);
    entry.span.setAttribute('dsh.llm.correlation', 'session-active-step');
    this.content(entry, 'input', requestMessages(options));
    if (this.captureContent && options.tools) {
      entry.span.setAttribute('dsh.llm.tool_schemas',
        captureText(options.tools, { maxChars: Math.min(this.maxChars, 4000) }).text);
    }
    const parameters = {};
    for (const key of ['temperature', 'maxTokens', 'reasoningEffort', 'stop']) {
      if (options[key] !== undefined) parameters[key] = options[key];
    }
    entry.span.setAttribute('llm.invocation_parameters', captureText(parameters, { maxChars: 2000 }).text);
    let stream;
    try { stream = next(); }
    catch (error) {
      step.modelError = true;
      this.safe(() => this.finish(entry, this.clock(), 'error', error));
      throw error;
    }
    const collector = this;
    return (async function* () {
      let finish, thrown, partial = 0;
      let remaining = collector.maxChars;
      const blocks = new Map();
      try {
        for await (const chunk of stream) {
          collector.safe(() => {
            if (entry.ended) return;
            if (chunk.type === 'usage') entry.span.setAttributes(usageAttributes(chunk.usage));
            if (chunk.type === 'finish') finish = chunk.reason;
            if (chunk.type === 'block-end') {
              if (blocks.has(chunk.index) || blocks.size < 64) {
                const oldSize = blocks.has(chunk.index) ? JSON.stringify(blocks.get(chunk.index)).length : 0;
                const captured = safeValue(chunk.block, {
                  maxChars: Math.min(collector.maxChars, remaining + oldSize), maxNodes: 64,
                });
                blocks.set(chunk.index, captured.value);
                if (captured.truncated) partial++;
                remaining = Math.max(0, collector.maxChars - JSON.stringify([...blocks.values()]).length);
              } else partial++;
            } else if (chunk.type === 'text-delta' && remaining > 0) {
              const block = blocks.get(chunk.index);
              if (!block && blocks.size >= 64) { partial++; return; }
              const text = String(chunk.text).slice(0, remaining);
              blocks.set(chunk.index, { type: 'text', text: (block?.text ?? '') + text });
              remaining -= text.length;
              if (text.length < String(chunk.text).length) partial++;
            }
          });
          // Forward the exact object, including error/aborted finish chunks.
          yield chunk;
        }
      } catch (error) {
        thrown = error;
        throw error;
      } finally {
        collector.safe(() => {
          collector.content(entry, 'output', [...blocks.values()]);
          if (partial || remaining === 0) entry.span.setAttribute('dsh.capture.truncated', true);
          const reason = thrown ? 'error' : finish?.kind;
          step.modelError = reason === 'error' && !options.signal?.aborted;
          if (reason) entry.span.setAttribute('dsh.llm.finish_reason', reason);
          const success = ['stop', 'tool-calls', 'max-tokens'].includes(reason);
          collector.finish(entry, collector.clock(),
            thrown && options.signal?.aborted ? 'aborted' : reason === 'error' ? 'error'
              : success ? 'ok' : reason ?? (options.signal?.aborted ? 'aborted' : 'consumer-stopped'),
            thrown ?? finish?.failure);
        });
      }
    })();
  }

  closeSession(sessionId, reason = 'session-disposed', time = this.clock(), remove = true) {
    const state = this.sessions.get(String(sessionId));
    if (state?.turn) {
      this.closeChildren(state.turn.key, time, reason);
      state.turn.root.span.setAttribute('dsh.end_time.estimated', true);
      this.finish(state.turn.root, time, reason);
      state.turn = null;
    }
    if (remove) this.sessions.delete(String(sessionId));
  }

  closeAll(reason = 'plugin-disposed') {
    for (const id of [...this.sessions.keys()]) this.closeSession(id, reason);
  }
}