import type { RawSpan, RawTrace, Span, Trace } from '../types.ts';

const nonnegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
export function adaptSpan(raw: RawSpan): Span {
  return {
    id: raw.span_id, name: raw.name, kind: raw.span_kind.toUpperCase(), status: raw.status,
    offset: nonnegative(raw.relative_start_ms), duration: nonnegative(raw.latency_ms),
    tokens: raw.total_tokens ?? null, cost: raw.cost_usd ?? null,
    input: raw.input_str, output: raw.output_str, error: raw.error_message ?? null,
    attributes: raw.attributes_json, children: raw.children.map(adaptSpan),
  };
}
export function adaptTrace(raw: RawTrace): Trace {
  return {
    id: raw.trace_id, name: raw.root_name, start: raw.tree?.start_time ?? '',
    duration: nonnegative(raw.total_latency_ms), tokens: raw.total_tokens ?? null,
    cost: raw.total_cost_usd ?? null, status: raw.status,
    root: raw.tree ? adaptSpan(raw.tree) : null,
  };
}
export function flatten(root: Span | null): Span[] {
  return root ? [root, ...root.children.flatMap(flatten)] : [];
}
export function pretty(value: string): string {
  if (!value) return '未记录';
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}
