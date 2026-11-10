"""
文件名: test_processor.py
所属模块: 数据处理中枢 (processor)

【功能说明】
本模块的本地单元测试脚本。
1. 模拟生成符合 `RawSpanData` 契约的假数据（包含敏感词、Token 等）。
2. 测试 `ingress.py` 的脱敏和计费逻辑是否正常。
3. 测试 `egress.py` 的建树算法是否能正确处理乱序数据和孤儿节点。
4. 运行方式：在项目根目录执行 `python -m processor.test_processor`。
"""
from datetime import datetime, timedelta
from dataclasses import asdict
import os
import sys
from pathlib import Path

_current_dir = Path(__file__).resolve().parent
_project_root = _current_dir.parent
for _p in (str(_project_root), str(_current_dir)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

try:
    from processor.contracts import RawSpanData
    from processor.ingress import process_ingress
    from processor.egress import build_trace_tree
except ImportError:
    from contracts import RawSpanData
    from ingress import process_ingress
    from egress import build_trace_tree

def run_test():
    print("🚀 开始测试成员 2 的数据流...")
    now = datetime.now()
    
    raw_root = RawSpanData(
        trace_id="trace-001", span_id="span-001", parent_id=None,
        name="ReAct_Agent", span_kind="AGENT",
        start_time=now, end_time=now + timedelta(milliseconds=1500),
        input_data="帮我查天气", output_data="今天晴朗"
    )
    
    raw_llm = RawSpanData(
        trace_id="trace-001", span_id="span-002", parent_id="span-001",
        name="gpt-4o", span_kind="LLM",
        start_time=now + timedelta(milliseconds=200), 
        end_time=now + timedelta(milliseconds=1200),
        input_data="查询天气, API_KEY是 sk-1234567890abcdefghijklmnopqrstuvwxyz", 
        output_data="天气晴",
        model_name="gpt-4o",
        raw_tokens={"prompt_tokens": 1000, "completion_tokens": 500}
    )

    print("\n--- 测试 Ingress 阶段 ---")
    processed_llm = process_ingress(raw_llm)
    print(f"脱敏后输入: {processed_llm.input_str}")
    print(f"计算花费: ${processed_llm.cost_usd:.6f}")
    
    print("\n--- 测试 Egress 阶段 (建树) ---")
    flat_data = [asdict(process_ingress(raw_root)), asdict(processed_llm)]
    flat_data.reverse() # 故意打乱顺序
    
    tree_view_model = build_trace_tree(flat_data)
    
    print(f"总耗时: {tree_view_model['total_latency_ms']} ms")
    print(f"总花费: ${tree_view_model['total_cost_usd']:.6f}")
    print(f"根节点名字: {tree_view_model['tree']['name']}")
    print(f"子节点数量: {len(tree_view_model['tree']['children'])}")
    print(f"累加后总Token: {tree_view_model['tree']['cumulative_tokens']}")

if __name__ == "__main__":
    run_test()