[English](./plugins.md) | 中文

---

# Plugin 开发指南

LLM Space Plugin 是安装在本机 `LLM_SPACE_HOME/plugins/` 下的 npm-compatible package。一个 Plugin 可以包含零个或多个扩展（Extensions），为 LLM Space 补充 Skills、MCP servers、模型、命令和 Thread Storages。

本文介绍当前已经实现的 Plugin 体系，包括目录约定、配置格式、运行机制、故障诊断和开发示例。

## 1. 核心模型

Plugin 是分发、版本管理和启停的最小单位；Extension 是 Plugin 提供的一项具体能力。

```text
Plugin
├── Metadata（package.json）
├── Settings（可选）
└── Extensions（零个或多个）
    ├── Skill
    ├── MCP server
    ├── Model provider
    ├── Command
    └── Thread Storage
```

几个重要规则：

- `package.json` 是唯一的 metadata 文件，`name` 同时也是稳定的 Plugin ID。
- 扩展按约定的目录和文件名自动发现，不在 `package.json` 中逐项声明。
- 新发现的 Plugin 默认启用。
- Plugin 可以整体启用或禁用。Plugin Skills 还可以在 Settings → Skills 中单独启停；其他 Extension 当前不支持单独启停。
- Plugin 的 Settings 自动保存；修改 Settings 后 Plugin 会重新加载。
- Plugin 提供的 Skills、MCP 和 Models 是只读贡献，不会写入用户自己的配置文件。
- 本地 Plugin 默认完全受信任；Plugin 运行环境不是安全沙箱。

## 2. 安装位置与发现规则

`LLM_SPACE_HOME` 默认为 `~/.llm-space`，因此默认安装目录是：

```text
~/.llm-space/plugins/
```

也可以在启动 LLM Space 前设置 `LLM_SPACE_HOME`，使用另一套完全独立的数据目录。

### 2.1 普通包与 Scoped 包

发现器只识别下面两种布局：

```text
plugins/
├── weather-kit/
│   └── package.json
└── @example/
    └── team-tools/
        └── package.json
```

- 普通包：`plugins/<name>/package.json`
- Scoped 包：`plugins/@<scope>/<name>/package.json`

普通包只扫描一层，Scoped 包只扫描两层。发现器不会递归查找任意深度的目录，也不会扫描 `node_modules`。

目录必须与 `package.json.name` 完全对应。例如：

| 安装目录                       | 正确的 `name`         |
| ------------------------------ | --------------------- |
| `plugins/weather-kit/`         | `weather-kit`         |
| `plugins/@example/team-tools/` | `@example/team-tools` |

Plugin 根目录、扩展目录和被发现的文件都必须是真实目录或普通文件。Symlink 会被拒绝，路径也不能逃逸出 Plugin 安装目录。

### 2.2 Extension 自动发现

LLM Space 只从固定位置发现扩展：

| 路径                            | Extension                 |
| ------------------------------- | ------------------------- |
| `skills/*/SKILL.md`             | Skills                    |
| `mcp.json`                      | MCP servers 与 tools      |
| `models.json`                   | Model providers 与 models |
| `commands/*.{ts,js,mjs}`        | Command Palette commands  |
| `thread-storages/*.{ts,js,mjs}` | Thread Storages           |
| `config.schema.json`            | Plugin Settings 表单      |

除每个 Skill 自己的目录外，扩展扫描不递归。例如 `commands/open-dashboard.ts` 会被发现，`commands/admin/open-dashboard.ts` 不会。

一个较完整的 Plugin 可以是：

```text
@example/team-tools/
├── package.json
├── icon.png
├── config.schema.json
├── mcp.json
├── models.json
├── skills/
│   └── incident-review/
│       ├── SKILL.md
│       └── references/
├── commands/
│   └── open-dashboard.ts
└── thread-storages/
    └── team-library.ts
```

不需要为了满足结构而创建空目录。一个只提供 Skill 的 Plugin 只需 `package.json` 和相应的 Skill 目录。

## 3. `package.json`

最小可用 metadata：

```json
{
  "name": "@example/team-tools",
  "version": "1.0.0",
  "displayName": "Team Tools",
  "description": "Example collaboration extensions for LLM Space.",
  "author": "Example Team",
  "license": "MIT",
  "homepage": "https://example.com/team-tools",
  "engines": {
    "llm-space": ">=4.7.1"
  }
}
```

必需字段：

- `name`：npm 风格的包名，也是 Plugin ID；只允许小写字母、数字、点、下划线和连字符，可带 scope。
- `version`：合法的 SemVer 版本。
- `engines["llm-space"]`：Plugin 兼容的 LLM Space SemVer 范围。

建议填写 `displayName`、`description`、`author`、`license` 和 `homepage`。其他 npm 字段可以保留，但 LLM Space 不会因为 `scripts`、`main`、`module`、`exports` 或 `bin` 而执行代码。

修改 `name` 等同于创建一个新的 Plugin。旧名称对应的 Settings 和持久化引用不会自动迁移。

### 3.1 图标

图标固定放在 Plugin 根目录：

```text
icon.png
```

推荐使用 512 × 512 PNG。当前限制为：

- 必须是有效的 PNG；
- 文件不超过 2 MiB；
- 宽和高都不超过 4096 像素。

无效或缺失的图标会回退到默认图标，不影响 Plugin 加载。

## 4. 安装、刷新与重载

手动安装一个 Plugin：

1. 将完整目录复制到 `LLM_SPACE_HOME/plugins/` 的正确层级。
2. 打开 Settings → Plugins。
3. 点击 **Refresh plugins**，重新扫描新增、删除或改名的 Plugin。
4. 选中 Plugin，检查 General 页中的兼容性、位置和 Extensions。

开发时修改现有 Plugin 文件后，点击该 Plugin 的 **Reload**。Reload 会重新读取 metadata、Settings schema 和所有 Extensions。

两者的区别是：

- **Refresh plugins**：重新扫描整个安装目录，用于发现新增、删除或改名的 Plugin。
- **Reload**：重新加载当前 Plugin，用于应用已有目录中的代码或配置改动。

LLM Space 当前不负责下载 Plugin、运行 `npm install`、更新依赖或回滚版本。Plugin 的运行时依赖必须随目录一起提供。

## 5. Settings

Plugin 的启用状态和配置保存在：

```text
LLM_SPACE_HOME/settings/plugins.json
```

文件结构如下：

```json
{
  "schemaVersion": 1,
  "plugins": {
    "@example/team-tools": {
      "enabled": true,
      "settings": {
        "endpoint": "https://api.example.com",
        "workspace": "demo"
      }
    }
  }
}
```

Plugin 第一次出现且没有对应 entry 时，等价于：

```json
{
  "enabled": true,
  "settings": {}
}
```

Settings 页面自动保存，不提供 Save 按钮。禁用或删除 Plugin 不会删除其 Settings；以后恢复同名 Plugin 时会继续使用。

如果 Settings 文件损坏且无法恢复，LLM Space 会在本次启动中禁用第三方 Plugin，但应用本身仍然可以启动。

### 5.1 用 JSON Schema 生成表单

在根目录添加 `config.schema.json` 后，Settings tab 会根据 schema 生成表单。当前适合使用：

- 嵌套 `object`；
- `string`、`number`、`integer`、`boolean`；
- `enum`；
- primitive array；
- `required`、`default`、`title`、`description`。

示例：

```json
{
  "type": "object",
  "required": ["endpoint"],
  "properties": {
    "endpoint": {
      "type": "string",
      "title": "Service endpoint",
      "description": "Base URL of the example service.",
      "default": "https://api.example.com"
    },
    "requestTimeout": {
      "type": "integer",
      "title": "Request timeout (seconds)",
      "default": 30
    },
    "mode": {
      "type": "string",
      "title": "Mode",
      "enum": ["standard", "strict"],
      "default": "standard"
    },
    "notifications": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "title": "Show notifications",
          "default": true
        }
      }
    }
  }
}
```

默认值会与用户已保存的值合并。代码扩展每次调用时得到 Settings 的只读快照。Schema 无效时，Settings 表单不可用并记录 Extension 错误，但已有配置不会被覆盖。

### 5.2 环境变量和 Settings 插值

`mcp.json` 与 `models.json` 中的字符串支持两种插值：

```json
{
  "token": "$EXAMPLE_API_TOKEN",
  "url": "${settings.endpoint}/v1",
  "label": "Workspace: ${settings.workspace}"
}
```

- 整个字符串为 `$ENV_NAME` 时，读取同名环境变量；不存在时得到空字符串。
- `${settings.key}` 读取 Plugin Settings，支持 `${settings.network.endpoint}` 这样的嵌套路径。
- Settings 值不是字符串时，会被 JSON 序列化后插入。

密码、API keys 和 tokens 应优先使用环境变量，不要直接写进 Plugin 目录或提交到版本库。

## 6. Skills

Plugin Skill 使用现有 Agent Skills 目录格式：

```text
skills/
└── release-checklist/
    ├── SKILL.md
    ├── references/
    │   └── checklist.md
    └── scripts/
        └── verify.ts
```

最小 `SKILL.md` 示例：

```md
---
name: release-checklist
description: Check a release candidate against the team's public checklist.
---

# Release checklist

1. Read `references/checklist.md`.
2. Compare every item with the supplied release notes.
3. Report missing evidence without changing external systems.
```

Plugin Skills 作为只读来源合并进有效 Skill 列表，不能从 Skills 页面移除或改写文件。用户可以在 Settings → Skills 中单独启停某个 Plugin Skill，也可以对同一 Plugin 的 Skills 批量启停；这些选择保存在 LLM Space 的 Skills 设置中，不会修改 Plugin 目录。禁用整个 Plugin 后，它们不会进入新的 Agent Run；重新启用 Plugin 时会恢复之前的单项启停状态。

## 7. MCP

`mcp.json` 可以声明一个或多个 MCP server。它们会作为只读来源补充用户在 Settings → MCP 中维护的 servers。

### 7.1 Stdio 示例

```json
{
  "servers": [
    {
      "id": "weather",
      "name": "Example Weather",
      "transport": "stdio",
      "command": "bun",
      "args": ["run", "./servers/weather.mjs"],
      "cwd": "${settings.serverDirectory}",
      "env": {
        "WEATHER_API_TOKEN": "$EXAMPLE_WEATHER_TOKEN"
      }
    }
  ]
}
```

### 7.2 Streamable HTTP 示例

```json
{
  "servers": [
    {
      "id": "knowledge-base",
      "name": "Example Knowledge Base",
      "transport": "streamableHttp",
      "url": "${settings.endpoint}/mcp",
      "headers": {
        "Authorization": "$EXAMPLE_API_TOKEN"
      }
    }
  ]
}
```

每个 server 至少需要：

- `id`：Plugin 内稳定且唯一的短 ID；
- `name`：界面显示名称；
- `transport`：`stdio`、`streamableHttp` 或 `sse`。

最终 ID 会自动加上 Plugin namespace，例如：

```text
plugin:@example/team-tools:mcp:knowledge-base
```

不要在 `mcp.json` 中手动拼接这个前缀。Plugin MCP 在设置页标记为只读；用户不能在那里改写它，应通过 Plugin Settings 或环境变量配置。禁用 Plugin 时，其 MCP 连接会关闭，新调用也会被拒绝。

Plugin 不支持直接提供 `tools/*.ts`。需要让 Agent 调用的工具应通过 MCP 暴露。

## 8. Models

`models.json` 可以声明一个或多个 provider，并复用 LLM Space 已支持的 API adapter。当前支持：

- `anthropic-messages`
- `openai-completions`
- `openai-responses`

示例：

```json
{
  "providers": [
    {
      "id": "example-cloud",
      "name": "Example Cloud",
      "api": "openai-completions",
      "baseUrl": "${settings.modelEndpoint}",
      "apiKey": "$EXAMPLE_MODEL_API_KEY",
      "models": [
        {
          "id": "example-chat-1",
          "name": "Example Chat 1",
          "api": "openai-completions",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 8192,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  ]
}
```

Plugin 只能声明配置，不能加载自定义 provider JavaScript。最终 provider ID 会被 namespace 化；用户配置与 Plugin 配置保持为两个独立来源。禁用 Plugin 后，这些模型不会再用于新的 Run。

## 9. Commands

Commands 是出现在 Command Palette 中的动态操作。每个 `commands/*.{ts,js,mjs}` 文件必须 default export 一个无参数 class。

```ts
export default class OpenDocumentationCommand {
  displayName = "Open example documentation";
  description = "Open the public documentation in the default browser.";

  async execute(context) {
    await context.openLink("https://example.com/docs");
    await context.notify("Documentation opened");
  }
}
```

文件名决定稳定 ID：

```text
commands/open-documentation.ts
→ plugin:@example/team-tools:command:open-documentation
```

每次加载 Plugin 时，每个 class 只实例化一次。实例可以持有短期内存状态，并可选实现 `dispose()`，在 Plugin 禁用、重载或应用退出时清理资源。

### 9.1 Command context

`execute(context)` 可以使用：

```ts
context.settings;
context.signal;
context.notify(message);
context.openLink(url);
context.pickFile(options);
context.readWorkspaceFile(path);
context.writeWorkspaceFile(path, content);
context.executeHostCommand(type, args);
```

目前允许调用的 LLM Space Commands 是 `openSettings` 和 `refreshTree`。其他类型会被拒绝。工作区文件方法中的路径相对于 LLM Space workspace 解析。

例如，创建一份工作区说明：

```ts
export default class CreateReadmeCommand {
  displayName = "Create example README";

  async execute(context) {
    const content = `# Example\n\nCreated by a Plugin command.\n`;
    await context.writeWorkspaceFile("examples/README.md", content);
    await context.executeHostCommand("refreshTree");
    await context.notify("README created");
  }
}
```

Commands 当前只进入 Command Palette，不会自动进入系统菜单、快捷键或右键菜单。

## 10. Thread Storages

Thread Storage 负责从外部 backend 读取一个 Thread，或把一个 Thread 写入 backend。它不是 workspace 的替代品：导入完成后，Thread 仍会保存到本地 `workspace/imported/`。

每个文件 default export 一个实现 `PluginThreadStorage` 的无参数 class：

```ts
import type {
  PluginThreadStorage,
  Thread,
  ThreadLocator,
  ThreadStorageContext,
} from "@llm-space/core";

export default class TeamLibraryStorage implements PluginThreadStorage {
  displayName = "Example Team Library";
  description = "Read and write Threads in an example service.";
  deepLinkId = "team-library";
  capabilities = { read: true, write: true };

  async resolveLatest(
    id: string,
    context: ThreadStorageContext
  ): Promise<ThreadLocator> {
    const endpoint = String(context.settings.endpoint ?? "");
    const response = await fetch(
      `${endpoint}/threads/${encodeURIComponent(id)}`
    );
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    const data = await response.json();
    return { id, version: data.version, filename: data.filename };
  }

  async read(
    locator: ThreadLocator,
    context: ThreadStorageContext
  ): Promise<Thread> {
    const endpoint = String(context.settings.endpoint ?? "");
    const response = await fetch(
      `${endpoint}/threads/${encodeURIComponent(locator.id)}/content`
    );
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return (await response.json()) as Thread;
  }

  async write(
    thread: Thread,
    id: string | undefined,
    context: ThreadStorageContext
  ): Promise<ThreadLocator> {
    const endpoint = String(context.settings.endpoint ?? "");
    const response = await fetch(
      id
        ? `${endpoint}/threads/${encodeURIComponent(id)}`
        : `${endpoint}/threads`,
      {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thread),
      }
    );
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return (await response.json()) as ThreadLocator;
  }
}
```

> 上例中的 `example.com` 数据格式只是演示。真实 Storage 必须自行校验远端响应，再转换为合法的 LLM Space `Thread`。

### 10.1 能力声明

Storage 用 `capabilities` 声明能力：

| 能力                           | 必须实现的方法              | 出现位置     |
| ------------------------------ | --------------------------- | ------------ |
| `{ read: true, write: false }` | `resolveLatest()`、`read()` | Import from… |
| `{ read: false, write: true }` | `write()`                   | Save to…     |
| `{ read: true, write: true }`  | 三个方法                    | 两处都会出现 |

`resolveLatest()` 把 backend 自己定义的 opaque resource ID 解析为 `ThreadLocator`。`filename` 和 `version` 都是可选的；调用者应把 locator 当成不透明地址，不要自行重建。

### 10.2 Deep Link 注册

可读 Storage 可以声明 `deepLinkId`：

```ts
deepLinkId = "team-library";
```

生产版本对应：

```text
llm-space://threads/team-library/project/alpha?revision=latest
```

开发版本对应：

```text
llm-space-dev://threads/team-library/project/alpha?revision=latest
```

LLM Space 使用 `threads` 和 `deepLinkId` 选择对应的 Storage。`team-library/` 之后的完整后缀由该 Storage 解释，因此 resource ID 可以包含多段路径和 query。`deepLinkId` 必须在所有已启用 Storage 中唯一，并且只能包含小写字母、数字、点、下划线或连字符。

Plugin Storage deep link 的作用是导入本地 workspace。它不会自动获得 Web Viewer、公开分享页面或 shared route 能力。

## 11. 运行模型与生命周期

声明式扩展和代码扩展具有不同的运行行为：

| 类型            | 运行行为                          |
| --------------- | --------------------------------- |
| Skills          | 加入可用 Skills 列表              |
| MCP             | 按 `mcp.json` 建立和管理连接      |
| Models          | 加入可用 providers 和 models 列表 |
| Commands        | 在 Bun 环境中加载和执行           |
| Thread Storages | 在 Bun 环境中加载和执行           |

加载时，LLM Space 会逐个 import 文件、调用无参数 constructor 并检查 contract。一个文件 import 失败、constructor 抛错或 contract 不合法，只会禁用对应 Extension，不影响其他 Plugin 和应用启动。

生命周期行为：

- **发现**：检查路径、metadata、版本兼容性和扩展文件。
- **启用**：注册 Extensions，并按需启动 MCP 和代码扩展。
- **Settings 变更**：保存配置并重载 Plugin。
- **Reload**：关闭已有连接和实例，重新发现并激活。
- **Disable**：阻止新调用、移除 Extensions，并关闭相关资源。
- **Shutdown**：尽力调用实例的 `dispose()` 并关闭相关资源。

## 12. ID、只读来源与冲突

扩展的稳定 ID 从 Plugin ID 和文件名或局部 ID 派生。例如：

```text
plugin:@example/team-tools:mcp:knowledge-base
plugin:@example/team-tools:model-provider:example-cloud
plugin:@example/team-tools:command:open-documentation
plugin:@example/team-tools:thread-storage:team-library
```

显示名称可以重复，canonical ID 不可以重复。发生冲突时，不使用“先加载者优先”或“后加载者覆盖”；冲突项不会激活，并在 Plugin 详情中显示 Extension 错误。

Plugin 的声明式贡献与用户配置分层保存：

- Plugin 整体启停不会改写用户的 MCP 或 Models 配置。Plugin Skill 的单项可见性作为用户覆盖项保存在 `skills.json` 中，但不会改写 Plugin 文件。
- Plugin 来源在相应设置页中是只读的。
- 想修改 Plugin 来源，应编辑 Plugin 文件或 Plugin Settings，然后 Reload。

## 13. 信任与安全

LLM Space 当前没有 Plugin trust 或权限授权界面。安装并启用一个本地 Plugin，意味着完全信任它。

特别注意：

- Plugin 运行环境提供故障隔离，但不是 OS sandbox。
- Plugin 代码可以直接使用 Bun/Node API，访问当前用户有权访问的文件、网络、环境变量和进程能力。
- Plugin 可以携带并加载自己的依赖；LLM Space 不审核依赖供应链。
- `context` 提供的 API 并不限制 Plugin 自己调用系统 API。
- 不应安装来源不明的 Plugin，也不应仅因为它能被禁用就认为它是安全的。

Plugin 作者应遵循：

- Secrets 使用环境变量，不写入源码、日志或示例配置。
- 对远端 JSON、文件内容和 deep-link resource ID 做运行时校验。
- 网络请求设置合理的超时并响应取消信号。
- 不在错误消息中包含 credentials、headers、完整 prompt 或 tool payload。
- `dispose()` 中关闭长连接、定时器和临时资源。
- Plugin 目录不使用 symlink，也不依赖安装目录外的相对路径。

## 14. 状态、错误与日志

Plugin 状态包括：

| 状态           | 含义                                   |
| -------------- | -------------------------------------- |
| `active`       | Plugin 已启用，Extensions 正常激活     |
| `degraded`     | Plugin 可用，但至少一个 Extension 失败 |
| `error`        | Plugin 无法正常激活                    |
| `incompatible` | 当前 LLM Space 版本不满足 `engines`    |
| `disabled`     | 用户已禁用 Plugin                      |

界面只显示安全摘要、`error-id` 和日志路径；完整错误链、stack 和经过截断与清理的输出写入：

```text
LLM_SPACE_HOME/logs/plugins/<encoded-plugin-name>/<timestamp>-<stage>-<error-id>.log
```

还没有合法 Plugin ID 的发现错误写入：

```text
LLM_SPACE_HOME/logs/plugins/_invalid/<timestamp>-discovery-<error-id>.log
```

在 Settings → Plugins 中可以 Reveal log 或复制日志路径。

如果怀疑某个 Plugin 阻止正常启动，可以临时使用：

```sh
LLM_SPACE_DISABLE_PLUGINS=1 mise run dev
```

这会在该次启动中跳过所有第三方 Plugin，便于检查或修复安装目录与 Settings。

## 15. 从零创建一个最小 Plugin

下面创建一个只提供 Command 的示例 Plugin。

目录：

```text
plugins/hello-space/
├── package.json
└── commands/
    └── hello.ts
```

`package.json`：

```json
{
  "name": "hello-space",
  "version": "1.0.0",
  "displayName": "Hello Space",
  "description": "A minimal LLM Space Plugin example.",
  "engines": {
    "llm-space": ">=4.7.1"
  }
}
```

`commands/hello.ts`：

```ts
export default class HelloCommand {
  displayName = "Say hello";
  description = "Show a local notification.";

  async execute(context) {
    const audience = String(context.settings.audience ?? "LLM Space");
    await context.notify(`Hello, ${audience}!`);
  }
}
```

复制完成后点击 **Refresh plugins**。在 Plugin 详情的 General tab 中应看到一个 Command Extension；打开 Command Palette 后应出现 **Say hello**。

如果再添加 `config.schema.json`：

```json
{
  "type": "object",
  "properties": {
    "audience": {
      "type": "string",
      "title": "Audience",
      "default": "LLM Space"
    }
  }
}
```

Settings tab 会出现 Audience 输入框，修改后自动保存并重载 Plugin。

## 16. 开发检查清单

发布或分发 Plugin 前，建议至少检查：

- `package.json.name` 与安装目录完全一致。
- `version` 是合法 SemVer，`engines["llm-space"]` 覆盖实际测试版本。
- `icon.png` 满足格式和大小限制。
- Extension 文件位于直接子目录，没有依赖递归扫描。
- Plugin 所需依赖已经随目录提供。
- Settings schema 能接受默认值和用户可能保存的旧值。
- Secrets 均来自环境变量。
- MCP 的 stdio command、cwd 和远端 URL 在干净环境中可用。
- Models 使用受支持的 API adapter，模型字段完整。
- Command 和 Thread Storage 的 constructor 不需要参数。
- 可读 Storage 返回合法 `Thread`，可写 Storage 返回合法 `ThreadLocator`。
- Deep link 使用唯一且稳定的 `deepLinkId`，并对任意后缀做校验。
- 单个 Extension 故障不会让其他 Extensions 无法使用。
- Reload、Disable、Enable 和应用退出都会正确清理资源。
- 日志中不包含 secrets、完整 prompt 或敏感 tool payload。

## 17. 当前不支持的能力

当前 Plugin 体系不包括：

- Hooks（before/after agent、turn、model 等）；
- `tools/*.ts` 形式的 Tool 扩展；
- Marketplace；
- 自动安装、更新、依赖安装与回滚；
- 项目级 Plugin；
- Remote Runtime Plugin；
- Plugin 权限声明或 trust 审核；
- 除 Plugin Skills 外的 Extension 级别独立启停；
- Plugin 自定义设置页面或其他自定义 UI；
- Plugin Thread Storage 自动接入 Web Viewer 或公开分享系统。

这些边界可以让当前实现保持可发现、可诊断和可安全降级。后续版本可能在保持兼容性的前提下继续扩展 Plugin 能力。
