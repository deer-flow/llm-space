# Host Services、设置与生命周期

## 1. DesktopHostProvider

共享 `packages/ui` 只依赖 HostServices。桌面实现把接口适配到：

- `createRpcTransport(runtimeId)`。
- Built-in/MCP/Plugin Tool 执行。
- Skills、路径与文件客户端。
- Generator 的目录、文件、uv 与环境变量能力。
- Command Bus 的设置、外链、分享、变量和 Run 动作。

这个 Provider 是共享 UI 和 Electrobun 的唯一主要接缝。

## 2. 设置的三种所有权

### Renderer 本地

主题、主色、侧栏宽度、实验开关等纯显示偏好存 localStorage。

### Desktop Bun

账号、更新、analytics、插件、Remote Servers 属于桌面应用自身。

### Runtime Scoped

模型、MCP、Skills、Search、Network 属于当前 Runtime。设置请求携带 runtimeId，切到远程后写入远程 home。

插件目前是本地例外，不属于 Remote Runtime。

## 3. 设置文件所有者

| 文件 | Manager |
| --- | --- |
| `settings/models.json` | ModelManager |
| `settings/mcp.json` | McpManager |
| `settings/skills.json` | SkillsManager |
| `settings/search.json` | SearchSettingsManager |
| `settings/network.json` | NetworkSettingsManager |
| `settings/remote-servers.json` | RemoteServerManager |
| `settings/auth.json` | GitHubAuthManager |

Manager 维护内存真相源与原子持久化，React 页面不直接写 JSON。

## 4. 文件能力的三条边界

1. Workspace API：严格限制在 Runtime workspace。
2. Prompt 外部文件：用户通过变量选择任意可读文件。
3. Agent 文件工具：按模型参数访问 Runtime 机器路径。

它们的安全假设不同，不能为了复用把三者合并为一个“万能文件服务”。

## 5. Tool Host 生命周期

`DesktopHost` 注册可信、打包内置模块。ToolRegistry 在 Window/RPC 启动前完成注册并 freeze；关闭时模块按逆序 best-effort cleanup。

动态第三方插件不放入这个可信 Host，而由 PluginManager 子进程管理。

## 6. 窗口与更新

Window State 保存 frame、zoom、maximized。Updater 后台检查、下载并通过 RPC message 更新 UI；正式构建的 regular 与 Performance 版使用独立 feed，但共享 `~/.llm-space`。

开发版只有显式设置 CEF CDP 端口才开放调试，发布包不能常驻远程调试端口。

## 7. 性能

Renderer 会在 token streaming 时高频渲染：

- 列表项按需 `memo()`。
- Store 使用窄 selector。
- callback 与派生 props 保持稳定。
- Preview 更新按 frame/throttle 合并。
- Inactive Pane 不卸载，但不能让它订阅无关全局变化。

## 8. 实践

1. 选择一个设置，判断它应属于 Renderer、Desktop 还是 Runtime。
2. 为 HostServices 新增能力时，同时实现桌面和 Web fallback。
3. 检查一个组件是否错误直接导入 `@/client`，应改为 Host 注入。
4. 用 `mise run dev:cef` 和项目 CDP skill 检查真实 Renderer，而不是在普通浏览器 mock Electrobun。
