# 上游代码来源

本前端以 Arize Phoenix 原版源码为基础裁剪，仅保留基础 Tracing 流程及必要公共依赖。

- 上游：https://github.com/Arize-ai/phoenix
- 固定提交：`c6602582f13a082ba696c60c9d182e5729462e59`
- Copyright 2025 Arize AI, Inc. All Rights Reserved.
- 上游许可和通知保存在 [LICENSE](vendor/arize-phoenix/LICENSE) 与 [IP_NOTICE](vendor/arize-phoenix/IP_NOTICE)。

| 本地文件 | 上游来源 | 修改说明 |
| --- | --- | --- |
| phoenix-src/** | 同路径的 js/app/src/** | 保留原 App、主题、公共组件、Relay 数据层、项目/Trace 列表与详情；删除无关入口及业务代码，调整导入与构建接入 |
| public/ 的图标、modernizr.js 等 | js/app/static/** | 原静态资源；phoenix-runtime-config.js 是本项目新增的配置占位 |
| .oxfmtrc.jsonc | 上游根目录 .oxfmtrc.jsonc | 调整本地工具 schema 路径 |
| [后端只读 schema](../server/routers/phoenix_schema.graphql) | js/app/schema.graphql | 保留精简前端现有查询所需的类型和字段 |

逐文件上游路径、固定提交与文本哈希见 [PHOENIX_SOURCE_MANIFEST.json](PHOENIX_SOURCE_MANIFEST.json)。具体裁剪见 [PHOENIX_CHANGES.md](PHOENIX_CHANGES.md)。文件被标记 modified 可能包含导入整理、格式化及 Relay 模块链接，不等于重写界面实现。

原型提交 `5d4ac39` 曾只局部抽取树和时间条、独立重写外观；该实现已退出当前应用，上表替代旧版来源说明。新增的 Vite 配置中间件、HTML 入口和来源清单脚本属于本项目接入改动。
