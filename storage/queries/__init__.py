"""
模块: storage.queries
存储层高性能查询接口导出
"""

from storage.queries.queries import (
    query_dashboard_metrics,
    query_recent_traces,
    query_span_by_id,
    query_spans_by_trace_id,
)

__all__ = [
    "query_dashboard_metrics",
    "query_recent_traces",
    "query_span_by_id",
    "query_spans_by_trace_id",
]

