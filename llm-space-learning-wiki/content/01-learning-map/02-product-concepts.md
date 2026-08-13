# 产品概念与领域词汇

阅读源码前必须先理解产品语言。领域词汇不是 UI 标签的集合，而是代码中的稳定概念。

## Thread：可执行的 Agent 实验文档

这里的 Thread 不是操作系统线程，而是一份可保存的 JSON 文档。它包含：

- `title`：标题。
- `model`：Provider、模型 ID 与参数。
- `context.systemPrompt`：全局提示词。
- `context.variables` 与 `variableVariants`：内置和自定义变量。
- `context.tools`：内置、MCP、插件、自定义函数和 Provider-Hosted Tools。
- `context.messages`：User 与 Assistant 消息。
- `runHistory`、`evaluationRubrics`、`evaluations`：运行快照与人工评测。

`ThreadContext` 是模型本次运行真正需要的上下文，`Thread` 则是完整的持久化文档。源码定义在 `packages/core/src/types/threads/thread.ts`。

## Message 与 Tool Call

领域层只保存 User 和 Assistant 两类消息。工具调用挂在 Assistant Message 的 `toolCalls` 中，结果保存在对应 Tool Call 的 `output`，而不是单独保存一条 Tool Result 领域消息。转换到 pi-agent 协议时，converter 才会产生运行时需要的工具结果消息。

这种结构适合可视化编辑：请求、参数和结果在一个工具卡片内，用户可以修改结果后继续运行。

## Model 与 Provider

- **Provider** 是调用模型服务所需的全局连接配置，包括 API 协议、Base URL、认证和可选模型。
- **Model** 是某个 Thread 选择的具体模型及运行参数。
- **Provider Profile** 是同一 Provider 的一组临时连接选择；它属于标签页运行状态，不写回 Thread。

模型配置由 `ModelManager` 管理，运行时通过 `resolveConnection()` 得到 API Key、Base URL 与 Headers。敏感凭证不会塞入 Thread JSON。

## 五类工具与执行所有权

| 类型 | 谁执行 | 是否产生本地 Tool Call |
| --- | --- | --- |
| Built-in | Runtime 内置实现 | 是 |
| MCP | MCP Server | 是 |
| Plugin Tool | 本机插件子进程 | 是 |
| Custom Function | 用户或外部系统补结果 | 是 |
| Provider-Hosted | 模型服务内部 | 否 |

“谁执行”是理解工具系统的钥匙。Provider-Hosted Tool 原样进入模型请求，由服务商内部完成，因此不受本地 Auto run tools 或 ReAct loop 控制。

## Agent loop 与 ReAct

ReAct 可粗略理解为“推理/决定行动 -> 调工具 -> 观察结果 -> 再继续”。LLM Space 有意支持两种体验：

1. **单步调试**：模型产生 Tool Call 后停止，用户检查或修改结果，再手动 Continue。
2. **自动循环**：应用执行可执行工具并继续模型调用，直到模型不再调用工具。

Store 用最多 50 个模型轮次作为保险，避免错误提示词或模型无限循环。

## Variables、Template 与 Snapshot

变量让 Prompt 复用动态值；Nunjucks 模板支持条件、循环、过滤器和 `@include`。真正重要的是 Snapshot：某个 Prompt 位置第一次运行时解析出的变量值会被冻结。以后时间或文件内容改变，旧对话前缀仍能复现原来的输入。

这体现了调试工具的核心原则：可编辑不等于可以破坏历史证据。

## Run History 与 Evaluation

完成一次运行后，系统保存 Thread Snapshot、时间和 usage。Snapshot 故意排除 `runHistory` 与评测定义，避免递归膨胀。

Evaluation 可以比较两次稳定 Run ID，保存 verdict、备注、Rubric 快照和逐项 1–5 分。Rubric 被修改后，历史评测仍保留当时的不可变定义。

## Runtime

Runtime 是一组能力的集合：模型、文件系统、MCP、工具、Skills、Search、Network、Trace 与流式运行。它可以是：

- `local`：桌面 Bun 主进程中的本地实现。
- `remote`：通过 SSH tunnel 连接 Linux 上的 `apps/server`。

UI 操作携带 `runtimeId`，保证模型、文件、工具都来自 Thread 所属 Runtime。

## Trace 与 Thread 的区别

Thread 是可编辑、可运行的实验；Trace 是外部 Agent 运行的观测证据。Trace Workbench 可以把一次观测转换成可编辑 Thread，帮助复现问题。不要把 Trace 当作另一种 Thread 存储目录。

## 检查点

尝试回答：

1. 为什么 Provider Profile 不应持久化进 Thread？
2. 为什么 Provider-Hosted Tool 不会进入本地工具执行器？
3. 为什么 Prompt 变量需要按“位置”冻结，而不是只冻结一份全局值？
4. 为什么 Thread Snapshot 不能包含自身的 run history？
