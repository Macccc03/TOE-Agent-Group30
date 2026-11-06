# Phoenix 基础前端裁剪说明

基准：[Arize Phoenix c660258](https://github.com/Arize-ai/phoenix/tree/c6602582f13a082ba696c60c9d182e5729462e59/js/app/src)，版本 21.0.0。当前应用从本目录 `phoenix-src` 编译，实际使用原页面和组件。

## 保留的原实现

| 本地相对路径 | 内容 |
| --- | --- |
| phoenix-src/App.tsx、GlobalStyles.tsx、contexts/ThemeContext.tsx | 应用基础、主题与设计变量 |
| phoenix-src/pages/Layout.tsx、components/nav/** | 原侧栏、顶部导航、面包屑和抽屉宿主的布局与样式 |
| phoenix-src/pages/projects/ProjectsPage.tsx | 原项目入口、搜索与视图切换 |
| phoenix-src/pages/project/TracesTable.tsx | 原 Trace 表格、展开、排序、加载更多、输入输出预览与指标 |
| phoenix-src/pages/trace/TracePage.tsx、TraceDetails.tsx、SpanDetails.tsx | 原详情抽屉、树/详情分栏、节点标题和 Info/Attributes/Events |
| phoenix-src/components/trace/TraceTree.tsx、traceTreeStyles.ts、components/timeline/TimelineBar.tsx | 原递归调用树、时间条、颜色、相对时间计算和响应式行为 |
| phoenix-src/pages/trace/span/** | 原不同类型 Span 的输入输出渲染 |
| phoenix-src/RelayEnvironment.ts、各 __generated__/** | 原 GraphQL 查询、分页、缓存与固定版本编译结果 |

## 实际做的减法

- `Routes.tsx` 仅保留 Projects → Traces → Trace 详情；其他产品路由不进入此应用。未引入整套后端或上游开发工作区。
- `Layout.tsx` 保留原布局，导航只留 Tracing；去掉助手面板、全局搜索、账号/设置及其他产品入口。
- `ProjectPage.tsx` 删除 Spans、Sessions、Metrics、Config 标签及其查询加载状态；保留时间范围和 Traces。
- `TracesTable.tsx` 删除标注列实现、动态列选择、批量操作、DSL/AI 筛选和图表选择。多图面板改成包住原表格的简单 flex 容器。原表格的列宽/排序/展开等共享实现保留。
- `SpanDetails.tsx` 删除数据集、Playground、下载、标注侧栏与 Notes；`SpanInfo.tsx` 删除标注和笔记卡片；树和悬浮卡不显示标注徽章；检索文档不提供标注编辑。
- `TimeRangeContext.tsx` 等共享上下文删除助手客户端操作注册；偏好状态删除 AI 查询、助手与 Playground 模型配置，避免为了几个展示组件带入模型调用功能。
- 此前重写的 `src/`、mock 和旧测试已移出当前版本，历史提交仍可恢复。

## 为可运行性作的接入改动

- 直接导入实际使用的公共组件，避免大型 barrel exports 拉入其他产品。清理裁剪后无用的导入，沿用上游格式规范。
- 原 GraphQL 标签链接到同一提交已有的 Relay artifacts，artifacts 内对其他 artifacts 的 require 改为静态模块导入。本地安装/构建不要求整套 Phoenix monorepo；查询字段仍按固定上游版本维护。
- Vite 代理 GraphQL 到本机 6006；从该服务公开 HTML 中读取原 `window.Config`，由开发与预览中间件提供。没有代理整个原站来冒充源码运行。
- 页面路由待原抽屉 portal 宿主建立后挂载，处理直接打开详情链接时宿主尚未就绪的情况；抽屉组件本身仍沿用原版。
- 许可文件保留在 vendor/arize-phoenix；逐文件基准与当前哈希见源码清单，修改源码后可更新清单继续审查。

## 当前边界

首阶段用已有 Phoenix 后端及数据库中的合成示例对照页面。没有接入团队 processor/storage，也没有调用模型。2026-11-04 在原版减法基础上新增全局看板，范围见下节。后台 Phoenix 容器仍是原版完整服务；裁剪的是前端。

原版共用的读取字段、类型定义、格式化与部分指标图表基础组件仍有保留。尤其 Markdown/代码高亮带来较多构建分块，主包仍有体积提示；需要在后续保留功能明确后继续精简，不能把本轮描述成已完成极限依赖裁剪。

本地源码与 Docker 镜像虽然同为 21.0.0，其构建提交可能不同。对照用于检查保留区域的数据与行为，不声称所有细节逐像素一致。进一步优化以用户体验反馈和团队明确需求为依据。

## 2026-11-04 新增全局指标看板

- 新增自有代码 `dashboard/`，不混入上游来源清单；原 540 个文件仍按固定基准维护。对原 Routes/Layout 只增加 `/dashboard` 路由、默认跳转和侧栏入口，原 Trace 页面未重写。
- 复用原主题、DisclosureGroup/Disclosure、ChartPanel/ChartResponsiveContainer、图表默认样式、Button、时间选择器和上下文，使用已有 Recharts，无新增依赖。
- 四图采用两个互斥折叠分组，默认展开调用表现，资源使用收起；可全部收起。URL 保存状态，收起图表不挂载，不提供一键全部展开。
- 看板用小型独立 GraphQL 读取层通过同一代理取数，分页读取后本地聚合；没有修改原 Relay artifacts。当前按 Span 时间范围统计，跨边界 Trace 的部分节点口径与大量数据聚合留待服务端接口对齐。
- 不改原 Docker 数据、不制造模型调用、不将参考图数字写死；没有本轮 commit/push。

## 2026-11-06 详情返回与调用树键盘操作

- `dashboard/DashboardPage.tsx` 的详情链接记录原看板查询参数；`phoenix-src/pages/trace/TracePage.tsx` 关闭抽屉时恢复看板。直接详情链接继续使用原项目列表返回逻辑；地址参数使刷新与节点选择后来源仍保留。
- `phoenix-src/components/trace/TraceTree.tsx` 在原节点上增加 Enter/空格选择和 `aria-pressed`，折叠按钮补充名称/展开状态。子按钮的键盘事件不触发父节点选择，保留原树、时间条、外观及鼠标行为。
- 两个上游文件的当前哈希已更新到来源清单；没有修改 Relay artifacts 或新增依赖。团队字段对齐提案见 `INTEGRATION.md`，未改队友模块。
