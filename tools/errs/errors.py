"""
文件名: errors.py
所属模块: 全局统一错误与异常包装中枢 (tools.errs)
================================================================================
【设计宗旨与参考规范】
参考自标准微服务架构 (Go errs 设计规范):
1. 统一错误码抽象 (CodeError): 携带业务错误码 (Code)、用户友好摘要 (Msg) 和调用链详情 (Detail)；
2. 链式上下文与详情注入 (.with_detail / wrap_msg): 支持传入详细描述与上下文键值对 (k=v)，便于故障定位；
3. 调用栈自动追溯 (CallStack): 包装时自动捕获调用链帧 (函数、文件名、行号)，形成直观的调用流追踪；
4. 根因递归拆包 (unwrap): 递归获取最底层原始异常 (Root Cause)；
5. 智能错误对比 (.is_ / is_code): 无论是对比预定义错误对象还是对比错误状态码，均能精准命中；
6. Web/API 友好: 一键序列化为统一字典 (.to_dict()) 或 FastAPI 的 HTTPException。
"""

from __future__ import annotations

import os
import sys
from typing import Any

from fastapi import HTTPException

# ==============================================================================
# 1. 上下文键值对格式化工具 (对标 Go toString(s, kv []any))
# ==============================================================================


def format_msg_kv(msg: str = "", *args: Any, **kwargs: Any) -> str:
    """
    格式化错误消息与上下文键值对。

    示例:
        format_msg_kv("query user failed", user_id="1001", trace_id="tr_999")
        -> "query user failed, user_id=1001, trace_id=tr_999"

        format_msg_kv("connect db error", "host", "localhost", "port", 5432)
        -> "connect db error, host=localhost, port=5432"
    """
    parts: list[str] = [str(msg)] if msg else []

    # 1. 支持偶数个可变位置参数 (k1, v1, k2, v2...)
    if args:
        i = 0
        while i < len(args):
            k = str(args[i])
            v = str(args[i + 1]) if i + 1 < len(args) else "MISSING"
            parts.append(f"{k}={v}")
            i += 2

    # 2. 支持关键字参数 (k=v)
    for k, v in kwargs.items():
        parts.append(f"{k}={v}")

    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    first = parts[0]
    rest = ", ".join(parts[1:])
    return f"{first}, {rest}" if first else rest


# ==============================================================================
# 2. 调用栈帧捕获工具 (对标 Go stack.New / runtime.Callers)
# ==============================================================================


class FrameInfo:
    """单个调用栈帧信息"""

    def __init__(self, func_name: str, filename: str, lineno: int) -> None:
        self.func_name = func_name
        self.filename = filename
        self.lineno = lineno

    def __str__(self) -> str:
        base_name = os.path.basename(self.filename)
        return f"{self.func_name}() {base_name}:{self.lineno}"

    def __repr__(self) -> str:
        return f"FrameInfo({self.func_name}, {self.filename}:{self.lineno})"


def capture_stack(skip: int = 2, depth: int = 10) -> list[FrameInfo]:
    """
    捕获当前调用栈帧列表（从最浅调用向最深调用排布）。
    skip: 跳过的栈帧深度（默认跳过当前函数及上一层封装器）
    depth: 最多收集的调用深度
    """
    frames: list[FrameInfo] = []
    try:
        current_frame = sys._getframe(skip)
    except (ValueError, AttributeError):
        return frames

    count = 0
    while current_frame and count < depth:
        code_obj = current_frame.f_code
        fn_name = code_obj.co_name
        file_path = code_obj.co_filename
        line_no = current_frame.f_lineno

        # 过滤底层运行时/解释器导入等内部上下文帧
        if not file_path.startswith("<frozen"):
            frames.append(FrameInfo(fn_name, file_path, line_no))
            count += 1
        current_frame = current_frame.f_back

    return frames


# ==============================================================================
# 3. 核心异常基类与业务错误码类 (对标 Go CodeError / codeError)
# ==============================================================================


class BaseAppError(Exception):
    """项目通用顶层受检异常基类"""


class CodeError(BaseAppError):
    """
    标准业务状态码错误类 (对标 Go CodeError 接口与实现)。
    """

    def __init__(
        self,
        code: int,
        msg: str,
        detail: str = "",
        cause: BaseException | None = None,
        stack: list[FrameInfo] | None = None,
    ) -> None:
        self._code = code
        self._msg = msg
        self._detail = detail
        self._stack = stack if stack is not None else []
        self.__cause__ = cause
        super().__init__(self.__str__())

    @property
    def code(self) -> int:
        """获取业务状态码 (Code)"""
        return self._code

    @property
    def msg(self) -> str:
        """获取用户/前端可见错误摘要 (Msg)"""
        return self._msg

    @property
    def detail(self) -> str:
        """获取内部详细故障信息 (Detail)"""
        return self._detail

    @property
    def stack(self) -> list[FrameInfo]:
        """获取调用栈信息列表"""
        return self._stack

    def with_detail(self, detail: str = "", *args: Any, **kwargs: Any) -> CodeError:
        """
        向错误追加详细上下文说明，返回全新的 CodeError 实例（不可变模式）。

        示例:
            ErrArgs.with_detail("invalid trace_id format", input_val="xyz")
        """
        extra = format_msg_kv(detail, *args, **kwargs)
        if self._detail and extra:
            new_detail = f"{self._detail}; {extra}"
        else:
            new_detail = extra or self._detail

        return CodeError(
            code=self._code,
            msg=self._msg,
            detail=new_detail,
            cause=self.__cause__,
            stack=capture_stack(skip=2),
        )

    def wrap(self, cause: BaseException | None = None) -> CodeError:
        """
        包装当前错误并附带调用栈捕获 (对标 Go e.Wrap())。
        """
        return CodeError(
            code=self._code,
            msg=self._msg,
            detail=self._detail,
            cause=cause or self.__cause__,
            stack=capture_stack(skip=2),
        )

    def wrap_msg(self, msg: str = "", *args: Any, **kwargs: Any) -> CodeError:
        """
        在包装的同时追加上下文说明与调用栈 (对标 Go e.WrapMsg(msg, kv...))。
        """
        detail_part = format_msg_kv(msg, *args, **kwargs)
        if self._detail and detail_part:
            new_detail = f"{self._detail}; {detail_part}"
        else:
            new_detail = detail_part or self._detail

        return CodeError(
            code=self._code,
            msg=self._msg,
            detail=new_detail,
            cause=self.__cause__,
            stack=capture_stack(skip=2),
        )

    def is_(self, other: Any) -> bool:
        """
        智能比对错误 (对标 Go e.Is(err)):
        1. 若传入 int，按 code 匹配；
        2. 若传入 CodeError，按两者 code 比对；
        3. 若传入普通异常，递归比对根因。
        """
        if other is None:
            return False
        if isinstance(other, int):
            return self._code == other
        if isinstance(other, CodeError):
            return self._code == other.code

        # 检查底层 cause 链
        curr = unwrap(other)
        if isinstance(curr, CodeError):
            return self._code == curr.code
        return False

    def to_dict(self) -> dict[str, Any]:
        """序列化为标准 JSON 响应结构字典"""
        res: dict[str, Any] = {
            "code": self._code,
            "msg": self._msg,
        }
        if self._detail:
            res["detail"] = self._detail
        return res

    def to_http_exception(self, status_code: int | None = None) -> HTTPException:
        """转换为标准 FastAPI HTTPException，便于路由直接抛出"""
        http_status = status_code or (self._code if 100 <= self._code <= 599 else 400)
        return HTTPException(
            status_code=http_status,
            detail=self.to_dict(),
        )

    def __str__(self) -> str:
        parts = [f"[{self._code}] {self._msg}"]
        if self._detail:
            parts.append(f"-> {self._detail}")
        if self.__cause__:
            parts.append(f"| Cause: {self.__cause__}")
        if self._stack:
            chain = " -> ".join(str(f) for f in self._stack[:4])
            parts.append(f"| Stack: {chain}")
        return " ".join(parts)

    def __repr__(self) -> str:
        return (
            f"<CodeError code={self._code} msg='{self._msg}' detail='{self._detail}'>"
        )


# ==============================================================================
# 4. 全局顶层工具函数 (对标 Go Wrap, WrapMsg, Unwrap, New)
# ==============================================================================


def new(msg: str = "", *args: Any, **kwargs: Any) -> BaseAppError:
    """创建通用异常对象 (对标 Go errs.New)"""
    return BaseAppError(format_msg_kv(msg, *args, **kwargs))


def new_code_error(code: int, msg: str) -> CodeError:
    """创建初始业务错误模板 (对标 Go errs.NewCodeError)"""
    return CodeError(code=code, msg=msg)


def wrap(err: BaseException | None, code_or_err: Any | None = None) -> CodeError | None:
    """
    将原生或第三方异常包装为带堆栈的 CodeError (对标 Go errs.Wrap)。
    若传入 err 为 None，安全返回 None。
    """
    if err is None:
        return None

    if isinstance(code_or_err, CodeError):
        return code_or_err.with_detail(str(err)).wrap(cause=err)

    if isinstance(err, CodeError):
        return err.wrap(cause=err)

    # 封装为通用内部错误
    return CodeError(
        code=500,
        msg="Internal Server Error",
        detail=str(err),
        cause=err,
        stack=capture_stack(skip=2),
    )


def wrap_msg(
    err: BaseException | None,
    msg: str = "",
    *args: Any,
    code_or_err: Any | None = None,
    **kwargs: Any,
) -> CodeError | None:
    """
    将原生异常附加上下文信息并包装 (对标 Go errs.WrapMsg)。
    """
    if err is None:
        return None

    extra = format_msg_kv(msg, *args, **kwargs)

    if isinstance(code_or_err, CodeError):
        return code_or_err.with_detail(extra).with_detail(str(err)).wrap(cause=err)

    if isinstance(err, CodeError):
        return err.wrap_msg(extra)

    return CodeError(
        code=500,
        msg="Internal Server Error",
        detail=f"{extra}; {err}" if extra else str(err),
        cause=err,
        stack=capture_stack(skip=2),
    )


def unwrap(err: Any) -> Any:
    """
    递归解包异常，提取最底层根因 (对标 Go errs.Unwrap)。
    """
    curr = err
    while curr is not None:
        cause = getattr(curr, "__cause__", None)
        if cause is None:
            cause = getattr(curr, "_cause", None)
        if cause is None or cause is curr:
            break
        curr = cause
    return curr


def is_code(err: Any, target_code: int) -> bool:
    """快速判定指定异常是否匹配给定的错误码"""
    if isinstance(err, CodeError):
        return err.code == target_code
    root = unwrap(err)
    if isinstance(root, CodeError):
        return root.code == target_code
    return False
