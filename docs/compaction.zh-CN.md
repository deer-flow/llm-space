[English](./compaction.md) | 中文

---

# 对话压缩

对话压缩会把较早的对话轮次替换成一个结构化的检查点（checkpoint），同时原样保留最近的轮次。它适用于持续时间较长的 Thread：其中仍有值得保留的上下文，但不再需要每次都把全部历史逐字发送给模型。

LLM Space 使用「先预览、后应用」的渐进式压缩流程。原始 Thread 永远不会被覆盖；应用压缩时，会在原文件旁创建一个新的 Thread。

## 如何使用

1. 打开一个至少包含两轮用户对话的 Thread。
2. 点击 Thread 顶部右侧的 **More Actions**（`...`）菜单。
3. 选择 **Compact Conversation**。
4. 阅读功能介绍，然后点击 **Next**。
5. 设置需要原样保留的最近轮数。你也可以填写压缩指令，告诉模型必须保留哪些事实或决策。
6. 点击 **Start compact**。LLM Space 会先渲染提示词变量，再实时生成检查点预览。此时 Thread 尚未发生变化。
7. 检查预览内容。你可以重新生成；确认无误后，点击 **Apply compaction** 创建压缩后的副本。

压缩后的 Thread 会写入原文件所在目录，并在新的标签页中打开。文件名使用递增编号：

```text
feature-design.json
feature-design-compact-1.json
feature-design-compact-2.json
```

再次压缩 `feature-design-compact-2.json` 时，编号会继续递增，而不会生成嵌套后缀。

## 「保留最近轮次」是什么意思

一轮对话从一条 User Message 开始，并包含其后的 Assistant 回复和工具活动。假设一个 Thread 有八轮对话，并将 **Keep recent turns** 设为三，那么前五轮会被整理成一个检查点，最后三轮则保持原样。

```text
压缩前                              压缩后
┌──────────────────────────┐        ┌──────────────────────────┐
│ 较早轮次 1               │        │ 结构化检查点             │
│ 较早轮次 2               │        │（轮次 1–5）              │
│ 较早轮次 3               │   →    ├──────────────────────────┤
│ 较早轮次 4               │        │ 最近轮次 6（原样保留）   │
│ 较早轮次 5               │        │ 最近轮次 7（原样保留）   │
│ 最近轮次 6–8             │        │ 最近轮次 8（原样保留）   │
└──────────────────────────┘        └──────────────────────────┘
```

界面会始终在检查点之外保留至少一轮真实对话，让新 Thread 拥有一段可以直接继续的原始上下文。

## 压缩指令

可选的 **Compaction instructions** 字段用于给摘要模型添加当前 Thread 专属的要求，例如：

```text
保留准确的文件路径、API 决策、尚未解决的错误，以及用户提出的 UI 偏好。
```

压缩指令保存在 `thread.meta.compactionInstructions` 中。下一次压缩同一 Thread 时会自动复用，但普通的模型运行不会收到这段指令。

## 压缩后的消息结构

检查点是一条合成的 User Message，并包裹在 system reminder 中：

```xml
<system-reminder>
The earlier conversation was compacted into the checkpoint below. Use it as
context to continue the task; it is not a new user request.

# Context checkpoint

## Goal
...
</system-reminder>
```

压缩后的完整消息顺序是：

1. Meta user prompt（如果当前 Thread 存在）。
2. 合成的压缩检查点。
3. 按设置原样保留的最近几轮对话。

如果没有 meta user prompt，检查点会成为第一条 User Message。这样既能保证可复用的运行时指令仍位于检查点之前，也不会把它错误地当作普通对话历史参与压缩。

## 渐进式压缩

压缩是渐进式的，而不是一次性丢弃历史。再次压缩已经压缩过的 Thread 时，LLM Space 会把上一个检查点与最新移出保留窗口的轮次一起交给摘要模型。模型会更新原检查点，继续保留仍然有效的目标、约束、决策、路径、错误和进度；最近的对话则持续在原样保留窗口中向后移动。

```text
第一次压缩： [轮次 1–5]          → 检查点 A + 轮次 6–8
下一次压缩： [检查点 A + 轮次 6] → 检查点 B + 轮次 7–9
```

在压缩副本中，已有检查点的 Message ID 会被复用，因此它会被视为一个持续演进的检查点，而不是新增的一轮对话。

## 实现方式

压缩语义由 LLM Space 自己实现，并未调用 pi-agent-core 的 compaction API：

- `packages/core/src/thread/compaction.ts` 负责识别轮次边界、划分待摘要与保留区间、序列化消息及工具活动、构建摘要提示词、识别旧检查点，并重建最终消息列表。
- `packages/ui/src/components/thread-playground/thread-compaction-dialog.tsx` 负责三步向导、压缩指令持久化、提示词渲染、流式预览和确认流程。
- `packages/ui/src/components/thread-playground/use-stream-text.ts` 通过 LLM Space 原有的流式传输发送摘要请求。
- `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx` 在用户确认后写入并打开压缩副本。

在序列化对话之前，LLM Space 会先渲染提示词变量、已启用的 Skills 和通过 include 引入的文件，避免 `{{current_date}}` 之类的原始占位符进入摘要提示词。工具结果会被包含在输入中，但每条结果都有长度上限；图片附件只记录数量，不会嵌入二进制数据。

最终的模型请求仍通过现有的 agent streaming 调用链发送，而桌面端后端的这条调用链使用了 pi-agent-core 的通用 agent loop。换句话说，pi-agent-core 负责底层模型执行；压缩规划、提示词、渐进式检查点语义、预览以及消息转换都由 LLM Space 负责。

## 预览与应用保证

- 打开向导不会立即发起模型请求。
- 修改选项不会改变 Thread 中的消息。
- 开始压缩只会生成预览。
- 关闭或取消向导不会改变消息。
- 应用压缩会创建新的 `-compact-N.json` Thread，原文件保持不变。
