"""
文件名: queries.py
所属模块: 存储层极速查询接口 (storage/queries)

【功能与算法说明】
1. query_spans_by_trace_id:
   - 算法: 利用复合覆盖索引 (trace_id, start_time ASC) 进行 B-Tree 顺序范围扫描。
   - 复杂度: O(log M + K)（M 为库中总记录数，K 为当前 Trace 的子节点数）。
   - 核心价值: 彻底消除 DB 层的内存快速排序（Quicksort），提取的数据天然按时间有序，直接对接 processor/egress.py 的建树算法。
2. query_recent_traces:
   - 算法: 命中 idx_traces_start_time 倒序索引，实现 B-Tree 逆向游标点查，杜绝全表扫描。
   - 复杂度: O(limit) 常数级秒开。
3. query_dashboard_metrics:
   - 算法: 单趟流式聚合，一次 SQL 扫描提取总调用量、总 Token、总花费、平均耗时与错误率。
4. query_span_by_id:
   - 算法: 基于主键 span_id 的 O(log M) 点查，供前端侧边栏抽屉展示单步详情。
"""

import sqlite3
from typing import Any, Dict, List, Optional


def query_spans_by_trace_id(conn: sqlite3.Connection, trace_id: str) -> List[Dict[str, Any]]:
    """
    【整链拓扑建树专用读取接口】：
    - 算法: 命中复合覆盖索引 idx_spans_trace_time (trace_id, start_time ASC)。
    - 返回: 严格按起始时间升序排列的字典列表，完全满足 build_trace_tree() 入参要求。
    """
    cursor = conn.cursor()
    query = """
    SELECT
        span_id, trace_id, parent_id, span_kind, name,
        start_time, end_time, latency_ms, input_str, output_str,
        prompt_tokens, completion_tokens, total_tokens, cost_usd,
        status, error_message, attributes_json
    FROM spans
    WHERE trace_id = ?
    ORDER BY start_time ASC;
    """
    cursor.execute(query, (trace_id,))
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def query_recent_traces(conn: sqlite3.Connection, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
    """
    【大屏首页分页读取接口】：
    - 算法: 命中 idx_traces_start_time (start_time DESC) 倒序索引，常数级游标扫描。
    """
    cursor = conn.cursor()
    query = """
    SELECT
        trace_id, root_name, start_time, end_time, latency_ms,
        total_tokens, total_cost_usd, status, error_message
    FROM traces
    ORDER BY start_time DESC
    LIMIT ? OFFSET ?;
    """
    cursor.execute(query, (limit, offset))
    rows = cursor.fetchall()
    return [dict(row) for row in rows]


def query_dashboard_metrics(conn: sqlite3.Connection, start_time_gte: Optional[str] = None) -> Dict[str, Any]:
    """
    【大屏核心指标卡片聚合接口】：
    - 算法: 一次扫描直接提取总调用数、总消耗、平均延迟与错误率，杜绝多次聚合。
    """
    cursor = conn.cursor()
    if start_time_gte:
        query = """
        SELECT
            COUNT(*) AS total_traces,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(total_cost_usd), 0.0) AS total_cost_usd,
            COALESCE(AVG(latency_ms), 0.0) AS avg_latency_ms,
            COALESCE(SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END), 0) AS error_count
        FROM traces
        WHERE start_time >= ?;
        """
        cursor.execute(query, (start_time_gte,))
    else:
        query = """
        SELECT
            COUNT(*) AS total_traces,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(total_cost_usd), 0.0) AS total_cost_usd,
            COALESCE(AVG(latency_ms), 0.0) AS avg_latency_ms,
            COALESCE(SUM(CASE WHEN status = 'ERROR' THEN 1 ELSE 0 END), 0) AS error_count
        FROM traces;
        """
        cursor.execute(query)

    row = cursor.fetchone()
    if not row or row["total_traces"] == 0:
        return {
            "total_traces": 0,
            "total_tokens": 0,
            "total_cost_usd": 0.0,
            "avg_latency_ms": 0.0,
            "error_count": 0,
            "error_rate": 0.0,
        }

    total = row["total_traces"]
    errors = row["error_count"]
    return {
        "total_traces": total,
        "total_tokens": row["total_tokens"],
        "total_cost_usd": round(row["total_cost_usd"], 6),
        "avg_latency_ms": round(row["avg_latency_ms"], 2),
        "error_count": errors,
        "error_rate": round(errors / total, 4) if total > 0 else 0.0,
    }


def query_span_by_id(conn: sqlite3.Connection, span_id: str) -> Optional[Dict[str, Any]]:
    """
    【侧边栏抽屉详情点查】：
    - 算法: 主键 O(log M) 极速点查。
    """
    cursor = conn.cursor()
    query = "SELECT * FROM spans WHERE span_id = ? LIMIT 1;"
    cursor.execute(query, (span_id,))
    row = cursor.fetchone()
    return dict(row) if row else None

