# 本地一体化 AI Agent 可观测性平台

> 📌 **项目进度与团队看板**：[飞书实时进度总结与协作文档](https://icn4cv300u2h.feishu.cn/wiki/Pv2uwNDPwiTRA1kDY5UczPjongd?from=from_copylink)

---

本项目复刻 Arize Phoenix 核心架构，移除复杂的跨网络传输层（gRPC / HTTP OTLP），基于进程内内存管道打造极速、零外部依赖的单机一体化 AI Agent 可观测性与追踪分析系统。

## 架构流水线

```text
本地 Agent 运行 ──► 内存直连探针 (probe) ──► 数据处理中枢 (processor) ──► 本地嵌入式库 (storage) ──► 可视化大屏 (frontend)
```

## 团队分工与核心模块

| 模块目录 | 核心职责 | 负责成员 |
| :--- | :--- | :--- |
| `probe/` | 多框架拦截（OpenAI/LangChain/LlamaIndex）、上下文栈与 ID 传播、语义清洗 | 成员 1（探针） |
| `processor/` | Token 阶梯解析、多模型代价格算、敏感数据脱敏、O(N) 拓扑排序建树 | 成员 2（数据处理） |
| `storage/` | SQLite-WAL / DuckDB 极致本地存储、内存缓冲批量提交、毫秒级索引点查 | 成员 3（数据库） |git
| `frontend/` | 时间轴甘特瀑布流、嵌套调用树状图、全局指标看板、下钻抽屉 | 成员 4（前端） |
| `docs/` | 数据契约规范、架构决策 (ADR)、进度燃尽追踪、会议纪要与交付物 | 成员 5（文档与项目管理） |

## 辅助工程目录

- `examples/`：典型 Agent 运行场景（RAG、ReAct 单 Agent、多 Agent 协同）
- `tests/`：各模块单元测试与全链路闭环测试

## 快速开始与依赖安装

### 1. 后端依赖安装
推荐使用 Python 3.12 虚拟环境：
```powershell
# 创建并激活虚拟环境
python -m venv .venv
.venv\Scripts\activate

# 一键安装所需清单依赖
$env:PYTHONUTF8 = '1'
pip install -r requirements.txt
```

### 2. 运行与验证
```powershell
# 运行 processor 数据流测试
python -m processor.test_processor
python -m processor.pipeline

# 启动本地一体化可观测服务
python -m server.main serve --host 127.0.0.1 --port 6060
```

### 3. 前端启动（可选）
```powershell
cd frontend
pnpm install
pnpm dev
# 访问 http://127.0.0.1:5175
```

前端默认连接 `6060` 上的团队服务。启动、切换数据源和写入合成样例见[前端说明](frontend/README.md)和[联调说明](frontend/INTEGRATION.md)。

---
> 详细设计协议与数据契约请参阅：[分工.md](./分工.md)

