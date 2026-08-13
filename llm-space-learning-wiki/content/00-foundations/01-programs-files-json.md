# 程序、文件与 JSON

> 难度：零基础 · 建议用时：25 分钟 · 不要求编程经验

## 1. 程序到底是什么

程序可以理解为一份非常精确的操作说明。代码是说明书，运行时负责照着执行，数据是执行过程中读取和产生的内容。

用餐厅类比：

- **代码**像菜谱，描述步骤。
- **运行时**像厨房，真正执行步骤。
- **数据**像食材和订单。
- **文件**像仓库中的长期记录，厨房关闭后仍存在。
- **内存**像操作台，速度快，但程序退出后内容通常消失。

LLM Space 使用 TypeScript 编写；Bun 和浏览器分别执行其中不同部分。

## 2. 值、变量与对象

变量是给一个值起名字：

```ts
const title = "我的第一个 Thread";
const messageCount = 3;
const isRunning = false;
```

对象把有关联的值放在一起：

```ts
const thread = {
  title: "我的第一个 Thread",
  model: "gpt-4.1",
  messages: [],
};
```

数组是有顺序的一组值。`messages: []` 表示消息列表暂时为空。

## 3. JSON 是数据交换格式

JSON 只描述数据，不描述函数和行为：

```json
{
  "title": "我的第一个 Thread",
  "messages": [
    { "role": "user", "text": "你好" }
  ]
}
```

它像跨语言都能看懂的标准表格。LLM Space 用 JSON 保存 Thread 和设置，也用 JSON-RPC 在进程或机器间发送请求。

## 4. 内存状态与磁盘状态

用户编辑 Thread 时，React Store 先更新内存；稍后持久化层再写磁盘。两者不是同一件事：

```text
用户输入
→ 内存中的 Thread 更新
→ 界面立即变化
→ 防抖与串行保存
→ workspace/*.json
```

如果写盘过程中突然断电，文件可能只写了一半。因此项目采用“写临时文件，再原子重命名”的方式。

## 5. 路径与目录

路径描述文件位置：

```text
~/.llm-space/workspace/demo.json
```

- `~` 表示当前用户主目录。
- `/` 分隔目录。
- `demo.json` 是文件名。
- 相对路径从某个已知根目录开始，绝对路径从文件系统根开始。

Workspace API 限制在工作区内，Agent 文件工具则可能访问更广范围，所以权限和确认非常重要。

## 6. 在源码中找到它们

| 概念 | 项目位置 |
| --- | --- |
| Thread 数据结构 | `packages/core/src/types/threads/thread.ts` |
| 磁盘读写 | `packages/core/src/server/storage/local/file-system.ts` |
| 内存 Store | `packages/ui/.../stores/thread-store.ts` |
| 工作区目录 | `~/.llm-space/workspace/` |

## 7. 动手练习

1. 在文本编辑器中新建一个合法 JSON 对象。
2. 故意删除一个逗号，观察 JSON 校验器报错。
3. 在 LLM Space 工作区找到一个 Thread 文件，辨认 title、model、context 和 messages。

## 8. 理解自测

**问题：为什么 TypeScript 类型不能保证磁盘 JSON 一定正确？**

答案：类型检查发生在开发和构建阶段；用户文件、旧版本文件或损坏文件是在运行时进入程序的，因此还需要 Zod/TypeBox 等运行时校验。

**问题：为什么界面已经变化，不代表文件一定保存成功？**

答案：界面读取的是内存状态，磁盘写入是稍后发生的异步副作用。
