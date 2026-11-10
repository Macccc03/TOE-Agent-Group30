"""
Phoenix 运行时动态配置上下文 (Runtime Dynamic Settings)
======================================================

提供一个全局单例 `Settings`，负责维护应用程序运行过程中的动态状态与日志/迁移开关。
与静态环境变量驱动的 `config.py` 协同工作，支持运行时动态惰性初始化与参数更新。
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

from phoenix.config import LoggingMode


@dataclass
class _Settings:
    """
    Phoenix 运行时配置数据类，支持惰性初始化与动态调整。
    """

    # 是否打印数据库迁移 DDL 过程的详细日志，默认关闭
    log_migrations: bool = field(default=False)
    # 日志输出模式：DEFAULT (传统标准输出) 或 STRUCTURED (结构化 JSON)
    logging_mode: LoggingMode = field(default=LoggingMode.DEFAULT)
    # Phoenix 业务日志等级，默认为 INFO
    logging_level: int = field(default=logging.INFO)
    # SQLAlchemy 数据库引擎与连接池日志等级，默认为 WARNING
    db_logging_level: int = field(default=logging.WARNING)
    # 是否强制禁用数据库自动迁移，生产环境若由外部 Pipeline 管理表结构时可设为 True
    disable_migrations: bool = field(default=False)
    # 用于 Web 端行为分析的 FullStory 组织机构 ID
    fullstory_org: Optional[str] = field(default=None)
    # 用于开源使用量打点的 Scarf.sh 像素像素点 ID
    scarf_sh_pixel_id: Optional[str] = field(default=None)


# 全局共享的运行时设置单例实例
Settings = _Settings()
