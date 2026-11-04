import assert from "node:assert/strict";
import test from "node:test";

import { getTools, getTraces, getTrend, p95, summarize } from "./metrics.ts";

const span = (overrides = {}) => ({
  id: "root",
  name: "agent",
  spanKind: "agent",
  parentId: null,
  startTime: "2026-11-04T10:00:00+08:00",
  endTime: "2026-11-04T10:00:02+08:00",
  latencyMs: 2000,
  statusCode: "OK",
  tokenCountTotal: null,
  costSummary: null,
  trace: { traceId: "trace-1" },
  projectId: "project-1",
  projectName: "demo",
  ...overrides,
});

test("父子节点按 Trace 去重，耗时不相加，Token/费用汇总自身值", () => {
  const traces = getTraces([
    span({ tokenCountTotal: 10, costSummary: { total: { cost: 0 } } }),
    span({
      id: "child",
      parentId: "root",
      spanKind: "llm",
      tokenCountTotal: 40,
      costSummary: { total: { cost: 0.02 } },
    }),
    span({ projectId: "project-2" }),
  ]);
  assert.equal(traces.length, 2);
  const first = traces.find((trace) => trace.projectId === "project-1");
  assert.equal(first.latency, 2);
  assert.equal(first.tokens, 50);
  assert.equal(first.cost, 0.02);
});

test("链内错误影响成功率，进行中排除，未记录和零值区分", () => {
  const traces = getTraces([
    span({ tokenCountTotal: 0, costSummary: { total: { cost: 0 } } }),
    span({ id: "bad", trace: { traceId: "trace-2" }, statusCode: "ERROR" }),
    span({
      id: "pending",
      trace: { traceId: "trace-3" },
      endTime: null,
      statusCode: "ERROR",
    }),
  ]);
  assert.equal(summarize(traces).successRate, 50);
  assert.equal(getTraces([span()])[0].tokens, null);
  assert.equal(summarize(traces).tokens, 0);
  assert.equal(summarize(traces).cost, 0);
  assert.equal(summarize([]).successRate, null);
  assert.equal(summarize([]).cost, null);
});

test("日趋势总数等于调用量，P95 使用最近秩法", () => {
  const traces = getTraces([span(), span({ trace: { traceId: "trace-2" } })]);
  const trend = getTrend(
    traces,
    Date.parse("2026-11-01T00:00:00+08:00"),
    Date.parse("2026-11-07T00:00:00+08:00")
  );
  assert.equal(
    trend.reduce((sum, bin) => sum + bin.calls, 0),
    2
  );
  assert.equal(p95(Array.from({ length: 20 }, (_, index) => index + 1)), 19);
  assert.equal(p95([]), null);
});

test("工具分布只统计 Phoenix 小写 tool 类型，排除检索与 Agent", () => {
  assert.deepEqual(
    getTools([
      span({ spanKind: "tool", name: "weather" }),
      span({ spanKind: "tool", name: "weather" }),
      span({ spanKind: "tool", name: "search" }),
      span({ spanKind: "retriever", name: "knowledge-search" }),
      span(),
    ]),
    [
      { name: "weather", count: 2 },
      { name: "search", count: 1 },
    ]
  );
});
