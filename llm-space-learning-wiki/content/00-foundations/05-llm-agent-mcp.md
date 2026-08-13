# LLM、Agent、Tools 与 MCP

> 难度：零基础到入门 · 建议用时：45 分钟 · 前置：JSON、请求与响应

## 1. LLM 是什么

大语言模型接收一串上下文 token，并预测接下来最合适的输出。它没有自动访问本机文件、数据库或浏览器的能力；这些能力必须由应用通过工具接入。

基本输入包括：

- System Prompt：长期行为规则。
- Messages：对话历史。
- Tools：可调用能力的名称、说明和参数 Schema。
- Model parameters：温度、最大 token、推理强度等。

## 2. Token 与上下文

Token 是模型处理文本的基本片段，不完全等于汉字或单词。上下文越长，成本和延迟通常越高。LLM Space 保存 usage，帮助比较不同运行。

## 3. Tool Call

模型不会直接执行函数，而是输出结构化请求：

```json
{
  "name": "read_file",
  "arguments": { "path": "README.md" }
}
```

宿主决定是否执行、由谁执行、是否需要用户确认，并把结果送回模型。

## 4. Agent 与 ReAct

Agent 是“模型 + 上下文 + 工具 + 循环控制”的系统。ReAct 可简化为：

```text
理解任务
→ 决定是否调用工具
→ 执行工具
→ 观察结果
→ 继续思考或给出答案
```

LLM Space 允许单步调试，也允许自动循环。单步模式让用户检查甚至修改 Tool Result 后再继续。

## 5. Runtime 是能力所在的地方

Runtime 拥有模型连接、文件系统、MCP、Tools、Skills、Search 和 Trace。它可以在本机，也可以在 SSH 远端。

UI 只发出意图；Runtime 才真正接触 API Key、文件和子进程。

## 6. 五类工具

| 类型 | 执行者 | 类比 |
| --- | --- | --- |
| Built-in | LLM Space Runtime | 公司内部固定部门 |
| MCP | MCP Server | 使用标准接口的外部供应商 |
| Plugin | 本机插件子进程 | 安装的扩展程序 |
| Custom Function | 用户或外部流程 | 预留的人工柜台 |
| Provider-Hosted | 模型服务商 | 云服务内部完成 |

工具类型不只是 UI 分类，它决定安全、确认、错误和 ReAct continuation。

## 7. MCP

MCP 是连接 AI 应用与外部系统的开放标准，可类比“AI 应用的 USB-C”。Host 管理连接和权限，Client 与一个 Server 保持连接，Server 暴露 Tools、Resources 或 Prompts。

```text
LLM Space（Host）
├── MCP Client A ↔ 文件 Server
├── MCP Client B ↔ 数据库 Server
└── MCP Client C ↔ 远程 API Server
```

MCP 使用 JSON-RPC，并包含能力协商、生命周期、取消、错误与通知。工具可能执行任意代码，不能因为“来自 MCP”就默认安全。

## 8. Skill 与 Tool 的区别

- Tool 是可执行能力，例如读文件或搜索。
- Skill 是按需加载的专业说明，告诉模型如何完成某类任务。

`available_skills` 只向模型展示目录；真正需要时，模型调用内置 `skill` 工具读取完整 `SKILL.md`。

## 9. 官方延伸阅读

- MCP 简介：https://modelcontextprotocol.io/docs/getting-started/intro
- MCP 架构：https://modelcontextprotocol.io/docs/learn/architecture
- MCP 规范：https://modelcontextprotocol.io/specification/latest

## 10. 理解自测

**为什么 Tool Schema 很重要？**

它告诉模型工具名称、用途和参数形状，也让宿主能在执行前校验输入。

**为什么 Provider-Hosted Tool 不进入本地执行器？**

它在模型服务商内部完成，应用收到的是活动和结果，而不是等待本地处理的 Tool Call。

**为什么插件子进程不是安全沙箱？**

独立进程能隔离崩溃，但插件仍可使用系统 API 访问文件、网络和环境变量。
