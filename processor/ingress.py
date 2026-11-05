"""
文件名: ingress.py
所属模块: 数据处理中枢 (processor)

【功能说明】
1. 数据脱敏：利用正则表达式匹配并过滤掉文本中的敏感信息（如 API Key、手机号）。
2. 计费引擎：根据传入的模型名称和 Token 消耗，结合配置文件计算出精确的美元成本。
3. 标准化处理：将时间戳转换为统一的 ISO-8601 字符串格式，计算耗时。
4. 核心任务：将探针传入的原始对象 `RawSpanData` 转化为可直接入库的 `ProcessedSpanRecord`。
"""

import json
import re
import os
from datetime import datetime
from typing import Any
from processor.contracts import RawSpanData, ProcessedSpanRecord

PRICE_FILE = os.path.join(os.path.dirname(__file__), 'model_price_manifest.json')
with open(PRICE_FILE, 'r', encoding='utf-8') as f:
    PRICE_MANIFEST = json.load(f)

def sanitize_text(text: Any) -> str:
    if text is None:
        return ""
    text_str = str(text)
    # 脱敏 API Key 和手机号
    text_str = re.sub(r'sk-[a-zA-Z0-9]{20,}', '<REDACTED_API_KEY>', text_str)
    text_str = re.sub(r'\b1[3-9]\d{9}\b', '<REDACTED_PHONE>', text_str)
    return text_str

def calculate_cost(model_name: str, prompt_tokens: int, completion_tokens: int) -> float:
    if not model_name or model_name not in PRICE_MANIFEST:
        return 0.0
    prices = PRICE_MANIFEST[model_name]
    cost = (prompt_tokens / 1_000_000) * prices["prompt"] + \
           (completion_tokens / 1_000_000) * prices["completion"]
    return cost

def process_ingress(raw_span: RawSpanData) -> ProcessedSpanRecord:
    latency_ms = (raw_span.end_time - raw_span.start_time).total_seconds() * 1000
    
    prompt_tokens = raw_span.raw_tokens.get("prompt_tokens", 0)
    completion_tokens = raw_span.raw_tokens.get("completion_tokens", 0)
    total_tokens = prompt_tokens + completion_tokens
    cost_usd = calculate_cost(raw_span.model_name, prompt_tokens, completion_tokens)
    
    return ProcessedSpanRecord(
        span_id=raw_span.span_id,
        trace_id=raw_span.trace_id,
        parent_id=raw_span.parent_id,
        span_kind=raw_span.span_kind,
        name=raw_span.name,
        start_time=raw_span.start_time.isoformat(),
        end_time=raw_span.end_time.isoformat(),
        latency_ms=latency_ms,
        input_str=sanitize_text(raw_span.input_data),
        output_str=sanitize_text(raw_span.output_data),
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        cost_usd=cost_usd,
        status=raw_span.status,
        error_message=raw_span.error_message,
        attributes_json=json.dumps(raw_span.metadata, ensure_ascii=False)
    )