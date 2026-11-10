"""
文件名: serve.py
所属模块: Phoenix 命令行接口命令处理器 (server/cli/commands)
================================================================================
【功能说明】
提供控制台 `phoenix serve` 子命令的注册与执行逻辑：
1. 注册命令行参数（主机、端口、数据库地址、只读模式、调试模式等）；
2. 初始化本地高性能存储引擎（SQLite-WAL）；
3. 组装并启动 Uvicorn ASGI 高并发 HTTP 服务。
"""

from __future__ import annotations

import logging
from argparse import SUPPRESS, ArgumentParser, Namespace, _SubParsersAction

import uvicorn

import storage
from config import (
    get_env_allowed_origins,
    get_env_database_connection_str,
    get_env_host,
    get_env_port,
)

logger = logging.getLogger("server.serve")


def _add_server_args(parser: ArgumentParser) -> None:
    """添加 serve 命令行通用参数配置"""
    parser.add_argument("--database-url", required=False, help="数据库连接串 (默认本地 SQLite)")
    parser.add_argument("--host", type=str, required=False, help="监听主机 IP (默认 127.0.0.1)")
    parser.add_argument("--port", type=int, required=False, help="监听端口 (默认 6006)")
    parser.add_argument("--read-only", action="store_true", required=False, help="开启只读演示模式")
    parser.add_argument("--debug", action="store_true", help="开启调试日志模式")
    parser.add_argument("--no-ui", action="store_true", help=SUPPRESS)


def register(subparsers: _SubParsersAction[ArgumentParser]) -> None:
    """向主命令行解析器注册 `phoenix serve` 子命令"""
    serve_parser = subparsers.add_parser("serve", help="启动本地 Agent 可观测性后端服务")
    serve_parser.set_defaults(func=run)
    _add_server_args(serve_parser)


def run(args: Namespace) -> None:
    """
    【服务主执行入口】
    负责加载配置、初始化存储中枢并启动 Uvicorn Web 服务器。
    """
    # 1. 解析网络监听主机与端口配置 (CLI 参数优先于配置文件与环境变量)
    host: str | None = args.host or get_env_host()
    if host == "::":
        host = None

    port = args.port or get_env_port()
    read_only = getattr(args, "read_only", False)
    debug = getattr(args, "debug", False)
    allowed_origins = get_env_allowed_origins()

    # 2. 解析并初始化本地数据库引擎
    db_connection_str = args.database_url or get_env_database_connection_str()
    # 若为 sqlite:/// 格式，提取实际物理文件路径，否则使用默认 trace.db
    db_file = "trace.db"
    if "sqlite:///" in db_connection_str:
        db_file = db_connection_str.split("sqlite:///")[-1]

    print(f"[Serve] 📦 正在连接本地高性能数据库: {db_file}")
    db = storage.init_db(db_file)

    # 3. 构造 FastAPI 核心应用实例
    try:
        from server.app import create_app
    except ImportError:
        from app import create_app

    app = create_app(
        db=db,
        debug=debug,
        read_only=read_only,
        allowed_origins=allowed_origins,
    )

    # 4. 控制台打印启动欢迎信息
    display_host = "localhost" if host in (None, "0.0.0.0", "::") else host
    print("=" * 70)
    print("🚀 本地一体化 AI Agent 可观测性平台启动就绪！")
    print(f"👉 Web 控制台与 API 入口: http://{display_host}:{port}")
    print(f"📖 交互式接口文档 (Swagger): http://{display_host}:{port}/docs")
    print(f"🔒 运行模式: {'只读模式 (ReadOnly)' if read_only else '读写全功能模式'}")
    print("=" * 70)

    # 5. 启动 Uvicorn 异步事件循环
    try:
        uvicorn.run(
            app,
            host=host or "127.0.0.1",
            port=port,
            log_level="debug" if debug else "info",
        )
    except KeyboardInterrupt:
        print("\n[Serve] 🛑 接收到退出信号，正在关闭服务与数据库连接...")
        db.close()
        print("[Serve] ✅ 服务已安全退出。")
