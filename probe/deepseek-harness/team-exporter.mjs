import { captureText, safeValue } from './capture.mjs';

function isoTime(time) {
  if (!Array.isArray(time) || time.length !== 2 || !time.every(Number.isFinite)) {
    throw new Error('Invalid OpenTelemetry timestamp');
  }
  return new Date(time[0] * 1000 + Math.floor(time[1] / 1e6)).toISOString();
}

export function spanToTeamRecord(span) {
  const attrs = span.attributes ?? {}, ids = span.spanContext();
  const tokens = {};
  for (const [field, attribute] of [
    ['prompt_tokens', 'llm.token_count.prompt'],
    ['completion_tokens', 'llm.token_count.completion'],
    ['total_tokens', 'llm.token_count.total'],
    ['cache_hit_tokens', 'llm.token_count.prompt_details.cache_read'],
    ['cache_write_tokens', 'llm.token_count.prompt_details.cache_write'],
    ['reasoning_tokens', 'llm.token_count.completion_details.reasoning'],
  ]) {
    const value = attrs[attribute];
    if (Number.isSafeInteger(value) && value >= 0) tokens[field] = value;
  }
  const metadata = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (['input.value', 'output.value', 'llm.input_messages', 'llm.output_messages', 'tool.parameters'].includes(key)) continue;
    metadata[key] = value;
  }
  const input = captureText(attrs['input.value'] ?? '');
  const output = captureText(attrs['output.value'] ?? '');
  const events = (span.events ?? []).slice(0, 8).map((event) => ({
    name: event.name,
    time: isoTime(event.time),
    attributes: safeValue(event.attributes ?? {}, { maxChars: 2000, maxNodes: 32 }).value,
  }));
  return {
    trace_id: ids.traceId, span_id: ids.spanId,
    parent_id: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    span_kind: attrs['openinference.span.kind'] ?? 'CHAIN',
    start_time: isoTime(span.startTime), end_time: isoTime(span.endTime),
    input_data: input.text, output_data: output.text,
    model_name: attrs['llm.model_name'] ?? null, raw_tokens: tokens,
    status: span.status?.code === 2 ? 'ERROR' : span.status?.code === 1 ? 'OK' : 'UNSET',
    error_message: span.status?.code === 2 ? captureText(span.status.message ?? '', { maxChars: 2000 }).text : null,
    metadata: {
      source: 'deepseek-harness', probe_version: '0.2.0',
      usage_reported: attrs['dsh.usage.reported'] === true,
      capture_truncated: input.truncated || output.truncated || attrs['dsh.capture.truncated'] === true,
      attributes: safeValue(metadata, { maxChars: 8000, maxNodes: 128 }).value,
      events,
    },
  };
}

export async function sendTeamRecords(url, records, { fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const response = await fetchImpl(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error('Team ingest HTTP ' + response.status);
  const result = await response.json();
  if (result.status !== 'ok' || result.received !== records.length ||
      result.processed !== records.length || (result.errors?.length ?? 0) > 0) {
    throw new Error('Team ingest did not accept all records: ' + String(result.processed) + '/' + records.length);
  }
  return result;
}

export class TeamJsonExporter {
  constructor(url, options = {}) {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Endpoint must use HTTP or HTTPS');
    this.url = url;
    this.options = options;
    this.pending = new Set();
    this.closed = false;
    this.stats = { exported: 0, failed: 0 };
  }

  export(spans, callback) {
    if (this.closed) { callback({ code: 1, error: new Error('Exporter is shut down') }); return; }
    let records;
    try { records = spans.map(spanToTeamRecord); }
    catch (error) { this.stats.failed += spans.length; callback({ code: 1, error }); return; }
    if (!records.length) { callback({ code: 0 }); return; }
    // Intentionally no automatic retry: current backend trace aggregates are not idempotent.
    const task = sendTeamRecords(this.url, records, this.options).then(
      () => {
        this.pending.delete(task);
        this.stats.exported += records.length;
        console.log('[dsh-team] accepted ' + records.length + ' span(s)');
        callback({ code: 0 });
      },
      (error) => {
        this.pending.delete(task);
        this.stats.failed += records.length;
        console.warn('[dsh-team] export failed: ' + error.message);
        callback({ code: 1, error });
      },
    );
    this.pending.add(task);
  }

  async forceFlush() { await Promise.all([...this.pending]); }
  async shutdown() { this.closed = true; await this.forceFlush(); }
}