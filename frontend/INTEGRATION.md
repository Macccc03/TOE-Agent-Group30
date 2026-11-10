# 团队后端联调

前端默认读取团队 SQLite 中的调用。现有 `/api` 接口接收和查询数据，`/graphql` 为保留的 Phoenix 项目页、Trace 列表、详情和看板提供只读查询，两者读取同一份数据。

| 功能 | 当前约定 |
| --- | --- |
| 项目 | SQLite 还没有项目归属，团队服务统一显示「本地项目」。 |
| Trace / Span ID | 保留写入的原始 ID 和父子关系。Relay 节点 ID 使用类型前缀，区别于原始 ID。 |
| 时间与筛选 | 使用带时区的 ISO 时间，耗时为毫秒。看板和列表按开始时间筛选；详情查询整条调用链。 |
| Token 与费用 | 节点自身数据来自 processor。整链 Token 和费用按已保存的节点汇总，同一 Span 重试覆盖旧值。存储仅有总费用，明细中的输入/输出费用留空。 |
| 错误与详情 | 节点详情展示处理后的输入输出、错误文本和模型名。图表统计将链内错误计为失败。 |
| 兼容范围 | 只支持当前页面所需的读取接口。团队库暂未保存事件、评估、标注和会话数据。 |

## 写入合成调用

启动后端和前端后，在 PowerShell 执行以下命令。再次运行会覆盖同一条合成记录，不需要模型 API Key。

```powershell
$start = [DateTimeOffset]::UtcNow.AddSeconds(-5)
$spans = @(
  @{
    traceId = 'local-demo'
    spanId = 'local-demo-agent'
    name = '本地合成 Agent'
    kind = 'AGENT'
    startTime = $start.ToString('o')
    endTime = $start.AddMilliseconds(1400).ToString('o')
    input = '这是合成调用'
    output = '未请求外部模型'
  },
  @{
    traceId = 'local-demo'
    spanId = 'local-demo-tool'
    parentId = 'local-demo-agent'
    name = '本地合成工具'
    kind = 'TOOL'
    startTime = $start.AddMilliseconds(250).ToString('o')
    endTime = $start.AddMilliseconds(720).ToString('o')
    output = '工具合成输出'
  }
)
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:6060/api/spans `
  -ContentType 'application/json; charset=utf-8' -Body (ConvertTo-Json -InputObject $spans -Depth 6)
```

刷新[全局看板](http://127.0.0.1:5175/dashboard?timeRangeKey=7d)，点击最近调用即可打开详情，也可以从 Tracing 的「本地项目」进入。接口详情见[团队 API 文档](http://127.0.0.1:6060/docs)。回归检查用 `python -m pytest -q tests/test_frontend_integration.py`。

现有 DeepSeek 探针仍向 Phoenix OTLP 端点发送数据。用上面的 REST 接口验证的是团队处理、存储和展示这段链路，真实探针接入团队服务需另行对接。
