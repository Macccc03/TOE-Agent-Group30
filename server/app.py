"""
文件名: app.py
所属模块: 服务端应用主装配中枢 (server)
================================================================================
【功能说明】
FastAPI 核心应用构造工厂 (Application Factory):
为本地一体化 AI Agent 可观测性平台装配核心中间件与 RESTful 路由：
1. 全局存储引擎状态注入 (app.state.db)：供所有接口访问底层 SQLite-WAL 高性能数据库；
2. CORS 跨域放行：支持本地前端（如 Vite 本地服务 http://localhost:5173）与后端 API 独立联调；
3. 核心可观测路由挂载：挂载 /api 路由集（含探针收集、建树、大盘指标、单步点查）。
"""

import logging
import os
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("server.app")


def verify_server_environment_variables() -> None:
    """
    启动阶段环境变量兼容性核验。
    若检测到旧版弃用配置则打印友好告警，保障平滑迁移。
    """
    if os.getenv("PHOENIX_ENABLE_WEBSOCKETS") is not None:
        logger.warning(
            "The environment variable PHOENIX_ENABLE_WEBSOCKETS is deprecated "
            "because WebSocket is no longer necessary."
        )


def create_app(
    db: Any = None,
    debug: bool = False,
    read_only: bool = False,
    allowed_origins: list[str] | None = None,
) -> FastAPI:

    verify_server_environment_variables()

    app = FastAPI(
        title="Local Agent Observability Platform",
        description="本地一体化 AI Agent 可观测性与追踪平台",
        version="1.0.0",
        debug=debug,
    )

    # 1. 注入本地数据库引擎实例
    if db is not None:
        app.state.db = db
    app.state.read_only = read_only

    # 2. 挂载 CORS 跨域中间件（供本地前端仪表盘独立访问）
    origins = allowed_origins or ["*"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 3. 挂载新架构核心观测 API 路由 (/api/spans, /api/traces, /api/metrics 等)
    from server.routers import api_router
    from server.routers.phoenix import router as phoenix_router

    app.include_router(api_router)
    app.include_router(phoenix_router)

    return app
