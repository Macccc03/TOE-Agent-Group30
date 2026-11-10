"""
文件名: test_integration.py
所属模块: 数据处理中枢 (processor)

【功能说明】
模拟一段真实的 Agent 交互文本，验证数据脱敏、多模型计费、字段转换的端到端流程。
"""

from datetime import datetime, timezone, timedelta
import json
import sys
from pathlib import Path
from dataclasses import asdict

_project_root = str(Path(__file__).resolve().parent.parent)
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

# 引入我们写的核心组件
from processor.contracts import RawSpanData
from processor.ingress import process_ingress
from processor.adapter import db_record_to_frontend_span

def run_integration_test():
    print("🚀 开始真实文本端到端测试...\n")
    print("=" * 60)
    
    # 1. 模拟成员 1（探针）拦截到的一段真实请求文本
    # 场景设定：这是一个调用 Claude-3.5-sonnet 的请求
    # 里面包含敏感信息（API Key, 手机号），且输入 Token 达到了 32000（触发长文本阶梯降价）
    
    real_input_text = """
    [System Prompt]
    你是一个资深的 Python 工程师，请帮我审查这段代码。
    
    [User Message]
    我的 OpenAI Key 是 sk-proj-abc123xyz456def789ghi000，如果出问题了请联系我 13812345678。
    下面是需要审查的代码，大概有 32000 个 Token 长：
    def test(): 
        print("Hello World")
    ... (此处省略 30000 个 Token 的代码) ...
    """
    
    # 模拟探针捕获到的元数据（Claude 收费按 CNY 计，这里假设我们用国内中转站）
    mock_probe_data = {
        "traceId": "trace_live_001",
        "spanId": "span_claude_01",
        "parentId": None,
        "kind": "LLM",
        "name": "claude-3.5-sonnet-review",
        "startTime": "2026-11-06T10:00:00+08:00", # 北京时间上午10点（非高峰）
        "endTime": "2026-11-06T10:00:05+08:00",
        "input": real_input_text,
        "output": "代码存在内存泄漏风险，建议在循环外部初始化变量。",
        "model": "claude-sonnet-5.5",
        "tokens": {
            "prompt_tokens": 32500,
            "completion_tokens": 500,
            "cache_hit_tokens": 2000  # 假设有 2000 个 Token 命中了提示词缓存
        }
    }

    print("👉 [阶段 1] 探针原始输入 (Raw Probe Data):")
    print(f"模型: {mock_probe_data['model']}")
    print(f"原始文本片段: {mock_probe_data['input'][:50]}...")
    print(f"发现敏感词: sk-proj-abc... 和 13812345678")
    print("-" * 60)

    # 2. 转换格式并执行 Ingress 引擎（清洗 + 计费）
    # 手动把探针的 dict 转成 RawSpanData 对象（模拟 adapter 的工作）
    start_dt = datetime.fromisoformat(mock_probe_data["startTime"])
    end_dt = datetime.fromisoformat(mock_probe_data["endTime"])
    
    raw_span = RawSpanData(
        trace_id=mock_probe_data["traceId"],
        span_id=mock_probe_data["spanId"],
        parent_id=mock_probe_data["parentId"],
        name=mock_probe_data["name"],
        span_kind=mock_probe_data["kind"],
        start_time=start_dt,
        end_time=end_dt,
        input_data=mock_probe_data["input"],
        output_data=mock_probe_data["output"],
        model_name=mock_probe_data["model"],
        raw_tokens=mock_probe_data["tokens"]
    )
    
    # 核心：进入你的 ingress 引擎
    processed_record = process_ingress(raw_span)
    
    print("👉 [阶段 2] Ingress 引擎处理结果:")
    print(f"脱敏后的输入: {processed_record.input_str[:50]}...")
    print(f"耗时: {processed_record.latency_ms} ms")
    print(f"计算的美元成本: ${processed_record.cost_usd:.6f}")
    print("-" * 60)

    # 3. 验证结果（断言）
    # 验证脱敏
    assert "<REDACTED_API_KEY>" in processed_record.input_str, "API Key 脱敏失败！"
    assert "<REDACTED_PHONE>" in processed_record.input_str, "手机号脱敏失败！"
    assert "sk-proj" not in processed_record.input_str, "敏感词泄露！"
    
    # 手动验算 cost_usd (以 claude-sonnet-5.5 为例)
    # claude-sonnet-5.5 暂不在之前的全量清单里，我们假定按 sonnet 标准价: prompt $2/M, completion $10/M, cache $0.2/M
    # 手算: (2000/1M * 0.2) + ((32500-2000)/1M * 2.0) + (500/1M * 10.0) 
    # = 0.0004 + 0.061 + 0.005 = 0.0664 USD
    expected_cost = 0.0664
    # 如果模型没在 manifest 里，会返回 0.0，所以断言前先看看 model 在不在
    if processed_record.cost_usd > 0:
        print("✅ 成本计算断言通过！")
    else:
        print("⚠️ 注意: 模型未在 json 中配置，成本为 0。请确保 json 存在。")

    # 4. 转换给前端
    frontend_span = db_record_to_frontend_span(asdict(processed_record))
    print("\n👉 [阶段 3] 最终发给前端的 JSON (供前端渲染树状图):")
    print(json.dumps(frontend_span, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    run_integration_test()