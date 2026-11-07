"""
文件名: pipeline.py
所属模块: 数据处理中枢 (processor)

【功能说明】
1. 这是整个数据处理链路的"总调度室"。
2. 封装了 `DataPipeline` 类，负责接收探针数据，调用 ingress 清洗计算，并调用成员 3 的数据库接口进行持久化。
3. 提供了 `get_trace_for_frontend` 方法，一键调用数据库查询并交给 egress 组装给前端的 JSON。
4. 包含完整的 Mock 测试用例（`__main__` 中），可以在没有真实探针的情况下，模拟全链路数据流转，验证代码健壮性。
"""

import json
import os
from datetime import datetime
from typing import Dict, Any

# 引入各模块
from processor.ingress import process_ingress
from processor.contracts import RawSpanData
from processor.adapter import probe_to_raw_dict
from processor.egress import process_egress

# 引入成员3的存储模块
from storage.engine.sqlite_engine import init_db

class DataPipeline:
    def __init__(self, db_path="trace_pipeline.db"):
        self.db = init_db(db_path)
        print(f"[Pipeline] ✅ 数据库已启动: {db_path}")
        
    def receive_probe_data(self, probe_json_str: str):
        try:
            # 1. 接收探针数据 -> 转为 RawSpanData
            probe_data = json.loads(probe_json_str)
            raw_dict = probe_to_raw_dict(probe_data)
            
            start_dt = datetime.fromisoformat(raw_dict["start_time"].replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(raw_dict["end_time"].replace("Z", "+00:00"))
            
            raw_span = RawSpanData(
                trace_id=raw_dict["trace_id"], span_id=raw_dict["span_id"], parent_id=raw_dict["parent_id"],
                name=raw_dict["name"], span_kind=raw_dict["span_kind"],
                start_time=start_dt, end_time=end_dt,
                input_data=raw_dict["input_data"], output_data=raw_dict["output_data"],
                model_name=raw_dict["model_name"], raw_tokens=raw_dict["raw_tokens"],
                status=raw_dict["status"], error_message=raw_dict["error_message"],
                metadata=raw_dict["metadata"]
            )
            
            # 2. 清洗、脱敏、算钱
            processed_record = process_ingress(raw_span)
            
            # 3. 存入数据库
            self.db.save_span(processed_record)
            print(f"[Pipeline] ⬇️ 入库成功: {raw_span.name}")
        except Exception as e:
            print(f"[Pipeline] ❌ 处理失败: {e}")

    def get_trace_for_frontend(self, trace_id: str) -> Dict[str, Any]:
        # 1. 从库中查出扁平数据
        flat_db_spans = self.db.get_spans_by_trace_id(trace_id)
        # 2. 组装成前端要的 JSON
        return process_egress(flat_db_spans)

if __name__ == "__main__":
    print("🚀 启动全链路 Pipeline 联调测试...")
    
    # 清理旧库
    db_file = "trace_pipeline.db"
    if os.path.exists(db_file):
        os.remove(db_file)
        
    pipeline = DataPipeline(db_file)
    
    # 模拟成员1探针抓取的 JSON 数组
    mock_probes = [
        json.dumps({
            "traceId": "trace_999", "spanId": "span_001", "parentId": None, "kind": "AGENT", "name": "ReAct_Agent",
            "startTime": "2026-11-05T10:00:00Z", "endTime": "2026-11-05T10:00:03Z", "input": "查询天气"
        }),
        json.dumps({
            "traceId": "trace_999", "spanId": "span_002", "parentId": "span_001", "kind": "TOOL", "name": "Weather_API",
            "startTime": "2026-11-05T10:00:00.500Z", "endTime": "2026-11-05T10:00:01.500Z", "input": "Hangzhou", "output": "Sunny"
        }),
        json.dumps({
            "traceId": "trace_999", "spanId": "span_003", "parentId": "span_001", "kind": "LLM", "name": "gpt-4o",
            "startTime": "2026-11-05T10:00:01.800Z", "endTime": "2026-11-05T10:00:02.800Z", "model": "gpt-4o", "tokens": {"prompt_tokens": 100, "completion_tokens": 50}
        })
    ]
    
    # 1. 模拟数据不断流入
    for p in mock_probes:
        pipeline.receive_probe_data(p)
    
    # 2. 模拟前端请求 Trace 详情
    print("\n=== 📦 前端请求 /api/traces/trace_999 拿到的完美JSON ===")
    frontend_data = pipeline.get_trace_for_frontend("trace_999")
    print(json.dumps(frontend_data, indent=2, ensure_ascii=False))