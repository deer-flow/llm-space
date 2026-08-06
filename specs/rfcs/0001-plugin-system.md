# RFC 0001: LLM Space Plugin System

> 状态：Draft
>
> 创建日期：2026-08-04

本文记录插件系统的当前唯一设计。`Draft` 表示尚未正式接受，不表示保留多个候选方案。

## 1. 总体设计

插件是位于 `LLM_SPACE_HOME/plugins/` 下的 npm-compatible package，可贡献 Skills、MCP、Models、Commands、Thread Storages 和 Settings。

- `package.json` 是唯一 metadata，`name` 是 Plugin ID。
- 扩展通过固定路径发现，不在 metadata 中声明。
- 新插件默认启用且默认受信任，不设 trust 机制。
- `settings/plugins.json` 只保存 `enabled` 和 settings KV。
- Tool 代码只通过 MCP 提供，不直接加载 `tools/*.ts`。
- Command 在每插件独立 Bun 子进程中运行。
- Thread Storage 在同一个插件子进程中运行。
- 插件不能修改宿主常量或取得宿主内部对象。
- 单插件或扩展故障不得影响应用及其他插件启动。
- 详细错误只写日志；UI 只显示安全摘要和日志路径。
- 只支持本机 `LLM_SPACE_HOME`，不支持 Remote Runtime 或项目级插件。
- LLM Space 不负责插件安装、更新和依赖安装；用户直接复制或删除目录。

## 2. 目录与发现

```text
LLM_SPACE_HOME/plugins/
├── simple-plugin/
│   ├── package.json
│   ├── icon.png
│   ├── config.schema.json
│   ├── mcp.json
│   ├── models.json
│   ├── skills/<skill-name>/SKILL.md
│   ├── commands/*.{ts,js,mjs}
│   └── thread-storages/*.{ts,js,mjs}
└── @vendor/
    └── github/
        └── package.json
```

发现入口只有：

- 普通包：`plugins/<name>/package.json`；
- Scoped 包：`plugins/@<scope>/<name>/package.json`。

发现器只扫描普通包一层、Scoped 包两层，不继续递归，也不扫描 `node_modules`。`@<scope>` 目录本身不是插件。

`package.json.name` 必须符合 npm 命名规则，并与目录表达的完整包名一致。插件按完整包名排序加载。缺失或无效的 `package.json`、名称不匹配、symlink 和路径逃逸只使对应候选项无效。

有效插件按固定路径发现扩展：

| 路径                            | 能力                     |
| ------------------------------- | ------------------------ |
| `skills/*/SKILL.md`             | Skills                   |
| `mcp.json`                      | MCP servers/tools        |
| `models.json`                   | Providers/models         |
| `commands/*.{ts,js,mjs}`        | Command Palette Commands |
| `thread-storages/*.{ts,js,mjs}` | Thread Storages          |
| `config.schema.json`            | Settings schema/UI       |

除 Skills 自身目录外，扩展扫描不递归。缺少某个路径表示插件不提供该扩展。

## 3. Package Metadata

| 字段                             | 必需 | 说明                           |
| -------------------------------- | ---- | ------------------------------ |
| `name`                           | 是   | 完整 Plugin ID，包括 npm scope |
| `version`                        | 是   | SemVer 版本                    |
| `engines["llm-space"]`           | 是   | 兼容的 LLM Space SemVer 范围   |
| `displayName`                    | 否   | 显示名称，缺省使用 `name`      |
| `description`                    | 否   | 插件简介                       |
| `author`、`contributors`         | 否   | npm people fields              |
| `license`                        | 否   | npm license field              |
| `homepage`、`repository`、`bugs` | 否   | 项目链接                       |
| `keywords`、`funding`            | 否   | npm 标准字段                   |

不定义独立 `id`、metadata `schemaVersion` 或 `icon` 字段。修改 `name` 等同于新插件，旧 Settings 和 Thread 引用不自动迁移。

LLM Space 忽略 `scripts`、`main`、`module`、`exports` 和 `bin`，不因此执行代码。未知字段被忽略。

图标固定为根目录可选的 `icon.png`，推荐 512 × 512。Bun 主进程校验格式、尺寸和文件大小后，以 Base64 Data URL 提供给 renderer；renderer 不直接加载 `file://`。缺失或无效时使用默认图标，不影响插件加载。

## 4. Plugin Settings

`LLM_SPACE_HOME/settings/plugins.json` 的结构固定为：

```json
{
  "schemaVersion": 1,
  "plugins": {
    "@vendor/github": {
      "enabled": false,
      "settings": {
        "endpoint": "https://example.com"
      }
    }
  }
}
```

每个插件 entry 只有两个业务字段：

- `enabled`：boolean；
- `settings`：string key 到 JSON-compatible value 的 object。

规则：

- 文件或插件 entry 不存在时，默认 `enabled: true`、`settings: {}`。
- 写入 entry 时同时写入两个字段；空的默认 entry 可以省略。
- 禁用或删除插件目录后保留 Settings；同名插件恢复后继续使用。
- 读取器忽略未知字段；写入器只输出固定结构。
- 写入采用临时文件原子替换，并保留 last-known-good backup。
- 配置损坏且无法恢复时，本次不激活第三方插件，但应用继续启动。
- Metadata、路径、运行状态、扩展、错误和日志不写入此文件。
- API keys 和 tokens 应使用环境变量引用。

可选的 `config.schema.json` 定义 Settings schema、默认值和 UI hints。运行时向插件提供 schema defaults 与用户 Settings 合并后的只读快照。

## 5. 扩展

### 5.1 Skills

`skills/<skill-name>/SKILL.md` 使用现有 Agent Skills 格式。插件 Skills 作为只读层加入有效 registry，不改写用户配置；禁用插件后不再进入新的 Agent Run。

### 5.2 MCP

根目录 `mcp.json` 使用现有格式，并作为只读层补充用户 MCP 配置。Server ID 由 Plugin ID 与 server name 派生；server lazy start，插件禁用后拒绝新调用并关闭连接。环境变量、headers 和 secrets 使用环境变量引用。

### 5.3 Models

根目录 `models.json` 只声明 LLM Space 内置 API adapters 支持的 providers/models，不加载 provider JavaScript。插件 Models 作为只读层合并，禁用后对新 Run 不可用。

### 5.4 Commands

只扫描 `commands/` 直接子文件，支持 `.ts`、`.js`、`.mjs`，不递归。相同文件 stem 视为冲突。

文件 stem 是 command ID，完整 ID 为：

`plugin:<package-name>:command:<file-name>`

每个文件 default export 一个 class，由宿主用无参数 constructor 创建一个长生命周期实例：

```ts
interface PluginCommand {
  displayName: string;
  description?: string;
  execute(context: CommandContext): void | Promise<void>;
}
```

- 每个启用插件使用一个独立 Bun 子进程承载全部 Command instances。
- CommandContext 通过受限 RPC 提供插件 Settings，以及通知、链接、文件选择、工作区文件和允许的宿主 Command 能力。
- 插件不能取得宿主对象，但子进程仍可直接使用 Bun/Node 的系统 API。
- Command 可引用插件内相对模块和随包提供的依赖；LLM Space 不安装依赖。
- Commands 只进入 Command Palette，不进入菜单、快捷键或右键菜单。
- 禁用插件时终止子进程并移除 Commands。
- 单个 Command 失败只标记该 Command；详情写日志，下次显式执行时可重试。

### 5.5 Thread Storages

只扫描 `thread-storages/` 直接子文件，支持 `.ts`、`.js`、`.mjs`，不递归。文件 stem 生成完整 ID：

`plugin:<package-name>:thread-storage:<file-name>`

每个文件 default export 一个实现 `PluginThreadStorage` 的无参数 class；每个 runner 生命周期只创建一个实例。实例声明 `displayName`、可选 `description`、`capabilities.read/write`，并按能力实现 `resolveLatest/read/write`。Storage 可声明可选 `deepLinkId`，注册 `llm-space://threads/<deepLinkId>/*`；`deepLinkId` 在全部启用 Storage 中必须唯一。宿主只解析 `deepLinkId`，其后的完整原始后缀由对应 Storage 解释。

Thread Storage 只存取单个 Thread，不替代 workspace。资源 ID 是 backend 自己解释的 opaque string；`ThreadLocator.filename` 可选。设置与 AbortSignal 通过每次调用的只读 context 传入。

“Save to…” 只列出可写 Storage；资源 ID 为空时创建，非空时更新。“Import from…” 只列出可读 Storage，读取后写入本地 `workspace/imported/`，生成不冲突文件名并打开。

GitHub Gist 是内置 read-write Storage，并继续独立支持现有 Share Dialog、Web Viewer、shared route 和 deep link。插件 Storage 不参与 Web Viewer 或分享链接；Storage deep link 只负责导入本地 workspace。

## 6. ID、冲突与生命周期

扩展 ID 固定为：

- Skill：`plugin:<package-name>:skill:<skill-name>`；
- MCP：`plugin:<package-name>:mcp:<server-name>`；
- Provider：`plugin:<package-name>:provider:<provider-id>`；
- Tool：`plugin:<package-name>:tool:<tool-name>`；
- Command：`plugin:<package-name>:command:<command-id>`；
- Thread Storage：`plugin:<package-name>:thread-storage:<storage-id>`。

任何 canonical ID 冲突都使冲突双方不激活，不使用 first-wins、last-wins 或来源优先级。显示名称重复不冲突。

插件依次经历发现、metadata 校验、兼容性检查、Settings 读取、扩展校验、冲突检查、注册和启动。每个阶段按插件和扩展隔离错误。

禁用插件立即阻止新调用、关闭 MCP、终止 Commands/Thread Storages，并从新 Agent Run 的 registry 中移除贡献。启用插件重新校验并注册。实际执行入口再次检查 enabled，旧 Thread 不能绕过禁用状态。

## 7. 信任、安全与日志

系统没有 trust 机制。发现且启用的插件被完全信任；复制插件目录即授权其执行。子进程只提供故障隔离，不是 OS sandbox，也不限制插件访问文件、网络、环境变量和进程 API。

宿主必须校验 metadata、schema 和路径，禁止 symlink/path traversal，限制子进程时间与输出，清理日志 secrets，并支持 `LLM_SPACE_DISABLE_PLUGINS=1` 安全启动。

插件相关异常不得成为主进程未处理错误。单个插件或扩展失败时，应用继续加载其他插件并完成启动。

详细错误写入：

`LLM_SPACE_HOME/logs/plugins/<encoded-package-name>/<timestamp>-<stage>-<error-id>.log`

尚未取得合法包名时写入：

`LLM_SPACE_HOME/logs/plugins/_invalid/<timestamp>-discovery-<error-id>.log`

日志包含版本、阶段、扩展、错误链、stack 和截断后的子进程输出，并清理 credentials、headers、prompt 和 tool payload。单条日志和子进程输出有大小限制。

日志写入失败不得阻止应用启动；宿主改写 fallback log。UI 只显示安全摘要、`error-id`、日志绝对路径，以及 Reveal log / Copy path，不直接展示完整错误。

## 8. 设置页

设置页采用左侧插件列表、右侧详情的双栏布局。插件列表显示 metadata、enabled、兼容性、扩展、运行状态及最近错误。详情页提供：

- 插件总开关；
- Metadata 和扩展状态；
- `config.schema.json` 生成的 Settings UI；
- Settings 自动保存，不提供 Save 按钮；
- 可点击的插件安装目录；
- Refresh：重新扫描插件根目录，发现新增和已删除的插件；
- Reload：重新发现并加载单个插件的 metadata 和扩展；
- Reveal plugin folder；
- Reveal log / Copy path。

设置页不提供 trust、权限审核、安装、更新、rollback 或扩展级开关。

## 9. 一期边界

一期实现发现、metadata、启用状态、Settings、诊断日志、Skills、MCP、Models、Commands 和 Thread Storages，以及 Plugins 设置页、动态 Command Palette、“Save to…”和“Import from…”。

Hooks、插件安装与更新、Marketplace、Remote Runtime 和项目级插件不在一期实现。该边界是产品范围，不改变本文其余部分的确定性设计。
