[English](./generating-projects.md) | 中文

---

# 生成项目

**Generate Project** 会把一个 Thread 导出为可编辑、可运行的 Agent 项目。它将 Thread 中的 prompt、模型、变量、选中的工具、消息和运行时上下文从 Playground 带入源码文件，便于版本管理和继续开发。

该功能目前是仅桌面端可用的 Beta。当前唯一目标格式是使用 Python 3.12、LangGraph、LangChain 和 `uv` 的项目。

## 使用条件

- Thread 必须能够解析出一个可用模型。生成项目会使用它的 provider、模型 ID 和对应的运行时依赖。
- [`uv`](https://docs.astral.sh/uv/) 必须位于 `PATH` 中。如果没有安装，向导会提供官方安装文档链接。
- 目标目录必须可写。
- 当前 LangGraph 导出器不支持 provider-hosted tools 和 Plugin tools。

## 如何生成

1. 打开需要导出的 Thread。
2. 打开 **More Actions**（`...`），选择 **Generate Project**。
3. 确认导出格式。当前版本只有 LangGraph/Python。
4. 选择父目录并填写项目名称。
5. 决定是否把第一条 User Message 作为 meta user prompt。LLM Space 会根据 Thread 给出建议；如果没有第一条 User Message，该选项不可用。
6. 点击 **Generate**，在进度界面中查看文件逐步生成。
7. 阅读完成后的操作提示，打开项目目录，并决定是否让 LLM Space 创建包含已解析凭证的 `.env`。

源 Thread 不会被修改。生成操作会创建并写入一个独立的项目目录。

## 项目结构

生成的项目大致包含：

```text
my-agent/
├── pyproject.toml
├── langgraph.json
├── Makefile
├── .env.example
├── PLAN.md
├── src/
│   ├── agents/agent.py
│   ├── models/create_model.py
│   ├── prompting/system_prompt.md
│   ├── prompting/apply_template.py
│   └── tools/
└── references/
    ├── system-prompt.md
    ├── messages/
    ├── tools/
    └── variables.json
```

支持的 built-in tools 会被复制成可工作的 Python 实现。Function tools 会变成需要继续实现的类型化 stub。MCP tools 会连同已解析的 server 配置和允许调用的工具名称一起导出。`PLAN.md` 会列出仍需完成的工作。

Prompt template 保持可编辑，并在运行时渲染。在支持的情况下，当前日期和已启用 Skills 等内置值仍会动态计算；`references/` 会保存模型实际看到的 prompt、起始消息、变量，以及自定义或 MCP 工具定义，便于检查。

## Meta user prompt

启用 **Use meta user prompt** 后，第一条 User Message 会成为每次生成 Agent 调用模型前注入的运行时上下文，而不是一条只执行一次的普通请求。它适合承载可复用的工作区指令、日期、Skills 或工作目录上下文。如果第一条 User Message 就是 Agent 只需回答一次的真实任务，则应关闭该选项。

## 依赖与凭证

生成过程中会 best-effort 执行 `uv sync`。如果安装失败或超时，项目仍会正常创建；可以手动完成安装：

```sh
cd /path/to/my-agent
uv sync
```

项目始终包含 `.env.example`。如果必要的值已被配置为明文 secret，生成过程也可能直接写入 `.env`。生成完成后，LLM Space 还可以选择性地解析模型、搜索和 MCP 环境变量引用，并把完整结果写入 `.env`。请检查该文件，并且不要把它提交到版本控制中。

## 运行项目

```sh
cd /path/to/my-agent
cp .env.example .env  # 如果 LLM Space 没有创建
uv run langgraph dev
```

随后可以打开 LangGraph Studio，运行、检查和追踪 Agent。如果 Thread 使用了 function tools，请先按照 `PLAN.md` 完成对应 stub。

## 实现方式

LangGraph 导出器是确定性的，不会额外调用一次 LLM。它使用与 LLM Space 相同的 prompt 语义渲染 Thread 模板，解析实际使用的模型和工具配置，写入脚手架与 reference 文件，并通过向导的进度流逐个报告生成的文件。

主要实现位于 `packages/core/src/generator/langgraph/` 和 `packages/ui/src/components/thread-playground/codegen/`。
