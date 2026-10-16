# 共享 UI、Host 抽象与状态管理

## 1. packages/ui 分层

```text
src/ui/          shadcn 生成原语
src/components/  业务组件
src/host/        宿主能力接口与 Context
src/lib/         纯工具
src/styles/      Tailwind v4 与设计 Token
```

包直接导出 TypeScript 源码，不单独 build。内部使用相对 import，避免宿主的 `@/` alias 把路径解析到 `apps/desktop/src`。

## 2. ThreadPlayground

这是核心共享业务 UI，包含 Model、Prompt、Variables、Messages、Tools、Run History、Evaluation 与 Generator。它通过 Props 和 Context 接收 Thread 初值、只读状态、Header action、HostServices 与 ModelClient。

## 3. 每 Thread 一个 Zustand Store

`createThreadStore()` 创建 vanilla Store，再由 Context 提供给组件。State 包含：

- thread / streamingMessage / status。
- AbortController 与 activeRunId。
- tool execution IDs。
- changeHistory / runHistory / evaluations。
- 所有编辑、运行、Undo、工具结果操作。

每标签一个 Store 避免全局状态互相污染，也让 inactive Pane 保持现场。

## 4. `run()` 的职责

Store Run：

1. 校验模型和消息。
2. 解析 Skills、文件与 Prompt Variables。
3. 固定 Runtime Transport 与 Provider Profile。
4. 调 `streamThread()` 并 reduce events。
5. 可选自动执行工具。
6. ReAct 开启时继续下一模型轮次。
7. 最多 50 轮。
8. 完成后记录 Run History。
9. Abort/Error 时恢复一致状态。

流式 chunk 不进入 Undo，整个 Run 折叠成有意义的状态变化。

## 5. HostServices

接口包含 presentational、Transport、Tool execution、Skills、MCP、Built-ins、Plugins、Paths、Files、Generator 和 Actions。

ModelClient 单独注入，负责 Provider/Model 查询与修改。分开是因为模型 Context 有自己的缓存与 UI 生命周期。

## 6. Desktop 与 Web

- DesktopHostProvider 提供真实 RPC、Command、文件和 Generator。
- webHost 设置 `presentational:true`，Transport/Tool/Generator 不可用，文件读取为空。

共享组件必须对不可用能力有明确 UI，而不是依赖调用后抛错。

## 7. React 性能

Message 和 ToolCall 列表是热路径：

- selector 只订阅需要字段。
- 高频子组件使用 `memo(_Foo)`。
- useMemo/useCallback 稳定引用。
- frame throttle 合并 preview 更新。
- 不对廉价且低频组件盲目 memo。

## 8. 组件约定

- 业务层优先使用 app-level wrapper。
- Tooltip 使用共享 wrapper。
- 破坏性操作用 ConfirmDialog。
- 列表必须有空状态与 filtered-empty 状态。
- 菜单文字 Title Case，普通 UI sentence case。

## 9. 实践

1. 为 Thread Store 新增一个纯编辑 action，并补 Undo 测试。
2. 检查一个组件的 selector 是否订阅整个 Store。
3. 在 Web Host 下渲染同组件，确保不显示运行按钮。
4. 为 HostServices 增加 capability 时实现桌面与只读 fallback。
