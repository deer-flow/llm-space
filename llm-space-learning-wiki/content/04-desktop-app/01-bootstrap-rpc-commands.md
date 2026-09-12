# 启动、RPC 与 Command Bus

## 1. 启动链

`src/bun/index.ts` 先注入登录 shell 环境、监听可能早到的 Deep Link、seed workspace/skills，再调用 `startDesktopApp()`。

组合根创建 Network、MCP、Models、Skills、Plugins、GitHub Auth、Storage、Trace、Streaming、Tool Host、Local Runtime、Router、Remote Manager、Updater、RPC 与 Window。

窗口开发时加载 Vite，生产时加载 `views://mainview/index.html`。Renderer 由 `mainview/main.tsx` 挂载 React Provider 树。

## 2. Typed RPC

`shared/rpc.ts` 的 `DesktopRPCType` 是两侧契约。类型分为：

- **request/response**：模型、文件、设置、MCP、插件等一次性操作。
- **message**：Agent 流、Command、更新状态、远程连接状态等事件。

Bun 实现在 `bun/rpc/index.ts`，Renderer 入口在 `lib/electrobun.ts` 与 `client/*`。

## 3. 用 message 模拟流

Electrobun RPC 没有原生 AsyncGenerator。`createRpcTransport()`：

1. 生成 UUID `streamId`。
2. 注册只接收该 ID 的 listener。
3. 发送 start message。
4. 把 event message 放入队列。
5. 用 wake Promise 让 `for await` 消费。
6. done 结束、error 抛出。
7. Abort 或消费者提前 break 时通知 Bun 取消。

队列消费后清空槽位，并在阈值后 compact，避免长对话一直保留已消费事件引用。

## 4. RPC 与 Command 的区别

RPC 描述底层能力，如 `fsWrite`；Command 描述用户意图，如 `deleteFile`、`openSettings`、`runThread`。

`shared/commands.ts` 使用 discriminated union 定义 type + args，`COMMAND_META` 标记目标是 webview 还是 bun。

```text
菜单/快捷键/按钮
→ executeCommand(command)
→ 当前进程检查 target
→ 本地执行或转发另一侧
```

这样原生菜单与 React 按钮共享相同行为，不会形成两套业务逻辑。

## 5. Command Provider

Renderer `CommandProvider` 维护 handler 注册。具体页面挂载时注册处理器，卸载时 disposer 清理。Bun 侧处理窗口缩放、外链、更新等系统能力，并把 UI Command 转发 Renderer。

## 6. Deep Link

冷启动 Deep Link 可能早于 Window/RPC，因此入口先缓存；对象图完成后才安装真实 Handler 并 flush。共享 Thread 链接读取 Gist/Storage、写入本地 workspace，再发送 Command 定位文件。

## 7. 退出握手

Electrobun quit 需要两阶段协调：第一次 before-quit 阻止直接退出，等待异步清理；完成后再次允许 app quit。否则 MCP、插件子进程、远程 Server 和 analytics 可能来不及关闭。

## 8. 实践

1. 新增一个只在 Renderer 处理的 Command，串起类型、metadata、handler 和菜单。
2. 在 RPC 流中模拟消费者提前 break，验证 Bun Abort。
3. 解释为何 `DesktopRPCType` 必须放 shared，而实现不能放 shared。
4. 跟踪一个冷启动分享 Deep Link，标出缓存和窗口激活时机。
