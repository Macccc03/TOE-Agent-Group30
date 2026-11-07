from sqlalchemy import URL, NullPool, event, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from typing import Any, Callable, Literal, Mapping, Optional
from typing_extensions import assert_never
from sqlite3 import Connection
import numpy as np
import aiosqlite
import sqlean
from enum import Enum
import orjson
from storage.helpers import SupportedSQLDialect
from sqlalchemy.engine import Connection as SAConnection
from urllib.parse import urlencode

# 【连接池周期性回收时间 (55 分钟)】
# 定期淘汰连接池中的闲置连接，使得服务端变更（如 IAM 角色撤销、证书轮换、云托管 PostgreSQL 负载均衡节点漂移）
# 能够平滑传播并重新握手。连接探活由 pool_pre_ping 独立负责；本参数仅用于限定凭证陈旧期上限。
# PostgreSQL 仅在会话启动握手时验证鉴权凭证，会话存活期间不再重新校验。
# 3300 秒（55 分钟）在此区间内既避免频繁新建连接开销，又保证了云端动态令牌的及时刷新。
_POOL_RECYCLE_SECONDS = 3300

# 【SQLite 只读连接池大小】保持常驻开启的只读连接数（对应 aiosqlite 工作线程数）。
# WAL 模式本身不限制并发读者数量，此参数核心用于对线程开销实施上限管控。
_READ_POOL_SIZE = 4

# 【SQLite 只读最大溢出连接数】当 8 个常规只读连接全部繁忙时，允许额外临时突发建立的只读连接数。
# 归还后立即关闭，用于平滑吸收突发流量峰值而不长久占用系统线程。超过此限制后调用方排队等待。
_READ_MAX_OVERFLOW = 8

# 【连接级别 PRAGMA 参数】作用域限制在单个连接内。
# 设置当 SQLite 遭遇文件锁竞争时的最大挂起重试超时时间（10000 毫秒 = 10 秒）。
_CONNECTION_PRAGMAS = ("PRAGMA busy_timeout = 10000;",)

# 【外键约束 PRAGMA】在常规运行时强制开启外键完整性约束检查。
# 注意：在执行 Alembic DDL 表结构迁移时必须将其排除！因为 Alembic 重构表结构的方式是新建临时表、
# 拷贝数据、DROP 原始表并重命名；如果外键开启，DROP 操作将直接级联清空所有子表数据！
_FOREIGN_KEY_PRAGMAS = ("PRAGMA foreign_keys = ON;",)

# 【SQLite 页面缓存大小】负数代表以 KiB 为单位（例如 -32000 = 32 MB）。
# SQLite 没有跨进程/跨连接共享的缓冲池，每个连接维护自有的独立页面缓存。
# 写入连接缓存设为 32MB，用于暂存尚未 Commit 的脏页，保证海量 Span 吞吐写入性能；
# 只读连接维持轻量级 2MB，未命中的页面由操作系统文件系统缓存承接。
_WRITER_CACHE_PRAGMAS = ("PRAGMA cache_size = -32000;",)
_READER_CACHE_PRAGMAS = ("PRAGMA cache_size = -2000;",)

# 【数据库全局物理文件属性 PRAGMA】
# 1. journal_mode = WAL: 开启预写日志模式 (Write-Ahead Logging)，实现读写互不阻塞；
# 2. synchronous = OFF: 关闭极端同步刷盘，大幅提升单机 Span 吞吐落盘性能。
_DATABASE_PRAGMAS = (
    "PRAGMA journal_mode = WAL;",
    "PRAGMA synchronous = OFF;",
)

def get_async_db_url(connection_str: str) -> URL:
    """
    解析数据库连接字符串，并自动将其重写升级为对应的异步非阻塞驱动协议：
    - SQLite: sqlite -> sqlite+aiosqlite
    - PostgreSQL: postgresql -> postgresql+asyncpg
    """
    url = make_url(connection_str)
    if not url.database:
        raise ValueError("Failed to parse database from connection string")
    backend = SupportedSQLDialect(url.get_backend_name())
    if backend is SupportedSQLDialect.SQLITE:
        return url.set(drivername="sqlite+aiosqlite")
    elif backend is SupportedSQLDialect.POSTGRESQL:
        url = url.set(drivername="postgresql+asyncpg")
        # 特殊兼容处理：部分复杂格式的连接串无法从默认插槽解析账号密码，
        # 此处手动提取并放入 URL query 参数中，避免密码丢失
        if url.username and url.password:
            url = url.set(
                query={**url.query, "user": url.username, "password": url.password},
                password=None,
                username=None,
            )
        return url
    else:
        assert_never(backend)


def create_engine(
    connection_str: str,
    migrate: bool = True,
    log_to_stdout: bool = False,
    log_migrations: bool = True,
) -> AsyncEngine:

    url = make_url(connection_str)

    if not url.database:
        raise ValueError("Failed to parse database from connection string")

    # 2. 提取并校验数据库后端方言名称（如 "sqlite" 或 "postgresql"）
    # 若传入了不受支持的数据库方言（如 mysql/oracle），会在枚举转换时自动阻断报错
    backend = SupportedSQLDialect(url.get_backend_name())

    # 3. 将传统同步驱动协议转换为对应的非阻塞异步驱动协议：
    #    - sqlite:// -> sqlite+aiosqlite://
    #    - postgresql:// -> postgresql+asyncpg://
    url = get_async_db_url(url.render_as_string(hide_password=False))

    # 4. 根据数据库类型路由至专属的引擎构造流程
    if backend is SupportedSQLDialect.SQLITE:
        # 【SQLite 分支】：配置单写排他队列、WAL 模式、32MB 写缓存及内存数据库初始化
        return aio_sqlite_engine(
            url=url,
            migrate=migrate,
            log_to_stdout=log_to_stdout,
            log_migrations=log_migrations,
        )
    # elif backend is SupportedSQLDialect.POSTGRESQL:
    #     # 【PostgreSQL 分支】：配置生产级连接池、pool_pre_ping 心跳探活、
    #     # 55分钟周期回收、AWS IAM / Azure 托管标识免密动态鉴权
    #     return aio_postgresql_engine(
    #         url=url,
    #         migrate=migrate,
    #         log_to_stdout=log_to_stdout,
    #         log_migrations=log_migrations,
    #     )
    else:
        raise ValueError("Error from db chosing")


def _sqlite_target(database: Optional[str], query: Mapping[str, Any]) -> str:
    """
    组装 SQLite 底层打开的目标名称，重新拼接 URL 查询字符串参数。

    从 URL 各分立组件显式拼接，规避 SQLAlchemy 2.1 将 `:memory:` 意外进行百分号转义
    （渲染成 `%3Amemory%3A` 导致 SQLite 无法识别为内存库）的问题。
    """
    name = (database or ":memory:").removeprefix("file:")
    return f"{name}?{urlencode(query, doseq=True)}" if query else name

def sqlite_connection_factory(
    database: str,
    *,
    mode: SQLiteAccessMode = "rwc",
    uri: bool = True,
    iter_chunk_size: int = 64,
) -> Callable[[], aiosqlite.Connection]:
    """
    构造供 SQLAlchemy 打开单个 SQLite 底层连接的连接生成器工厂函数。

    设计核心要点：
    1. 使用第三方扩展 sqlean 替代原生 sqlite3：Phoenix 加载了 text、stats、time、crypto 扩展函数库；
    2. `mode` 在底层文件系统打开句柄时即被固化，无法后续修改，因此是实现系统级只读强管控的唯一卡点；
       设置为 `mode="ro"` 可在代码逻辑层之下彻底硬阻断任何写操作；
    3. 默认采用 `mode="rwc"`（读、写、自动创建文件）：连接建立是惰性触发的，在表结构迁移完成前引擎就可能
       发起连接，若使用 `mode="rw"` 连接尚未创建的文件将直接失败崩溃。
    """

    def connect() -> aiosqlite.Connection:
        # mode 必须作为 URI 查询参数生效，必须以 file: 格式解析；
        # 若直接附加在普通路径后面会被底层误认为文件名本身的一部分
        if uri:
            separator = "&" if "?" in database else "?"
            target = f"file:{database}{separator}mode={mode}"
        else:
            target = database
        conn = aiosqlite.Connection(
            lambda: sqlean.connect(target, uri=uri),
            iter_chunk_size=iter_chunk_size,
        )
        # aiosqlite>=0.22 将工作线程迁移至 Connection._thread；
        # 显式将其标记为守护线程 (daemon=True)，避免阻止应用退出
        conn._thread.daemon = True
        return conn

    return connect

def set_sqlite_read_pragma(connection: Connection, _: Any) -> None:
    """
    SQLite 只读连接池的连接级 PRAGMA 配置。

    注意：在 `mode=ro` 只读模式下执行 `PRAGMA journal_mode = WAL` 会触发写报错，
    因此只读引擎直接继承主写引擎设置的 WAL 模式，无需也无法由自身设置。
    """
    _apply_pragmas(connection, _CONNECTION_PRAGMAS + _FOREIGN_KEY_PRAGMAS + _READER_CACHE_PRAGMAS)

def _disable_implicit_transactions(connection: Connection, _: Any) -> None:
    """
    关闭底层驱动的隐式事务，将事务控制权完全移交给 SQLAlchemy。

    原生 pysqlite 驱动会在 DML 写入语句前自动开启事务，但在 SELECT 查询前不会，
    如果不关闭隐式事务，查询操作将退化为 Autocommit 模式无法保证读一致性。
    """
    connection.isolation_level = None


def _begin_sqlite_transaction(connection: SAConnection) -> None:
    """
    显式发起 BEGIN 语句，使读取和 Savepoint 保存点处于真实的外部事务之中。

    延迟发起的 BEGIN 同样适用于只读连接，保证只读事务能够稳定锁定当前的 WAL 一致性快照视图。
    """
    connection.exec_driver_sql("BEGIN")

def configure_sqlite_transactions(engine: AsyncEngine) -> None:
    """配置 SQLite 事务监听事件，使 SQLAlchemy 能够显式且确定性地管控 SQLite 事务。"""
    event.listen(engine.sync_engine, "connect", _disable_implicit_transactions)
    event.listen(engine.sync_engine, "begin", _begin_sqlite_transaction)

def aio_sqlite_read_engine(url: URL, log_to_stdout: bool = False) -> Optional[AsyncEngine]:
    """
    为并发只读查询分配专属连接的只读专用异步引擎 (Read-Only Engine)。

    设计动机：
    - 主引擎采用单连接排他队列，若只读查询走主引擎，将被耗时的批量写操作阻塞排队；
    - 在此专用只读引擎中，每个读取会话独享连接，并发读取完全并行展开；
    - `mode="ro"` 确保从数据库引擎底层物理拒绝任何写请求；
    - 针对内存数据库 (`:memory:`) 返回 None，因为二次打开内存数据库将产生相互孤立的空数据库。
    """
    database = _sqlite_target(url.database, url.query)
    if database.startswith(":memory:"):
        return None

    # 【长连接持久化】：维持连接存活，避免每次借出都新建连接（每次新建会产生 aiosqlite 工作线程开销）；
    # 【超时机制】：pool_timeout=None 使并发读取突发超出连接池时自旋排队而非直接报错拒绝；
    # 【关闭探活】：pool_pre_ping=False，本地磁盘文件不存在网络抖动或连接被中间件丢弃的问题。
    engine = create_async_engine(
        url=url,
        echo=log_to_stdout,
        json_serializer=_dumps,
        async_creator=sqlite_connection_factory(database, mode="ro"),
        pool_size=_READ_POOL_SIZE,
        max_overflow=_READ_MAX_OVERFLOW,
        pool_timeout=None,
        pool_pre_ping=False,
    )
    event.listen(engine.sync_engine, "connect", set_sqlite_read_pragma)
    configure_sqlite_transactions(engine)
    return engine

def aio_sqlite_engine(
    url: URL,
    migrate: bool = True,
    shared_cache: bool = True,
    log_to_stdout: bool = False,
    log_migrations: bool = True,
) -> AsyncEngine:



def _dumps(obj: Any) -> str:
    """
    高性能 JSON 序列化辅助函数：基于 C 语言加速库 orjson 将数据结构快速编码为 JSON 文本。
    """
    return orjson.dumps(obj, default=_default).decode()


def _default(obj: Any) -> Any:
    """
    自定义类型 JSON 序列化回退处理器：
    - NumPy 多维数组 (ndarray) -> 转为原生 Python list
    - NumPy 标量数值 (integer, floating, bool_) -> 转为原生 Python int / float / bool
    - Python 枚举类型 (Enum) -> 转为其 underlying 字符串/整型 value
    """
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, (np.integer, np.floating, np.bool_)):
        return obj.item()
    if isinstance(obj, Enum):
        return obj.value
    raise TypeError(f"Object of type {type(obj).__name__} is not serializable")