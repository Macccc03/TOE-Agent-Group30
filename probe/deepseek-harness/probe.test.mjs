import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import assert from 'node:assert/strict';
import test from 'node:test';
import { captureText, usageAttributes } from './capture.mjs';
import { HarnessCollector } from './probe-core.mjs';
import { sendTeamRecords, spanToTeamRecord, TeamJsonExporter } from './team-exporter.mjs';

const logger = { log() {}, warn() {} };
function fixture(t, config = {}) {
  const memory = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memory)] });
  let now = 1700000000000;
  const collector = new HarnessCollector(provider.getTracer('test'), { logger, clock: () => ++now, ...config });
  const seqs = new Map();
  const event = (type, data, sessionId = 'session-a', seq) => {
    const current = seq ?? (seqs.get(sessionId) ?? 0) + 1;
    seqs.set(sessionId, current);
    collector.onEvent({ id: sessionId }, { type, data, time: ++now, seq: current });
  };
  t.after(async () => { collector.closeAll(); await provider.forceFlush(); await provider.shutdown(); });
  return { collector, event, records: () => memory.getFinishedSpans().map(spanToTeamRecord),
    async flush() { await provider.forceFlush(); } };
}
const chunks = async function* (values) { for (const value of values) yield value; };
async function run(f, values, options = {}) {
  const request = { sessionId: 'session-a', provider: 'test-provider', model: 'test-model',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], ...options };
  const received = [];
  for await (const chunk of f.collector.wrapStream(request, () => chunks(values))) received.push(chunk);
  return received;
}
function open(f, id = 'session-a') {
  f.event('turn/start', { turn: 1 }, id); f.event('step/start', { turn: 1, step: 1 }, id);
}
function close(f, id = 'session-a', reason = { kind: 'completed' }) {
  f.event('step/end', { turn: 1, step: 1 }, id); f.event('turn/end', { turn: 1, reason }, id);
}

test('captures question, tool IO, final answer and LLM hierarchy', async (t) => {
  const f = fixture(t); open(f);
  f.event('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: 'inspect 13812345678' }] });
  const values = [
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'c1', name: 'pwsh', arguments: '{"command":"pwd"}' } },
    { type: 'usage', usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 5, reasoningTokens: 3 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ];
  assert.equal((await run(f, values))[0], values[0]);
  f.event('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'pwsh', arguments: '{"password":"plain-secret"}' });
  f.event('tool/result', { turn: 1, step: 1, message: { toolCallId: 'c1', isError: false, content: [{ type: 'text', text: 'project directory' }] } });
  f.event('step/end', { turn: 1, step: 1 });
  f.event('step/start', { turn: 1, step: 2 });
  await run(f, [{ type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }, { type: 'finish', reason: { kind: 'stop' } }]);
  f.event('assistant/message', { turn: 1, step: 2, message: { content: [{ type: 'text', text: 'done' }] } });
  f.event('step/end', { turn: 1, step: 2 });
  f.event('turn/end', { turn: 1, reason: { kind: 'completed' } });
  await f.flush();
  const records = f.records(), root = records.find((r) => r.span_kind === 'AGENT');
  assert.equal(records.length, 6); assert.equal(root.output_data, 'done');
  assert.ok(root.input_data.includes('<REDACTED_PHONE>'));
  assert.ok(!JSON.stringify(records).includes('plain-secret'));
  assert.ok(records.find((r) => r.span_kind === 'TOOL').output_data.includes('project directory'));
  assert.equal(new Set(records.map((r) => r.trace_id)).size, 1);
  const ids = new Set(records.map((r) => r.span_id));
  for (const r of records) if (r.parent_id) assert.ok(ids.has(r.parent_id));
  const llms = records.filter((r) => r.span_kind === 'LLM');
  assert.equal(llms.length, 2); assert.equal(llms[0].raw_tokens.prompt_tokens, 125);
  assert.equal(llms[0].raw_tokens.total_tokens, 135); assert.equal(llms[0].raw_tokens.reasoning_tokens, 3);
  for (const r of records.filter((r) => r.span_kind !== 'LLM')) assert.deepEqual(r.raw_tokens, {});
  assert.deepEqual(llms[1].raw_tokens, {}); assert.equal(f.collector.open.size, 0);
});

test('usage includes disjoint cache fields once, with reported zero distinct from missing', () => {
  const a = usageAttributes({ inputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 1, outputTokens: 3, reasoningTokens: 2 });
  assert.equal(a['llm.token_count.prompt'], 7); assert.equal(a['llm.token_count.total'], 10);
  assert.equal(usageAttributes({ inputTokens: 0, outputTokens: 0 })['llm.token_count.total'], 0);
  assert.deepEqual(usageAttributes(undefined), {});
  assert.deepEqual(usageAttributes({ inputTokens: -1, outputTokens: 2 }), {});
});

test('redacts nested arguments, binary/reasoning blocks and circular or oversized content', () => {
  const captured = captureText([{ type: 'tool-call', arguments: '{"api_key":"not-prefixed-key","password":"plain-pass"}' }]);
  assert.ok(!captured.text.includes('not-prefixed-key')); assert.ok(!captured.text.includes('plain-pass'));
  assert.ok(captureText('sk-abcdefghijk 13812345678 Bearer abc.def').text.includes('<REDACTED'));
  const long = captureText('a'.repeat(10000), { maxChars: 300 });
  assert.equal(long.text.length, 300); assert.equal(long.truncated, true);
  const circular = {}; circular.self = circular;
  assert.ok(captureText(circular).text.includes('CIRCULAR'));
  const binary = captureText([{ type: 'image', data: 'binary-data' }, { type: 'reasoning', text: 'private-reasoning' }]);
  assert.ok(!binary.text.includes('private-reasoning')); assert.ok(!binary.text.includes('binary-data'));
});

test('forwards error finish chunks unchanged and records exception details', async (t) => {
  const f = fixture(t); open(f);
  const finish = { type: 'finish', reason: { kind: 'error', failure: { code: 'TIMEOUT', message: 'provider timeout' } } };
  assert.equal((await run(f, [finish]))[0], finish);
  close(f, 'session-a', { kind: 'error', error: { code: 'TIMEOUT', message: 'provider timeout' } });
  await f.flush();
  const model = f.records().find((r) => r.span_kind === 'LLM');
  assert.equal(model.status, 'ERROR'); assert.ok(model.error_message.includes('provider timeout'));
  assert.equal(model.metadata.events[0].name, 'exception');
});

test('preserves the original thrown iterator error', async (t) => {
  const f = fixture(t); open(f); const failure = new Error('original failure');
  const source = async function* () { throw failure; };
  await assert.rejects(async () => {
    for await (const ignored of f.collector.wrapStream({ sessionId: 'session-a', model: 'm', provider: 'p', messages: [] }, () => source())) {}
  }, (error) => error === failure);
  close(f, 'session-a', { kind: 'error', error: failure }); await f.flush();
  assert.equal(f.records().find((r) => r.span_kind === 'LLM').status, 'ERROR');
});

test('retry creates separate attempts and recovers the step status', async (t) => {
  const f = fixture(t); open(f);
  await run(f, [{ type: 'finish', reason: { kind: 'error', failure: { message: 'retryable' } } }]);
  await run(f, [{ type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }, { type: 'finish', reason: { kind: 'stop' } }]);
  close(f); await f.flush();
  const llms = f.records().filter((r) => r.span_kind === 'LLM');
  assert.equal(llms.length, 2); assert.equal(llms[0].parent_id, llms[1].parent_id);
  assert.equal(llms[1].raw_tokens.total_tokens, 12);
  assert.equal(f.records().find((r) => r.span_kind === 'CHAIN').status, 'OK');
});

test('cancellation closes unmatched tools with estimated timestamps', async (t) => {
  const f = fixture(t); open(f);
  f.event('tool/call', { turn: 1, step: 1, callId: 'lost', name: 'pwsh', arguments: '{}' });
  f.event('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } });
  await f.flush(); assert.equal(f.records().length, 3); assert.equal(f.collector.open.size, 0);
  const tool = f.records().find((r) => r.span_kind === 'TOOL');
  assert.equal(tool.status, 'UNSET'); assert.equal(tool.metadata.attributes['dsh.end_time.estimated'], true);
});

test('pairs parallel tools when results arrive in reverse order', async (t) => {
  const f = fixture(t); open(f);
  for (const id of ['a', 'b']) f.event('tool/call', { turn: 1, step: 1, callId: id, name: id, arguments: id });
  for (const id of ['b', 'a']) f.event('tool/result', { turn: 1, step: 1, message: { toolCallId: id, isError: false, content: [{ type: 'text', text: 'result-' + id }] } });
  close(f); await f.flush();
  const tools = f.records().filter((r) => r.span_kind === 'TOOL');
  assert.equal(tools.length, 2); assert.equal(tools[0].parent_id, tools[1].parent_id);
  for (const tool of tools) assert.ok(tool.output_data.includes('result-' + tool.name));
});

test('isolates interleaved sessions', async (t) => {
  const f = fixture(t); open(f); open(f, 'session-b');
  await Promise.all([
    run(f, [{ type: 'finish', reason: { kind: 'stop' } }]),
    run(f, [{ type: 'finish', reason: { kind: 'stop' } }], { sessionId: 'session-b' }),
  ]);
  close(f, 'session-b'); close(f); await f.flush();
  const roots = f.records().filter((r) => r.span_kind === 'AGENT');
  assert.notEqual(roots[0].trace_id, roots[1].trace_id);
  const lookup = new Map(f.records().map((r) => [r.span_id, r]));
  for (const r of f.records()) if (r.parent_id) assert.equal(lookup.get(r.parent_id).trace_id, r.trace_id);
});

test('ignores duplicate event sequence numbers', async (t) => {
  const f = fixture(t);
  f.event('turn/start', { turn: 1 }, 'session-a', 1); f.event('turn/start', { turn: 1 }, 'session-a', 1);
  f.event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 'session-a', 2);
  f.event('turn/end', { turn: 1, reason: { kind: 'completed' } }, 'session-a', 2);
  await f.flush(); assert.equal(f.records().length, 1);
});

test('content capture can be disabled', async (t) => {
  const f = fixture(t, { captureContent: false }); open(f);
  f.event('user/message', { content: [{ type: 'text', text: 'sensitive text' }] });
  await run(f, [{ type: 'block-end', index: 0, block: { type: 'text', text: 'response' } }, { type: 'finish', reason: { kind: 'stop' } }]);
  close(f); await f.flush();
  for (const r of f.records()) { assert.equal(r.input_data, ''); assert.equal(r.output_data, ''); }
});

test('bounded streaming output retains its preview after block-end', async (t) => {
  const f = fixture(t, { maxChars: 300 }); open(f);
  await run(f, [{ type: 'text-delta', index: 0, text: 'z'.repeat(5000) },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'z'.repeat(5000) } },
    { type: 'finish', reason: { kind: 'stop' } }]);
  close(f); await f.flush();
  const model = f.records().find((r) => r.span_kind === 'LLM');
  assert.ok(model.output_data.includes('zzzz')); assert.equal(model.metadata.capture_truncated, true);
  assert.ok(model.output_data.length <= 300);
});

test('skips auxiliary calls without changing the returned stream', async (t) => {
  const f = fixture(t); open(f);
  const source = chunks([]); let calls = 0;
  const result = f.collector.wrapStream({ sessionId: 'session-a', purpose: 'session-title' }, () => { calls++; return source; });
  assert.equal(result, source); assert.equal(calls, 1);
  close(f); await f.flush(); assert.equal(f.records().filter((r) => r.span_kind === 'LLM').length, 0);
});

test('telemetry setup failure still calls the real stream exactly once', async (t) => {
  const f = fixture(t); open(f);
  f.collector.tracer = { startSpan() { throw new Error('telemetry failed'); } };
  const source = chunks([]); let calls = 0;
  const result = f.collector.wrapStream({ sessionId: 'session-a', model: 'm', provider: 'p', messages: [] }, () => { calls++; return source; });
  assert.equal(result, source); assert.equal(calls, 1);
});

test('disposal closes active spans and releases session state', async (t) => {
  const f = fixture(t); open(f); f.collector.closeAll(); await f.flush();
  assert.equal(f.collector.open.size, 0); assert.equal(f.collector.sessions.size, 0);
  assert.equal(f.records().length, 2);
});

test('rejects partial HTTP-200 results; failed exports are not automatically resent', async () => {
  await assert.rejects(sendTeamRecords('http://test/api/spans', [{}], {
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'ok', received: 1, processed: 0, errors: ['bad'] }) }),
  }), /did not accept all/);
  let requests = 0;
  const exporter = new TeamJsonExporter('http://test/api/spans', { fetchImpl: async () => { requests++; throw new Error('offline'); } });
  let result;
  exporter.export([{ name: 'x', attributes: {}, status: { code: 1 }, events: [], startTime: [1700000000, 0], endTime: [1700000001, 0],
    spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }) }], (value) => { result = value; });
  await exporter.forceFlush();
  assert.equal(requests, 1); assert.equal(result.code, 1); assert.equal(exporter.stats.failed, 1);
  await exporter.shutdown();
});

test('model options stay frozen and stream objects are forwarded unchanged', async (t) => {
  const f = fixture(t); open(f);
  const message = Object.freeze({ role: 'user', content: Object.freeze([{ type: 'text', text: 'hello' }]) });
  const options = Object.freeze({ sessionId: 'session-a', model: 'm', provider: 'p', messages: Object.freeze([message]) });
  const finish = Object.freeze({ type: 'finish', reason: Object.freeze({ kind: 'stop' }) });
  const result = [];
  for await (const value of f.collector.wrapStream(options, () => chunks([finish]))) result.push(value);
  assert.equal(result[0], finish);
  assert.equal(options.messages[0], message);
});

test('synchronous next failure is propagated exactly once', async (t) => {
  const f = fixture(t); open(f);
  const original = new Error('sync provider failure');
  let calls = 0, caught;
  try {
    f.collector.wrapStream({ sessionId: 'session-a', model: 'm', provider: 'p', messages: [] }, () => { calls++; throw original; });
  } catch (error) { caught = error; }
  assert.equal(caught, original); assert.equal(calls, 1);
  close(f, 'session-a', { kind: 'error', error: original }); await f.flush();
  assert.equal(f.records().find((r) => r.span_kind === 'LLM').status, 'ERROR');
});

test('a failed tool records details while a recovered turn can finish OK', async (t) => {
  const f = fixture(t); open(f);
  f.event('tool/call', { turn: 1, step: 1, callId: 'bad', name: 'pwsh', arguments: 'invalid JSON {' });
  f.event('tool/result', { turn: 1, step: 1, message: { toolCallId: 'bad', isError: true, content: [{ type: 'text', text: 'permission denied' }] },
    error: { name: 'PermissionError', code: 'DENIED', reason: 'permission denied' } });
  close(f); await f.flush();
  const records = f.records();
  assert.equal(records.find((r) => r.span_kind === 'TOOL').status, 'ERROR');
  assert.equal(records.find((r) => r.span_kind === 'CHAIN').status, 'ERROR');
  assert.equal(records.find((r) => r.span_kind === 'AGENT').status, 'OK');
});

test('a repeated usage snapshot replaces counts rather than adding twice', async (t) => {
  const f = fixture(t); open(f);
  await run(f, [
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]);
  close(f); await f.flush();
  assert.equal(f.records().find((r) => r.span_kind === 'LLM').raw_tokens.total_tokens, 12);
});

test('unconsumed stream gets an estimated end when the session is disposed', async (t) => {
  const f = fixture(t); open(f);
  f.collector.wrapStream({ sessionId: 'session-a', model: 'm', provider: 'p', messages: [] }, () => chunks([]));
  f.collector.closeSession('session-a'); await f.flush();
  const model = f.records().find((r) => r.span_kind === 'LLM');
  assert.equal(model.status, 'UNSET');
  assert.equal(model.metadata.attributes['dsh.end_time.estimated'], true);
});

test('successful export waits for acknowledgement and rejects exports after shutdown', async () => {
  let release;
  const response = new Promise((resolve) => { release = resolve; });
  const exporter = new TeamJsonExporter('http://test/api/spans', { fetchImpl: () => response });
  const results = [];
  const span = { name: 'x', attributes: {}, status: { code: 1 }, events: [], startTime: [1700000000, 123000000], endTime: [1700000000, 923000000],
    parentSpanContext: { spanId: 'c'.repeat(16) }, spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }) };
  exporter.export([span], (value) => results.push(value));
  let flushed = false;
  const pending = exporter.forceFlush().then(() => { flushed = true; });
  await Promise.resolve(); assert.equal(flushed, false);
  release({ ok: true, json: async () => ({ status: 'ok', received: 1, processed: 1, errors: null }) });
  await pending;
  assert.equal(results[0].code, 0); assert.equal(exporter.stats.exported, 1);
  const record = spanToTeamRecord(span);
  assert.equal(record.parent_id, 'c'.repeat(16));
  assert.equal(Date.parse(record.end_time) - Date.parse(record.start_time), 800);
  await exporter.shutdown();
  exporter.export([span], (value) => results.push(value));
  assert.equal(results[1].code, 1);
});