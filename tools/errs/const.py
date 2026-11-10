"""
文件名: const.py
所属模块: 全局统一错误码与预定义错误对象 (tools.errs)
================================================================================
【设计宗旨与参考规范】
参考自 Go 微服务架构 (MyBlogNew/Backend/tools/errs/predefine.go):
1. 错误码常量集中管理 (const): 统一定义系统级状态码与观测领域业务状态码；
2. 预定义错误模板对象 (var Err*): 提供开箱即用的错误单例对象，支持通过 .with_detail() 或 .wrap_msg() 复用与扩展。
"""

from __future__ import annotations

from tools.errs.errors import CodeError

# ==============================================================================
# 1. 预定义业务错误码常量 (对标 Go predefine.go 中的 const 声明)
# ==============================================================================

# 基础系统状态码 (1000 - 1099) & HTTP 对齐
CODE_OK: int = 200
CODE_INTERNAL_SERVER: int = 500
CODE_ARGS_ERROR: int = 1001
CODE_NOT_FOUND: int = 1002
CODE_UNAUTHORIZED: int = 1003
CODE_FORBIDDEN: int = 1004

# 兼容 Go 命名习惯的别名 (对标 predefine.go)
ServerInternalError: int = CODE_INTERNAL_SERVER
ArgsError: int = CODE_ARGS_ERROR
NotFoundError: int = CODE_NOT_FOUND
UnauthorizedError: int = CODE_UNAUTHORIZED
ForbiddenError: int = CODE_FORBIDDEN

# 核心可观测业务状态码 (2000 - 2999)
CODE_DATABASE_ERROR: int = 2001
CODE_PROBE_ERROR: int = 2002
CODE_PROCESSOR_ERROR: int = 2003
CODE_DESENSITIZE_ERROR: int = 2004
CODE_TREE_BUILD_ERROR: int = 2005

# ==============================================================================
# 2. 预定义错误单例模板 (对标 Go predefine.go 中的 var Err* 声明)
# 可通过 .with_detail(...) 或 .wrap_msg(...) 快速扩展业务上下文
# ==============================================================================

# 基础系统错误模板
ErrInternalServer: CodeError = CodeError(CODE_INTERNAL_SERVER, "Internal Server Error")
ErrArgs: CodeError = CodeError(CODE_ARGS_ERROR, "Invalid Arguments")
ErrNotFound: CodeError = CodeError(CODE_NOT_FOUND, "Resource Not Found")
ErrUnauthorized: CodeError = CodeError(CODE_UNAUTHORIZED, "Unauthorized Request")
ErrForbidden: CodeError = CodeError(CODE_FORBIDDEN, "Forbidden Access")

# 业务专用错误模板 (AI Observability Agent)
ErrDatabase: CodeError = CodeError(CODE_DATABASE_ERROR, "Database Operation Failed")
ErrProbe: CodeError = CodeError(CODE_PROBE_ERROR, "Probe Payload Format Invalid")
ErrProcessor: CodeError = CodeError(CODE_PROCESSOR_ERROR, "Ingress Processing Failed")
ErrTreeBuild: CodeError = CodeError(
    CODE_TREE_BUILD_ERROR, "Trace Tree Construction Failed"
)

__all__ = [
    "ArgsError",
    "CODE_ARGS_ERROR",
    "CODE_DATABASE_ERROR",
    "CODE_DESENSITIZE_ERROR",
    "CODE_FORBIDDEN",
    "CODE_INTERNAL_SERVER",
    "CODE_NOT_FOUND",
    "CODE_OK",
    "CODE_PROBE_ERROR",
    "CODE_PROCESSOR_ERROR",
    "CODE_TREE_BUILD_ERROR",
    "CODE_UNAUTHORIZED",
    "ErrArgs",
    "ErrDatabase",
    "ErrForbidden",
    "ErrInternalServer",
    "ErrNotFound",
    "ErrProbe",
    "ErrProcessor",
    "ErrTreeBuild",
    "ErrUnauthorized",
    "ForbiddenError",
    "NotFoundError",
    "ServerInternalError",
    "UnauthorizedError",
]

