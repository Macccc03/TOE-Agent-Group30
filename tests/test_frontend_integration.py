import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from graphql import parse, validate

from server.app import create_app
from server.routers.phoenix import PROJECT_ID, schema
from storage import init_db

FRONTEND = Path(__file__).resolve().parents[1] / "frontend" / "phoenix-src"


def demo_spans():
    start = datetime.now(timezone.utc) - timedelta(minutes=1)

    def span(suffix, kind, start_ms, end_ms, **fields):
        return {
            "traceId": "integration-demo",
            "spanId": f"integration-{suffix}",
            "name": f"集成示例 {kind}",
            "kind": kind,
            "startTime": (start + timedelta(milliseconds=start_ms)).isoformat(),
            "endTime": (start + timedelta(milliseconds=end_ms)).isoformat(),
            **fields,
        }

    return [
        span("root", "AGENT", 0, 1850, input="合成样例", output="未调用外部模型"),
        span("tool", "TOOL", 200, 500, parentId="integration-root", output="工具执行成功"),
        span(
            "llm",
            "LLM",
            550,
            1700,
            parentId="integration-root",
            model="deepseek-flash",
            tokens={"prompt_tokens": 80, "completion_tokens": 40},
            input="用于回归检查的输入",
            output="合成模型输出",
            status="ERROR",
            errorMessage="合成错误",
        ),
    ]


def relay_query(name):
    artifact = next(FRONTEND.rglob(f"{name}.graphql.ts"))
    text = artifact.read_text(encoding="utf-8")
    return json.loads(re.search(r'"text": ("(?:[^"\\]|\\.)*")', text)[1])


@pytest.fixture
def client(tmp_path):
    db = init_db(str(tmp_path / "tracing.db"))
    try:
        with TestClient(create_app(db=db)) as client:
            yield client
    finally:
        db.close()


def execute(client, query, **variables):
    response = client.post("/graphql", json={"query": query, "variables": variables})
    assert response.status_code == 200
    body = response.json()
    assert not body.get("errors"), body
    return body["data"]


def test_native_storage_is_visible_in_retained_phoenix_pages(client):
    dashboard = """
    query ($id: ID!, $range: TimeRange, $after: String) {
      node(id: $id) {
        ... on Project {
          spans(first: 2, timeRange: $range, after: $after) {
            edges { node { spanId spanKind tokenCountTotal costSummary { total { cost } } } }
            pageInfo { endCursor hasNextPage }
          }
        }
      }
    }
    """

    def dashboard_page(**variables):
        return execute(client, dashboard, id=PROJECT_ID, **variables)["node"]["spans"]

    assert dashboard_page()["edges"] == []
    spans = demo_spans()
    for _ in range(2):
        assert client.post("/api/spans", json=spans).json()["processed"] == 3
    summary = client.get("/api/traces").json()["data"][0]
    metrics = client.get("/api/metrics/summary").json()["metrics"]
    assert summary["total_tokens"] == metrics["total_tokens"] == 120
    assert summary["latency_ms"] == 1850
    assert summary["status"] == "ERROR"
    assert summary["total_cost_usd"] > 0

    page = dashboard_page()
    assert page["pageInfo"]["hasNextPage"]
    second = dashboard_page(after=page["pageInfo"]["endCursor"])
    assert not second["pageInfo"]["hasNextPage"]
    nodes = [edge["node"] for edge in [*page["edges"], *second["edges"]]]
    assert {node["spanKind"] for node in nodes} == {"agent", "tool", "llm"}
    assert sum(node["tokenCountTotal"] for node in nodes) == 120
    assert sum(node["costSummary"]["total"]["cost"] for node in nodes) == summary["total_cost_usd"]
    assert dashboard_page(range={"end": "2000-01-01T00:00:00Z"})["edges"] == []

    project = execute(
        client, relay_query("ProjectPageQueriesTracesQuery"), id=PROJECT_ID, timeRange={}
    )["project"]
    root = project["rootSpans"]["edges"][0]["rootSpan"]
    assert root["cumulativeTokenCountTotal"] == 120
    assert root["trace"]["numSpans"] == 3
    assert len(root["descendants"]["edges"]) == 2

    trace = execute(
        client, relay_query("TraceDetailsQuery"), id=PROJECT_ID, traceId=summary["trace_id"]
    )["project"]["trace"]
    assert trace["latencyMs"] == summary["latency_ms"]
    child = next(
        edge["span"] for edge in trace["spans"]["edges"] if edge["span"]["spanKind"] == "llm"
    )
    assert child["parentId"] == root["spanId"]
    assert child["statusCode"] == "ERROR"
    detail = execute(client, relay_query("SpanDetailsQuery"), id=child["id"])["span"]
    assert detail["input"]["value"] == "用于回归检查的输入"
    assert detail["output"]["value"] == "合成模型输出"
    assert detail["statusMessage"] == "合成错误"

    # Updating the same span replaces its old contribution and can clear an error.
    spans[-1]["status"] = "OK"
    spans[-1]["errorMessage"] = None
    spans[-1]["tokens"]["completion_tokens"] = 20
    assert client.post("/api/spans", json=spans[-1]).json()["processed"] == 1
    updated = client.get("/api/traces").json()["data"][0]
    assert (updated["total_tokens"], updated["status"]) == (100, "OK")


def test_schema_matches_retained_relay_queries():
    for artifact in FRONTEND.rglob("*.graphql.ts"):
        match = re.search(r'"text": ("(?:[^"\\]|\\.)*")', artifact.read_text(encoding="utf-8"))
        if match and "Session" not in artifact.name:
            text = json.loads(match[1])
            if text.lstrip().startswith("query"):
                assert not validate(schema, parse(text)), artifact.name
