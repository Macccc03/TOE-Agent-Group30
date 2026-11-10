"""
文件名: api.py
所属模块: 服务端 RESTful API 路由 (server/routers)
================================================================================
【功能定位】
提供符合“本地一体化 Agent 观测系统”核心契约的轻量级 RESTful API 端点：
1. 探针数据收集与处理中枢启动接口 (POST /api/spans 或 /api/ingest)：
   接收成员 1 探针采集的 RawSpanData，自动触发成员 2 的数据清洗、脱敏与代价格算，
   随后批量持久化至成员 3 的本地 SQLite-WAL 存储引擎中。
2. 核心大屏与建树查询接口 (GET /api/traces, GET /api/traces/{trace_id})：
   调用成员 2 的建树算法与出库加工逻辑，返回符合【契约 3】的 TraceTreeViewModel。
3. 全局统计看板接口 (GET /api/metrics/summary)：
   为前端总览仪表盘（Overview Dashboard）提供总调用量、总 Token、总花费等聚合卡片指标。
4. 单步点查下钻接口 (GET /api/spans/{span_id})：
   供前端侧边抽屉（Details Drawer）展示底层 Prompt、输出及异常 Traceback 明细。
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status

# 引入成员 3 (storage) 的存储引擎
import storage

# 引入成员 2 (processor) 的清洗、转换与建树模块
from processor.adapter import probe_to_raw_dict
from processor.contracts import ProcessedSpanRecord, RawSpanData
from processor.egress import process_egress
from processor.ingress import process_ingress
from storage.engine.sqlite_engine import SQLiteStorageEngine

logger = logging.getLogger("server.routers.api")

router = APIRouter(prefix="/api", tags=["Observability API"])

# 全局默认数据库单例（当 request.app.state.db 未显式注入时回退使用）
_default_db: SQLiteStorageEngine | None = None


def get_db(request: Request) -> SQLiteStorageEngine:
    """获取数据库引擎实例，优先从 FastAPI app.state.db 中提取"""
    global _default_db
    db = getattr(request.app.state, "db", None)
    if db is not None:
        return db
    if _default_db is None:
        _default_db = storage.init_db("trace.db")
    return _default_db


# =====================================================================
# 1. 核心算法：$O(N)$ 拓扑组装建树算法 (契约 3 标准)
# =====================================================================

def build_trace_tree(flat_spans: list[dict[str, Any]]) -> dict[str, Any]:
    """
    将数据库查出的扁平 Span 记录组装为带有嵌套 children 的树状拓扑模型 (TraceTreeViewModel)。
    时间复杂度: O(N), 空间复杂度: O(N)
    """
    if not flat_spans:
        return {}

    def parse_dt(val: Any) -> datetime:
        dt: datetime | None = None
        if isinstance(val, datetime):
            dt = val
        elif isinstance(val, str):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except Exception:
                pass
        if dt is None:
            dt = datetime.now(timezone.utc)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    node_map: dict[str, dict[str, Any]] = {}
    roots: list[dict[str, Any]] = []

    # 第一遍扫描: 确定最小起始时间，计算各 Span 相对 Trace 起点的相对毫秒偏移 (供甘特图展示)
    min_start_time = min(parse_dt(span["start_time"]) for span in flat_spans)

    for span in flat_spans:
        s_id = str(span.get("span_id", ""))
        start_dt = parse_dt(span.get("start_time"))
        rel_start_ms = max(0.0, (start_dt - min_start_time).total_seconds() * 1000.0)

        node_map[s_id] = {
            "span_id": s_id,
            "parent_id": span.get("parent_id"),
            "name": span.get("name", "Unknown Node"),
            "span_kind": span.get("span_kind", "CHAIN"),
            "latency_ms": float(span.get("latency_ms", 0.0)),
            "relative_start_ms": rel_start_ms,
            "cost_usd": float(span.get("cost_usd", 0.0)),
            "tokens": int(span.get("total_tokens", 0)),
            "input": span.get("input_str", ""),
            "output": span.get("output_str", ""),
            "status": span.get("status", "OK"),
            "error_message": span.get("error_message"),
            "start_time": span.get("start_time"),
            "end_time": span.get("end_time"),
            "children": [],
        }

    # 第二遍扫描: 基于 parent_id 构建父子树形指针
    for span in flat_spans:
        s_id = str(span.get("span_id", ""))
        p_id = span.get("parent_id")
        current_node = node_map[s_id]

        if p_id and str(p_id) in node_map:
            node_map[str(p_id)]["children"].append(current_node)
        else:
            roots.append(current_node)

    # 对子节点按相对起始时间升序排列，保障时间线直观
    for node in node_map.values():
        node["children"].sort(key=lambda x: x["relative_start_ms"])

    primary_root = roots[0] if roots else {}
    trace_id = flat_spans[0].get("trace_id", "")
    total_tokens = sum(int(s.get("total_tokens", 0)) for s in flat_spans)
    total_cost = sum(float(s.get("cost_usd", 0.0)) for s in flat_spans)
    total_latency = max((s["relative_start_ms"] + s["latency_ms"]) for s in node_map.values()) if node_map else 0.0

    return {
        "trace_id": trace_id,
        "root_name": primary_root.get("name", "Agent_Pipeline"),
        "total_latency_ms": round(total_latency, 2),
        "total_tokens": total_tokens,
        "total_cost_usd": round(total_cost, 6),
        "status": "ERROR" if any(s.get("status") == "ERROR" for s in flat_spans) else "OK",
        "start_time": flat_spans[0].get("start_time"),
        "tree": primary_root,
        "all_roots": roots,
    }


# =====================================================================
# 2. 探针数据收集与数据处理启动接口 (Ingress Pipeline)
# =====================================================================

@router.post("/spans", summary="接收探针数据并启动流水线清洗落盘")
@router.post("/ingest", summary="接收探针数据别名接口")
async def ingest_spans(
    payload: dict[str, Any] | list[dict[str, Any]],
    request: Request,
) -> dict[str, Any]:
    """
    【接收外部收集探针发回信息的入口】：
    1. 接收来自 LangChain / LlamaIndex / OpenAI 探针上报的单条或批量 Span 原始数据；
    2. 字段自适应：支持驼峰式 (traceId) 或蛇形命名 (trace_id)；
    3. 启动成员 2 的 Ingress 处理流：进行敏感信息脱敏、Token 明细拆解与模型花费核算；
    4. 将清洗完成的 ProcessedSpanRecord 批量原子写入本地 SQLite-WAL 数据库。
    """
    db = get_db(request)
    raw_items = payload if isinstance(payload, list) else [payload]
    if not raw_items:
        return {"status": "ok", "received": 0, "processed": 0}

    processed_records: list[ProcessedSpanRecord] = []
    errors: list[str] = []

    for idx, item in enumerate(raw_items):
        try:
            # 1. 适配并标准化字段 (兼容 TS 探针 camelCase 与 Python snake_case 命名)
            raw_dict = probe_to_raw_dict(item)

            span_id = str(
                raw_dict.get("span_id")
                if raw_dict.get("span_id") != "unknown_span"
                else (item.get("span_id") or item.get("spanId") or "unknown_span")
            )
            trace_id = str(
                raw_dict.get("trace_id")
                if raw_dict.get("trace_id") != "unknown_trace"
                else (item.get("trace_id") or item.get("traceId") or "")
            )
            parent_id = raw_dict.get("parent_id") or item.get("parent_id") or item.get("parentId")
            start_str = (
                raw_dict.get("start_time")
                or item.get("start_time")
                or item.get("startTime")
                or datetime.now().isoformat()
            )
            end_str = (
                raw_dict.get("end_time")
                or item.get("end_time")
                or item.get("endTime")
                or datetime.now().isoformat()
            )
            start_dt = datetime.fromisoformat(str(start_str).replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(str(end_str).replace("Z", "+00:00"))

            raw_span = RawSpanData(
                trace_id=trace_id,
                span_id=span_id,
                parent_id=parent_id,
                name=str(raw_dict.get("name") or item.get("name") or "Unknown"),
                span_kind=str(raw_dict.get("span_kind") or item.get("span_kind") or item.get("kind") or "CHAIN"),
                start_time=start_dt,
                end_time=end_dt,
                input_data=raw_dict.get("input_data") or item.get("input_data") or item.get("input"),
                output_data=raw_dict.get("output_data") or item.get("output_data") or item.get("output"),
                model_name=raw_dict.get("model_name") or item.get("model_name") or item.get("model"),
                raw_tokens=raw_dict.get("raw_tokens") or item.get("raw_tokens") or item.get("tokens") or {},
                status=str(raw_dict.get("status") or item.get("status") or "OK"),
                error_message=raw_dict.get("error_message") or item.get("error_message"),
                metadata=raw_dict.get("metadata") or item.get("metadata") or item,
            )

            # 2. 启动数据处理中枢：脱敏、Token 阶梯统计、多模型动态代价格算
            record = process_ingress(raw_span)
            processed_records.append(record)
        except Exception as e:
            err_msg = f"Item {idx} processing failed: {e!s}"
            logger.warning(err_msg)
            errors.append(err_msg)

    # 3. 批量原子提交落盘
    if processed_records:
        db.save_spans_batch(processed_records)

    return {
        "status": "ok",
        "received": len(raw_items),
        "processed": len(processed_records),
        "errors": errors if errors else None,
    }


# =====================================================================
# 3. 核心查询接口：列表、建树详情、大屏指标 (契约 3)
# =====================================================================

@router.get("/traces", summary="获取最近 Trace 概览列表（供前端仪表盘/分页大盘使用）")
async def list_recent_traces(
    request: Request,
    limit: int = Query(50, ge=1, le=200, description="每页返回数量"),
    offset: int = Query(0, ge=0, description="分页偏移量"),
) -> dict[str, Any]:
    """
    【大盘首页分页查询】：
    利用 B-Tree 逆序游标索引，微秒级常数开销获取最新 Traces 摘要列表。
    """
    db = get_db(request)
    traces = db.get_recent_traces(limit=limit, offset=offset)
    return {
        "total": len(traces),
        "limit": limit,
        "offset": offset,
        "data": traces,
    }


@router.get("/traces/{trace_id}", summary="获取单条 Trace 的拓扑树与时间轴视图模型（契约 3）")
async def get_trace_detail(
    trace_id: str,
    request: Request,
) -> dict[str, Any]:
    """
    【建树核心接口（对接契约 3）】：
    1. 从底层数据库通过覆盖索引按时间顺序查出该 Trace 的全部扁平 Span 记录；
    2. 调用成员 2 的建树算法构造树状拓扑结构 (tree)；
    3. 同步整合甘特图相对时间偏移 (spans)，一次性满足嵌套树与时间轴瀑布流大屏渲染。
    """
    db = get_db(request)
    flat_spans = db.get_spans_by_trace_id(trace_id)

    if not flat_spans:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trace with ID '{trace_id}' not found.",
        )

    # 1. 调用拓扑算法生成符合契约 3 的树模型
    tree_model = build_trace_tree(flat_spans)

    # 2. 调用出站转换器生成时间轴甘特图列表数据
    egress_model = process_egress(flat_spans)

    return {
        **tree_model,
        "spans": egress_model.get("spans", []),
    }


@router.get("/metrics/summary", summary="获取全局大盘核心指标卡片数据")
async def get_metrics_summary(
    request: Request,
    start_time_gte: str | None = Query(None, description="起始时间过滤 ISO 字符串"),
) -> dict[str, Any]:
    """
    【总览大盘卡片接口】：
    单趟聚合调用总量、总 Token 消耗、累计美元花费、平均耗时及错误率。
    """
    db = get_db(request)
    metrics = db.get_dashboard_metrics(start_time_gte=start_time_gte)
    return {
        "status": "ok",
        "metrics": metrics,
    }


# =====================================================================
# 4. 单步点查下钻接口 (供侧边抽屉使用) 与健康检查
# =====================================================================

@router.get("/spans/{span_id}", summary="单步点查 Span 详细信息（供右侧抽屉下钻查看）")
async def get_span_detail(
    span_id: str,
    request: Request,
) -> dict[str, Any]:
    """
    【单步点查接口】：
    根据 span_id 查询单一节点的完整输入、输出、Prompt、属性参数与异常堆栈。
    """
    db = get_db(request)
    span = db.get_span_by_id(span_id)
    if not span:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Span with ID '{span_id}' not found.",
        )
    return {
        "status": "ok",
        "data": span,
    }


@router.get("/health", summary="服务与数据库健康检查")
async def health_check(request: Request) -> dict[str, Any]:
    """验证服务就绪状态与本地 SQLite 数据库连接状态"""
    db = get_db(request)
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "database": "sqlite-wal",
        "db_connected": db is not None,
    }
