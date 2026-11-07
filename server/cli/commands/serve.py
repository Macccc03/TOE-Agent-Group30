from argparse import SUPPRESS, ArgumentParser, Namespace, _SubParsersAction
from typing import Optional

from phoenix.settings import Settings

from config import (
    get_async_db_url,
    get_env_allowed_origins,
    get_env_database_connection_str,
    get_env_host,
    get_env_host_root_path,
    get_env_log_sql,
    get_env_port,
    get_env_read_replica_url,
)
from storage.engines import create_engine


def _add_server_args(parser: ArgumentParser) -> None:
    """
    添加 `serve` 与 `trace-fixture` 两个子命令共用的通用命令行参数配置。
    包含主机绑定、端口指定、只读模式、前端热更等底层控制选项。
    """
    parser.add_argument("--database-url", required=False, help=SUPPRESS)
    parser.add_argument("--host", type=str, required=False, help=SUPPRESS)
    parser.add_argument("--port", type=int, required=False, help=SUPPRESS)
    parser.add_argument("--grpc-port", type=int, required=False, help=SUPPRESS)
    parser.add_argument(
        "--read-only", action="store_true", required=False, help=SUPPRESS
    )
    parser.add_argument("--no-internet", action="store_true", help=SUPPRESS)
    parser.add_argument("--debug", action="store_true", help=SUPPRESS)
    parser.add_argument("--dev", action="store_true", help=SUPPRESS)
    parser.add_argument("--dev-vite-port", type=int, default=5173, help=SUPPRESS)
    parser.add_argument("--no-ui", action="store_true", help=SUPPRESS)
    parser.set_defaults(grpc_port=None)


def register(subparsers: _SubParsersAction[ArgumentParser]) -> None:
    """
    【向总命令行注册 serve 子命令】
    在总 main 函数 (main.py) 中调用，将 `phoenix serve` 子命令挂载到 ArgumentParser，
    并绑定其触发入口函数为 `run(args)`。
    """
    # -------------------------------------------------------------------------
    # 1. 注册核心子命令：`phoenix serve`（日常生产与开发标准服务启动入口）
    # -------------------------------------------------------------------------
    # 创建 `serve` 专属的子命令解析器
    serve_parser = subparsers.add_parser("serve")
    # 绑定回调函数：当用户执行 `phoenix serve` 时，解析完成后由 main.py 调用 args.func(args) 即 run(args)
    serve_parser.set_defaults(func=run)
    # 挂载通用的服务器网络和运行模式参数（如 --port、--grpc-port、--host、--database-url 等）
    _add_server_args(serve_parser)

    # 参数：指定启动时预载入的演示追踪链路集合（以逗号分隔，如 "fixture1, fixture2"）
    serve_parser.add_argument(
        "--with-trace-fixtures",
        type=str,
        required=False,
        default="",
        help=(
            "Comma separated list of tracing fixture names (spaces are ignored). "
            "Example: 'fixture1, fixture2'"
        ),
    )
    # 参数：指定启动时预载入的项目名称集合（以逗号分隔，如 "project1, project2"）
    serve_parser.add_argument(
        "--with-projects",
        type=str,
        required=False,
        default="",
        help=(
            "Comma separated list of project names (spaces are ignored). "
            "Example: 'project1, project2'"
        ),
    )
    # 参数：是否强制导入演示数据。默认仅在空库导入，启用此标志后跳过数据库时间检查，强制写入演示链路
    serve_parser.add_argument(
        "--force-fixture-ingestion",
        action="store_true",
        required=False,
        help=(
            "Whether or not to check the database age before adding the fixtures. "
            "Default is False, i.e., fixtures will only be added if the "
            "database is new."
        ),
    )
    # 参数：是否在导入演示 Trace 时，自动在数据库中脚手架搭建（创建）其关联的评测数据集（Datasets）
    serve_parser.add_argument(
        "--scaffold-datasets",
        action="store_true",
        required=False,
        help=(
            "Whether or not to add any datasets defined in "
            "the inputted project or trace fixture. "
            "Default is False. "
        ),
    )

    # -------------------------------------------------------------------------
    # 2. 注册专用子命令：`phoenix trace-fixture`（离线演示与数据回放专用）
    # -------------------------------------------------------------------------
    # 创建 `trace-fixture` 专属的子命令解析器
    trace_fixture_parser = subparsers.add_parser("trace-fixture")
    # 同样绑定回调入口为 run(args)
    trace_fixture_parser.set_defaults(func=run)
    # 同样挂载通用的网络配置与服务端口参数
    _add_server_args(trace_fixture_parser)


"""
    # 测试用包：
    # 必选位置参数：指定要运行的内置演示包名称，choices 严格限定只能在 TRACES_FIXTURES 预设名单内选择
    trace_fixture_parser.add_argument(
        "fixture", type=str, choices=[fixture.name for fixture in TRACES_FIXTURES]
    )
    # 参数：动态流式模拟开关。启用后按真实时间戳间隔流式发射链路数据，便于测试前端 Live 实时刷新
    trace_fixture_parser.add_argument("--simulate-streaming", action="store_true")
"""


def run(args: Namespace) -> None:
    # TODO 注册退出钩子：在进程终止时自动移除 PID 文件

    # 获取数据库连接地址（优先命令行 --database-url，其次环境变量 PHOENIX_SQL_DATABASE_URL）
    db_connection_str = args.database_url or get_env_database_connection_str()

    # 1. 解析监听主机与服务端口 (HTTP 默认 6006, gRPC 默认 4317)
    host: Optional[str] = args.host or get_env_host()
    if host == "::":
        host = None

    port = args.port or get_env_port()  # HTTP / Web UI 端口（默认 6006）
    host_root_path = get_env_host_root_path()

    # TODO 监控

    # 初始化数据库引擎：包含主库引擎、只读读副本引擎以及执行 Alembic 自动迁移

    # 获取只读从库/读副本连接串（若配置，只读查询分流至从库，减轻主库写锁压力）
    read_replica_connection_str = get_env_read_replica_url()
    # 创建异步数据库会话工厂 (DbSessionFactory) 以及注册停机清理回调函数
    factory, shutdown_callbacks = _create_db_session_factory(
        db_connection_str=db_connection_str,  # 主数据库连接 URI（用于写入与核心事务）
        read_replica_connection_str=read_replica_connection_str,  # 只读从库连接 URI（用于分析报表与海量只读查询）
        migrate=not Settings.disable_migrations,  # 是否自动执行 Alembic DDL 数据库版本迁移
        log_to_stdout=get_env_log_sql(),  # 是否在控制台输出 SQLAlchemy 执行的原始 SQL
        log_migrations=Settings.log_migrations,  # 是否打印 Alembic 数据表迁移版本追踪日志
    )

    # 跨域资源共享 (CORS) 允许的源地址列表（允许前端跨域访问 API）
    allowed_origins = get_env_allowed_origins()


def _create_db_session_factory(
    *,
    db_connection_str: str,
    read_replica_connection_str: Optional[str],
    migrate: bool,
    log_to_stdout: bool,
    log_migrations: bool,
) -> tuple[DbSessionFactory, list[Callable[[], None | Awaitable[None]]]]:
    """
    【创建底层数据库引擎与会话工厂】

    设计关键点：
    1. 主引擎 (primary_engine)：负责所有的 DML 写入操作与 DDL 迁移；
    2. 只读引擎 (read_db)：
       - 对于 SQLite：创建专用的 aio_sqlite_read_engine，支持只读查询并发，避免排队在写锁后；
       - 对于 PostgreSQL：若配置了读副本 (Read Replica)，则将只读查询路由至副本集群以分散主库压力。
    3. 退出销毁回调：注册连接池 dispose 函数，确保优雅停机。
    """
    primary_engine = create_engine(
        connection_str=db_connection_str,
        migrate=migrate,
        log_to_stdout=log_to_stdout,
        log_migrations=log_migrations,
    )

    read_db = None
    if primary_engine.dialect.name == "sqlite":
        # SQLite 针对并发读取的优化：避免只读查询被写入者的单连接阻塞
        sqlite_read_engine = aio_sqlite_read_engine(
            get_async_db_url(db_connection_str), log_to_stdout=log_to_stdout
        )
        if sqlite_read_engine is not None:
            shutdown_callbacks.extend(instrument_engine_if_enabled(sqlite_read_engine))
            shutdown_callbacks.append(sqlite_read_engine.dispose)
            read_db = _db(sqlite_read_engine)
            logger.info("Read-only SQLite engine created")
    if read_replica_connection_str and primary_engine.dialect.name == "postgresql":
        # PostgreSQL 支持主从读写分离
        replica_engine = create_engine(
            connection_str=read_replica_connection_str,
            migrate=False,
            log_to_stdout=log_to_stdout,
        )
        shutdown_callbacks.extend(instrument_engine_if_enabled(replica_engine))
        shutdown_callbacks.append(replica_engine.dispose)
        read_db = _db(replica_engine)
        logger.info(
            "Read replica engine created for %s",
            read_replica_connection_str.split("@")[-1],
        )
    elif read_replica_connection_str:
        logger.warning(
            "PHOENIX_SQL_DATABASE_READ_REPLICA_URL is set but ignored for %s dialect",
            primary_engine.dialect.name,
        )
