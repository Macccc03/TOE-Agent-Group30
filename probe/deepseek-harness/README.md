# DeepSeek Harness 探针 v0.2.0

本目录负责采集 Harness 运行数据，并以普通 JSON 发送到小组后端 `POST /api/spans`。
适配 Harness 提交：`8bd073392eef6f54e921a093b95076248eb08cbb`。
只修改探针目录，不包含前端、数据处理或数据库修改。

## 文件

| 文件 | 操作 | 职责 |
|---|---|---|
| probe.ts | 替换 | Cordis 插件入口、事件注册、OTel 配置和资源释放 |
| team-exporter.mjs | 替换 | Span 到团队 JSON 的转换、请求超时、接收数量校验 |
| capture.mjs | 新增 | 内容脱敏、截断、消息提取和 Token 语义转换 |
| probe-core.mjs | 新增 | Turn/Step/Tool/LLM 的配对、层级和状态 |
| probe.test.mjs | 新增 | 22 项自动验证；本机运行时使用实际 OTel SDK |
| README.md | 新增 | 本说明 |

保留已经跑通的 smoke-team.mjs、package.json 和 package-lock.json。
无需增加依赖；沿用 @opentelemetry/api 1.9.0 和 sdk-trace-base 2.0.0 等现有依赖。

## 本次增加的能力

- Turn：用户问题、最终回答、会话 ID、结束原因和取消原因。
- Step：正常结束状态、工具错误状态、重试后的最终模型状态。
- Tool：工具名、callId、参数、结果、错误类型与错误信息。
- LLM：独立节点、请求消息、响应内容、模型、provider 路由、调用参数和工具定义摘要。
- LLM 时间：llm/stream 钩子的进入到流消费结束。包括这一层的中间件和流处理，不等同于提供商内部推理时间。
- 重试：同一 Step 的每次模型请求拥有独立 LLM 节点。
- Token：输入、输出、总量、缓存读取、缓存写入、推理 Token；只写入对应 LLM 节点。
- 常见密钥/Bearer 凭据/手机号遮罩、密码等字段递归遮罩、内容长度和结构遍历上限。
- 取消、缺失结束事件、Session 释放和插件卸载时，结束尚未完成的 Span；估算边界有明确标记。
- 按 session.id 隔离多会话；按 callId 匹配并行工具；按事件 seq 忽略重复事件。
- 批量导出、队列上限、请求超时；严格检查 received/processed/errors。
- 提供 session/flush 与 Cordis 清理阶段的刷新/关闭，不注册进程级全局处理器。

记录工具的失败，与整轮是否最终成功分别判断。例如工具失败但 Agent 在后续步骤恢复，工具仍为 ERROR，Turn 可以为 OK。

## 数据来源

### session/event
- turn/start、turn/end：建立和结束根节点。
- user/message：事件的 data 就是消息，本身没有 turn；关联到该会话当前打开的 Turn。
- step/start、step/end：建立和结束步骤。
- tool/call、tool/result：通过 callId / message.toolCallId 配对。
- assistant/message：更新 Turn 的最终回答；中断前缀附带 interrupted 标记。

### llm/stream
使用 Harness 已有的公开 waterfall，读取 options，调用 next()，转发同一批原始 chunk 对象。
不修改模型请求，不主动重试模型请求；采集初始化失败时仍继续调用原流。
记录 block-end/text-delta、usage 和 finish，传播原有异常。
消息只取 role/content 等必要字段，不复制原生 replayState 或完整请求对象。

通过 options.sessionId 和该会话活动 Step 关联 LLM。带 purpose 的标题/压缩等辅助请求默认跳过。
不带 purpose、同时又使用同一 Session ID 的外部自定义请求可能也被归入活动 Step，这个限制通过 dsh.llm.correlation 标注。

源码依据：
- https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/packages/core/session/src/types.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/packages/llm/llm/src/index.ts
- https://github.com/deepseek-ai/deepseek-harness/blob/8bd073392eef6f54e921a093b95076248eb08cbb/packages/llm/llm/src/types.ts

## Token 必须按此语义转换

Harness 的 inputTokens 仅表示未缓存输入，其 cacheReadTokens 和 cacheWriteTokens 是独立计数：

```text
prompt_tokens = inputTokens + cacheReadTokens + cacheWriteTokens
completion_tokens = outputTokens
total_tokens = 提供商报告的 totalTokens；未报告时使用 prompt_tokens + completion_tokens
```

reasoningTokens 是输出中的细项，不再额外加到总量中。
多次 usage 快照以最后一次覆盖，不累加快照。
缺少 usage 时 raw_tokens 为 {}，metadata.usage_reported 为 false；实际报告 0 时保留 0。
Step 和 Turn 不重复保存 LLM 的消耗，以免数据库汇总时重复计费。

当前小组处理器只计算部分字段；缓存写入和推理细项会随原始 JSON 保留，需由数据处理成员进一步消费。
模型不在计价清单中，当前后端可能返回 0 费用，应解释为尚未定价。
后端会把缺少 Token 的记录写成数值 0；探针通过 usage_reported 保留“未知”的区别。

## 安装

将上表六个文件放入：
D:\TOE-Agent-Group30\TOE-Agent-Group30\probe\deepseek-harness

probe.ts、team-exporter.mjs 替换为本次完整版本，其余四个文件新建。
不同版本的旧 core/exporter 不要混用。已有本地额外改动应先另存备份再合并。

保持 cordis.yml 指向：

```text
file:///D:/TOE-Agent-Group30/TOE-Agent-Group30/probe/deepseek-harness/probe.ts
```

如果依赖尚未安装，在任意目录执行：

```powershell
npm --prefix 'D:\TOE-Agent-Group30\TOE-Agent-Group30\probe\deepseek-harness' ci
```

## 先运行自动验证

```powershell
Set-Location -LiteralPath 'D:\TOE-Agent-Group30\TOE-Agent-Group30'
node --test .\probe\deepseek-harness\probe.test.mjs
```

预期 22 个测试通过。
覆盖：输入输出与层级、缓存 Token、遮罩与截断、模型错误和异常传播、模型重试、取消收尾、并行工具、多会话、事件去重、关闭内容采集、辅助请求跳过、采集初始化失败降级、资源释放、接收确认、调用参数不可变等。

## 启动与真实验证

保持小组后端在 6007 运行。停止旧 Harness 后，在 Harness 仓库启动：

```powershell
Set-Location -LiteralPath 'C:\Users\71856\Desktop\deepseek harness\deepseek-harness'
$env:DSH_TEAM_ENDPOINT = 'http://127.0.0.1:6007/api/spans'
pnpm dsh web --patch '..\harness-trace-probe\cordis.yml'
```

启动应显示：

```text
[dsh-probe] loaded v0.2.0 (turn/step/tool/llm)
```

先询问“执行 pwd，告诉我当前目录，然后结束任务”。
随后再用一个只读且确定会失败的路径测试错误，例如请求读取一个确认不存在的文件。
另发一次稍长任务并点击停止，验证取消原因和未结束节点的收尾。
模型重试是否发生由 Harness/提供商策略决定，自动测试中已使用确定的失败/成功序列验证。

批量发送间隔 500ms；任务完成后等待约一秒再查询：

```powershell
$list = Invoke-RestMethod 'http://127.0.0.1:6007/api/traces?limit=5'
$list.data | Format-Table trace_id, root_name, status, latency_ms

$traceId = $list.data[0].trace_id
$detail = Invoke-RestMethod "http://127.0.0.1:6007/api/traces/$traceId"
$detail.spans | Format-Table name, spanKind, parentId, statusCode, tokenCountTotal
```

预期：
- 同一 Trace 有 AGENT、CHAIN、LLM、TOOL，LLM 和 Tool 都挂在对应 Step 下。
- 根节点 input/output 对应本轮提问和最终回答。
- Tool input/output 有实际参数和结果。
- LLM 有模型名、输入输出以及提供商实际返回的用量。
- 取消时有 dsh.turn.end_reason / dsh.turn.cancel_cause，估算结束节点有 dsh.end_time.estimated。

缺失结束事件时状态保留 UNSET，并标记 incomplete；不凭空宣称执行成功。

## 配置

| 环境变量 | 默认值 | 作用 |
|---|---|---|
| DSH_TEAM_ENDPOINT | http://127.0.0.1:6007/api/spans | 完整 JSON 接收地址 |
| DSH_CAPTURE_CONTENT | true | 设置 false 关闭输入输出和工具定义内容采集，错误摘要仍记录 |
| DSH_CAPTURE_MAX_CHARS | 16000 | 单个输入/输出字段的字符上限；允许 256～16000 |

默认略去图片、文件的二进制内容和 reasoning 文本。仍可记录提供商报告的 reasoning Token 数。
脱敏是常见模式遮罩，不保证识别所有形式的敏感内容。终端日志不打印输入输出。

## 导出与尚未完成的部分

使用 BatchSpanProcessor：500ms、每批最多 32 条、队列最多 1024 条。
每个 HTTP 请求超时 5 秒，记录成功/失败计数。
HTTP 200 但 processed 数量不足同样视为失败。

当前数据库对重复 Span 的 Trace 累计不具备幂等性，所以不自动重发失败批次。
没有实现可靠落盘队列、崩溃恢复、离线历史轨迹导入或跨 Agent 的自动适配。
本次的“多会话隔离”不等同于把不同子 Agent 的根 Trace 串成一棵跨 Agent 调用树。
断电、强制终止进程时无法保证清理阶段执行。
队列达到上限时 SDK 可能丢弃采样数据；这不是“零丢失”承诺。

## 本次验证记录

2026-11-10：
- 22 个自动验证用例已在 V8 环境运行，通过；该环境使用模拟 OTel SDK 和模拟网络。
- 插件注册的五个钩子及 Cordis 清理回调已作模拟检查。
- 未在当前环境实际运行 Node --test、真实 Harness 或真实 Python 后端，因为本机终端工具不可用。
- 本机 Node 测试使用真实已安装 OTel SDK；完成后还需执行上述真实 Harness 任务验证，才能认定升级版本联调通过。

## 提交范围

仅提交本目录相关文件：
```powershell
git add -- probe/deepseek-harness
git commit -m "完善 Harness 探针的模型调用、输入输出与异常采集"
git push origin main
```

执行前查看 git diff --cached --stat，确认没有把 node_modules、密钥、数据库或本地绝对路径配置加入暂存。