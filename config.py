import os

ENV_PHOENIX_PORT = 6006
ENV_PHOENIX_HOST = "127.0.0.1"


def get_env_database_connection_str() -> str:
    if phoenix_url := os.getenv(ENV_PHOENIX_SQL_DATABASE_URL):
        return phoenix_url

    if postgres_url := get_env_postgres_connection_str():
        return postgres_url

    working_dir = get_working_dir()
    return f"sqlite:///{working_dir}/phoenix.db"


def get_env_database_connection_str() -> str:
    if phoenix_url := os.getenv(ENV_PHOENIX_SQL_DATABASE_URL):
        return phoenix_url

    if postgres_url := get_env_postgres_connection_str():
        return postgres_url

    working_dir = get_working_dir()
    return f"sqlite:///{working_dir}/phoenix.db"


def get_env_database_connection_str() -> str:
    if phoenix_url := os.getenv(ENV_PHOENIX_SQL_DATABASE_URL):
        return phoenix_url


def get_env_host() -> str:
    return getenv(ENV_PHOENIX_HOST) or HOST


def get_env_port() -> int:
    if not (port := getenv(ENV_PHOENIX_PORT)):
        return PORT
    if port.isnumeric():
        return int(port)
    if _KUBERNETES_PHOENIX_PORT_PATTERN.match(port) is not None:
        raise ValueError(
            'If you are deploying Phoenix with Kubernetes using a service named "phoenix", '
            "Kubernetes will automatically generate an environment variable `PHOENIX_PORT` "
            'of the form "tcp://<IP>:<PORT>" that is not the integer format Phoenix expects. '
            "To resolve this issue, explicitly set the `PHOENIX_PORT` environment variable to "
            "an integer value in your Kubernetes deployment configuration."
        )
    raise ValueError(
        f"Invalid value for environment variable {ENV_PHOENIX_PORT}: "
        f"{port}. Value must be an integer."
    )


def get_env_host_root_path() -> str:
    if not (host_root_path := getenv(ENV_PHOENIX_HOST_ROOT_PATH)):
        return HOST_ROOT_PATH
    if not host_root_path.startswith("/"):
        raise ValueError(
            f"Invalid value for environment variable {ENV_PHOENIX_HOST_ROOT_PATH}: "
            f"{host_root_path}. Value must start with '/'"
        )
    if host_root_path.endswith("/"):
        raise ValueError(
            f"Invalid value for environment variable {ENV_PHOENIX_HOST_ROOT_PATH}: "
            f"{host_root_path}. Value cannot end with '/'"
        )
    return host_root_path


def get_env_read_replica_url() -> str | None:
    return getenv(ENV_PHOENIX_SQL_DATABASE_READ_REPLICA_URL)


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


def get_env_log_sql() -> bool:
    return _bool_val(ENV_PHOENIX_LOG_SQL, False)


def get_env_allowed_origins() -> Optional[list[str]]:
    """
    获取环境变量 PHOENIX_ALLOWED_ORIGINS 配置的跨域允许域名列表。
    """
    allowed_origins = getenv(ENV_PHOENIX_ALLOWED_ORIGINS)
    if allowed_origins is None:
        return None

    return allowed_origins.split(",")


def get_env_root_url() -> URL:
    """
    获取在 Web 浏览器中直接访问 Phoenix 系统的规范化根 URL。

    返回:
    URL: Phoenix 服务的 Web 访问根地址对象。

    说明:
    此函数旨在替代遗留的 `get_base_url()` 辅助函数。
    尤其是 `get_env_collector_endpoint()` 实际上是为客户端 SDK 设计的，在服务端应当逐步废弃。
    """
    if root_url := getenv(ENV_PHOENIX_ROOT_URL):
        result = urlparse(root_url)
        if not result.scheme or not result.netloc:
            raise ValueError(
                f"The environment variable `{ENV_PHOENIX_ROOT_URL}` must be a valid URL."
            )
        return URL(root_url)
    host = get_env_host()
    if host == "0.0.0.0":
        host = "127.0.0.1"
    scheme = "https" if get_env_tls_enabled_for_http() else "http"
    return URL(urljoin(f"{scheme}://{host}:{get_env_port()}", get_env_host_root_path()))
