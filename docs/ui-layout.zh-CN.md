[English](./ui-layout.md) | 中文

---

# 界面布局

LLM Space 的主界面围绕 Thread 的编辑、运行和调试组织。左侧用于管理工作区文件，中间是当前 Thread 的主要编辑区，右侧是运行结果、预览和调试信息。

![LLM Space 界面布局](./images/ui-layout.png)

| 编号 | 区域 | 说明 |
| --- | --- | --- |
| 1 | Workspace | 工作区文件树。这里展示 `workspace/` 下的目录和 Thread JSON 文件，用于新建、打开、复制、移动、删除和整理 Thread。 |
| 2 | Thread Tabs | 已打开的 Thread 标签页。可以在多个 Thread 之间切换，也可以通过新标签打开更多实验文件。 |
| 3 | Thread Settings | 当前 Thread 的运行配置区。通常包含标题、模型选择、运行参数、Tools 等与本次实验相关的设置。 |
| 4 | System Prompt | 在这里编辑 System Prompt，以调整模型的行为和输出。 |
| 5 | Messages | 对话编辑和运行区。这里展示 User / Assistant 消息、模型输出、工具调用记录，以及当前运行中的流式响应。 |

这个布局的核心思路是：左边选文件，中间编辑和运行 Thread，右边查看运行后的证据与调试上下文。
