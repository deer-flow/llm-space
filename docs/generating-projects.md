English | [中文](./generating-projects.zh-CN.md)

---

# Generating a project

**Generate Project** exports a Thread into an editable, runnable agent project. It carries the Thread's prompt, model, variables, selected tools, messages, and runtime context out of the playground and into source files that can be versioned and extended.

This feature is currently a Desktop-only Beta. The available target is a Python 3.12 project using LangGraph, LangChain, and `uv`.

## Requirements

- A model must resolve for the Thread. The generated project uses its provider, model ID, and compatible runtime package.
- [`uv`](https://docs.astral.sh/uv/) must be available on `PATH`. The wizard links to the official installation guide when it is missing.
- The destination directory must be writable.
- Provider-hosted tools and Plugin tools are not currently supported by the LangGraph exporter.

## How to generate

1. Open the Thread.
2. Open **More Actions** (`...`) and choose **Generate Project**.
3. Confirm the export format. LangGraph/Python is the only format in the current version.
4. Choose a parent directory and project name.
5. Decide whether the first User Message should be used as a meta user prompt. LLM Space suggests a value based on the Thread and disables the option when no first User Message exists.
6. Choose **Generate** and watch files appear in the progress view.
7. Review the completion instructions, open the folder, and decide whether LLM Space should create a `.env` containing resolved credentials.

The source Thread is not changed. Generation creates and writes a separate project directory.

## Generated project

A generated project contains files similar to:

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

Supported built-in tools are copied as working Python implementations. Function tools become typed stubs that must be completed. MCP tools are exported with their resolved server configuration and allowed tool names. `PLAN.md` lists any remaining work.

The prompt template remains editable and is rendered at runtime. Built-in values such as the current date and enabled Skills remain dynamic where supported; exported references preserve the model-facing prompt, initial messages, variables, and custom or MCP tool definitions for inspection.

## Meta user prompt

When **Use meta user prompt** is enabled, the first User Message becomes runtime context injected before each generated-agent model call rather than an ordinary request. This is useful for reusable workspace instructions, dates, Skills, or working-directory context. Leave it disabled when the first User Message is the actual task the agent should answer only once.

## Dependencies and credentials

Generation runs `uv sync` on a best-effort basis. If installation fails or times out, the project is still created; finish it manually:

```sh
cd /path/to/my-agent
uv sync
```

The project always includes `.env.example`. Generation may also write `.env` when a required value is already configured as a literal secret. Afterward, LLM Space can optionally resolve model, search, and MCP environment references and write the complete result to `.env`. Review this file and never commit it to source control.

## Run the project

```sh
cd /path/to/my-agent
cp .env.example .env  # if LLM Space did not create it
uv run langgraph dev
```

Then open LangGraph Studio to run, inspect, and trace the agent. If the Thread used function tools, complete the stubs described in `PLAN.md` first.

## How generation works

The LangGraph exporter is deterministic and does not make an additional LLM call. It renders Thread templates through the same LLM Space prompt semantics, resolves the effective model and tool configuration, writes the scaffold and reference files, and reports each file through the wizard's progress stream.

The implementation lives primarily in `packages/core/src/generator/langgraph/` and `packages/ui/src/components/thread-playground/codegen/`.
