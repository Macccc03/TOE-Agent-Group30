export interface Span {
  id: string;
  name: string;
  kind: string;
  status: string;
  offset: number;
  duration: number;
  tokens: number | null;
  cost: number | null;
  input: string;
  output: string;
  error: string | null;
  attributes: string;
  children: Span[];
}

export interface Trace {
  id: string;
  name: string;
  start: string;
  duration: number;
  tokens: number | null;
  cost: number | null;
  status: string;
  root: Span | null;
}

// Matches the existing processor/egress.py node fields; no Relay IDs required.
export interface RawSpan {
  span_id: string; name: string; span_kind: string; status: string;
  start_time: string; latency_ms: number; relative_start_ms: number;
  total_tokens?: number | null; cost_usd?: number | null;
  input_str: string; output_str: string; error_message?: string | null;
  attributes_json: string; children: RawSpan[];
}
export interface RawTrace {
  trace_id: string; root_name: string; total_latency_ms: number;
  total_tokens?: number | null; total_cost_usd?: number | null;
  status: string; tree: RawSpan | null;
}
