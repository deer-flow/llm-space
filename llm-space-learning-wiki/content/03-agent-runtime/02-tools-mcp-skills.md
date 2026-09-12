# Tools、MCP 与 Skills

## 1. 定义与执行分离

模型请求中的 Tool 只是名称、描述和参数 Schema。`streamAgent()` 用 step-by-step stub 让 pi-agent 在产生 Tool Call 后终止当前模型轮次。真实执行发生在桌面 Host：

```text
Assistant ToolCall
→ useToolCallRunner / auto-run loop
→ apps/desktop/src/client/tool-execution.ts
→ built-in | mcp | plugin
→ ToolCallOutput 写回 Thread
→ 下一轮模型请求
```

这使用户能暂停、修改参数、伪造结果和复现异常。

## 2. ToolRegistry

Registry 接收启动期 `ToolContribution`：

- contribution ID 和 tool name 必须唯一。
- 注册时深拷贝并冻结定义。
- `freeze()` 后不可增加工具。
- 普通返回值统一转文本。
- 结构化图片等必须使用 `createToolCallResponse()`。

内置模块贡献 filesystem、web、media 与 misc 工具。

## 3. Built-in Tools

典型能力：

- 文件：read、write、edit、ls、tree、grep、glob、bash。
- Agent 支撑：skill、todo_write、ask_user_question、sleep。
- Web：web_search、web_fetch、weather_report。
- 媒体：generate_image。

这些工具运行在 Runtime 所在机器。Remote Runtime 下，文件路径和 shell 都指向远端 Linux，而不是桌面 Mac。

## 4. MCP 基础

MCP（Model Context Protocol）让外部 Server 标准化暴露 tools/resources/prompts。LLM Space 主要消费工具。

`McpManager` 管：

- 用户与插件只读配置。
- 已连接 Client。
- 正在连接的共享 Promise，防止重复并发连接。
- Test AbortController。
- readiness 与工具摘要。

## 5. 懒连接

`listTools()` 或 `callTool()` 才触发 `_connect()`。Transport 支持 stdio、Streamable HTTP 和 SSE。配置变化会关闭旧 Client 并使 readiness 失效。

环境变量在连接时解析，而不是保存明文 secret。错误信息会清理 Token、Authorization 与 URL query。工具输出统一限制长度，防止异常 Server 撑爆 Thread。

## 6. Skills

Skill 是含 `SKILL.md` 的目录，提供按需加载的专业说明。`SkillsManager` 扫描用户路径、内置托管目录与插件路径。

冲突优先级：

- 用户 Skill 优先于插件 Skill。
- 多个插件同名时冲突项不进入可用集合。
- 隐藏设置影响 Agent 可见列表，但不随意删除磁盘内容。

内置 `skill` 工具按名称读取完整 Markdown；`available_skills` Prompt 变量只展示名称与描述，避免把所有正文提前塞入上下文。

## 7. 三种工具所有权

```text
Runtime Registry  owns built-in
MCP Server        owns MCP execution
Plugin subprocess owns plugin execution
Provider service  owns provider-hosted execution
User/external     owns custom function result
```

实现工具功能前先确定所有权，否则容易错误地增加本地执行按钮或 ReAct continuation。

## 8. 危险操作

文件写入与 shell 可以造成真实副作用。UI 会识别危险 bash 命令并要求确认；自动运行路径也必须保留相同策略。Remote 环境的风险更高，因为路径可能指向共享服务器。

## 9. 实践

1. 写一个纯只读 built-in Tool Contribution，并在 freeze 前注册。
2. 配置一个 stdio MCP，跟踪首次 listTools 的连接缓存。
3. 制造 MCP 输出超长和带 Authorization 的错误，观察截断与清理。
4. 创建同名用户/插件 Skill，验证优先级。
5. 解释为什么 Provider-Hosted web_search 不能回退为本地 web_search。
