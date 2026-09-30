# Thread、消息与持久化模型

## 1. Thread 的真实结构

源码：`packages/core/src/types/threads/thread.ts`。

```text
Thread
├── title / model / runtimeId
├── context
│   ├── systemPrompt
│   ├── tools
│   ├── variables / variableVariants / snapshot
│   └── messages
├── runHistory
├── evaluationRubrics / evaluations
└── originalURL
```

`ThreadContext` 是运行输入；`Thread` 还包含调试、评测和来源信息。`ThreadSnapshot` 只保留标题、模型与 Context，刻意排除历史，防止 `runHistory[].thread.runHistory...` 无限递归。

## 2. Message 设计

`Message` 是 `UserMessage | AssistantMessage` 的 discriminated union。User 内容可含文本和图片；Assistant 还可保存 thinking、toolCalls、usage、Provider-Hosted activities、annotations 与响应回放信息。

工具结果放在：

```ts
assistant.toolCalls[i].output
```

而不是单独领域消息。这使用户能直接在工具卡片上编辑参数或结果。`convertToPiContext()` 在发送模型前把该结构转换成 pi-agent 需要的 Assistant + ToolResult 序列。

## 3. Tool 的运行时身份

Tool 使用 `type` 区分 built-in、mcp、plugin、function 与 provider-hosted。规范化函数负责旧字段兼容。稳定 key 不应只依赖显示名，因为不同来源可能出现同名工具。

Provider-Hosted Tool 是例外：它进入独立的 raw config 列表，不转换成本地可执行 `pi.Tool`。

## 4. 本地文件系统

核心实现：`packages/core/src/server/storage/local/file-system.ts`。

`LocalFileSystem` 把相对路径限制在 `<LLM_SPACE_HOME>/workspace`：

- `realpath()` 防止路径逃逸。
- `ls()` 返回文件树节点。
- `read()` 解析、验证、规范化并解包图片。
- `write()` 同步标题与文件名，打包大图后原子写入。

### 原子写入

原子写入通常采用：

1. 在同目录写临时文件。
2. flush/fsync，确保内容落盘。
3. rename 覆盖目标。

rename 在同文件系统内是原子的，能避免进程崩溃留下半个 JSON。相关通用逻辑在 `server/json-file.ts`。

## 5. 图片 Blob

内嵌 Base64 大图会让 Thread JSON 巨大。存储层按 SHA-256 去重，把图片写入 Blob 文件，JSON 中保留引用；读取时再解包。内容寻址意味着相同图片天然复用。

## 6. 损坏文件恢复

读取不是简单 `JSON.parse`：

- 尝试严格解析。
- 对常见截断场景做 best-effort 恢复。
- 用持久化 schema 迁移旧字段并验证。
- 若规范化后与磁盘不同，可回写修复版本。
- 无法恢复时保留证据而不是静默覆盖。

## 7. Storage 与 Parser 不同

- Storage 已知资源身份，负责读写与版本，如本地文件和 Gist。
- Parser 面对未知外部文件，负责识别 OpenAI、Anthropic、Aurora、DeerFlow JSONL 等格式并统一为 Thread。

Gist 的 `ThreadLocator { id, filename, version }` 把资源身份与具体版本分开，`readLatestThread()` 可解析最新版本。

## 8. 实践

1. 创建最小 Thread JSON，只保留一条 User Message，验证 schema 默认行为。
2. 追踪 `LocalFileSystem.write()` 如何处理标题、图片与临时文件。
3. 构造一个旧字段 Thread，阅读 `thread-zod.ts` 的迁移结果。
4. 解释为何 Agent 内置文件工具不受 workspace 根限制，而 Thread 文件 API 必须受限。

## 常见误区

- TypeScript 类型不能保护磁盘输入，必须有运行时 schema。
- “Thread” 不是并发执行线程。
- 删除本地工作区文件走桌面 Trash 注入；远程 Runtime 没有相同 OS 语义。
