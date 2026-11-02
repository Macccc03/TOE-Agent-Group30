# 上游代码来源

本基础前端局部复用 Arize Phoenix，不包含其完整产品功能。

- 上游：https://github.com/Arize-ai/phoenix
- 固定提交：`c6602582f13a082ba696c60c9d182e5729462e59`
- Copyright 2025 Arize AI, Inc. All Rights Reserved.
- 上游许可和通知保存在 [LICENSE](vendor/arize-phoenix/LICENSE) 与 [IP_NOTICE](vendor/arize-phoenix/IP_NOTICE)。

| 本地文件 | 上游来源 | 修改说明 |
| --- | --- | --- |
| src/components/TimelineBar.tsx、timeline.ts | js/app/src/components/timeline/TimelineBar.tsx | 改用毫秒偏移，独立类型/样式，增加零耗时和边界处理 |
| src/components/TraceTree.tsx | js/app/src/components/trace/TraceTree.tsx | 保留递归节点、选择、局部折叠和时间条模式；改用嵌套团队模型及原生按钮，移除 Relay、标注、悬浮查询、全局偏好与主题依赖 |

其余列表、详情容器、样式、适配层和模拟数据为本项目本次新增；未复制整套 Phoenix 页面或依赖配置。
