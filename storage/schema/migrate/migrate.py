"""
文件名: migrate.py
所属模块: 存储引擎结构迁移 (storage/schema/migrate)

【功能说明】
1. 定义本地 SQLite 数据库核心表结构（traces 表、spans 表）以及覆盖索引。
2. 提供数据库表结构初始化、版本迁移与完整性校验函数（init_database）。
3. 遵循与数据处理中枢（processor）一致的数据契约（ProcessedSpanRecord）。
"""

import sqlite3
import logging

logger = logging.getLogger(__name__)

# =====================================================================
# 1. DDL 建表语句定义
# =====================================================================

# 【traces 表】：记录端到端整条调用链路的宏观指标与时间跨度
CREATE_TRACES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS traces (
    trace_id TEXT PRIMARY KEY,
    root_name TEXT NOT NULL DEFAULT 'Unknown_Agent',
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    latency_ms REAL NOT NULL DEFAULT 0.0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'OK',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

# 【spans 表】：对应 ProcessedSpanRecord，记录调用链中每个原子步骤的执行明细
CREATE_SPANS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS spans (
    span_id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    parent_id TEXT,
    span_kind TEXT NOT NULL,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    latency_ms REAL NOT NULL,
    input_str TEXT,
    output_str TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'OK',
    error_message TEXT,
    attributes_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (trace_id) REFERENCES traces (trace_id) ON DELETE CASCADE
);
"""

# =====================================================================
# 2. 索引优化语句（支撑微秒级高并发查询）
# =====================================================================

CREATE_INDEXES_SQL = [
    # 核心覆盖索引：按 trace_id 与 start_time 极速点查整条链路所有子 Span，支撑 O(N) 拓扑排序建树
    """
    CREATE INDEX IF NOT EXISTS idx_spans_trace_time
    ON spans (trace_id, start_time ASC);
    """,

    # 父子层级索引：按 parent_id 快速查找直接子节点
    """
    CREATE INDEX IF NOT EXISTS idx_spans_parent_id
    ON spans (parent_id);
    """,

    # 首页大屏倒序索引：按起始时间倒序，极大加速前端 Trace 列表按时间分页检索
    """
    CREATE INDEX IF NOT EXISTS idx_traces_start_time
    ON traces (start_time DESC);
    """,

    # 分类聚合索引：按语义类型（LLM, TOOL, AGENT）快速过滤与分类耗时统计
    """
    CREATE INDEX IF NOT EXISTS idx_spans_kind
    ON spans (span_kind);
    """,
]


# =====================================================================
# 3. 数据库初始化与校验函数
# =====================================================================

def init_database(conn: sqlite3.Connection) -> None:
    """
    执行数据库初始化与表结构迁移：
    1. 自动创建 traces 表与 spans 表（幂等：IF NOT EXISTS）
    2. 自动构建高性能查询索引
    """
    cursor = conn.cursor()
    try:
        # 创建核心数据表
        cursor.execute(CREATE_TRACES_TABLE_SQL)
        cursor.execute(CREATE_SPANS_TABLE_SQL)

        # 创建索引
        for index_sql in CREATE_INDEXES_SQL:
            cursor.execute(index_sql)

        conn.commit()
        logger.info("SQLite 核心数据表 (traces, spans) 及索引初始化完成。")
    except Exception as e:
        conn.rollback()
        logger.error(f"数据库初始化迁移失败: {e}", exc_info=True)
        raise e


def verify_schema(conn: sqlite3.Connection) -> bool:
    """
    校验数据库核心表和索引是否存在且结构完整
    """
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {row[0] for row in cursor.fetchall()}
    has_tables = "traces" in tables and "spans" in tables

    cursor.execute("SELECT name FROM sqlite_master WHERE type='index';")
    indexes = {row[0] for row in cursor.fetchall()}
    has_indexes = "idx_spans_trace_time" in indexes and "idx_traces_start_time" in indexes

    return has_tables and has_indexes


if __name__ == "__main__":
    # 模块独立执行测试：创建内存数据库验证 DDL 语法
    test_conn = sqlite3.connect(":memory:")
    init_database(test_conn)
    assert verify_schema(test_conn) is True
    print("[OK] DDL 表结构与索引语法校验通过！")
    test_conn.close()
