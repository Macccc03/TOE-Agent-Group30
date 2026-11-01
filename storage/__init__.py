"""
模块: storage
本地高性能 SQLite-WAL 存储模块入口
"""

from storage.engine.sqlite_engine import (
    SQLiteStorageEngine,
    init_db,
    configure_pragmas,
    bulk_upsert_spans,
)
from storage.queries.queries import (
    query_spans_by_trace_id,
    query_recent_traces,
    query_dashboard_metrics,
    query_span_by_id,
)
from storage.schema.model.model import ProcessedSpanRecord
from storage.schema.migrate.migrate import init_database, verify_schema

__all__ = [
    # 核心引擎与启动函数
    "SQLiteStorageEngine",
    "init_db",
    "configure_pragmas",
    # 写入接口
    "bulk_upsert_spans",
    # 查出接口
    "query_spans_by_trace_id",
    "query_recent_traces",
    "query_dashboard_metrics",
    "query_span_by_id",
    # 数据契约与 DDL 迁移
    "ProcessedSpanRecord",
    "init_database",
    "verify_schema",
]
