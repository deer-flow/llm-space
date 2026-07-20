[English](./shortcut-keys.md) | 中文

---

# 常用快捷键

LLM Space 的桌面菜单和 Thread 编辑器都支持快捷键。本文用 macOS 的 `Command` 写法说明；在 Windows / Linux 上，对应按键通常是 `Ctrl`。

# 菜单快捷键

这些快捷键来自桌面应用顶部菜单。

| 菜单 | 操作 | macOS 快捷键 | Windows / Linux |
| --- | --- | --- | --- |
| LLM Space | 打开 Settings | `Command + ,` | `Ctrl + ,` |
| LLM Space | 隐藏应用 | `Command + H` | `Ctrl + H` |
| LLM Space | 隐藏其他应用 | `Command + Shift + H` | `Ctrl + Shift + H` |
| LLM Space | 退出应用 | `Command + Q` | `Ctrl + Q` |
| File | 新建 Thread 文件 | `Command + N` | `Ctrl + N` |
| File | 新建文件夹 | `Command + Shift + N` | `Ctrl + Shift + N` |
| File | 关闭当前标签页 | `Command + W` | `Ctrl + W` |
| File | 重新打开已关闭标签页 | `Command + Shift + T` | `Ctrl + Shift + T` |
| View | 打开 Command Palette | `Command + Shift + P` | `Ctrl + Shift + P` |
| View | 切换左侧 Sidebar | `Command + B` | `Ctrl + B` |
| View | 重新加载应用 | `Command + Shift + R` | `Ctrl + Shift + R` |
| View | 放大界面 | `Command + +` | `Ctrl + +` |
| View | 缩小界面 | `Command + -` | `Ctrl + -` |
| View | 重置缩放 | `Command + 0` | `Ctrl + 0` |
| Window | 选择上一个标签页 | `Command + Option + ←` | `Ctrl + Alt + ←` |
| Window | 选择下一个标签页 | `Command + Option + →` | `Ctrl + Alt + →` |
| Window | 切换全屏 | `Command + Shift + F` | `Ctrl + Shift + F` |

# Command Palette

`Command + Shift + P` 会打开 Command Palette。你可以在里面搜索并执行应用命令，例如打开设置、切换 Sidebar、导入文件、关闭标签页等。

# Thread 运行快捷键

Thread 页面支持快速运行当前 Thread 或从指定消息继续运行。

| 操作 | macOS 快捷键 | Windows / Linux | 行为 |
| --- | --- | --- | --- |
| 运行 / 停止当前 Thread | `Command + Enter` | `Ctrl + Enter` | 没有 Message 编辑框焦点时，从最后一条消息开始执行；如果当前正在运行，则停止当前运行。 |
| 从当前 Message 开始运行 | `Command + Enter` | `Ctrl + Enter` | 焦点在某一条 Message 编辑框里时，从这条消息开始执行。 |
| 从当前 Message 开始运行 | `Command + R` | `Ctrl + R` | 焦点在某一条 Message 编辑框里时，从这条消息开始执行；没有 Message 焦点时，从最后一条消息开始执行。 |
| 打开快捷命令入口 | `Command + P` | `Ctrl + P` | 用于快速触发常用操作。 |

## Message 有焦点时

当光标位于某条 User Message 或 Assistant Message 的编辑框里时，运行快捷键会以这条 Message 为起点执行。它等价于在这条消息上使用 `Run from this message` / `Continue`。

这种方式适合调试中间步骤：你可以修改某条 User Message、Assistant Message 或 Tool Call 结果，然后从这一条继续跑后续流程。

## 没有 Message 焦点时

当焦点不在任何 Message 编辑框中时，运行快捷键会从最后一条消息开始执行。它等价于点击 Thread 右上角的 `Run`。

如果当前 Thread 正在运行，再次触发运行快捷键会停止当前运行。

# 编辑器内快捷键

部分输入框和编辑器会优先处理自己的快捷键。例如在普通文本编辑区域中，系统剪切、复制、粘贴、撤销、重做等行为会按操作系统默认规则执行。

如果某个快捷键没有触发全局操作，先确认当前焦点是否在输入框、CodeMirror 编辑器或弹窗表单中。
