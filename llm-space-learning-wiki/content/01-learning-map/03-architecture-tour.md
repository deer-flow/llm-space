# 架构分层与首条调用链

这一节用三个边界接口串起全项目：`AgentTransport`、`RuntimeClient` 与 `HostServices`。

## 1. 分层不是目录美化

```text
React UI
  ↓ HostServices / ModelClient
Desktop Renderer adapters
  ↓ Electrobun typed RPC
Desktop Bun composition root
  ↓ RuntimeRouter
LocalRuntimeClient / RemoteRuntimeClient
  ↓ Managers + Registries
core streamAgent / persistence
  ↓ pi-agent-core / filesystem / network
```

每一层只依赖下一层公开的契约。这样同一套 Thread Playground 才能在桌面端可编辑运行、在 Web 端只读展示。

## 2. AgentTransport：隐藏传输方式

`packages/core/src/client/transport.ts` 定义一个接收 `AgentStreamRequest`、返回 `AsyncGenerator<AgentEvent>` 的函数接口。

- 默认 HTTP Transport 使用 POST + SSE。
- 桌面 `createRpcTransport()` 用 Electrobun fire-and-forget message 模拟流。

`streamThread()` 不知道事件从 HTTP 还是 RPC 来，因此领域运行逻辑可以复用。

## 3. RuntimeClient：隐藏执行位置

`packages/runtime/src/runtime/types.ts` 统一定义模型、文件系统、MCP、工具、Skills、网络、搜索、Trace 和流式运行能力。

- `LocalRuntimeClient` 把方法委派给进程内 Manager。
- `RemoteRuntimeClient` 把同一方法编码成 `/rpc` 或 `/stream` 请求。
- `RuntimeRouter` 根据 `runtimeId` 选择实例。

新增远程能力不能只改服务端：还要同步改 capability、Client 方法、共享 RPC method、server dispatcher，并升级协议版本。

## 4. HostServices：隐藏宿主平台

共享 UI 不能直接导入 Electrobun。`HostServices` 注入：

- Transport 和工具执行。
- Skills、MCP、内置工具、插件工具查询。
- 文件、路径和 Generator 能力。
- 打开设置、链接、分享等宿主动作。

桌面实现调用 RPC 与 Command Bus；Web 实现设置 `presentational: true`，返回空集合或禁用副作用。

## 5. 从 Run 到 UI 更新

关键源码顺序：

1. `packages/ui/.../stores/thread-store.ts` 的 `run()`。
2. `packages/core/src/thread/prompt-variables.ts` 渲染上下文。
3. `packages/core/src/client/api.ts` 的 `streamThread()`。
4. `apps/desktop/src/client/rpc-transport.ts` 的 `createRpcTransport()`。
5. `apps/desktop/src/bun/rpc/` 的 stream 转发。
6. `packages/runtime/src/streaming/stream-thread.ts`。
7. `packages/core/src/server/agent/stream.ts`。
8. `packages/core/src/client/reducer.ts`。

### AsyncGenerator 是什么

普通 Promise 只返回一次最终值；AsyncGenerator 可以在任务未结束时持续 `yield` 事件。消费端使用：

```ts
for await (const event of stream) {
  // 增量更新界面
}
```

它非常适合 token streaming。取消由 `AbortSignal` 贯穿所有层；消费者提前退出时 Transport 也会主动通知上游停止。

## 6. 组合根

`apps/desktop/src/bun/app/start-desktop-app.ts` 是最重要的阅读入口。它按顺序创建 Network、MCP、Model、Skills、Plugin、Storage、Trace、Streaming、Tool Registry、Local Runtime、Router、Remote Manager、RPC 与 Window。

组合根回答三个问题：

- 实际实例是谁？
- 生命周期由谁拥有？
- 关闭时按什么顺序释放？

不要只看 class 定义后猜运行方式。

## 7. 错误隔离

- 流式运行错误被转换为同一 `streamId` 的 error message。
- 损坏 JSON 会尝试恢复或保留备份。
- MCP/插件单体故障不能阻止应用启动。
- Remote 连接失败不会在新连接尚未成功时破坏当前可用连接。
- Provider 错误保留服务端语义，不静默删除用户配置。

## 8. 练习：手工画序列图

以一次“模型调用 `web_search`，应用自动执行，再继续生成答案”为例，画出：

```text
User → Store → Transport → Runtime → Model
Model → ToolCall → Store → executeTool → Builtin Registry
Tool Result → Store → Transport → Model → Final Answer
```

在每条箭头旁写出实际函数名、数据类型和取消点。这张图将成为后续阅读的索引。
