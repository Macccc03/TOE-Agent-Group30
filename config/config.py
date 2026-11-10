"""
文件名: config.py
所属模块: 全局配置管理模块 (config)
================================================================================
【配置提取规则】
系统统一执行如下两级提取策略：
1. 首先提取本地环境变量 (os.getenv)；
2. 如果本地环境变量不存在或为空 (None / 空字符串)，则回退并读取 config.yaml 中的默认配置项；
3. 如果 YAML 中亦未配置或为空，则采用代码预设的终极保底默认值。
"""

import os
from pathlib import Path
from typing import Any, assert_never
from urllib.parse import urljoin, urlparse

import yaml
from sqlalchemy import URL, make_url

from storage.helpers import SupportedSQLDialect

# -----------------------------------------------------------------------------
# 1. 配置文件定位与动态 YAML 加载器
# -----------------------------------------------------------------------------
CONFIG_DIR = Path(__file__).resolve().parent
YAML_PATH = CONFIG_DIR / "config.yaml"

_yaml_cache: dict[str, Any] | None = None


def load_yaml_config(reload: bool = False) -> dict[str, Any]:
    """
    加载 config.yaml 配置文件内容。
    支持热重载、文件不存在容错及格式异常安全回退。
    """
    global _yaml_cache
    if _yaml_cache is not None and not reload:
        return _yaml_cache

    if YAML_PATH.exists():
        try:
            with open(YAML_PATH, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                _yaml_cache = data if isinstance(data, dict) else {}
        except (yaml.YAMLError, OSError):
            _yaml_cache = {}
    else:
        _yaml_cache = {}
    return _yaml_cache


def get_config_value(
    env_name: str, yaml_keys: tuple[str, ...], default: Any = None
) -> Any:
    """
    【统一提取核心函数】：
    1. 首先提取本地环境变量 (os.getenv)；
    2. 如果提取为空（未设置或纯空白字符串），则检索 config.yaml 对应层级键值；
    3. 若 YAML 中依然为空或未定义，则返回代码预设 default。
    """
    # 步骤 1: 优先提取本地环境变量
    env_val = os.getenv(env_name)
    if env_val is not None:
        trimmed = str(env_val).strip()
        if trimmed != "":
            return trimmed

    # 步骤 2: 若环境变量为空，则使用 YAML 内的默认信息配置
    cfg = load_yaml_config()
    curr: Any = cfg
    for k in yaml_keys:
        if isinstance(curr, dict) and k in curr:
            curr = curr[k]
        else:
            return default

    # 步骤 3: 校验 YAML 提取结果
    if curr is None:
        return default
    if isinstance(curr, str) and curr.strip() == "":
        return default

    return curr


# -----------------------------------------------------------------------------
# 2. 环境变量名常量定义 (保持向后兼容)
# -----------------------------------------------------------------------------
ENV_PHOENIX_PORT = "PHOENIX_PORT"
ENV_PHOENIX_HOST = "PHOENIX_HOST"
ENV_PHOENIX_HOST_ROOT_PATH = "PHOENIX_HOST_ROOT_PATH"
ENV_PHOENIX_SQL_DATABASE_URL = "PHOENIX_SQL_DATABASE_URL"
ENV_PHOENIX_SQL_DATABASE_READ_REPLICA_URL = "PHOENIX_SQL_DATABASE_READ_REPLICA_URL"
ENV_PHOENIX_LOG_SQL = "PHOENIX_LOG_SQL"
ENV_PHOENIX_ALLOWED_ORIGINS = "PHOENIX_ALLOWED_ORIGINS"
ENV_PHOENIX_ROOT_URL = "PHOENIX_ROOT_URL"
ENV_PHOENIX_WORKING_DIR = "PHOENIX_WORKING_DIR"
ENV_PHOENIX_SECRET = "PHOENIX_SECRET"
ENV_PHOENIX_ADMIN_SECRET = "PHOENIX_ADMIN_SECRET"
ENV_PHOENIX_TLS_ENABLED = "PHOENIX_TLS_ENABLED"

# 默认兼容静态常量
PORT = 6006
HOST = "127.0.0.1"
HOST_ROOT_PATH = ""


# -----------------------------------------------------------------------------
# 3. 核心配置提取接口
# -----------------------------------------------------------------------------


def get_env_host() -> str:
    """获取监听主机，优先环境变量 PHOENIX_HOST，次之 config.yaml [server.host]，默认 127.0.0.1"""
    return str(
        get_config_value(ENV_PHOENIX_HOST, ("server", "host"), default="127.0.0.1")
    )


def get_env_port() -> int:
    """获取监听端口，优先环境变量 PHOENIX_PORT，次之 config.yaml [server.port]，默认 6006"""
    raw_val = get_config_value(ENV_PHOENIX_PORT, ("server", "port"), default=6006)
    try:
        return int(raw_val)
    except (ValueError, TypeError) as exc:
        raise ValueError(
            f"Invalid value for port configuration: {raw_val}. Value must be an integer."
        ) from exc


def get_env_host_root_path() -> str:
    """获取根路径子目录，优先环境变量 PHOENIX_HOST_ROOT_PATH，次之 config.yaml [server.host_root_path]"""
    val = str(
        get_config_value(
            ENV_PHOENIX_HOST_ROOT_PATH, ("server", "host_root_path"), default=""
        )
    )
    if not val:
        return ""
    if not val.startswith("/"):
        raise ValueError(
            f"Invalid value for host root path: {val}. Value must start with '/'"
        )
    if val.endswith("/"):
        raise ValueError(
            f"Invalid value for host root path: {val}. Value cannot end with '/'"
        )
    return val


def get_working_dir() -> Path:
    """获取本地持久化工作目录，优先环境变量 PHOENIX_WORKING_DIR，次之 config.yaml [database.working_dir]，默认 ~/.phoenix"""
    val = get_config_value(
        ENV_PHOENIX_WORKING_DIR, ("database", "working_dir"), default="~/.phoenix"
    )
    expanded = os.path.expanduser(str(val))
    return Path(expanded).resolve()


def get_env_database_connection_str() -> str:
    """获取主数据库连接串，优先环境变量，次之 config.yaml [database.connection_str]，若均未配置则默认构建本地 SQLite 文件"""
    val = get_config_value(
        ENV_PHOENIX_SQL_DATABASE_URL, ("database", "connection_str"), default=""
    )
    if val:
        return str(val)

    working_dir = get_working_dir()
    return f"sqlite:///{working_dir}/phoenix.db"


def get_env_read_replica_url() -> str | None:
    """获取只读副本连接串，优先环境变量，次之 config.yaml [database.read_replica_url]"""
    val = get_config_value(
        ENV_PHOENIX_SQL_DATABASE_READ_REPLICA_URL,
        ("database", "read_replica_url"),
        default=None,
    )
    return str(val) if val else None


def get_env_log_sql() -> bool:
    """获取是否打印 SQL，优先环境变量，次之 config.yaml [database.log_sql]"""
    val = get_config_value(ENV_PHOENIX_LOG_SQL, ("database", "log_sql"), default=False)
    if isinstance(val, bool):
        return val
    return str(val).lower() in ("true", "1", "yes", "on")


def get_env_allowed_origins() -> list[str] | None:
    """获取允许跨域的源列表，优先环境变量 (逗号拆分)，次之 config.yaml [server.allowed_origins]"""
    val = get_config_value(
        ENV_PHOENIX_ALLOWED_ORIGINS,
        ("server", "allowed_origins"),
        default=None,
    )
    if val is None:
        return None
    if isinstance(val, list):
        return [str(item) for item in val]
    return [item.strip() for item in str(val).split(",") if item.strip()]


def get_env_tls_enabled_for_http() -> bool:
    """获取是否启用 TLS/HTTPS，优先环境变量，次之 config.yaml [server.tls_enabled]"""
    val = get_config_value(
        ENV_PHOENIX_TLS_ENABLED, ("server", "tls_enabled"), default=False
    )
    if isinstance(val, bool):
        return val
    return str(val).lower() in ("true", "1", "yes", "on")


def get_env_root_url() -> URL:
    """
    获取规范化的外部 Web 访问根 URL。
    优先读取环境变量 PHOENIX_ROOT_URL，次之 config.yaml [server.root_url]；
    若均未指定，则基于 host、port 及 host_root_path 动态构建。
    """
    if root_url := get_config_value(
        ENV_PHOENIX_ROOT_URL, ("server", "root_url"), default=""
    ):
        result = urlparse(str(root_url))
        if not result.scheme or not result.netloc:
            raise ValueError(f"The root URL `{root_url}` must be a valid URL.")
        return make_url(str(root_url))

    host = get_env_host()
    if host == "0.0.0.0":
        host = "127.0.0.1"
    scheme = "https" if get_env_tls_enabled_for_http() else "http"
    port = get_env_port()
    root_path = get_env_host_root_path()
    return make_url(urljoin(f"{scheme}://{host}:{port}", root_path))


def get_async_db_url(connection_str: str) -> URL:
    """
    解析数据库连接字符串，自动将其重写升级为对应的异步非阻塞驱动协议：
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
        if url.username and url.password:
            url = url.set(
                query={**url.query, "user": url.username, "password": url.password},
                password=None,
                username=None,
            )
        return url
    else:
        assert_never(backend)


# -----------------------------------------------------------------------------
# 4. 辅助安全与队列容量配置 (保持与现有服务端调用兼容)
# -----------------------------------------------------------------------------


def get_env_phoenix_secret() -> str | None:
    """获取 JWT/加密对称密钥，优先环境变量，次之 config.yaml [security.secret]"""
    val = get_config_value(ENV_PHOENIX_SECRET, ("security", "secret"), default=None)
    return str(val) if val else None


def get_env_phoenix_admin_secret() -> str | None:
    """获取管理员特权密钥，优先环境变量，次之 config.yaml [security.admin_secret]"""
    val = get_config_value(
        ENV_PHOENIX_ADMIN_SECRET, ("security", "admin_secret"), default=None
    )
    return str(val) if val else None


def get_env_max_spans_queue_size() -> int:
    """获取缓冲队列最大容量，优先环境变量，次之 config.yaml [queue.max_spans_queue_size]，默认 10000"""
    val = get_config_value(
        "PHOENIX_MAX_SPANS_QUEUE_SIZE", ("queue", "max_spans_queue_size"), default=10000
    )
    try:
        return int(val)
    except (ValueError, TypeError):
        return 10000


def get_env_database_allocated_storage_capacity_gibibytes() -> int:
    """获取数据库最大配额容量，优先环境变量，次之 config.yaml [database.allocated_storage_gibibytes]，默认 10"""
    val = get_config_value(
        "PHOENIX_DATABASE_ALLOCATED_STORAGE_CAPACITY_GIBIBYTES",
        ("database", "allocated_storage_gibibytes"),
        default=10,
    )
    try:
        return int(val)
    except (ValueError, TypeError):
        return 10


def get_env_database_usage_email_warning_threshold_percentage() -> int:
    """获取容量告警阈值百分比，默认 80"""
    val = get_config_value(
        "PHOENIX_DATABASE_USAGE_EMAIL_WARNING_THRESHOLD_PERCENTAGE",
        ("database", "usage_email_warning_threshold"),
        default=80,
    )
    try:
        return int(val)
    except (ValueError, TypeError):
        return 80


def get_env_database_usage_insertion_blocking_threshold_percentage() -> int:
    """获取容量写阻断阈值百分比，默认 95"""
    val = get_config_value(
        "PHOENIX_DATABASE_USAGE_INSERTION_BLOCKING_THRESHOLD_PERCENTAGE",
        ("database", "usage_insertion_blocking_threshold"),
        default=95,
    )
    try:
        return int(val)
    except (ValueError, TypeError):
        return 95


def validate_env_allowed_providers() -> None:
    """校验第三方提供商配置合法性（桩函数，保持调用兼容）"""


def validate_env_allowed_sandbox_providers() -> None:
    """校验代码沙箱提供商配置合法性（桩函数，保持调用兼容）"""


def validate_env_support_email() -> None:
    """校验技术支持邮箱配置合法性（桩函数，保持调用兼容）"""


def validate_env_wasm_binary_path() -> None:
    """校验 WASM 二进制文件路径（桩函数，保持调用兼容）"""
