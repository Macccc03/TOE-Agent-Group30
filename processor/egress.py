"""
文件名: egress.py
所属模块: 数据处理中枢 (processor)

【功能说明】
1. 负责处理从数据库读取出来的扁平列表数据，供前端渲染使用。
2. 相对时间计算：遍历所有 Span，找出整个 Trace 的最早开始时间，计算每个 Span 的偏移量（relativeStartMs）。
3. 汇总看板指标：一次性算出该 Trace 的总耗时、总 Token 消耗和总花费。
4. 调用 adapter.py 完成格式转换，最终输出前端所需的 JSON 响应体。
"""

from datetime import datetime, timezone
from typing import Any, List, Dict
from processor.adapter import db_record_to_frontend_span

def _parse_time(t_val: Any) -> datetime:
    if isinstance(t_val, datetime):
        return t_val if t_val.tzinfo else t_val.replace(tzinfo=timezone.utc)
    if isinstance(t_val, str):
        try:
            dt = datetime.fromisoformat(t_val.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return datetime.now(timezone.utc)

def process_egress(flat_db_spans: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not flat_db_spans:
        return {"trace_summary": {}, "spans": []}

    min_start_time = min(_parse_time(span["start_time"]) for span in flat_db_spans)
    max_end_time = max(_parse_time(span["end_time"]) for span in flat_db_spans)
    total_latency_ms = (max_end_time - min_start_time).total_seconds() * 1000.0

    formatted_spans = []
    for span in flat_db_spans:
        frontend_span = db_record_to_frontend_span(span)
        start_dt = _parse_time(span["start_time"])
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

def build_trace_tree(flat_spans: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    将扁平 Span 列表组装为具有嵌套 children 的树状结构，并递归汇总指标。
    支持乱序输入与孤儿节点容错。
    """
    if not flat_spans:
        return {}

    min_start_time = min(_parse_time(s["start_time"]) for s in flat_spans)
    max_end_time = max(_parse_time(s["end_time"]) for s in flat_spans)
    total_latency_ms = (max_end_time - min_start_time).total_seconds() * 1000.0

    node_map: Dict[str, Dict[str, Any]] = {}
    roots: List[Dict[str, Any]] = []

    for span in flat_spans:
        s_id = span.get("span_id") or span.get("id") or str(id(span))
        st = _parse_time(span["start_time"])
        rel_ms = max(0.0, (st - min_start_time).total_seconds() * 1000.0)

        node = dict(span)
        node["relative_start_ms"] = rel_ms
        node["children"] = []
        node_map[s_id] = node

    for span in flat_spans:
        s_id = span.get("span_id") or span.get("id") or str(id(span))
        p_id = span.get("parent_id") or span.get("parentId")
        current_node = node_map[s_id]

        if p_id and p_id in node_map:
            node_map[p_id]["children"].append(current_node)
        else:
            roots.append(current_node)

    def _calc_cumulative_tokens(node: Dict[str, Any]) -> int:
        own_tokens = node.get("total_tokens", 0) or node.get("tokens", 0)
        if not own_tokens and isinstance(node.get("raw_tokens"), dict):
            own_tokens = sum(node["raw_tokens"].values())
        child_tokens = sum(_calc_cumulative_tokens(child) for child in node["children"])
        total = own_tokens + child_tokens
        node["cumulative_tokens"] = total
        return total

    for node in node_map.values():
        node["children"].sort(key=lambda x: x.get("relative_start_ms", 0.0))

    roots.sort(key=lambda x: (0 if x.get("parent_id") is None else 1, x.get("relative_start_ms", 0.0)))
    for root in roots:
        _calc_cumulative_tokens(root)

    primary_root = roots[0] if roots else {}

    return {
        "trace_id": flat_spans[0].get("trace_id", ""),
        "root_name": primary_root.get("name", "Unknown"),
        "total_latency_ms": total_latency_ms,
        "total_tokens": sum(s.get("total_tokens", 0) for s in flat_spans),
        "total_cost_usd": sum(s.get("cost_usd", 0.0) for s in flat_spans),
        "tree": primary_root
    }
