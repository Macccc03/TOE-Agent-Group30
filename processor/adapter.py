"""
文件名: adapter.py
所属模块: 数据处理中枢 (processor)

【功能说明】
1. 入站适配 (probe_to_raw_dict)：由于成员 1 的探针可能是用 TS 写的，传过来的 JSON 字段名可能不统一。
   该函数负责将外部 JSON 强行映射为内部统一的标准字段。
2. 出站适配 (db_record_to_frontend_span)：数据库查询出的数据是蛇形命名（snake_case），
   而前端（成员 4）的 TypeScript 接口要求是驼峰命名（camelCase）。
   该函数负责数据格式的翻译，并组装前端需要的嵌套结构（如 costSummary）。
"""

import json
from typing import Dict, Any

def probe_to_raw_dict(probe_json: Dict[str, Any]) -> Dict[str, Any]:
    """将成员1的探针JSON转为内部字典"""
    return {
        "trace_id": probe_json.get("traceId") or probe_json.get("trace_id", "unknown_trace"),
        "span_id": probe_json.get("spanId") or probe_json.get("span_id") or probe_json.get("id", "unknown_span"),
        "parent_id": probe_json.get("parentId") or probe_json.get("parent_id"),
        "name": probe_json.get("name", "Unknown Node"),
        "span_kind": probe_json.get("kind") or probe_json.get("spanKind") or probe_json.get("span_kind", "CHAIN"),
        "start_time": probe_json.get("startTime") or probe_json.get("start_time"),
        "end_time": probe_json.get("endTime") or probe_json.get("end_time"),
        "input_data": probe_json.get("input") if "input" in probe_json else probe_json.get("input_data", ""),
        "output_data": probe_json.get("output") if "output" in probe_json else probe_json.get("output_data", ""),
        "model_name": probe_json.get("model") or probe_json.get("model_name", None),
        "raw_tokens": probe_json.get("tokens") or probe_json.get("raw_tokens", {}),
        "status": "ERROR" if probe_json.get("isError") else probe_json.get("status", "OK"),
        "error_message": probe_json.get("errorMessage") or probe_json.get("error_message"),
        "metadata": probe_json
    }

def db_record_to_frontend_span(db_record: Dict[str, Any]) -> Dict[str, Any]:
    """将数据库记录转为前端成员4需要的 ISpanItem 格式 (驼峰式)"""
    cost_val = db_record.get("cost_usd", 0.0)
    return {
        "id": db_record.get("span_id"),
        "spanId": db_record.get("span_id"),
        "parentId": db_record.get("parent_id"),
        "name": db_record.get("name"),
        "spanKind": db_record.get("span_kind"),
        "startTime": db_record.get("start_time"),
        "endTime": db_record.get("end_time"),
        "latencyMs": db_record.get("latency_ms", 0.0),
        "statusCode": db_record.get("status", "OK"),
        "tokenCountTotal": db_record.get("total_tokens", 0),
        "costSummary": {
            "total": {
                "cost": cost_val
            }
        },
        "input": db_record.get("input_str", ""),
        "output": db_record.get("output_str", "")
    }