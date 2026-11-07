import os
from typing import (
    Callable,
    Iterable,
    Optional,
    Union,
)

from fastapi import APIRouter, Depends, FastAPI
from typing_extensions import TypeAlias

from config import (
    get_env_database_allocated_storage_capacity_gibibytes,
    get_env_database_usage_email_warning_threshold_percentage,
    get_env_database_usage_insertion_blocking_threshold_percentage,
    get_env_max_spans_queue_size,
    get_env_phoenix_admin_secret,
    get_env_phoenix_secret,
    get_env_root_url,
    validate_env_allowed_providers,
    validate_env_allowed_sandbox_providers,
    validate_env_support_email,
    validate_env_wasm_binary_path,
)

_Callback: TypeAlias = Callable[[], Union[None, Awaitable[None]]]


def verify_server_environment_variables() -> None:
    """
    在服务启动阶段全面核验所有系统环境变量的兼容性与正确性。
    如果存在互斥、无效、格式错误或缺失的致命依赖项，将立即中断启动并抛出详细错误提示。
    """
    get_env_root_url()
    get_env_phoenix_secret()
    get_env_phoenix_admin_secret()
    get_env_database_allocated_storage_capacity_gibibytes()
    get_env_database_usage_email_warning_threshold_percentage()
    get_env_database_usage_insertion_blocking_threshold_percentage()
    get_env_max_spans_queue_size()
    validate_env_support_email()
    validate_env_allowed_providers()
    validate_env_allowed_sandbox_providers()
    validate_env_wasm_binary_path()

    # 若检测到正在使用已弃用的旧版环境变量，输出醒目的告警提示信息
    if os.getenv("PHOENIX_ENABLE_WEBSOCKETS") is not None:
        logger.warning(
            "The environment variable PHOENIX_ENABLE_WEBSOCKETS is deprecated "
            "because WebSocket is no longer necessary."
        )
    if os.getenv("PHOENIX_POSTGRES_AWS_IAM_TOKEN_LIFETIME_SECONDS") is not None:
        logger.warning(
            "The environment variable PHOENIX_POSTGRES_AWS_IAM_TOKEN_LIFETIME_SECONDS "
            "is deprecated and ignored because AWS IAM token lifetime is no longer used "
            "to control PostgreSQL pool recycling."
        )


def create_app(
    db: DbSessionFactory,
    authentication_enabled: bool,
    debug: bool = False,
    dev: bool = False,
    dev_vite_port: int = 5173,
    read_only: bool = False,
    grpc_port: Optional[int] = None,
    enable_prometheus: bool = False,
    initial_spans: Optional[Iterable[Union[Span, tuple[Span, str]]]] = None,
    initial_annotation_precursors: Optional[Iterable[AnnotationPrecursor]] = None,
    serve_ui: bool = True,
    startup_callbacks: Iterable[_Callback] = (),
    shutdown_callbacks: Iterable[_Callback] = (),
    secret: Optional[SecretStr] = None,
    password_reset_token_expiry: Optional[timedelta] = None,
    access_token_expiry: Optional[timedelta] = None,
    refresh_token_expiry: Optional[timedelta] = None,
    scaffolder_config: Optional[ScaffolderConfig] = None,
    email_sender: Optional[EmailSender] = None,
    oauth2_client_configs: Optional[list[OAuth2ClientConfig]] = None,
    ldap_config: Optional["LDAPConfig"] = None,
    basic_auth_disabled: bool = False,
    bulk_inserter_factory: Optional[Callable[..., BulkInserter]] = None,
    allowed_origins: Optional[list[str]] = None,
    management_url: Optional[str] = None,
    welcome_message: Optional[_WelcomeMessage] = None,
) -> FastAPI:
    """
    【FastAPI / ASGI 核心应用构造主工厂函数 (The Core Application Factory)】
    ================================================================================
    作为 Arize Phoenix 服务端的中枢组装引擎，负责自底向上初始化并编排所有核心子系统：
    1. 中间件管线 (Middlewares): 安全响应头、CSRF 域名防御、JWT/Bearer 认证、跨域 CORS、数据脱敏等；
    2. API 路由集成 (Routers): RESTful API (/v1)、GraphQL 端点 (/graphql)、OAuth2 / OIDC / LDAP 认证网关；
    3. 遥测服务与后台守护 (OTel & Daemons): OpenTelemetry 接收器、gRPC 端口绑定、后台批量落盘引擎与清理调度器；
    4. 智能体与工具生态 (Agents & MCP): 挂载 Model Context Protocol (MCP) 端点及代码执行沙箱环境；
    5. 前端单页应用 (SPA): 动态注入运行配置，托管并渲染现代化的 React Web UI 看板。

    参数说明 (Parameters):
        db (DbSessionFactory):
            核心数据库会话工厂，用于获取底层 SQLAlchemy 异步 Session，支持 SQLite 与 PostgreSQL。
        authentication_enabled (bool):
            是否开启身份认证。若为 True，访问大部分 API 与界面均需登录或提供 Bearer Token。
        debug (bool, 默认 False):
            是否开启调试模式。开启后异常信息将打印至控制台，并启用 FastAPI debug 模式。
        dev (bool, 默认 False):
            是否开启前端开发者热更新 (HMR) 模式。开启后静态资源请求自动代理至 Vite 本地开发服务器。
        dev_vite_port (int, 默认 5173):
            Vite 前端本地开发服务器的监听端口。
        read_only (bool, 默认 False):
            只读模式开关。若为 True，禁止所有对数据库的增删改写入操作，仅提供查询服务。
        grpc_port (Optional[int], 默认 None):
            OpenTelemetry OTLP gRPC 协议接收端口。若为 None 则从环境变量或默认值 (4317) 解析。
        enable_prometheus (bool, 默认 False):
            是否启用 Prometheus 性能指标导出中间件与监控端点 (/metrics)。
        initial_spans (Optional[Iterable[Union[Span, tuple[Span, str]]]], 默认 None):
            服务启动时自动预加载并写入数据库的初始追踪链路 (Spans) 数据集合。
        initial_annotation_precursors (Optional[Iterable[AnnotationPrecursor]], 默认 None):
            服务启动时自动写入的初始评测打分及标注前置数据。
        serve_ui (bool, 默认 True):
            是否托管并对外提供 React Web UI 前端单页应用。若为 False 则仅作为无头 (Headless) API 服务运行。
        startup_callbacks (Iterable[_Callback], 默认 ()):
            应用启动生命周期中需顺序执行的异步或同步前置回调函数列表。
        shutdown_callbacks (Iterable[_Callback], 默认 ()):
            应用关闭生命周期中需顺序执行的清理与资源释放回调函数列表。
        secret (Optional[SecretStr], 默认 None):
            应用主对称密钥。用于 JWT 签名校验、密码哈希加盐及敏感字段对称加解密。
        password_reset_token_expiry (Optional[timedelta], 默认 None):
            用户找回密码重置链接与 Token 的有效期时限。
        access_token_expiry (Optional[timedelta], 默认 None):
            用户正常登录后颁发的访问令牌 (Access Token) 的有效生命周期。
        refresh_token_expiry (Optional[timedelta], 默认 None):
            刷新令牌 (Refresh Token) 的有效生命周期。
        scaffolder_config (Optional[ScaffolderConfig], 默认 None):
            数据库空库初始化与样例数据自动脚手架配置。
        email_sender (Optional[EmailSender], 默认 None):
            邮件发送组件实例 (SMTP)，用于发送重置密码验证邮件与系统告警通知。
        oauth2_client_configs (Optional[list[OAuth2ClientConfig]], 默认 None):
            已配置的第三方 OAuth2 / OIDC 单点登录身份源列表 (如 Google, GitHub, Okta, Azure AD)。
        ldap_config (Optional[LDAPConfig], 默认 None):
            企业级 LDAP / Active Directory 目录认证配置。
        basic_auth_disabled (bool, 默认 False):
            是否彻底禁用传统的账号密码直登，强制用户仅能通过 SSO / OAuth2 单点登录。
        bulk_inserter_factory (Optional[Callable[..., BulkInserter]], 默认 None):
            异步批量写入引擎工厂函数。若未提供则默认使用内置标准 BulkInserter。
        allowed_origins (Optional[list[str]], 默认 None):
            CORS 跨域资源共享允许的主机白名单。
        management_url (Optional[str], 默认 None):
            Phoenix 企业版租户管理控制面入口 URL。
        welcome_message (Optional[_WelcomeMessage], 默认 None):
            控制台启动欢迎横幅生成函数，打印服务就绪地址与端口列表。

    返回:
        FastAPI: 组装完成、包含完整中间件管线与全生命周期管理器的 FastAPI 核心应用实例。
    """

    # 校验所有 Phoenix 服务端运行所需的环境变量格式、取值范围及互斥依赖配置
    verify_server_environment_variables()
    # TODO 校验用户配置的 OAuth2 身份提供商 (IdP) 名称，防止与保留的认证系统端点路由发生冲突
    # _validate_oauth2_idp_names(oauth2_client_configs or [])

    # 浅拷贝服务启动与停机回调函数列表，确保在追加内部钩子时不影响外部调用方传入的集合
    # startup_callbacks_list: list[_Callback] = list(startup_callbacks)
    # shutdown_callbacks_list: list[_Callback] = list(shutdown_callbacks)

    # 注册数据库初始化辅助对象 Facilitator 作为首选启动回调，负责建表与基础表结构初始化
    # startup_callbacks_list.append(Facilitator(db=db))

    # 注册 WebAssembly 二进制资源预拉取回调（若开启了相关本地快速沙箱或解析加速支持）
    # startup_callbacks_list.append(prefetch_wasm_binary_if_needed)

    # 对服务启动时要求预热或直插的 Span 数据流进行标准化，缺失项目名称时默认挂载至 `default`
    # initial_batch_of_spans: Iterable[tuple[Span, str]] = (
    #     ()
    #     if initial_spans is None
    #     else (
    #         ((item, DEFAULT_PROJECT_NAME) if isinstance(item, Span) else item)
    #         for item in initial_spans
    #     )
    # )
    # 服务启动阶段预加载的标注前驱元数据定义
    # startup_annotation_precursors = (
    #     () if initial_annotation_precursors is None else initial_annotation_precursors
    # )

    # # 若底层数据库方言为 SQLite，由于其并发写入并发度受限，启用内存 DataLoader 缓存以降低锁争用
    # cache_for_dataloaders = (
    #     CacheForDataLoaders() if db.dialect is SupportedSQLDialect.SQLITE else None
    # )
    # # 实例化全局数据最后变更时间戳跟踪器，用于 GraphQL 轮询缓存失效与实时增量对比
    # last_updated_at = LastUpdatedAt()

    # # 解析 MCP (Model Context Protocol) 挂载路径：
    # # 匿名端点路径集合在构建中间件堆栈前必须明确解析，
    # # 因为它不仅用于下方的 CSRF 来源验证中间件，还用于末尾的 AnonymousCorsMiddleware 跨域白名单放行
    # mcp_mount_path: Optional[str] = None
    # if get_env_enable_mcp_server():
    #     mcp_mount_path = MCP_MOUNT_PATH
    # # 获取需要豁免身份验证与 CSRF 保护的匿名公共端点路径集合
    # anonymous_surfaces = anonymous_paths(mcp_mount_path)


     middlewares: list[Middleware] = [
        # 响应头管理中间件：注入版本号及 Colab 笔记本缓存控制指令
        Middleware(HeadersMiddleware),
        # 敏感信息脱敏中间件：绑定 ContextVar 脱敏处理器上下文
        Middleware(RedactorMiddleware),
    ]

    # # 动态加载由第三方插件或用户定制扩展注入的全局 FastAPI 中间件
    # middlewares.extend(user_fastapi_middlewares())

    # # CSRF 跨站请求伪造防护中间件挂载
    # if origins := get_env_csrf_trusted_origins():
    #     # 从配置的受信 Origin 列表中解析合法主机名
    #     trusted_hostnames = [h for o in origins if o and (h := urlparse(o).hostname)]
    #     middlewares.append(
    #         Middleware(
    #             RequestOriginHostnameValidator,
    #             trusted_hostnames=trusted_hostnames,
    #             anonymous_paths=anonymous_surfaces,
    #         )
    #     )
    # elif email_sender or oauth2_client_configs:
    #     # 当启用了邮件重置密码或 OAuth2 认证但未配置 CSRF 受信域时，打印合规性安全告警
    #     logger.warning(
    #         "CSRF protection can be enabled by listing trusted origins via "
    #         f"the `{ENV_PHOENIX_CSRF_TRUSTED_ORIGINS}` environment variable. "
    #         "This is recommended when setting up OAuth2 clients or sending "
    #         "password reset emails."
    #     )

    # # 用户鉴权与 Token 存储器初始化 (基于 JWT 与数据库持久化)
    # if authentication_enabled and secret:
    #     token_store = JwtStore(db, secret)
    #     middlewares.append(
    #         Middleware(
    #             AuthenticationMiddleware,
    #             backend=BearerTokenAuthBackend(token_store),
    #         )
    #     )
    # else:
    #     token_store = None

    # 实例化 DML 数据变更事件分发总线，负责协调跨服务事件通知与缓存失效
    dml_event_handler = DmlEventHandler(
        db=db,
        cache_for_dataloaders=cache_for_dataloaders,
        last_updated_at=last_updated_at,
    )
    # 实例化过期追踪数据定时清理器 (TTL 清理守护线程)
    trace_data_sweeper = TraceDataSweeper(
        db=db,
        dml_event_handler=dml_event_handler,
    )
    # 实例化持久化系统动态设置管理器
    system_settings = SystemSettings(db=db, registry=SETTINGS_REGISTRY)
    # 实例化智能体对话会话过期清理守护任务
    agent_session_sweeper = AgentSessionSweeper(db, settings=system_settings)
    # 实例化评估实验临时数据定时清理器
    experiment_sweeper = ExperimentSweeper(db)
    # 实例化生成式大模型元数据及定价规则存储器
    generative_model_store = GenerativeModelStore(db)
    # 实例化 Span 消耗 Token 与调用开销实时计算器
    span_cost_calculator = SpanCostCalculator(generative_model_store)
    # 构造异步批量插入引擎，管理高并发写入缓冲队列与批量持久化刷盘
    bulk_inserter = bulk_inserter_factory(
        db,
        span_cost_calculator=span_cost_calculator,
        event_queue=dml_event_handler,
        initial_batch_of_spans=initial_batch_of_spans,
        max_spans_queue_size=get_env_max_spans_queue_size(),
    )

    