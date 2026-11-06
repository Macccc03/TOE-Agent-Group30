# 团队数据接入准备

核对版本：main `09b9bce`（2026-11-06）。本文是前端提出的对齐材料，**尚未由团队冻结为接口协议**。当前页面继续读取 Phoenix GraphQL。

## 已有通路

- 探针 `probe/deepseek-harness/probe.ts` 通过 OTLP 写入 Phoenix；它输出的日志 JSON 没有自动送入 `DataPipeline`。
- `processor/pipeline.py` 可以接收 JSON，执行入库处理、SQLite 写入，再由 `get_trace_for_frontend()` 返回字典。该方法尚未暴露为 HTTP/GraphQL 接口；示例中的 `/api/traces/...` 只是打印文本。
- `processor/egress.py` 当前输出 `trace_summary + spans`，节点为平铺列表，使用 `parentId` 表达层级；不再输出旧文档中的 `tree`。

## 当前输出样例

以下为合成 Agent + LLM 输入经过内存 SQLite 的实际结果摘录，非模型真实调用。费用来自仓库费率配置，用于计算检查，不代表服务商当前账单价格。子节点省略的字段与根节点结构相同。

```json
{
  "trace_summary": {
    "trace_id": "review-trace",
    "total_latency_ms": 3000.0,
    "total_tokens": 33000,
    "total_cost_usd": 0.0664
  },
  "spans": [
    {
      "id": "root",
      "spanId": "root",
      "parentId": null,
      "name": "review-agent",
      "spanKind": "AGENT",
      "startTime": "2026-11-06T10:00:00+00:00",
      "endTime": "2026-11-06T10:00:03+00:00",
      "latencyMs": 3000.0,
      "relativeStartMs": 0.0,
      "statusCode": "OK",
      "tokenCountTotal": 0,
      "costSummary": { "total": { "cost": 0.0 } },
      "input": "",
      "output": ""
    },
    {
      "spanId": "llm",
      "parentId": "root",
      "spanKind": "LLM",
      "latencyMs": 2000.0,
      "relativeStartMs": 500.0,
      "tokenCountTotal": 33000,
      "costSummary": { "total": { "cost": 0.0664 } }
    }
  ]
}
```

## 待对齐字段

| 项目 | 当前团队输出 | 前端需要确认 |
| --- | --- | --- |
| 项目与 Trace 归属 | summary 有 trace_id，Span 无 project/trace | 项目列表及 ID；每条 Trace/Span 的归属；看板不能跨项目混算 |
| 节点 ID | adapter 将 id、spanId 设为同一值 | Phoenix Relay 节点 ID 与原始 Span ID 不同；保留 UI 时需明确映射 |
| 父节点 ID | 日志 parentId 为事件路径，spanId 为 OTEL ID | 消费日志时统一父子 ID；OTLP 上下文通路另行保留 |
| 类型 | AGENT/CHAIN/LLM/TOOL 等大写 | Phoenix GraphQL 返回小写；在服务边界统一，工具统计才能匹配 |
| 时间 | Pipeline 要带时区的 ISO 字符串 | 探针毫秒数字先转换；耗时及相对偏移单位固定为毫秒 |
| 状态 | Span 有 OK/ERROR；summary 无状态 | 整链最终结果与链内异常分别定义；进行中如何表达 |
| Token/费用 | 节点自身值；未知模型成本返回 0 | 未记录/未计价用何种状态区分真实 0；保持单步/整链累计值分离 |
| 输入输出 | adapter 输出字符串 | 原详情使用结构化 input/output，需内容类型映射 |
| 属性与错误 | 库有 attributes_json、error_message，adapter 未输出 | 详情 Attributes、Events、模型参数和错误信息如何提供 |
| 时间范围与分页 | 尚无浏览器查询契约 | 项目/Trace 列表分页、详情整链；跨边界 Trace 是否完整查询 |
| 看板汇总 | 存储有部分汇总；egress 是单 Trace 摘要 | 成功率、P95、趋势桶、工具分布的时间范围和口径 |

## 接入路线建议

优先保留 Phoenix 原页面、组件和交互，在服务边界提供它们需要的数据。具体采用 Phoenix 服务适配还是独立服务承接现有 GraphQL 查询，需要成员 1/2/3 共同确定。仅将驼峰字段 JSON 作为原 GraphQL 响应，会缺少连接分页、节点 ID、查询字段与元数据。

待路线确定后，再写请求样例；此时不约定一个代码里不存在的 API 地址。至少需要：项目列表、Trace 列表（带时间范围/分页）、完整 Trace 详情、看板指标/趋势/工具分布，以及统一的错误返回。

近期可用已有 OTLP → Phoenix 通路验证探针在页面上的真实表现，但该验收不能计为经过团队 processor/storage 的闭环。

## 已复现的联调问题

- 同一个 LLM Span 重复写入，`spans` 明细仍为 33000 Token，`get_dashboard_metrics()` 却为 66000。请存储侧确认 upsert 后汇总的幂等性，前端不应用除二等补丁掩盖该差异。
- 数字毫秒时间戳输入 Pipeline 时，字符串 `.replace()` 报错，该 Span 没有入库。
- `test_integration.py` 的 `expected_cost` 没用于数值断言；现有 `cost > 0` 只打印消息。应由处理侧补计费数值/未知模型检查。

## 联调验收

1. 使用明确标记的成功、子节点异常、工具、非零费用样例验证格式与统计，模拟数据和真实 Agent 分开记录。
2. 同一 Trace 的看板、列表、详情核对耗时/Token/费用；重复写入不改变汇总。
3. 根/子 ID 正确关联，时间偏移一致；缺失值、进行中和错误有约定。
4. 一条真实 Agent 调用经过选定的团队完整通路，出现在页面中并可下钻到输入输出，才认定真实闭环完成。
