"""
文件名: contracts.py
所属模块: 数据处理中枢 (processor)

【功能说明】
1. 定义全链路的数据交互规范（契约）。本文件不包含任何业务逻辑，只定义数据结构。
2. `RawSpanData`：定义了成员 1（探针）必须传递给本模块的数据格式。
3. `ProcessedSpanRecord`：定义了本模块处理完毕后，必须传递给成员 3（数据库）入库的数据格式。
4. 作用：实现模块间的解耦。只要大家遵守这里的字段名，底层无论怎么改都不会报错。
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

@dataclass
class RawSpanData:
    trace_id: str
    span_id: str
    parent_id: Optional[str]
    name: str
    span_kind: str
    start_time: datetime
    end_time: datetime
    input_data: Any
    output_data: Any
    model_name: Optional[str] = None
    raw_tokens: dict[str, int] = field(default_factory=dict)
    status: str = "OK"
    error_message: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)

@dataclass
class ProcessedSpanRecord:
    span_id: str
    trace_id: str
    parent_id: Optional[str]
    span_kind: str
    name: str
    start_time: str
    end_time: str
    latency_ms: float
    input_str: str
    output_str: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    status: str
    error_message: Optional[str]
    attributes_json: str