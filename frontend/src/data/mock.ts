import type { RawSpan, RawTrace } from '../types.ts';

function node(id: string, name: string, kind: string, offset: number, duration: number, extra: Partial<RawSpan> = {}): RawSpan {
  return { span_id: id, name, span_kind: kind, status: 'OK',
    start_time: new Date(Date.parse('2026-11-02T02:30:00Z') + offset).toISOString(),
    relative_start_ms: offset, latency_ms: duration, total_tokens: 0, cost_usd: 0,
    input_str: '', output_str: '', attributes_json: '{}', children: [], ...extra };
}

const rag = node('rag-root', 'TravelAssistant', 'AGENT', 0, 1420, {
  input_str: '杭州今天的天气怎么样？适合穿什么？', output_str: '杭州今天晴，20℃。建议穿长袖上衣，早晚搭配轻便夹克。',
  attributes_json: '{"framework":"示例 Agent","demo":true}',
  children: [node('rag-chain', '查询与生成建议', 'CHAIN', 30, 1360, {
    input_str: '解析地点，查询天气，再生成建议。', output_str: '查询完成，建议已生成。',
    children: [node('rag-tool', 'WeatherTool', 'TOOL', 60, 320, {
      input_str: '{"city":"杭州"}', output_str: '{"weather":"晴","temperature":20,"unit":"℃"}',
    }), node('rag-llm', '生成穿衣建议', 'LLM', 400, 960, {
      total_tokens: 1280, cost_usd: 0.00341,
      input_str: JSON.stringify({ system: '你是旅行助手，请根据天气提供简短的穿衣建议。', user: '杭州，晴，20℃' }),
      output_str: '建议穿长袖上衣，早晚搭配轻便夹克。', attributes_json: '{"model":"demo-model","temperature":0.3,"synthetic":true}',
    })],
  })],
});
const failed = node('error-root', 'OrderAssistant', 'AGENT', 0, 850, {
  status: 'ERROR', input_str: '帮我查询订单 A1024 的物流。', output_str: '',
  error_message: '物流服务暂时不可用，未能完成查询。',
  children: [node('error-tool', 'TrackingTool', 'TOOL', 50, 800, {
    status: 'ERROR', input_str: '{"order_id":"A1024"}', error_message: 'TimeoutError: 模拟物流服务请求超时（800ms）',
    attributes_json: '{"retry_count":0,"synthetic":true}',
  })],
});
const zero = node('zero-root', '本地缓存命中', 'TOOL', 0, 0, {
  input_str: '读取缓存：杭州天气', output_str: '缓存命中，无模型调用。', attributes_json: '这是一段非 JSON 属性，按原文展示。',
});
export const rawTraces: RawTrace[] = [
  { trace_id: 'demo-rag-001', root_name: '杭州天气与穿衣建议', total_latency_ms: 1420, total_tokens: 1280, total_cost_usd: 0.00341, status: 'OK', tree: rag },
  { trace_id: 'demo-error-002', root_name: '订单物流查询', total_latency_ms: 850, total_tokens: null, total_cost_usd: null, status: 'ERROR', tree: failed },
  { trace_id: 'demo-zero-003', root_name: '零耗时缓存查询', total_latency_ms: 0, total_tokens: 0, total_cost_usd: 0, status: 'OK', tree: zero },
];
