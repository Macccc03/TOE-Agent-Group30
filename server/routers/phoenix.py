"""Read-only Phoenix tracing queries over the team's SQLite storage."""

import json
from collections import defaultdict, deque
from functools import cache
from math import ceil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from graphql import GraphQLError, build_schema, graphql_sync
from pydantic import BaseModel

from processor.adapter import db_record_to_frontend_span
from processor.ingress import sanitize_text
from server.routers.api import get_db
from storage.engine.sqlite_engine import SQLiteStorageEngine

router = APIRouter()
schema = build_schema(
    Path(__file__).with_name("phoenix_schema.graphql").read_text(encoding="utf-8")
)
PROJECT_ID = "local-traces"
PROJECT_NAME = "本地项目"
SPAN_KINDS = set(schema.get_type("SpanKind").values)
SPAN_STATUSES = set(schema.get_type("SpanStatusCode").values)
ROOT_SPAN = """
NOT EXISTS (
    SELECT 1 FROM spans parent
    WHERE parent.span_id = s.parent_id AND parent.trace_id = s.trace_id
)
"""
SORT_COLUMNS = {
    "startTime": "julianday(s.start_time)",
    "endTime": "julianday(s.end_time)",
    "latencyMs": "s.latency_ms",
    "tokenCountTotal": "s.total_tokens",
    "tokenCountPrompt": "s.prompt_tokens",
    "tokenCountCompletion": "s.completion_tokens",
    "cumulativeTokenCountTotal": "t.total_tokens",
    "cumulativeTokenCountPrompt": "s.prompt_tokens",
    "cumulativeTokenCountCompletion": "s.completion_tokens",
    "cumulativeTokenCostTotal": "t.total_cost_usd",
    "tokenCostTotal": "s.cost_usd",
}


class GraphQLRequest(BaseModel):
    query: str
    variables: dict[str, Any] | None = None
    operationName: str | None = None


def page_args(first=50, after=None):
    try:
        offset = int(after) if after is not None else 0
    except ValueError as exc:
        raise GraphQLError("Invalid cursor") from exc
    size = 50 if first is None else first
    if offset < 0 or not 0 <= size <= 1000:
        raise GraphQLError("Invalid page bounds")
    return offset, size


def connection(nodes, offset=0, has_next=False):
    edges = [{"node": node, "cursor": str(i)} for i, node in enumerate(nodes, offset + 1)]
    return {
        "edges": edges,
        "pageInfo": {
            "endCursor": edges[-1]["cursor"] if edges else None,
            "hasNextPage": has_next,
        },
    }


def page(nodes, first=50, after=None):
    offset, size = page_args(first, after)
    return connection(
        nodes[offset : offset + size], offset, size > 0 and offset + size < len(nodes)
    )


def time_filter(column, time_range):
    clauses, values = [], []
    for key, operator in (("start", ">="), ("end", "<")):
        value = (time_range or {}).get(key)
        if value is not None:
            clauses.append(f"julianday({column}) {operator} julianday(?)")
            values.append(value)
    return clauses, values


def cost_summary(total):
    # Storage records a total price and token splits, with no price split.
    return {"total": {"cost": total}, "prompt": {}, "completion": {}}


def span_io(value):
    if value is None:
        return None
    return {"value": value, "truncatedValue": value[:512], "mimeType": "text"}


def span_status(row):
    status = row["status"].upper()
    return status if status in SPAN_STATUSES else "UNSET"


class TracingView:
    """A view of the storage for one GraphQL operation."""

    def __init__(self, db: SQLiteStorageEngine):
        self.db = db
        self.conn = db.connect()
        # Cache only for this request. Relay can request the same span through
        # several fragments and aliases, and root metrics all use the same rows.
        self.trace = cache(self.trace)
        self.trace_node = cache(self.trace_node)
        self.trace_rows = cache(self.trace_rows)
        self.project = {
            "__typename": "Project",
            "id": PROJECT_ID,
            "name": PROJECT_NAME,
            "gradientStartColor": "#14b8a6",
            "gradientEndColor": "#2563eb",
            "startTime": lambda _: self.bounds()["start_time"],
            "endTime": lambda _: self.bounds()["end_time"],
            "hasTraces": lambda _: self.bounds()["start_time"] is not None,
            "streamingLastUpdatedAt": lambda _: self.bounds()["end_time"],
            "trace": lambda _, traceId: self.trace(traceId),
            "spans": self.project_spans,
            "traceCount": lambda _, timeRange=None, **kw: self.project_stats(timeRange)["count"],
            "latencyMsQuantile": self.latency_quantile,
            "costSummary": lambda _, timeRange=None, **kw: cost_summary(
                self.project_stats(timeRange)["cost"]
            ),
            "sessionCount": 0,
            "annotationConfigs": connection([]),
            "spanAnnotationNames": [],
            "traceAnnotationNames": [],
            "documentEvaluationNames": [],
        }
        self.bounds = cache(self.bounds)
        self.stats = cache(self.stats)

    def root(self):
        return {
            "node": self.node,
            "projects": self.projects,
            "projectCount": 1,
            "datasetCount": 0,
            "promptCount": 0,
            "evaluatorCount": 0,
            "agentsConfig": {
                "assistantProjectName": "",
                **dict.fromkeys(
                    (
                        "forceTracing",
                        "webAccessEnabled",
                        "assistantEnabled",
                        "githubServerEnabled",
                        "githubEnabled",
                        "githubWorkspaceTokenConfigured",
                        "allowLocalTraces",
                        "allowRemoteExport",
                    ),
                    False,
                ),
            },
        }

    def bounds(self):
        return self.conn.execute(
            "SELECT min(start_time) AS start_time, max(end_time) AS end_time FROM traces"
        ).fetchone()

    def projects(self, _, first=50, after=None, filter=None, **kwargs):
        matches = not filter or filter["value"].casefold() in PROJECT_NAME.casefold()
        return page([self.project] if matches else [], first, after)

    def node(self, _, id):
        if id == PROJECT_ID:
            return self.project
        kind, _, raw_id = id.partition(":")
        if kind == "Trace":
            return self.trace(raw_id)
        if kind == "Span":
            row = self.db.get_span_by_id(raw_id)
            return self.span(row) if row else None
        return None

    def project_stats(self, time_range):
        return self.stats((time_range or {}).get("start"), (time_range or {}).get("end"))

    def stats(self, start, end):
        clauses, values = time_filter("start_time", {"start": start, "end": end})
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        rows = self.conn.execute(
            f"SELECT latency_ms, total_cost_usd FROM traces {where} ORDER BY latency_ms",
            values,
        ).fetchall()
        return {
            "count": len(rows),
            "latencies": [row["latency_ms"] for row in rows],
            "cost": sum(row["total_cost_usd"] for row in rows) if rows else None,
        }

    def latency_quantile(self, _, probability, timeRange=None, **kwargs):
        latencies = self.project_stats(timeRange)["latencies"]
        if not 0 <= probability <= 1:
            raise GraphQLError("Quantile probability must be between 0 and 1")
        return latencies[max(0, ceil(probability * len(latencies)) - 1)] if latencies else None

    def project_spans(
        self,
        _,
        first,
        after=None,
        timeRange=None,
        sort=None,
        filterCondition=None,
        traceFilterCondition=None,
        **kwargs,
    ):
        if filterCondition not in (None, "", "parent_span is None") or traceFilterCondition:
            raise GraphQLError("Only the root-span filter is supported")
        offset, size = page_args(first, after)
        clauses, values = time_filter("s.start_time", timeRange)
        if filterCondition:
            clauses.append(ROOT_SPAN)
        where = "WHERE " + " AND ".join(clauses) if clauses else ""
        sort = sort or {"dir": "desc"}
        order_by = SORT_COLUMNS.get(sort.get("col"), SORT_COLUMNS["startTime"])
        direction = "ASC" if sort["dir"] == "asc" else "DESC"
        rows = self.conn.execute(
            f"""
            SELECT s.* FROM spans s JOIN traces t ON t.trace_id = s.trace_id
            {where}
            ORDER BY {order_by} {direction}, s.span_id {direction}
            LIMIT ? OFFSET ?
            """,
            [*values, size + 1, offset],
        ).fetchall()
        return connection(
            [self.span(dict(row)) for row in rows[:size]],
            offset,
            size > 0 and len(rows) > size,
        )

    def trace_rows(self, trace_id):
        rows = self.db.get_spans_by_trace_id(trace_id)
        by_id = {row["span_id"]: row for row in rows}
        roots, children = [], defaultdict(list)
        for row in rows:
            if row["parent_id"] in by_id:
                children[row["parent_id"]].append(row)
            else:
                roots.append(row)
        return rows, roots, children

    def trace(self, trace_id):
        return self.trace_node(trace_id) if self.trace_rows(trace_id)[0] else None

    def trace_node(self, trace_id):
        def latency(_):
            row = self.conn.execute(
                "SELECT latency_ms FROM traces WHERE trace_id = ?", (trace_id,)
            ).fetchone()
            return row["latency_ms"]

        def root_span(_):
            roots = self.trace_rows(trace_id)[1]
            return self.span(roots[0]) if roots else None

        def spans(_, first, after=None, filterCondition=None, **kwargs):
            if filterCondition not in (None, "", "parent_span is None"):
                raise GraphQLError("Only the root-span filter is supported")
            rows, roots, _ = self.trace_rows(trace_id)
            return page(
                [self.span(row) for row in (roots if filterCondition else rows)], first, after
            )

        return {
            "__typename": "Trace",
            "id": f"Trace:{trace_id}",
            "traceId": trace_id,
            "project": self.project,
            "latencyMs": latency,
            "numSpans": lambda _: len(self.trace_rows(trace_id)[0]),
            "spans": spans,
            "rootSpan": root_span,
            "costSummary": lambda _: cost_summary(
                sum(row["cost_usd"] for row in self.trace_rows(trace_id)[0])
            ),
            "traceAnnotations": [],
            "traceAnnotationSummaries": [],
            "costDetailSummaryEntries": [],
        }

    def descendants(self, row, max_depth=None):
        children = self.trace_rows(row["trace_id"])[2]
        seen = {row["span_id"]}
        pending = deque((child, 1) for child in children[row["span_id"]])
        result = []
        while pending:
            child, depth = pending.popleft()
            span_id = child["span_id"]
            if span_id in seen or (max_depth is not None and depth > max_depth):
                continue
            seen.add(span_id)
            result.append(child)
            pending.extend((item, depth + 1) for item in children[span_id])
        return result

    def span(self, row):
        span = db_record_to_frontend_span(row)
        kind = span["spanKind"].lower()
        own_status = span_status(row)
        subtree = cache(lambda: [row, *self.descendants(row)])

        def descendants(_, maxDepth=3, first=50, after=None, **kwargs):
            rows = self.descendants(row, maxDepth)
            return page([self.span(child) for child in rows], first, after)

        def attributes(_):
            # Older rows may contain the entire raw request. Only expose the
            # recognized model name alongside the separately sanitized I/O.
            try:
                metadata = json.loads(row["attributes_json"] or "{}")
            except json.JSONDecodeError:
                return "{}"
            if not isinstance(metadata, dict):
                return "{}"
            model = metadata.get("model") or metadata.get("model_name")
            return json.dumps({"llm": {"model_name": sanitize_text(model)}} if model else {})

        return {
            **span,
            "__typename": "Span",
            "id": f"Span:{span['spanId']}",
            "spanKind": kind if kind in SPAN_KINDS else "unknown",
            "statusCode": own_status,
            "statusMessage": sanitize_text(row["error_message"]),
            "propagatedStatusCode": lambda _: (
                "ERROR" if any(span_status(child) == "ERROR" for child in subtree()) else own_status
            ),
            "trace": lambda _: self.trace_node(row["trace_id"]),
            "project": self.project,
            "input": span_io(span["input"]),
            "output": span_io(span["output"]),
            "attributes": attributes,
            "events": [],
            "tokenCountPrompt": row["prompt_tokens"],
            "tokenCountCompletion": row["completion_tokens"],
            "cumulativeTokenCountTotal": lambda _: sum(
                child["total_tokens"] for child in subtree()
            ),
            "cumulativeTokenCountPrompt": lambda _: sum(
                child["prompt_tokens"] for child in subtree()
            ),
            "cumulativeTokenCountCompletion": lambda _: sum(
                child["completion_tokens"] for child in subtree()
            ),
            "costSummary": cost_summary(row["cost_usd"]),
            "costDetailSummaryEntries": [],
            "cumulativeCostDetailSummaryEntries": [],
            "descendants": descendants,
            "spanAnnotations": [],
            "spanAnnotationSummaries": [],
            "documentEvaluations": [],
            "documentRetrievalMetrics": [],
        }


@router.post("/graphql", include_in_schema=False)
async def tracing_graphql(body: GraphQLRequest, request: Request):
    view = TracingView(get_db(request))
    return graphql_sync(
        schema,
        body.query,
        root_value=view.root(),
        variable_values=body.variables,
        operation_name=body.operationName,
    ).formatted
