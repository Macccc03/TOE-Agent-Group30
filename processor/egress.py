"""
文件名: egress.py
所属模块: 数据处理中枢 (processor)

【功能说明】
1. 负责处理从数据库读取出来的扁平列表数据，供前端渲染使用。
2. 相对时间计算：遍历所有 Span，找出整个 Trace 的最早开始时间，计算每个 Span 的偏移量（relativeStartMs）。
3. 汇总看板指标：一次性算出该 Trace 的总耗时、总 Token 消耗和总花费。
4. 调用 adapter.py 完成格式转换，最终输出前端所需的 JSON 响应体。
"""

from datetime import datetime
from typing import Any, List, Dict
from processor.adapter import db_record_to_frontend_span

def process_egress(flat_db_spans: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not flat_db_spans:
        return {"trace_summary": {}, "spans": []}

    def parse_time(t_str):
        try:
            return datetime.fromisoformat(t_str.replace("Z", "+00:00"))
        except:
            return datetime.now()

    min_start_time = min(parse_time(span["start_time"]) for span in flat_db_spans)
    max_end_time = max(parse_time(span["end_time"]) for span in flat_db_spans)
    total_latency_ms = (max_end_time - min_start_time).total_seconds() * 1000.0

    formatted_spans = []
    for span in flat_db_spans:
        frontend_span = db_record_to_frontend_span(span)
        start_dt = parse_time(span["start_time"])
        frontend_span["relativeStartMs"] = max(0.0, (start_dt - min_start_time).total_seconds() * 1000.0)
        formatted_spans.append(frontend_span)

    return {
        "trace_summary": {
            "trace_id": flat_db_spans[0]["trace_id"],
            "total_latency_ms": total_latency_ms,
            "total_tokens": sum(s.get("total_tokens", 0) for s in flat_db_spans),
            "total_cost_usd": sum(s.get("cost_usd", 0.0) for s in flat_db_spans)
        },
        "spans": formatted_spans
    }