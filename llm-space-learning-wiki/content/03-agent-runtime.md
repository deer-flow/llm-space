# 第三章：Agent Runtime 与扩展系统

`@llm-space/runtime` 把 Core 的领域协议连接到真实模型、MCP Server、工具、Skills、插件、网络设置和 Trace 存储。它不是自动启动的容器，而是一组 Manager、Registry、Client 和共享协议，由桌面端或无头 Server 显式组合。

## 核心构件

- `RuntimeClient`：本地/远程统一能力契约。
- `LocalRuntimeClient`：把方法委派给各 Manager。
- `RuntimeRouter`：注册 Runtime 并按 `runtimeId` 路由。
- `ModelManager`、`McpManager`、`SkillsManager`、`TraceManager`：各自配置和生命周期所有者。
- `ToolRegistry`：启动期注册、运行期冻结的内置工具表。
- `PluginManager`：发现、验证、启停并隔离插件扩展。

## 本章子课程

- [Runtime、模型与流式生命周期](03-agent-runtime/01-runtime-models-streaming.md)
- [Tools、MCP 与 Skills](03-agent-runtime/02-tools-mcp-skills.md)
- [插件、网络与 Trace](03-agent-runtime/03-plugins-network-traces.md)

## 关键设计原则

1. 定义面与执行面分离：模型先产生 Tool Call，UI/Host 再执行工具。
2. 配置所有权清晰：每个 Manager 管自己的 settings 文件和连接缓存。
3. 运行作用域固定：一次 Run 开始后锁定 Runtime 与 Provider Connection。
4. 动态扩展故障隔离：单插件或 MCP 失败不阻止应用启动。
5. Network 最先初始化：代理环境必须在子进程和网络请求出现前生效。
