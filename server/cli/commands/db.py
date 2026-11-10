"""
Phoenix 命令行接口命令处理器 (CLI Command): db.py
================================================================================
提供控制台命令行工具执行逻辑（服务启动、数据库初始化、数据导出等）。
"""

import asyncio
from argparse import SUPPRESS, Namespace
from typing import TYPE_CHECKING

from config import get_env_database_connection_str
from storage.engines import create_engine

if TYPE_CHECKING:
    from argparse import ArgumentParser, _SubParsersAction


def register(subparsers: _SubParsersAction[ArgumentParser]) -> None:
    db_parser = subparsers.add_parser("db", help=SUPPRESS)
    db_subparsers = db_parser.add_subparsers(
        dest="db_command", required=True, help=SUPPRESS
    )
    migrate_parser = db_subparsers.add_parser(
        "migrate",
        help="Run database migrations and exit.",
    )
    migrate_parser.add_argument("--database-url", required=False, help=SUPPRESS)
    migrate_parser.set_defaults(func=_run_db_migrate)


def _run_db_migrate(args: Namespace) -> None:
    db_connection_str = args.database_url or get_env_database_connection_str()
    engine = create_engine(
        connection_str=db_connection_str,
        migrate=True,
        log_to_stdout=True,
        log_migrations=True,
    )
    asyncio.run(engine.dispose())
