"""
文件名: egress.py
所属模块: 数据处理中枢 (processor)

【功能说明】
负责“数据从数据库查出来之后，发给前端之前”的组装工作。这是本模块最核心的算法所在。
1. 建树算法 (Tree Builder)：使用 O(N) 复杂度的两次遍历法，将数据库查出的扁平乱序列表，组装成父子嵌套的树状 JSON。
2. 相对偏移计算：以整条 Trace 的最早起始时间为基准，计算出每个 Span 的 `relative_start_ms`，供前端（成员 4）直接画瀑布图。
3. 指标递归聚合 (Aggregate)：将叶子节点的 Token、花费，逐层向上累加。让根节点展示出整个调用链路的总消耗。
4. 输出最终提供给前端的 `TraceTreeViewModel`。
"""
from datetime import datetime
from typing import Any, List, Dict

def build_trace_tree(flat_spans: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not flat_spans:
        return {}

    node_map = {}
    roots = []
    
    def parse_time(t_str):
        return datetime.fromisoformat(t_str.replace("Z", "+00:00"))
        
    min_start_time = min(parse_time(span["start_time"]) for span in flat_spans)

    for span in flat_spans:
        s_id = span["span_id"]
        start_dt = parse_time(span["start_time"])
        relative_start_ms = (start_dt - min_start_time).total_seconds() * 1000.0
        
        node_map[s_id] = {
            **span, 
            "relative_start_ms": max(0.0, relative_start_ms),
            "children": []
        }

    for span in flat_spans:
        s_id = span["span_id"]
        p_id = span.get("parent_id")
        current_node = node_map[s_id]

        if p_id and p_id in node_map:
            node_map[p_id]["children"].append(current_node)
        else:
            roots.append(current_node)

    for node in node_map.values():
        node["children"].sort(key=lambda x: x["relative_start_ms"])

    def aggregate_metrics(node):
        total_tokens = node.get("total_tokens", 0)
        total_cost = node.get("cost_usd", 0.0)
        for child in node["children"]:
            child_tokens, child_cost = aggregate_metrics(child)
            total_tokens += child_tokens
            total_cost += child_cost
        node["cumulative_tokens"] = total_tokens
        node["cumulative_cost"] = total_cost
        return total_tokens, total_cost

    for root in roots:
        aggregate_metrics(root)

    primary_root = roots[0] if roots else {}
    max_end_time = max(parse_time(span["end_time"]) for span in flat_spans)
    total_latency_ms = (max_end_time - min_start_time).total_seconds() * 1000.0

    return {
        "trace_id": flat_spans[0]["trace_id"],
        "root_name": primary_root.get("name", "Unknown"),
        "total_latency_ms": total_latency_ms,
        "total_tokens": primary_root.get("cumulative_tokens", 0),
        "total_cost_usd": primary_root.get("cumulative_cost", 0.0),
        "status": primary_root.get("status", "OK"),
        "tree": primary_root
    }