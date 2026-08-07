# Atlas Plugin

[English](./README.md) | [简体中文](./README.zh-CN.md)

Atlas 是一个围绕项目知识、日常操作和 Thread 工作流构建的完整 LLM Space Plugin
示例。它刻意比最小脚手架更丰富：覆盖当前支持的所有 Extension 点，并且每一种可重复
声明的类型都至少提供两个扩展。

## 包含的 Extensions

| 类型 | 数量 | 演示能力 |
| --- | ---: | --- |
| Settings | 1 个 Schema、7 个字段 | 默认值、校验、描述和插值 |
| Skills | 2 | frontmatter、references 和边界明确的工作流 |
| MCP servers | 2 | 内置 stdio servers、Settings 到环境变量的插值 |
| MCP Tools | 4 | Zod 输入 Schema、普通结果和受控错误 |
| Model providers | 2 | OpenAI Responses 与 Anthropic Messages adapters |
| Models | 4 | 每个 Plugin provider 包含多个模型 |
| Plugin Tools | 2 | 类型化参数、Thread/variable context 和 workspace 读取 |
| Commands | 2 | Palette 参数、进度、结果、workspace 与 Thread 写入 |
| Thread Storages | 2 | 持久化 workspace storage 和进程生命周期 memory storage |

`config.schema.json` 是这里唯一的单例：LLM Space 每个 Plugin 最多只发现一个
Settings Schema。因此 Atlas 在一个 Schema 中提供多项独立设置；其他 Extension 类型
均提供了不止一个贡献项。

## 目录结构

```text
atlas-plugin/
├── package.json
├── tsconfig.json
├── config.schema.json
├── mcp.json
├── models.json
├── README.md
├── README.zh-CN.md
├── commands/
│   ├── create-project-brief.ts
│   └── rename-active-thread.ts
├── tools/
│   ├── project-context.ts
│   └── read-workspace-note.ts
├── thread-storages/
│   ├── memory-shelf.ts
│   └── workspace-library.ts
├── servers/
│   ├── catalog-server.ts
│   └── metrics-server.ts
└── skills/
    ├── incident-brief/
    │   ├── SKILL.md
    │   └── references/template.md
    └── release-readiness/
        ├── SKILL.md
        └── references/checklist.md
```

## 本地安装

Plugin 根目录必须是真实目录，因此应复制示例，不能创建 symlink。LLM Space 不会
自动安装 Plugin 依赖；两个内置 MCP server 使用了 MCP SDK，所以需要在复制后的
目录中执行 `bun install`。

```sh
mkdir -p ~/.llm-space/plugins
cp -R ./examples/atlas-plugin ~/.llm-space/plugins/atlas-plugin
cd ~/.llm-space/plugins/atlas-plugin
bun install --production
```

然后打开 Settings → Plugins，点击 **Refresh plugins**。Atlas 要求 LLM Space
4.9.0 或更高版本。

## 配置

在 Atlas 的 Settings tab 中：

1. 将 **MCP server directory** 设置为安装目录的绝对路径，通常是展开 `~` 后的
   `~/.llm-space/plugins/atlas-plugin`。
2. 按需修改 team、project、notes directory 或模型 base URL。
3. 如需使用示例 Model Providers，请在启动 LLM Space 前导出
   `OPENAI_API_KEY` 和/或 `ANTHROPIC_API_KEY`。

Model 条目主要用于展示配置结构。实际使用前，请将 ID、限制和成本信息替换为所用
Provider 的已验证值。不要把 API key 直接写进 `models.json`。

## 体验示例

### Commands

打开 Command Palette，尝试：

```text
Rename active Thread Release 4.9
rename-active-thread "Release 4.9"
Create project brief Atlas Web
create-project-brief "Atlas 中文站"
```

重命名 Command 会暂存一次完整 Thread 更新并返回明确终态；Brief Command 会写入
`atlas/<名称>-brief.md` 并刷新 workspace 文件树。

### Plugin Tools

把以下 Tools 加入本地 Thread：

- `atlas_project_context` 读取 Plugin Settings、owning Thread 和已解析的
  Prompt Variables。
- `atlas_read_workspace_note` 在配置的 Atlas notes directory 内安全读取文件，并
  限制输出长度。

### MCP

在 Settings → MCP 的 **MCPs in Plugins** 下测试两个 Atlas servers：

- **Atlas Catalog** 提供 `list_resources` 和 `get_resource`。
- **Atlas Metrics** 提供 `get_project_health` 和 `compare_metric`。

这些 server 使用本地确定性数据，不需要凭据或网络访问。

### Model providers

Atlas 提供一个兼容 OpenAI Responses 的 provider 和一个兼容 Anthropic Messages 的
provider，每个 provider 包含两个示意 Models。开始 Run 前，请导出对应 API key、
确认 base URL，并替换示例 Model ID 和 metadata。

### Thread Storages

- **Atlas Workspace Library** 将 JSON 持久化到
  `<notesDirectory>/thread-library/`，支持导入、保存和
  `llm-space://threads/atlas-library/<id>` deep link。
- **Atlas Memory Shelf** 用进程生命周期内的状态演示相同读写契约；Plugin reload
  或应用退出后内容会消失。

### Skills

两个 Skills 分别演示发布证据检查和事故简报整理，并各自使用本地 reference 文件。
在 Settings → Skills 启用后，即可让 Agent 执行对应任务。

## 生产使用注意事项

本目录是教学示例，不是生产集成。基于它发布 Plugin 前，请至少完成以下工作：

- 替换示意 Model metadata，并测试每个已配置 provider；
- 完整校验外部 Thread Storage 返回的 Thread payload；
- 为网络操作添加超时和取消处理；
- 避免在文件、结果、进度和日志中泄漏 secret；
- 为 Commands、Tools、MCP servers 和 Storage 行为增加自动化测试；
- 在分发的 Plugin 目录中包含已经安装好的运行时依赖。
