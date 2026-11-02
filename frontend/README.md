# 前端基础体验版

基于 Phoenix 局部组件精简实现的 React/TypeScript 前端。当前使用明确标注的本地模拟数据，不调用模型、团队后端或 Phoenix GraphQL。

项目背景见[项目 README](../README.md)，职责见[团队分工](../分工.md)，上游复用范围与许可见[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 已实现

- 调用列表：名称、状态、开始时间、耗时、Token 与费用。
- 调用详情：整链摘要、可折叠调用树、相对时间条、节点选择。
- 节点信息：单步指标、输入输出、复制、错误提示与可折叠属性。
- Hash 地址记录 Trace 和节点选择，刷新可恢复详情；列表支持空数据、请求失败的模拟场景。
- 三条模拟调用：天气建议（四个节点、三层结构）、订单查询错误、零耗时缓存命中。

本版尚未接入真实采集、数据库查询或团队服务；没有评估、标注、Playground、Chat 和完整看板功能。

## 环境与启动

要求 Node.js >=24，pnpm 10.30.3；本次验证使用 Node 24.22.1。无需 Python、Docker 或模型 API Key。

在本目录打开终端：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

打开 http://127.0.0.1:5174 。开发服务器只绑定本机，端口被占用时会退出，不会自动切换。停止前台启动的服务使用 Ctrl+C。

如果已有本地体验服务正在运行，直接打开地址即可，不必重复启动。

## 体验步骤

1. 点击“杭州天气与穿衣建议”，选择 WeatherTool 或“生成穿衣建议”，观察右侧内容与时间条。
2. 展开/收起调用树，刷新详情页，检查节点选择是否保留。
3. 返回列表，打开“订单物流查询”，查看错误节点和错误信息。
4. 打开“零耗时缓存查询”，确认 0ms、0 Token、$0 与“未记录”的区别；展开属性查看非 JSON 文本。
5. 列表右上“演示场景”可切换空列表、请求失败，再恢复正常列表。

## 构建与检查

```powershell
pnpm build
pnpm test
```

build 执行 TypeScript 检查和 Vite 生产构建；test 使用 Node 内置测试器验证时间条边界、字段适配及空值/原文保留。构建结果在 dist/，不提交。

本次构建及 3 组自动测试已通过；真实后端联调尚未进行。

## 代码结构

```text
src/
  App.tsx                    # 列表/详情与最小 Hash 路由
  components/TraceTree.tsx    # 精简自 Phoenix，移除 Relay 等依赖
  components/TimelineBar.tsx  # Phoenix 时间条改造
  components/timeline.ts      # 带边界处理的时间位置计算
  components/SpanDetails.tsx  # 节点信息展示
  data/mock.ts               # 合成数据，不是真实 Agent 输出
  data/repository.ts         # 当前 mock；后续真实数据唯一入口
  data/adapter.ts            # 对齐 processor 字段，区分单步和整链指标
  types.ts                   # 原始/展示类型
  styles.css                 # 基础页面样式
vendor/arize-phoenix/         # 上游许可和通知
```

## 数据接入边界

后续替换 traceRepository 的 list/get 实现即可保留页面交互；API 地址和错误格式尚未与团队冻结，当前没有实际 HTTP 数据请求。RawTrace/RawSpan 参考 processor 的现有命名；需进一步确认时区、节点类型、单步/累计指标、整链错误状态和多根节点口径。

本目录只包含必要的 Phoenix 局部改造，没有复制完整页面目录、依赖清单或服务器协议。后续视觉与看板优化待基础体验反馈后进行。
