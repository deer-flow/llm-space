# 第二章：Core 领域层

`@llm-space/core` 是全项目最值得先掌握的包。它定义 Thread、Message、Tool、Model 等领域协议，并提供模板、历史、解析、流式转换、存储和代码生成逻辑。这里的代码尽量不依赖 React、Electrobun 或具体平台。

## 边界原则

- 根入口导出浏览器安全的 client、parsers、types、utils。
- `@llm-space/core/thread` 放框架无关的 Thread 行为。
- `@llm-space/core/server` 允许依赖 Bun/Node 文件系统和模型执行。
- `@llm-space/core/storage` 定义共享 Thread 的读写连接器。
- `@llm-space/core/generator` 定义从 Thread 生成工程的协议与 LangGraph 实现。

同一包内仍通过 exports 子路径显式隔离运行环境，避免 Web bundle 意外包含服务端模块。

## 本章学习路线

1. [Thread、消息与持久化模型](02-core-domain/01-thread-and-storage.md)
2. [流式转换、运行历史与评测](02-core-domain/02-stream-history-evaluation.md)
3. [Prompt 模板、导入解析与代码生成](02-core-domain/03-templates-parsers-generator.md)

## 关键调用图

```text
Thread JSON
  → normalize / validate
  → render prompt variables
  → convertToPiContext
  → AgentTransport
  → streamAgent
  → AgentEvent
  → reduceMessages
  → AssistantMessage
  → recordRun / evaluation
  → atomic persistence
```

学习时重点区分三种“校验”：

- TypeScript 静态类型只在开发阶段工作。
- TypeBox schema 同时提供类型与可编译校验器。
- Zod 持久化边界负责旧字段迁移、规范化与运行时验证。

## 推荐阅读顺序

`types/messages` → `types/threads/thread.ts` → `client/converters.ts` → `client/reducer.ts` → `thread/thread-workflow.test.ts` → `thread/prompt-variables.ts` → `server/storage/local/file-system.ts` → `generator/langgraph`。

先读测试再读 1000 行级实现，通常能更快找到不变量。
