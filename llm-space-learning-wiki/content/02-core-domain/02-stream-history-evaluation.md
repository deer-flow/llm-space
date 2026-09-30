# 流式转换、运行历史与评测

## 1. 为什么有两次转换

LLM Space 的领域模型适合编辑和持久化，pi-agent 的协议适合模型执行。运行前 `convertToPiContext()` 做正向转换；事件返回后 `reduceMessages()` 做增量归并。

```text
ThreadContext
→ PiThreadContext
→ AgentEvent stream
→ AssistantMessage
```

## 2. `streamThread()`

位置：`packages/core/src/client/api.ts`。

职责很窄：

1. 检查对话最后一条是否可运行。
2. 将 context 转换为 pi 格式。
3. 构造 `AgentStreamRequest`。
4. 选择注入 Transport；未注入时使用 HTTP/SSE。
5. 原样 yield 事件。

它不负责模型凭证、UI 状态或持久化，体现单一职责。

## 3. `streamAgent()`

位置：`packages/core/src/server/agent/stream.ts`。

职责：

- 从注入的 Models 集合解析模型。
- 为单次运行解析 API Key、Base URL 和 Headers。
- 应用结构化输出与 Provider-Hosted Tools。
- 调用 `agentLoopContinue()`。
- 在 `finally` 中恢复共享 model 上临时覆盖的 Base URL。

最后一点防止一次连接配置泄漏到下一次运行，是共享可变对象的典型风险。

## 4. `reduceMessages()`

Reducer 是纯函数风格的事件状态机：

- `message_start`：创建临时 Assistant Message。
- `thinking_delta`、`text_delta`：拼接增量内容。
- `toolcall_start/delta/end`：保留未完成参数文本并尝试解析 JSON。
- `tool_execution_end`：补入输出。
- `message_end`：使用 Provider 最终内容、usage、活动和注解校准消息。
- `agent_end`：检查 Provider 错误。

在 UI 中保留 `partialArguments` 很重要，因为模型输出损坏 JSON 时仍可调试原始文本。

## 5. 运行历史

`recordRun()` 保存：

- 稳定 Run ID。
- 不含历史的 Thread Snapshot。
- 本次 usage。
- 完成时间。

历史数量有上限，避免单文件无限增长。旧历史缺少 ID 时会按确定规则回填，使 Evaluation 可以稳定引用。

## 6. Undo 与 Run History 不同

- Undo/Redo 记录编辑快照，服务于当前交互，采用 copy-on-write 引用，受数量和图片内存预算约束。
- Run History 记录已完成运行证据，持久化到 Thread。

不要用 Undo 实现运行回放，也不要把每个 streaming chunk 写进 Undo。

## 7. Rubric 与 Evaluation

Rubric 包含 2–6 个有序标准和 revision。Evaluation 保存 Rubric Snapshot 与两边 Run ID 的分数，因此：

- 修改 Rubric 不会改变历史评测。
- 删除某次运行时需要清理失效评测引用。
- 平均分是派生信息，verdict 仍是独立的人类判断。

## 8. Usage

Provider usage 会被归一化为输入、输出、缓存读写、推理、总 token 和 cost。负数、NaN 或 Infinity 被过滤，全零 usage 不持久化。跨 Provider 比较时只保留可移植字段。

## 9. 实践

1. 逐事件喂给 `reduceMessages()`：text、tool call、tool result、message end。
2. 验证提前 Abort 时不会留下 active stream。
3. 比较一次模型最终 content 与增量 content 不一致时 reducer 的选择。
4. 创建 Rubric、评测两次 Run，再修改 Rubric，确认历史快照不变。

## 阅读测试

- `client/reducer.test.ts`
- `server/agent/stream.test.ts`
- `thread/history.test.ts`
- `thread/run-evaluation-utils.test.ts`
- `thread/thread-workflow.test.ts`
