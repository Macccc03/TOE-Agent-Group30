"""
模块: storage.queries
存储层高性能查询接口导出
"""

from storage.queries.queries import (
    query_spans_by_trace_id,
    query_recent_traces,
    query_dashboard_metrics,
    query_span_by_id,
)

__all__ = [
    "query_spans_by_trace_id",
    "query_recent_traces",
    "query_dashboard_metrics",
    "query_span_by_id",
]

