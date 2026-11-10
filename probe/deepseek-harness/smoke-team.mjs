import { randomBytes } from "node:crypto";
import { sendTeamRecords } from "./team-exporter.mjs";

const base = (
  process.env.DSH_TEAM_BASE ?? "http://127.0.0.1:6007"
).replace(/\/$/, "");

const traceId = randomBytes(16).toString("hex");
const rootId = randomBytes(8).toString("hex");
const stepId = randomBytes(8).toString("hex");
const toolId = randomBytes(8).toString("hex");

const start = Date.now() - 1000;
const time = (offset) =>
  new Date(start + offset).toISOString();

function makeSpan(id, parentId, kind, name, begin, end) {
  return {
    trace_id: traceId,
    span_id: id,
    parent_id: parentId,
    span_kind: kind,
    name,
    start_time: time(begin),
    end_time: time(end),
    input_data: "",
    output_data: "",
    raw_tokens: {},
    status: "OK",
    metadata: {
      source: "probe-smoke-test",
      synthetic: true,
    },
  };
}

// 子节点先到达，验证后端能否正确建立父子关系。
const records = [
  makeSpan(
    toolId,
    stepId,
    "TOOL",
    "synthetic-tool",
    200,
    500
  ),
  makeSpan(
    stepId,
    rootId,
    "CHAIN",
    "Synthetic Step",
    100,
    600
  ),
  makeSpan(
    rootId,
    null,
    "AGENT",
    "probe-smoke-test",
    0,
    800
  ),
];

const result = await sendTeamRecords(
  `${base}/api/spans`,
  records
);

const detailUrl = `${base}/api/traces/${traceId}`;

const response = await fetch(detailUrl, {
  signal: AbortSignal.timeout(5000),
});

if (!response.ok) {
  throw new Error(`查询轨迹失败：HTTP ${response.status}`);
}

const detail = await response.json();

const root = detail.tree;
const step = root?.children?.[0];
const tool = step?.children?.[0];

if (
  root?.span_id !== rootId ||
  step?.span_id !== stepId ||
  tool?.span_id !== toolId ||
  detail.spans?.length !== 3
) {
  throw new Error("记录已发送，但返回的节点数量或父子关系不正确");
}

console.log("PASS：三个节点已接收，调用树层级正确。");
console.log("接收数量：", result.received);
console.log("处理数量：", result.processed);
console.log("Trace ID：", traceId);
console.log("查询地址：", detailUrl);