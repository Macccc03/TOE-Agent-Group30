"""
文件名: engines.py
所属模块: 统一数据库引擎构建与启动中枢 (storage/engines)
================================================================================
【设计职责】
为本地一体化 Agent 可观测性平台提供精简、高性能的数据库启动配置与工厂入口：
1. 统一连接串解析 (parse_db_path)：
   自动将多种连接串格式（如 sqlite:///./trace.db, sqlite:///:memory:, 纯路径 trace.db 或环境变量配置）
   精确提取为底层的本地 SQLite 文件路径；
2. 引擎统一构造 (create_engine)：
   对接当前项目的核心 SQLite-WAL 存储引擎 (SQLiteStorageEngine)，一键完成：
   - WAL 预写日志并发调优 (并发读写互不阻塞)；
   - 32MB 脏页内存缓存与 5000ms 锁等待保护；
   - 自动执行表结构 DDL 迁移 (init_database) 与索引完整性验证 (verify_schema)；
   - 兼容同步 close 与异步 dispose 资源释放接口；
3. 彻底精简：
   移除了旧版 Phoenix 中冗余的云端 PostgreSQL 连接池轮换、IAM 凭证刷新、C 扩展 sqlean 等无用代码。
"""

from __future__ import annotations

import logging
import os

from storage.engine.sqlite_engine import SQLiteStorageEngine, init_db
from storage.helpers import SupportedSQLDialect

logger = logging.getLogger("storage.engines")

# 全局存储引擎单例缓存
_global_engine: SQLiteStorageEngine | None = None


def parse_db_path(connection_str: str | None = None) -> str:
    """
    智能解析连接串，提取实际的本地 SQLite 物理文件路径。

    解析规则:
    1. 若未显式传入 connection_str，则尝试从 config.yaml / 环境变量 (PHOENIX_SQL_DATABASE_URL) 获取；
    2. 支持 "sqlite:///path/to/trace.db" -> 提取 "path/to/trace.db"；
    3. 支持 "sqlite:///:memory:" -> 提取 ":memory:"；
    4. 支持纯文件路径如 "trace.db" 或 "./data/trace.db"；
    5. 若均未配置或为空，则安全回退为默认的 "trace.db"。
    """
    if not connection_str:
        try:
            from config import get_env_database_connection_str

            conn_str = get_env_database_connection_str() or ""
        except (ImportError, AttributeError):
            conn_str = os.getenv("PHOENIX_SQL_DATABASE_URL", "")
    else:
        conn_str = connection_str

    conn_str = conn_str.strip()

    if not conn_str:
        return "trace.db"

    # 处理 sqlite:/// 协议头
    if "sqlite:///" in conn_str:
        path_part = conn_str.split("sqlite:///", 1)[-1]
        path_clean = path_part.split("?")[0]
        return path_clean if path_clean else "trace.db"

    # 处理 file: 协议头
    if conn_str.startswith("file:"):
        path_clean = conn_str.removeprefix("file:").split("?")[0]
        return path_clean if path_clean else "trace.db"

    # 普通路径格式去除查询参数后直接返回
    return conn_str.split("?")[0]


def create_engine(
    connection_str: str | None = None,
    migrate: bool = True,
    log_to_stdout: bool = False,
    log_migrations: bool = True,
) -> SQLiteStorageEngine:
    """
    【项目核心数据库引擎启动入口】：
    自动根据连接串配置完成 SQLite-WAL 引擎启动、性能参数配置与 DDL 迁移校验。

    参数:
        connection_str: 数据库连接字符串或文件路径（若为 None 则从全局配置提取）；
        migrate: 是否在启动时自动执行数据表结构初始化与迁移（默认为 True）；
        log_to_stdout: 是否向控制台打印引擎启动细节日志；
        log_migrations: 是否打印迁移执行日志。

    返回:
        已启动且校验完毕的 SQLiteStorageEngine 实例。
    """
    db_path = parse_db_path(connection_str)

    if log_to_stdout or log_migrations:
        logger.info(f"正在启动 SQLite-WAL 存储引擎: {db_path} (migrate={migrate})")

    # 构建并启动底层高性能存储引擎
    engine = SQLiteStorageEngine(db_path=db_path)
    engine.startup()

    return engine


def get_engine(connection_str: str | None = None) -> SQLiteStorageEngine:
    """
    获取全局共享的数据库引擎单例。
    若尚未初始化，则根据指定连接串（或系统默认配置）创建并常驻内存。
    """
    global _global_engine
    if _global_engine is None or not _global_engine._is_initialized:
        _global_engine = create_engine(connection_str=connection_str)
    return _global_engine


__all__ = [
    "SQLiteStorageEngine",
    "SupportedSQLDialect",
    "create_engine",
    "get_engine",
    "init_db",
    "parse_db_path",
]
