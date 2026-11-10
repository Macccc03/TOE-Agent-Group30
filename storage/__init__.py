"""
模块: storage
本地高性能 SQLite-WAL 存储模块入口
"""

from storage.engine.sqlite_engine import (
    SQLiteStorageEngine,
    bulk_upsert_spans,
    configure_pragmas,
    init_db,
)
from storage.engines import create_engine, get_engine, parse_db_path
from storage.queries.queries import (
    query_dashboard_metrics,
    query_recent_traces,
    query_span_by_id,
    query_spans_by_trace_id,
)
from storage.schema.migrate.migrate import init_database, verify_schema
from storage.schema.model.model import ProcessedSpanRecord

__all__ = [
    # 数据契约与 DDL 迁移
    "ProcessedSpanRecord",
    # 核心引擎与启动函数
    "SQLiteStorageEngine",
    # 写入接口
    "bulk_upsert_spans",
    "configure_pragmas",
    "create_engine",
    "get_engine",
    "init_database",
    "init_db",
    "parse_db_path",
    "query_dashboard_metrics",
    "query_recent_traces",
    "query_span_by_id",
    # 查出接口
    "query_spans_by_trace_id",
    "verify_schema",
]
