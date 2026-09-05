[English](./plugins.md) | 中文

---

# Plugin 开发指南

LLM Space Plugin 是安装在本机 `LLM_SPACE_HOME/plugins/` 下的 npm-compatible package。一个 Plugin 可以包含零个或多个扩展（Extensions），为 LLM Space 补充 Skills、MCP servers、模型、Tools、命令和 Thread Storages。

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
    ├── Plugin Tool
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
| `tools/*.{ts,js,mjs}`           | 可执行 Plugin Tools       |
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
├── tools/
│   └── project-info.ts
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

### 2.3 Plugin 持久化数据

Plugin **必须**将下载文件、缓存、索引、数据库以及其他运行时生成的数据放在
Plugin 安装目录之外的以下位置：

```text
~/.llm-space/data/plugins/<plugin-name>/
```

Scoped Plugin 对应的路径是
`~/.llm-space/data/plugins/@scope/<plugin-name>/`。代码必须支持
`LLM_SPACE_HOME`，不要写死 `~/.llm-space`：

```ts
const home = process.env.LLM_SPACE_HOME?.trim()
  || path.join(os.homedir(), ".llm-space");
const dataDirectory = path.join(
  home,
  "data",
  "plugins",
  ...pluginName.split("/"),
);
```

ZIP 安装器会在更新时整体替换 Plugin 安装目录。因此，任何写在
`LLM_SPACE_HOME/plugins/<name>/` 下的运行时数据都可能被覆盖或删除；外部的
`data/plugins/<name>/` 不参与包替换，在安装、更新、Reload 和禁用操作中会保持
不变。不要把运行时数据打进 Plugin ZIP。

### 2.4 Settings 中的 Extensions

Settings → Plugins 会按类型分组展示已发现的 Extensions，并显示类型图标、数量、
启用状态和加载诊断。选中 Extension 可以定位其来源文件或目录。建议为扩展提供简洁
描述，让用户在启用或执行前就能理解其用途：

| Extension | 描述来源 |
| --- | --- |
| Skill | `SKILL.md` frontmatter 中的 `description` |
| Settings | `config.schema.json` 顶层的 `description` |
| Command | class 的 `description` 属性 |
| Plugin Tool | class 的 `description` 属性 |
| Thread Storage | class 的 `description` 属性 |
| MCP server / Model provider | server 或 provider 的 `name` |

描述只是界面文案，不是标识符。稳定 ID 仍由 Plugin 包名及声明扩展的文件名或对象
ID 决定。

### 2.4 内置默认 Plugin

LLM Space 自带一个默认 Plugin——Memory 插件（`@llm-space/memory`），通过
`memory_save`、`memory_search`、`memory_forget` 三个 Plugin Tools 和一个
`memory` Skill，让 Agent 拥有跨项目的持久记忆。

桌面应用启动时会在发现插件之前，把该插件写入
`<home>/plugins/@llm-space/memory/`（仅当该目录不存在时）。种子写入只发生
一次，且永远不会覆盖：如果你删除、替换或修改了这个插件，将保留你的版本。
Agent 的记忆保存在
`LLM_SPACE_HOME/data/plugins/@llm-space/memory/memories.jsonl`，该文件在
插件更新后依然保留，并被所有工作区共享，因此记忆天然是跨项目的。

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

### 4.1 打包 Plugin ZIP

安装器接受以下两种压缩包结构：

```text
weather-kit-1.2.3.zip          weather-kit-1.2.3.zip
├── package.json               └── weather-kit/
├── tools/                         ├── package.json
└── ...                            ├── tools/
                                   └── ...
```

也就是说，`package.json` 可以直接位于 ZIP 根目录，也可以放在唯一的一层包装目录
中。真正决定安装目录的是 `package.json.name`，ZIP 文件名和包装目录名都不参与
Plugin 身份判断。

在 Plugin 根目录执行下面的命令即可制作发布包：

```sh
zip -r ../weather-kit-1.2.3.zip . \
  -x "data/*" ".git/*" ".DS_Store" "__MACOSX/*"
```

ZIP 应输出到 Plugin 根目录之外，避免把压缩包自身再次打进去。不要发布 `data/`；
当前安装实例的数据应写入 `LLM_SPACE_HOME/data/plugins/<plugin-name>/`。Plugin
使用的所有扩展源码、资源文件和运行时依赖都必须包含在发布包中；LLM Space 解压
后不会再运行包管理器安装依赖。

当前限制为：ZIP 压缩后不超过 50 MiB，解压后不超过 200 MiB，文件条目不超过
10,000 个。绝对路径、`..` 路径穿越、反斜杠路径以及包含多个 package 根目录的
压缩包会被拒绝；常见的 macOS metadata 会被忽略。

### 4.2 拖拽 ZIP 安装或更新

1. 启动 LLM Space，将一个或多个 `.zip` 文件拖到主窗口上。
2. 看到 **Drop plugin ZIP to install** 提示后松开文件。
3. 安装成功后，点击通知中的 **View plugin**，或者打开 Settings → Plugins 查看。

成功通知会显示 Plugin ID 和安装版本。若 ZIP 的 `package.json.name` 与已安装
Plugin 相同，安装器会替换该 Plugin 的包文件并重新加载，但不会修改
`LLM_SPACE_HOME/data/plugins/<plugin-name>/` 下的数据。不同的包名会安装为另一个
Plugin；修改 `name` 不属于升级，也不会自动迁移旧 Plugin 的数据。

### 4.3 手动安装

手动安装一个已经解压的 Plugin：

1. 将完整目录复制到 `LLM_SPACE_HOME/plugins/` 的正确层级。
2. 打开 Settings → Plugins。
3. 点击 **Refresh plugins**，重新扫描新增、删除或改名的 Plugin。
4. 选中 Plugin，检查 General 页中的兼容性、位置和 Extensions。

### 4.4 Refresh 与 Reload

开发时修改现有 Plugin 文件后，点击该 Plugin 的 **Reload**。Reload 会重新读取 metadata、Settings schema 和所有 Extensions。

两者的区别是：

- **Refresh plugins**：重新扫描整个安装目录，用于发现新增、删除或改名的 Plugin。
- **Reload**：重新加载当前 Plugin，用于应用已有目录中的代码或配置改动。

LLM Space 不会从 registry 拉取 Plugin，不会运行 `npm install`、解析依赖、比较版本
高低或自动回滚。Plugin 的运行时依赖必须随 ZIP 或目录一起提供。

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

MCP 页面会标明所属 Plugin，并显示连接信息、就绪状态、已发现的 Tool 数量及名称。
LLM Space 会缓存成功的就绪检查和 Tool 发现结果，避免每次刷新界面都重新连接。
Plugin 配置变化后，旧快照会被标记为 stale；下一次连接测试或 Tool 发现会向 server
重新获取结果。

Plugin 可以通过 `tools/*.{ts,js,mjs}` 提供本地可执行 Tools，也可以通过 MCP 暴露远程或共享工具。

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

## 9. Plugin Tools

Plugin Tool 是模型可以在本地 Thread 中调用的 PI 兼容工具。适合用来实现可重复、
参数化的操作；如果某项操作应由用户在 Command Palette 中明确发起，则使用 Command。
每个直接位于 `tools/*.{ts,js,mjs}` 下的文件必须 default export 一个无参数 class。
开发 Plugin 时可以实现可选的类型契约，以便尽早发现定义错误：

```ts
import type {
  PluginToolContext,
  PluginToolExtension,
} from "@llm-space/core";

export default class ReadProjectFileTool implements PluginToolExtension {
  name = "read_project_file";
  description = "Read a UTF-8 file from the LLM Space workspace.";
  parameters = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Workspace-relative path, for example docs/plan.md.",
      },
      maxChars: {
        type: "integer",
        minimum: 1,
        maximum: 50000,
        default: 12000,
      },
    },
    required: ["path"],
    additionalProperties: false,
  } as const;
  strict = true;

  async execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ) {
    const path = String(args.path ?? "");
    const requestedMaxChars = Number(args.maxChars ?? 12000);
    if (!path) throw new Error("path is required.");
    if (!Number.isInteger(requestedMaxChars) || requestedMaxChars < 1) {
      throw new Error("maxChars must be a positive integer.");
    }
    const maxChars = Math.min(requestedMaxChars, 50000);

    const content = await context.readWorkspaceFile(path);
    return {
      path,
      content: content.slice(0, maxChars),
      truncated: content.length > maxChars,
    };
  }
}
```

`name` 是模型看到的 Tool 名称，应保持稳定、语义明确并使用 snake_case；
`description` 说明何时应该调用它；`parameters` 是输入 JSON Schema。建议同时声明
`required` 和 `additionalProperties: false`，并在 `execute()` 内再次校验业务约束。
`strict` 会请求支持该能力的模型 provider 严格遵循 Schema。

文件名则独立决定持久化到 Thread 的稳定 Extension ID：

```text
tools/read-project-file.ts
→ plugin:@example/team-tools:tool:read-project-file
```

修改包名、文件名或模型侧的 `name` 都可能破坏已保存 Thread 或 Prompt 中的引用。
禁用或删除 Plugin 不会从已保存 Thread 中删除 Tool；Plugin 恢复前，调用会明确返回
unavailable 错误。

### 9.1 Tool context 与已解析 variables

`execute(context, args)` 得到产生本次 Tool Call 的 owning Thread，而不是 UI 当前
选中的 Tab。主要能力如下：

```ts
context.settings; // 只读 Plugin Settings 快照
context.signal; // 可选 AbortSignal
context.thread; // 独立、深度冻结的 owning Thread
context.variables; // 已解析的 Prompt Variables
context.notify(message);
context.openLink(url);
context.pickFile(options);
context.readWorkspaceFile(path);
context.writeWorkspaceFile(path, content);
context.executeHostCommand(type, args);
context.createResult(content);
```

Thread 快照不包含 filename、Tab API 或写入方法，不能直接修改。同一批并行 Tool
Calls 共享同一份 Thread 与已解析 variables 快照。

`context.variables` 在调用开始时解析所有已配置变量：

| Variable 类型 | 解析结果 |
| --- | --- |
| Custom、working directory、current date | 字符串 |
| Skills | 按变量配置格式生成的字符串 |
| File | UTF-8 文件内容 |
| JSON | 解析后的 JSON 值 |

空值或无法解析的变量会被省略。原始定义仍在
`context.thread.context.variables`，custom variant 数据仍在
`context.thread.context.variableVariants`。

例如，Tool 可以组合 Settings、已解析 variables 和调用参数，而不依赖当前 UI Tab：

```ts
async execute(context: PluginToolContext, args: Record<string, unknown>) {
  return {
    project: context.settings.project ?? null,
    cwd: context.variables.current_working_directory ?? null,
    query: typeof args.query === "string" ? args.query : null,
    owningThreadTitle: context.thread.title,
  };
}
```

### 9.2 返回值、富内容与错误

普通结果直接返回 JSON 兼容值，LLM Space 会将其序列化为模型可见的 Tool output。
需要明确组合 text 和 image 内容时，使用 `createResult()`：

```ts
return context.createResult([
  { type: "text", text: "Rendered architecture diagram." },
  {
    type: "image",
    data: pngBytesAsBase64,
    mimeType: "image/png",
  },
]);
```

参数无效或操作失败时抛出 `Error`，错误信息应可操作且不能包含 secret。每次 Plugin
加载时 Tool class 只实例化一次，因此多个调用可能进入同一个实例。把单次调用状态放在
`execute()` 的局部变量中，并确保共享 cache 可以安全并发。如果实例拥有 process、
timer 或 connection，可在 `dispose()` 中释放：

```ts
async dispose() {
  await this.client?.close();
}
```

Plugin Tools 只支持本地 Runtime：remote Thread 不会列出本地 Plugin Tools，不能在
remote Runtime 执行，也暂时不能导出到 LangGraph。MCP Tools 使用 MCP server 自己
的 transport 和 Schema，不使用上述 class API；已有独立或共享 MCP server 时，应在
`mcp.json` 中声明。

## 10. Commands

Command 是由用户从 Command Palette 主动触发的操作。每个直接位于
`commands/*.{ts,js,mjs}` 下的文件必须 default export 一个无参数 class：

```ts
import type {
  PluginCommandContext,
  PluginCommandExtension,
} from "@llm-space/core";

export default class OpenDocumentationCommand
  implements PluginCommandExtension
{
  displayName = "Open example documentation";
  description = "Open the public documentation in the default browser.";

  async execute(context: PluginCommandContext) {
    await context.openLink("https://example.com/docs");
    return context.createResult({
      level: "success",
      message: "Documentation opened.",
    });
  }
}
```

文件名决定稳定 ID 和文件名别名：

```text
commands/open-documentation.ts
→ plugin:@example/team-tools:command:open-documentation
→ palette alias: open-documentation
```

每次加载 Plugin 时，class 只实例化一次。实例可以持有短期且并发安全的内存状态，
也可以实现 `dispose()`，在 Plugin 禁用、重载或应用退出时释放资源。

下文的进度和终态结果 API 要求 LLM Space 4.9.0 或更高版本。使用它们时应声明兼容
范围：

```json
{
  "engines": {
    "llm-space": ">=4.9.0"
  }
}
```

### 10.1 Command context

`execute(context, arguments)` 可以使用通用 host 能力，以及本次调用的参数、活跃
Tab 快照和反馈 API：

```ts
context.settings;
context.signal;
context.notify(message);
context.openLink(url);
context.pickFile(options);
context.readWorkspaceFile(path);
context.writeWorkspaceFile(path, content);
context.executeHostCommand(type, args);
context.arguments;
context.activeTab?.filename;
context.activeTab?.thread;
await context.activeTab?.writeThread(thread);
await context.report({ phase: "loading", message: "Loading records…" });
return context.createResult({ level: "success", message: "Import complete." });
```

工作区文件路径相对于 LLM Space workspace 解析。目前允许调用的 host Commands 是
`openSettings` 和 `refreshTree`，其他类型会被拒绝。

### 10.2 Palette 参数

用户可以在完整显示名或文件名别名后追加 shell 风格参数。以下两行都会调用
`commands/sync-active-thread.ts`：

```text
Sync active thread production "Release 4.9" --dry-run
sync-active-thread production 'Release 4.9' --dry-run
```

Command 收到的数组为：

```ts
["production", "Release 4.9", "--dry-run"]
```

同一份冻结数组会同时出现在 `context.arguments` 和可选的第二个 `execute()` 参数中。
单引号和双引号负责组合空格；反斜杠会转义下一个字符，单引号内部除外。未闭合引号或
末尾反斜杠会直接在 Palette 中报错，不会执行不完整的 Command。

应主动校验参数，并为预期中的用户输入错误返回受控结果：

```ts
async execute(context: PluginCommandContext, args: readonly string[]) {
  const [environment, ...flags] = args;
  if (!environment) {
    return context.createResult({
      level: "warning",
      message: "Usage: sync-active-thread <environment> [--dry-run]",
    });
  }

  const dryRun = flags.includes("--dry-run");
  await context.report({
    phase: "validated",
    message: dryRun ? "Validated dry-run arguments." : "Arguments validated.",
  });
  // Continue with validated values…
}
```

### 10.3 读取并事务化更新活跃 Thread

`context.activeTab` 是 Command 开始执行时活跃的 Thread Tab；当前活跃 Tab 不是
Thread 时为 `null`。其中的 `thread` 是完整 `Thread` 的独立快照，包括模型、
Prompt Variables、消息、Tools、Run History 和 Evaluations。

`activeTab.writeThread(nextThread)` 暂存一次完整 Thread 替换，不会立即修改 UI。
只有 Command 成功、同一个 Tab 仍然活跃且 Pane 没有进行中的 Run 或持久化操作时，
LLM Space 才会校验和提交它。修改前始终先 clone 快照：

```ts
import type { PluginCommandContext, Thread } from "@llm-space/core";

async function prefixActiveTitle(
  context: PluginCommandContext,
  prefix: string
) {
  if (!context.activeTab) {
    return context.createResult({
      level: "warning",
      message: "Open a Thread before running this command.",
    });
  }

  const nextThread = structuredClone(context.activeTab.thread) as Thread;
  nextThread.title = `${prefix}: ${nextThread.title}`;
  await context.activeTab.writeThread(nextThread);
  return context.createResult({
    level: "success",
    message: `Updated ${context.activeTab.filename}.`,
  });
}
```

只会提交最后一次暂存的替换。受控 `error` 结果、异常或 host 侧的提交冲突都会丢弃
暂存内容。

### 10.4 进度与终态反馈

Command 启动时，LLM Space 会创建一条持久反馈。在较长操作中使用 `report()` 更新
同一条反馈：

```ts
await context.report({ phase: "reading", message: "Reading local metadata…" });
await context.report({ phase: "uploading", message: "Uploading 3 records…" });
await context.report({ phase: "refreshing" });
```

`phase` 必须是非空且稳定的 Command 自定义标识符；`message` 是可选的用户可见文案。
Report 只属于当前调用，并会在 `execute()` 结束前到达 UI。

普通 JSON 返回值可供 host 使用，但不会显示。需要自定义终态文案时，返回
`createResult()` 创建的不透明值：

```ts
return context.createResult({
  level: "success", // "success" | "warning" | "error"
  message: "Synced 6 records.",
});
```

| 结束方式 | 用户反馈 | 暂存的 Thread 写入 |
| --- | --- | --- |
| 返回 `success` | success 样式和自定义文案 | 条件仍安全时提交 |
| 返回 `warning` | warning 样式和自定义文案 | 条件仍安全时提交 |
| 返回 `error` | 受控失败和自定义文案 | 丢弃 |
| 返回 JSON 或 `void` | 默认完成文案 | 条件仍安全时提交 |
| 抛出 `Error` | 非预期失败文案 | 丢弃 |

对预期且可操作的结果使用 `warning` 或 `error`；网络协议损坏等非预期失败应抛出
异常。Report、result 和 error 中都不能包含凭据。

### 10.5 完整示例：同步并更新 Thread

下面的示例组合了 Settings、参数、进度、网络访问、暂存 Thread 更新和终态结果：

```ts
import type {
  PluginCommandContext,
  PluginCommandExtension,
  Thread,
} from "@llm-space/core";

export default class SyncActiveThreadCommand
  implements PluginCommandExtension
{
  displayName = "Sync active thread";
  description = "Fetch the canonical title and apply it to the active Thread.";

  async execute(context: PluginCommandContext, args: readonly string[]) {
    const [environment = "production"] = args;
    const endpoint = String(context.settings.endpoint ?? "").replace(/\/$/, "");

    if (!endpoint) {
      return context.createResult({
        level: "warning",
        message: "Configure endpoint in Plugin Settings first.",
      });
    }
    if (!context.activeTab) {
      return context.createResult({
        level: "warning",
        message: "Open a Thread before running this command.",
      });
    }

    await context.report({
      phase: "fetching",
      message: `Fetching ${environment} metadata…`,
    });

    const response = await fetch(
      `${endpoint}/threads/${encodeURIComponent(context.activeTab.filename)}`
    );
    if (!response.ok) {
      throw new Error(`Metadata request failed (${response.status}).`);
    }

    const payload = (await response.json()) as { title?: unknown };
    if (typeof payload.title !== "string" || !payload.title.trim()) {
      return context.createResult({
        level: "error",
        message: "The server response did not contain a valid title.",
      });
    }

    await context.report({ phase: "updating", message: "Updating the Thread…" });
    const nextThread = structuredClone(context.activeTab.thread) as Thread;
    nextThread.title = payload.title.trim();
    await context.activeTab.writeThread(nextThread);

    return context.createResult({
      level: "success",
      message: `Updated ${context.activeTab.filename}.`,
    });
  }
}
```

修改工作区文件时，应明确写入文件并刷新文件树：

```ts
await context.writeWorkspaceFile(
  "examples/README.md",
  "# Example\n\nCreated by a Plugin Command.\n"
);
await context.executeHostCommand("refreshTree");
return context.createResult({ level: "success", message: "README created." });
```

同一个 Plugin Command 同时只能有一个调用；不同 Commands 可以并发。Plugin
Commands 当前只进入 Command Palette，不会自动获得系统菜单项、快捷键或右键菜单项。

## 11. Thread Storages

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

### 11.1 能力声明

Storage 用 `capabilities` 声明能力：

| 能力                           | 必须实现的方法              | 出现位置     |
| ------------------------------ | --------------------------- | ------------ |
| `{ read: true, write: false }` | `resolveLatest()`、`read()` | Import from… |
| `{ read: false, write: true }` | `write()`                   | Save to…     |
| `{ read: true, write: true }`  | 三个方法                    | 两处都会出现 |

`resolveLatest()` 把 backend 自己定义的 opaque resource ID 解析为 `ThreadLocator`。`filename` 和 `version` 都是可选的；调用者应把 locator 当成不透明地址，不要自行重建。

### 11.2 Deep Link 注册

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

## 12. 运行模型与生命周期

声明式扩展和代码扩展具有不同的运行行为：

| 类型            | 运行行为                          |
| --------------- | --------------------------------- |
| Skills          | 加入可用 Skills 列表              |
| MCP             | 按 `mcp.json` 建立和管理连接      |
| Models          | 加入可用 providers 和 models 列表 |
| Commands        | 在 Bun 环境中加载和执行           |
| Plugin Tools    | 在 Bun 中加载，由本地 Agent Runtime 调用 |
| Thread Storages | 在 Bun 环境中加载和执行           |

加载时，LLM Space 会逐个 import 文件、调用无参数 constructor 并检查 contract。一个文件 import 失败、constructor 抛错或 contract 不合法，只会禁用对应 Extension，不影响其他 Plugin 和应用启动。

生命周期行为：

- **发现**：检查路径、metadata、版本兼容性和扩展文件。
- **启用**：注册 Extensions，并按需启动 MCP 和代码扩展。
- **Settings 变更**：保存配置并重载 Plugin。
- **Reload**：关闭已有连接和实例，重新发现并激活。
- **Disable**：阻止新调用、移除 Extensions，并关闭相关资源。
- **Shutdown**：尽力调用实例的 `dispose()` 并关闭相关资源。

## 13. ID、只读来源与冲突

扩展的稳定 ID 从 Plugin ID 和文件名或局部 ID 派生。例如：

```text
plugin:@example/team-tools:mcp:knowledge-base
plugin:@example/team-tools:model-provider:example-cloud
plugin:@example/team-tools:command:open-documentation
plugin:@example/team-tools:tool:read-project-file
plugin:@example/team-tools:thread-storage:team-library
```

显示名称可以重复，canonical ID 不可以重复。发生冲突时，不使用“先加载者优先”或“后加载者覆盖”；冲突项不会激活，并在 Plugin 详情中显示 Extension 错误。

Plugin 的声明式贡献与用户配置分层保存：

- Plugin 整体启停不会改写用户的 MCP 或 Models 配置。Plugin Skill 的单项可见性作为用户覆盖项保存在 `skills.json` 中，但不会改写 Plugin 文件。
- Plugin 来源在相应设置页中是只读的。
- 想修改 Plugin 来源，应编辑 Plugin 文件或 Plugin Settings，然后 Reload。

## 14. 信任与安全

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

## 15. 状态、错误与日志

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

## 16. 从零创建一个最小 Plugin

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
    "llm-space": ">=4.9.0"
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
    return context.createResult({
      level: "success",
      message: `Hello, ${audience}!`,
    });
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

### 16.1 完整 Plugin 示例：Atlas

需要一个可以直接复制、并组合全部 Extension 点的示例时，请查看
[Atlas Plugin](../examples/atlas-plugin/README.zh-CN.md)。它包含两个 Skills、两个
MCP servers 及四个 MCP Tools、两个 Model providers 及四个 Models、两个本地
Plugin Tools、两个 Commands 和两个 Thread Storages。Settings 是唯一的单例
Extension 点，因此 Atlas 使用一个包含七项字段的 Schema 来展示它。

该示例还包含两个可运行的 stdio MCP servers、类型化 TypeScript contracts、中英文
文档和安装说明。测试前需要把它复制为真实目录而不是 symlink，使用 Bun 安装内置
server 依赖，并在 Settings 中填写 MCP server directory 的绝对路径。

## 17. 开发检查清单

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
- Command、Plugin Tool 和 Thread Storage 的 constructor 都不需要参数。
- 每个 Plugin Tool 都有稳定的 snake_case `name`、准确描述、严格的参数 Schema，
  并返回 JSON 兼容值或显式富内容。
- Command 会校验 Palette 参数，为耗时操作通过 `report()` 报告有意义的阶段，并在
  需要自定义文案时返回明确的终态结果。
- Command 的受控失败和异常都不会提交暂存的 Thread 写入。
- 并行 Tool calls 和不同 Commands 的并发调用不会破坏实例共享状态。
- 可读 Storage 返回合法 `Thread`，可写 Storage 返回合法 `ThreadLocator`。
- Deep link 使用唯一且稳定的 `deepLinkId`，并对任意后缀做校验。
- 单个 Extension 故障不会让其他 Extensions 无法使用。
- Reload、Disable、Enable 和应用退出都会正确清理资源。
- 日志中不包含 secrets、完整 prompt 或敏感 tool payload。

## 18. 当前不支持的能力

当前 Plugin 体系不包括：

- Hooks（before/after agent、turn、model 等）；
- Marketplace；
- 自动安装、更新、依赖安装与回滚；
- 项目级 Plugin；
- Remote Runtime Plugin；
- Plugin 权限声明或 trust 审核；
- 除 Plugin Skills 外的 Extension 级别独立启停；
- Plugin 自定义设置页面或其他自定义 UI；
- Plugin Thread Storage 自动接入 Web Viewer 或公开分享系统。

这些边界可以让当前实现保持可发现、可诊断和可安全降级。后续版本可能在保持兼容性的前提下继续扩展 Plugin 能力。
