# 插件、网络与 Trace

## 1. Plugin 生命周期

插件位于 `LLM_SPACE_HOME/plugins/` 的 npm-compatible package。`PluginManager.create()`：

```text
discover
→ metadata / engine 校验
→ settings
→ declarative extensions
→ subprocess
→ registries
→ rebuild contributions
```

发现器拒绝名称不匹配、路径逃逸和 symlink 候选。单插件错误被记录，不阻止其他插件和应用启动。

## 2. 扩展类型

当前源码可发现：

- `skills/*/SKILL.md`
- `mcp.json`
- `models.json`
- `commands/*.{ts,js,mjs}`
- `tools/*.{ts,js,mjs}`
- `thread-storages/*.{ts,js,mjs}`
- `config.schema.json`

注意 Draft RFC 仍写着 Tool 只能通过 MCP，但可执行源码、测试和用户文档已经支持 `tools/`。发生规范漂移时，优先级是源码与测试 > 当前用户文档 > Draft RFC。

## 3. 子进程不是 Sandbox

Command、Tool 与 Thread Storage 在每插件独立 Bun 子进程中运行，通过 NDJSON RPC 通信，并有消息大小、timeout 与 stderr 上限。

它能隔离崩溃和未处理异常，但插件仍可使用 Bun/Node API 访问文件、网络、环境变量和进程。因此“复制插件到目录”本质上是信任并授权代码执行。

## 4. Host 白名单

插件可通过受控 host request 请求通知、打开链接、选择文件、读写 workspace 和执行少量宿主 Command。宿主仍校验 method 与参数，避免直接暴露内部 Manager。

## 5. Settings 与冲突

`settings/plugins.json` 保存 enabled 与 JSON settings。写入采用原子替换并保留 last-known-good。Canonical extension ID 冲突时不使用 first-wins，而是让冲突贡献失效，避免加载顺序成为隐式 API。

## 6. NetworkSettingsManager

Network 设置是进程级副作用：

- 同步写入大小写两套 `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY`。
- 清除 `ALL_PROXY`，避免 Bun/依赖使用意外代理。
- 必须在 MCP、插件子进程和 GitHub fetch 之前初始化。

应用内 GitHub 调用直接使用全局 fetch，从统一代理环境获益，不应绕过为自定义 dispatcher。

## 7. SearchSettings

Search Manager 只保存 Brave、Firecrawl、Tavily 等配置，不提供独立服务。每次执行 `web_search`/`web_fetch` 时读取当前设置并创建对应 Provider。

## 8. Trace Workbench

Trace 系统处理 Langfuse 等外部运行证据：

```text
JSON/remote observations
→ raw.json
→ normalized trace.json
→ 首次打开生成 workbench.json
→ 用户只编辑 workbench
```

原始 Trace 不被可视化调试修改。Workbench 是从证据派生出的可编辑 Thread，用于复现。

## 9. 扩展练习

1. 阅读 `plugin-discovery.test.ts`，列出全部路径校验。
2. 设计插件 Tool 的错误日志，确保不记录 secret、prompt 和 tool payload。
3. 修改代理设置，观察它为何必须影响子进程环境。
4. 导入一条 Langfuse Trace，区分 raw、normalized 与 workbench 三层。
5. 评审插件 RFC 与实现差异，提出文档同步方案。
