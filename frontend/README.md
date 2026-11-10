# Phoenix 精简前端

直接以 Phoenix 原版页面源码做减法，保留项目入口、Trace 列表、详情抽屉、调用树、时间条与节点输入输出。在此基础上增加全局指标看板。主题、公共组件和原页面的 Relay/GraphQL 数据层沿用上游实现。

当前代码入口是 `phoenix-src/index.tsx`。此前独立编写的 `src/` 原型已从当前应用移除，可从 Git 提交 `5d4ac39` 找回。新增看板代码位于 `dashboard/`，复用原主题、Disclosure、ChartPanel、时间选择器及已有 Recharts。

项目背景见[项目 README](../README.md)，职责见[团队分工](../分工.md)，上游复用范围与许可见[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 保留与裁剪

- 保留：项目卡片/表格、项目搜索、时间范围、Trace 表格及展开、排序/分页、原版详情抽屉、节点选择、树搜索/折叠、耗时及 Token/费用、Info/Attributes/Events、输入输出复制与显示模式。
- 移除：Datasets/Experiments、Evaluators、Prompts、Playground、Chat/PXI、Dashboards、原版管理设置和 API 浏览页的路由与导航；项目创建/管理操作；项目中的 Spans/Sessions/Metrics/Config 标签。
- 移除：列表上方多图看板、DSL/自然语言筛选、动态列选择、批量操作及标注列；详情中的标注/Notes、导入数据集、Playground、下载与会话跳转入口。
- 保留必要的共用样式、格式化、Relay artifacts 和部分读取元数据的查询，方便原页面运行。裁剪不表示后台 Phoenix 服务也已精简。

逐文件来源与本次改动见 [PHOENIX_CHANGES.md](PHOENIX_CHANGES.md) 和 [源码清单](PHOENIX_SOURCE_MANIFEST.json)。

## 环境与启动

前端验证使用 Node.js 24.22.1 和 pnpm 10.30.3。默认连接团队的 Python/SQLite 服务，可以直接本机运行。

在仓库根目录按[项目 README](../README.md#快速开始与依赖安装)安装 Python 依赖后，启动后端：

```powershell
python -m server.main serve --host 127.0.0.1 --port 6060
```

另开终端进入 `frontend`：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

打开[全局看板](http://127.0.0.1:5175/dashboard)。空数据库会显示 0 条调用，可以按[联调说明](INTEGRATION.md)写入一条合成 Trace。开发服务器只绑定本机，端口占用时退出。停止前台服务用 Ctrl+C。

若团队服务使用其他端口，启动前设置 `$env:TOE_BACKEND_URL = 'http://127.0.0.1:6060'`。要对比原版或查看此前 Docker 的数据，可设置 `$env:PHOENIX_BACKEND_URL = 'http://127.0.0.1:6006'` 后重启前端，切回团队服务时清除该变量。两个后端各用自己的数据库。

## 体验步骤

### 设置与主题

从侧栏底部打开 [设置](http://127.0.0.1:5175/settings)，在「外观」选择浅色或深色。主题立即应用到全局，选择保存在当前浏览器；没有已保存的偏好时使用深色。全局看板的指标、图表和状态文字随主题调整配色。

### 全局指标看板

打开 [全局看板](http://127.0.0.1:5175/dashboard?timeRangeKey=7d)，也可通过侧栏进入；根路径默认跳转到看板。

- 六项指标：调用量、成功率、平均耗时、P95 耗时、Token、费用。项目筛选、时间范围和刷新作用于整页。
- 四张图按两组互斥展开：默认显示“调用表现”（调用量/错误、耗时），点击“资源使用”切换到 Token/费用和工具分布；再次点击当前组全部收起。最多挂载两张图，收起时卸载图表。
- 分组、项目与时间选择保存在地址中，刷新可恢复。最近调用最多显示 10 条，点击名称进入原 Trace 详情抽屉，浏览器返回可恢复看板状态。
- 从看板进入详情时，地址中的 `dashboardSearch` 保存原看板筛选；切换节点或刷新后关闭抽屉，仍回到原项目、时间和图表分组。直接打开不带该参数的详情链接，关闭后回项目 Trace 列表。
- 按项目和 Trace ID 去重，节点自身 Token/费用只累加一次。P95 使用最近秩法，费用单位为美元。工具分布统计 `tool` 节点。

看板读取所选时间段内的分页 Span，并在浏览器聚合。筛选按 Span 开始时间执行，跨时间边界的调用可能只有部分节点参与统计。详情抽屉仍读取整条 Trace。聚合逻辑检查用 `pnpm test:dashboard`。

### 调用追踪

1. 侧栏进入 Tracing，选择「本地项目」，从列表点开一条 Trace。
2. 选择不同节点，核对输入输出、错误、耗时和 Token。调用树节点支持 Tab 聚焦、Enter/空格选择，折叠按钮独立操作。
3. 搜索调用树、展开/收起，刷新详情地址检查选中节点是否恢复。
4. 拉宽抽屉或树与节点详情之间的分隔线，查看原版时间条。树宽小于 500px 时，上游组件会隐藏时间条。

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
dashboard/                    # 新增看板、读取和聚合逻辑及聚合测试
settings/                     # 外观设置页，使用原 Phoenix 主题
phoenix-src/
  App.tsx / GlobalStyles.tsx   # 原应用、主题与设计基础
  Routes.tsx                  # 全局看板、设置及 Projects → Traces → Trace
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

团队服务通过 `POST /api/spans` 接收数据，经过 processor 写入 SQLite。前端经 Vite 代理访问同一服务的只读 `/graphql`，由适配层把团队记录转换成保留的 Phoenix Relay 查询所需的数据。接口范围和验证见[联调说明](INTEGRATION.md)。
