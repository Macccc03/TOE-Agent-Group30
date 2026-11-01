from dataclasses import dataclass
from typing import Optional

@dataclass
class ProcessedSpanRecord:
    # 1. 唯一标识与层级映射词条
    span_id: str
    """
    【步骤主键标识 (UUID)】：对应数据库 `spans.span_id` 主键/唯一索引。
    """

    trace_id: str
    """
    【所属链路 ID (UUID)】：对应数据库 `spans.trace_id`，创建索引以支持毫秒级整链批量点查。
    """

    parent_id: Optional[str]
    """
    【父步骤 ID】：对应数据库 `spans.parent_id`。建树算法据此建立树形层次关联。
    """

    # 2. 分类与名称词条
    span_kind: str
    """
    【语义分类标签】："AGENT" | "CHAIN" | "LLM" | "TOOL" | "RETRIEVER" 等标准语义分类。
    """

    name: str
    """
    【步骤业务名称】：如 "gpt-4o", "Weather_API_Tool"。
    """

    # 3. 规范化时间与性能词条
    start_time: str
    """
    【标准化起始时间戳 (ISO-8601)】
    - 格式：如 "2026-11-01T10:00:00.000000+00:00" 或 "2026-11-01T10:00:00.000Z"。
    - 作用：统一字符串存储，方便跨平台数据库时间检索与区间比较。
    """

    end_time: str
    """
    【标准化结束时间戳 (ISO-8601)】：对应步骤结束时刻的标准时间字符串。
    """

    latency_ms: float
    """
    【原子步骤执行耗时（毫秒）】
    - 计算公式：(end_time - start_time) 换算为毫秒浮点数（如 1250.5）。
    - 作用：存储该步骤实际耗时，直接供前端瀑布流甘特图渲染色块宽度，便于快速定位慢步骤瓶颈。
    """

    # 4. 脱敏后的输入输出载荷词条
    input_str: str
    """
    【隐私脱敏后的输入文本】
    - 处理说明：已过滤敏感敏感凭证（如匹配 `sk-xxxx` 替换为 `<REDACTED_API_KEY>`，手机号替换为 `<REDACTED_PHONE>`）。
    - 作用：安全合规的持久化存储，供调试回放查看。
    """

    output_str: str
    """
    【隐私脱敏后的输出结果】
    - 处理说明：模型生成文本、工具调用返回结果的脱敏文本表示。
    """

    # 5. Token 消耗与成本计量词条
    prompt_tokens: int
    """
    【输入提示词 Token 消耗数】：大模型调用中输入的上下文 Token 数量（整型）。
    """

    completion_tokens: int
    """
    【输出生成词 Token 消耗数】：大模型生成输出的 Token 数量（整型）。
    """

    total_tokens: int
    """
    【步骤总消耗 Token 数】：prompt_tokens + completion_tokens。
    """

    cost_usd: float
    """
    【步骤折算成本金额（美元）】
    - 计算公式：根据 `model_price_manifest.json` 中配置的每百万 Token 费率折算得出。
    - 精度：6 位小数浮点数（如 0.002345），精确统计每次模型调用的真实花销。
    """

    # 6. 状态与扩展属性词条
    status: str
    """
    【标准化状态码】："OK" | "ERROR"。
    """

    error_message: Optional[str]
    """
    【错误详情文本】：无错误时为 None，发生异常时记录堆栈信息。
    """

    attributes_json: str
    """
    【扩展属性 JSON 字符串】
    - 格式：序列化后的 JSON 字符串（包含 metadata、超参配置、user_id 等）。
    - 作用：灵活存储半结构化数据，无须频繁修改数据表结构（DDL Schema）。
    """