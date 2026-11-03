# Phoenix 精简前端

直接以 Phoenix 原版页面源码做减法，保留项目入口、Trace 列表、详情抽屉、调用树、时间条与节点输入输出。主题、公共组件和 Relay/GraphQL 数据层沿用上游实现。

当前代码入口是 `phoenix-src/index.tsx`。此前独立编写的 `src/` 原型已从当前应用移除，可从 Git 提交 `5d4ac39` 找回。此次调整先恢复原版基础体验，尚未加入团队自有功能。

项目背景见[项目 README](../README.md)，职责见[团队分工](../分工.md)，上游复用范围与许可见[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 保留与裁剪

- 保留：项目卡片/表格、项目搜索、时间范围、Trace 表格及展开、排序/分页、原版详情抽屉、节点选择、树搜索/折叠、耗时及 Token/费用、Info/Attributes/Events、输入输出复制与显示模式。
- 移除：Datasets/Experiments、Evaluators、Prompts、Playground、Chat/PXI、Dashboards、设置和 API 浏览页的路由与导航；项目创建/管理操作；项目中的 Spans/Sessions/Metrics/Config 标签。
- 移除：列表上方多图看板、DSL/自然语言筛选、动态列选择、批量操作及标注列；详情中的标注/Notes、导入数据集、Playground、下载与会话跳转入口。
- 保留必要的共用样式、格式化、Relay artifacts 和部分读取元数据的查询，方便原页面运行。裁剪不表示后台 Phoenix 服务也已精简。

逐文件来源与本次改动见 [PHOENIX_CHANGES.md](PHOENIX_CHANGES.md) 和 [源码清单](PHOENIX_SOURCE_MANIFEST.json)。

## 环境与启动

本次验证使用 Node.js 24.22.1、pnpm 10.30.3。依赖由 `pnpm-lock.yaml` 固定。需要本机 Phoenix 21.0.0 服务，默认地址 `http://127.0.0.1:6006`；前端继续使用它的原生 GraphQL 接口。

本工作区此前部署的 Docker 服务可在仓库根目录启动：

```powershell
docker compose -f ..\phoenix-local\compose.yaml up -d
```

Docker Desktop 需处于运行状态。首次在另一台电脑部署时，先按照 Phoenix 官方方式准备匹配的 21.0.0 后端；相邻的 `phoenix-local` 不是本仓库内容。

在本目录打开终端：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

打开 [源码精简版](http://127.0.0.1:5175/projects)，原版在 [Phoenix 原版](http://127.0.0.1:6006/projects)。二者读取同一个本地服务的数据。当前入口端口为 **5175**，此前原型的 5174 不再是当前应用入口。

开发服务器只绑定本机；端口占用会退出。前台运行时用 Ctrl+C 停止。若需修改后端地址，在启动前设置 `$env:PHOENIX_BACKEND_URL = 'http://127.0.0.1:6006'`。此版本面向本地未开启认证的体验环境；登录和账户页面已裁掉。

如果已有本地体验服务正在运行，直接打开地址即可，不必重复启动。

## 体验步骤

1. 打开 `local-agent-demo`，点击 `demo-agent` 进入 Trace 详情。
2. 选择 `knowledge-search` 或 `answer-generation`，查看不同节点的输入输出、属性和耗时。
3. 搜索调用树、展开/收起、切换指标显示，刷新详情地址检查选中节点是否恢复。
4. 拖动详情抽屉边缘和树/节点详情之间的分隔线。上游树宽小于 500px 时隐藏时间条，小于 300px 时进一步隐藏指标与折叠控件；要看时间条，请把树区域拉宽。
5. 返回 Projects，打开无数据的 `default` 项目检查空列表。

`local-agent-demo` 是之前写入 Phoenix 数据库的三条合成示例，模型名含 `synthetic-demo-no-api-call`；不是团队真实 Agent 的采集结果，也不会调用模型。若看不到旧数据，调整时间范围。另一台电脑的空数据库需要自行写入测试 Trace。

## 构建与检查

```powershell
pnpm build
pnpm typecheck
pnpm verify:source
pnpm preview
```

`build` 执行完整 TypeScript 检查和 Vite 生产构建，结果位于 `dist/`。`preview` 使用与开发服务相同的运行配置中间件和 GraphQL 代理，需先停止占用 5175 的开发服务。不要直接双击 `dist/index.html` 或用缺少代理的普通静态服务代替。

`verify:source` 检查清单中的文件与本地哈希是否一致；正常开发不需要相邻 Phoenix 源码。修改 `phoenix-src` 后用 `pnpm manifest:update` 更新清单；此维护命令需要相邻 Phoenix 源码仍处于清单固定提交。旧原型的三个测试已随旧代码移除，不能当作当前版本的测试结果。生产构建仍有大包体提示，后续按保留功能继续优化。

2026-11-04 验证记录：Node 24.22.1 / pnpm 10.30.3 下，冻结锁文件安装、完整类型检查及生产构建、格式检查、540 个上游文件的来源清单校验通过。浏览器已核对同数据的列表与详情、节点切换、刷新恢复、树展开/收起、拉宽后显示时间条及空项目。错误、非零费用等场景尚未全面覆盖；后端离线启动提示已通过构建，未单独做浏览器验收。

## 代码结构

```text
phoenix-src/
  App.tsx / GlobalStyles.tsx   # 原应用、主题与设计基础
  Routes.tsx                  # 仅保留 Projects → Traces → Trace
  pages/projects/             # 原版项目入口
  pages/project/              # 裁剪后的原版列表及时间范围
  pages/trace/                # 原版详情、节点输入输出和属性
  components/trace/            # 原调用树、指标、悬浮信息
  components/timeline/         # 原时间条
  RelayEnvironment.ts         # 原 GraphQL 数据层
  **/__generated__/           # 固定版本的 Relay 编译结果
public/                       # 原静态资源及运行配置占位
scripts/                      # 来源清单维护与校验
vendor/arize-phoenix/          # 上游许可和通知
```

## 数据接入边界

当前通路：本地 Phoenix 数据库 → Phoenix GraphQL → Vite 本地代理 → 原 Relay 查询 → 原页面。前端直接从本地保留源码编译，不是嵌入原站的 iframe。

团队 processor/storage 还没有接入此页面。后续需要与成员 2 确认：保留 Phoenix GraphQL、建设适配层还是提供团队 API；不能假定之前原型的 repository 替换方案继续适用。查询使用固定上游生成结果；修改 GraphQL 字段时需从同一 Phoenix 版本的 schema 重新生成并同步 artifacts，不能只修改生成文件中的查询文本。
