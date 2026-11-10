"""
文件名: ingress.py
所属模块: 数据处理中枢 (processor)

【功能说明】
1. 数据脱敏：过滤 API Key、手机号等敏感信息。
2. 多币种计费引擎：支持 USD/CNY 自动换算，统一输出美元成本。
3. 阶梯定价：按输入 Token 长度自动匹配档位（如豆包、Qwen、GPT-6 Astra 长上下文）。
4. 高峰/空闲定价：针对 DeepSeek 按时段自动切换单价（北京时间）。
5. 缓存感知：区分缓存命中/未命中的输入 Token，分别计价。
6. 标准化输出：将 RawSpanData 转化为 ProcessedSpanRecord。
"""

import json
import re
import os
from datetime import datetime, time
from typing import Any, Optional, Dict, Tuple
from processor.contracts import RawSpanData, ProcessedSpanRecord

PRICE_FILE = os.path.join(os.path.dirname(__file__), 'model_price_manifest.json')
with open(PRICE_FILE, 'r', encoding='utf-8') as f:
    PRICE_MANIFEST = json.load(f)

# 汇率配置（建议从环境变量读取，此处硬编码便于演示）
USD_TO_CNY = float(os.getenv("USD_TO_CNY_RATE", "7.25"))
CNY_TO_USD = 1.0 / USD_TO_CNY


# =====================================================================
# 工具函数
# =====================================================================

def sanitize_text(text: Any) -> str:
    if text is None:
        return ""
    text_str = str(text)
    text_str = re.sub(r'sk-[a-zA-Z0-9\-_]{10,}', '<REDACTED_API_KEY>', text_str)
    text_str = re.sub(r'\b1[3-9]\d{9}\b', '<REDACTED_PHONE>', text_str)
    return text_str


def _to_usd(amount: float, currency: str) -> float:
    """将任意币种金额统一转换为美元"""
    currency = currency.upper()
    if currency == "USD":
        return amount
    elif currency == "CNY":
        return amount * CNY_TO_USD
    else:
        print(f"[Warning] 未知币种 {currency}，按美元处理")
        return amount


def _parse_iso_datetime(iso_str: str) -> datetime:
    """解析 ISO 时间字符串，兼容 Z 后缀"""
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00"))


# =====================================================================
# 高峰/空闲判断（针对 DeepSeek 等 time_based 模型）
# =====================================================================

def _is_peak_time(dt: datetime, model_config: dict) -> bool:
    """
    判断给定时间是否属于高峰时段。
    规则来源：DeepSeek 官方文档——北京时间周一至周五 9:00-12:00、14:00-18:00 为高峰，其余为空闲。
    法定节假日全天按空闲处理（此处未实现节假日表，可后续扩展）。
    """
    # 转换为北京时间 (UTC+8)
    beijing_tz = dt.utcoffset()
    if beijing_tz is None:
        beijing_dt = dt
    else:
        beijing_dt = dt.astimezone().replace(tzinfo=None)

    # 判断星期：0=周一 ... 6=周日
    weekday = beijing_dt.weekday()
    peak_days = model_config.get("peak_days", [0, 1, 2, 3, 4])
    if weekday not in peak_days:
        return False

    # 判断小时区间
    peak_hours = model_config.get("peak_hours", [[9, 12], [14, 18]])
    current_hour = beijing_dt.hour
    for start, end in peak_hours:
        if start <= current_hour < end:
            return True
    return False


# =====================================================================
# 阶梯档位选择
# =====================================================================

def _select_tier(model_config: dict, input_tokens: int, reference_time: Optional[datetime] = None) -> dict:
    """
    根据输入 Token 数量和生效时间，从 tiers 中选择匹配的档位。
    如果 pricing_type 不是 tiered，直接返回 model_config 本身作为唯一档位。
    """
    if model_config.get("pricing_type") != "tiered":
        return model_config

    tiers = model_config.get("tiers", [])
    if not tiers:
        return model_config

    # 先过滤掉因生效时间不匹配的档位
    valid_tiers = []
    for tier in tiers:
        valid_from = tier.get("valid_from")
        valid_until = tier.get("valid_until")
        if reference_time:
            ref_date = reference_time.date() if isinstance(reference_time, datetime) else reference_time
            if valid_from and ref_date < _parse_iso_datetime(valid_from).date():
                continue
            if valid_until and ref_date > _parse_iso_datetime(valid_until).date():
                continue
        valid_tiers.append(tier)

    if not valid_tiers:
        valid_tiers = tiers  # 兜底

    # 按 max_input_tokens 升序排列（None 视为无穷大）
    valid_tiers.sort(key=lambda t: t.get("max_input_tokens") or float('inf'))

    for tier in valid_tiers:
        max_tokens = tier.get("max_input_tokens")
        if max_tokens is None or input_tokens <= max_tokens:
            return tier

    return valid_tiers[-1]  # 兜底返回最后一档


# =====================================================================
# 核心计费函数
# =====================================================================

def calculate_cost(
    model_name: Optional[str] = None,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cache_hit_tokens: int = 0,
    reference_time: Optional[datetime] = None,
) -> float:
    """
    计算一次模型调用的美元成本。

    参数:
        model_name: 模型名称，需与 manifest 中的 key 一致。
        prompt_tokens: 输入 Token 总数（包含缓存命中和未命中）。
        completion_tokens: 输出 Token 数。
        cache_hit_tokens: 输入 Token 中缓存命中的数量（默认 0，即全部按未命中计）。
        reference_time: 用于阶梯定价有效期和高峰/空闲判断的时间点，默认使用当前时间。

    返回:
        美元成本（float）。
    """
    if not model_name or model_name not in PRICE_MANIFEST:
        return 0.0

    config = PRICE_MANIFEST[model_name]
    currency = config.get("currency", "USD")
    pricing_type = config.get("pricing_type", "standard")
    now = reference_time or datetime.now()

    # ---------- 缓存未命中 Token 数 ----------
    cache_miss_tokens = max(0, prompt_tokens - cache_hit_tokens)

    # ---------- 按计费模式计算原始币种金额 ----------
    if pricing_type == "time_based":
        # DeepSeek 等峰谷定价
        is_peak = _is_peak_time(now, config)
        price_table = config["peak"] if is_peak else config["off_peak"]

        cost_original = (
            (cache_hit_tokens / 1_000_000) * price_table.get("prompt_cache_hit", 0.0)
            + (cache_miss_tokens / 1_000_000) * price_table.get("prompt_cache_miss", 0.0)
            + (completion_tokens / 1_000_000) * price_table.get("completion", 0.0)
        )

    elif pricing_type == "tiered":
        # 阶梯定价：先选档位
        tier = _select_tier(config, prompt_tokens, reference_time=now)
        cost_original = (
            (cache_hit_tokens / 1_000_000) * tier.get("cache_read", 0.0)
            + (cache_miss_tokens / 1_000_000) * tier.get("prompt", 0.0)
            + (completion_tokens / 1_000_000) * tier.get("completion", 0.0)
        )

    else:
        # 标准定价
        cost_original = (
            (cache_hit_tokens / 1_000_000) * config.get("cache_read", 0.0)
            + (cache_miss_tokens / 1_000_000) * config.get("prompt", 0.0)
            + (completion_tokens / 1_000_000) * config.get("completion", 0.0)
        )

    # ---------- 统一转换为美元 ----------
    return _to_usd(cost_original, currency)


# =====================================================================
# 入库前主处理函数
# =====================================================================

def process_ingress(raw_span: RawSpanData) -> ProcessedSpanRecord:
    latency_ms = (raw_span.end_time - raw_span.start_time).total_seconds() * 1000

    # 从 raw_tokens 中提取各项（探针可能传不同键名，做兼容）
    prompt_tokens = raw_span.raw_tokens.get("prompt_tokens", 0)
    completion_tokens = raw_span.raw_tokens.get("completion_tokens", 0)
    cache_hit_tokens = raw_span.raw_tokens.get(
        "cache_hit_tokens",
        raw_span.raw_tokens.get("cached_input_tokens", 0)
    )
    total_tokens = prompt_tokens + completion_tokens

    # 调用计费引擎（使用 Span 的 start_time 作为参考时间，确保峰谷判断与实际调用时刻一致）
    cost_usd = calculate_cost(
        model_name=raw_span.model_name,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cache_hit_tokens=cache_hit_tokens,
        reference_time=raw_span.start_time,
    )

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
        attributes_json=json.dumps(raw_span.metadata, ensure_ascii=False),
    )