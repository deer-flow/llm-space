# 第一章：建立 LLM Space 的全局地图

本章不是从某个组件开始抄代码，而是先建立一张能解释整个仓库的地图。LLM Space 4 是一个面向 Agent 开发者的桌面工作台：用户把模型、提示词、变量、工具和消息保存为 Thread，再运行、观察、修改、回放与评测。理解这个目标后，仓库里的每一层都会有明确位置。

## 学习目标

- 能用一句话解释 `packages/core`、`packages/runtime`、`packages/ui` 与三个 `apps/*` 的边界。
- 能在本地安装依赖、运行桌面端、运行 Web 端并执行质量检查。
- 能说清一次 Thread 运行从 React 点击事件到模型流式事件返回的完整路径。
- 掌握后续课程的阅读方法：先找边界类型，再找组合根，最后沿调用链进入实现。

## 仓库全景

| 区域 | 角色 | 典型依赖方向 |
| --- | --- | --- |
| `packages/core` | 跨环境领域模型、Thread 语义、流式 reducer、Agent 服务端核心 | 不依赖 React 或 Electrobun |
| `packages/runtime` | 模型、MCP、Skills、插件、工具、Trace 与 Runtime 统一接口 | 依赖 `core` |
| `packages/ui` | React 设计系统与 Thread Playground | 依赖 `core`，通过 HostServices 注入宿主能力 |
| `apps/desktop` | Electrobun 桌面壳、Bun 主进程、Renderer 与远程运行时管理 | 组合 `core`、`runtime`、`ui` |
| `apps/server` | 可部署到 Linux 的无界面 Runtime HTTP 服务 | 组合 `core` 与 `runtime` |
| `apps/web` | 官网与只读共享 Thread 查看器 | 组合 `core` 与 `ui` |

这是一种“内层稳定、外层适配”的架构。领域类型和纯逻辑在内层；文件系统、网络、窗口、SSH 等有副作用的能力留在外层。`HostServices`、`RuntimeClient`、`AgentTransport` 是最重要的三个边界接口。

## 一次运行的主链路

1. 用户在 `ThreadPlayground` 点击 Run。
2. 每个标签页独享的 Zustand Thread Store 执行 `run()`。
3. Store 渲染模板变量，整理消息与工具，调用 `streamThread()`。
4. `streamThread()` 把 LLM Space Thread 转成 pi-agent 的上下文，并调用注入的 `AgentTransport`。
5. 桌面端的 Transport 通过 Electrobun RPC 发送带 `streamId` 的消息。
6. Bun 主进程把请求路由到本地或远程 `RuntimeClient`。
7. `StreamThreadController` 调用 `streamAgent()`，后者驱动 `agentLoopContinue()`。
8. 模型事件跨边界返回；`reduceMessages()` 把增量事件折叠成可持久化 Assistant Message。
9. Store 更新 React UI；运行结束后记录 Run History，并由标签页持久化 Thread JSON。

## 学习方法

本课程每个专题都按同一顺序展开：

1. **先看契约**：类型、接口和 discriminated union 决定系统允许发生什么。
2. **再看组合根**：对象在哪里创建、依赖如何注入，决定运行时真正使用哪套实现。
3. **跟踪快乐路径**：从用户动作走到最终副作用。
4. **检查失败路径**：Abort、网络错误、损坏文件和不兼容协议怎样被隔离。
5. **用测试反证理解**：测试通常比注释更准确地表达边界条件。

## 本章子课程

- [开发环境与 Monorepo](01-learning-map/01-environment-and-monorepo.md)
- [产品概念与领域词汇](01-learning-map/02-product-concepts.md)
- [架构分层与首条调用链](01-learning-map/03-architecture-tour.md)

完成本章后再进入 `packages/core`。如果现在还不能不看图说出上述九步主链路，不要急着阅读大型 React 组件。
