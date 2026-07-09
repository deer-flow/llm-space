# Core Concepts

LLM Space is a desktop workbench for developing, debugging, and evaluating prompts and agents. You can think of a Thread as a saved experiment file: it records the conversation context, the selected model, available tools, and the messages and tool call results produced during a run.

# Thread

A Thread is the basic unit of work in LLM Space. A Thread usually contains:

- Title: shown in the file tree and tab bar.
- Model: the default model used when this Thread runs.
- System Prompt: global instructions sent to the model.
- Variables: placeholders that can be referenced in the System Prompt, messages, and tool results.
- Tools: tool definitions the model can call.
- Messages: the conversation history made of User and Assistant messages.
- Tool Calls: tool call requests and results recorded on Assistant messages.
- Run History: historical run snapshots for replay, comparison, and debugging.
- Evaluations: manual evaluation records for comparing different runs.

In the UI, creating, opening, copying, moving, and deleting Threads is essentially managing Thread files in the workspace.

# Model

A Model is the language model actually called during a run, such as a model ID under OpenAI, Anthropic, Ark, or a custom compatible API.

A Thread can save its own model configuration:

| Field | Meaning |
| --- | --- |
| `provider` | Model provider ID. |
| `id` | Model ID. |
| `params.maxTokens` | Maximum number of tokens the run can generate. |
| `params.temperature` | Sampling temperature. |
| `params.reasoning` | Reasoning level or effort, depending on model support. |
| `params.responseType` | Response type, such as plain text or structured output. |
| `params.extra` | Extra parameters passed to a specific model. |

If a Thread does not save a model, the UI falls back to the currently available model for display and running. Once you manually select a model, that model configuration is saved with the Thread.

# Model Provider

A Model Provider is a provider configuration. It tells LLM Space where to call models, which API compatibility mode to use, which API key to use, and which models are available.

Common Provider information includes:

| Configuration | Description |
| --- | --- |
| Provider name and ID | Used to identify the provider in model selectors and config files. |
| API Key | The key required to call this provider's models. |
| Base URL | Custom API endpoint. Leave empty to use the default endpoint. |
| API compatibility mode | For example Anthropic Messages, OpenAI Chat Completions, or OpenAI Responses. |
| Models | Models available under this Provider. |
| Disabled Models | Models hidden or disabled by the user. |
| Custom Models | Model IDs manually added by the user. |

Model Provider is a global setting. Model is the concrete runtime model selected by a specific Thread.

# Tools

Tools are capabilities the model can request to call. Tool definitions are sent to the model, and the model decides whether to call them based on their names, descriptions, and parameter schemas.

LLM Space has three main types of tools:

| Type | Description | Result source |
| --- | --- | --- |
| Built-in | Capabilities implemented by the app runtime, such as files, commands, and web search. Their definitions follow common agent implementation patterns. | Implemented inside LLM Space. The app can run them automatically, or the user can trigger them when confirmation is needed. |
| Custom Function Tool | User-defined function tool definitions. They describe the tool name, purpose, and parameters, but do not have a built-in execution backend. | The user fills the result manually, or an external workflow supplies it. |
| MCP | Tools from an MCP Server. After LLM Space connects to an MCP Server, it exposes server-provided tools to the model. | Executed by the corresponding MCP Server. |

A tool usually contains:

| Field | Meaning |
| --- | --- |
| `type` | `builtin`, `function`, or `mcp`. |
| `name` | Tool name exposed to the model. |
| `description` | Tells the model when to use this tool. |
| `parameters` | JSON Schema describing tool parameters. |

MCP tools also save which MCP Server they come from, such as `serverId`, `serverName`, and the raw `toolName`.

# System Prompt

The System Prompt is the Thread's global instruction. It is usually used to define the assistant's identity, goals, constraints, output format, and tool usage policy.

The System Prompt is not shown as a normal user message, but it is sent to the model as part of the context. Compared with repeating rules in every user message, putting stable behavior requirements in the System Prompt is easier to reuse and compare.

# Variables

Variables are placeholders you can reuse in the System Prompt, messages, and tool results. You write `{{variable_name}}` in the text, and at run time LLM Space replaces it with the variable's real value. This lets you pull out content that changes or is reused (the current date, the list of available skills, common snippets, and so on) and manage it in one place instead of hand-writing and maintaining it in many spots.

The reference syntax is always double curly braces, for example `{{current_date}}`. There are two kinds of variables: built-in and custom.

## Built-in Variables

Built-in variables compute their value automatically from the current environment or configuration. You only reference them; you don't fill in a value:

| Variable | Description | Options |
| --- | --- | --- |
| `current_date` | The current system date and time, in the local time zone. | Format: readable date, ISO date, or local date and time. |
| `available_skills` | The list of currently enabled Skills (names and descriptions), so the model knows what capabilities are available. | Format: Markdown list or XML; indentation; includes all enabled Skills by default, or you can pick only some. |

`available_skills` expands to all enabled Skills by default. If you only want to expose a subset, select specific Skills in the variable settings; an empty selection means "all enabled Skills."

## Custom Variables

A custom variable is a "name → value" pair you define manually, where the value is a fixed piece of text. It suits snippets you reuse in multiple places, such as a shared tone-of-voice note, company information, or common constraints. Once defined, you reference it with `{{variable_name}}` as well.

A variable name must start with a letter or underscore and contain only letters, digits, and underscores.

## Resolution and Storage

- At run time, `{{variable_name}}` in the text is replaced with the variable's current value, while the stored Thread template stays unchanged.
- Built-in variable definitions are stored under `context.variables`, and custom variable values are stored under `context.variableVariants`.
- If you reference a variable that doesn't exist or has an empty value, the UI shows a hint.

# Messages

Messages are the conversation history of a Thread. LLM Space currently uses two main message roles:

| Role | Description | Content |
| --- | --- | --- |
| User | Messages entered by the user. | Text, and optionally image data. |
| Assistant | Messages generated by the model. | Text, reasoning, tool calls, and token usage. |

User message content can be:

- Text: `{ "type": "text", "text": "..." }`
- Image data: `{ "type": "image_data", "mimeType": "image/png", "data": "..." }`

Assistant message content is mainly text, and may also include:

- `thinking`: reasoning or thinking content returned by the model, depending on provider support.
- `toolCalls`: records of tool calls requested by the model.
- `usage`: token usage returned by the model provider.

# Tool Calls

A Tool Call is a tool invocation recorded on an Assistant message. It means the model decided to call a tool and supplied arguments.

A Tool Call usually contains:

| Field | Meaning |
| --- | --- |
| `id` | Tool call ID, used to match request and result. |
| `input.name` | Tool name to call. |
| `input.arguments` | Tool argument object. |
| `input.partialArguments` | Raw argument text that could not be fully parsed, usually kept for debugging. |
| `output.content` | Text returned by the tool. |
| `output.isError` | Whether the tool runtime reported an error. |

Tool call results are saved in the Thread, so you can inspect why the model called a tool, what arguments it used, and what the tool returned.

# File Storage

LLM Space is a desktop app, and user data is stored locally. The default root directory is:

```text
~/.llm-space
```

You can override it with an environment variable:

```text
LLM_SPACE_HOME=/path/to/data
```

Common directories:

| Path | Content |
| --- | --- |
| `workspace/` | Thread files. |
| `settings/models.json` | Model Provider and model settings. |
| `settings/mcp.json` | MCP Server settings. |
| `settings/window.json` | Desktop window state. |
| `settings/skills.json` | Skill discovery settings. |
| `traces/` | Trace and debugging workbench data. |

Thread files are stored in:

```text
~/.llm-space/workspace/
```

Subdirectories in the workspace map to the file tree on the left side of the app. Thread files use the `.json` extension. The file name is the source of the title shown in the UI; when saving, the app keeps the Thread `title` aligned with the file name.

# Thread JSON Format

A native Thread file is formatted JSON. The core structure looks like this:

```json
{
  "title": "core-concepts",
  "model": {
    "provider": "openai",
    "id": "gpt-4.1",
    "params": {
      "temperature": 0.7,
      "maxTokens": 4096
    }
  },
  "context": {
    "systemPrompt": "You are a helpful assistant.",
    "tools": [
      {
        "type": "function",
        "name": "lookup_order",
        "description": "Look up an order by ID.",
        "parameters": {
          "type": "object",
          "properties": {
            "orderId": {
              "type": "string"
            }
          },
          "required": ["orderId"]
        }
      }
    ],
    "messages": [
      {
        "id": "msg_1",
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "Look up order A123 for me."
          }
        ]
      },
      {
        "id": "msg_2",
        "role": "assistant",
        "content": [
          {
            "type": "text",
            "text": "I will look it up."
          }
        ],
        "toolCalls": [
          {
            "id": "call_1",
            "input": {
              "name": "lookup_order",
              "arguments": {
                "orderId": "A123"
              }
            },
            "output": {
              "content": [
                {
                  "type": "text",
                  "text": "Order A123 has shipped."
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

Actual files may also contain `runHistory` and `evaluations`. These fields are mainly used for debugging, replay, and manual evaluation, and are usually maintained by the app automatically.

# Supported Import Schemas

The import entry point currently selects parsers by file extension, and `.json` is supported. When importing JSON, LLM Space attempts to recognize and normalize the following formats:

| Format | Description |
| --- | --- |
| Native Thread JSON | JSON that already matches the LLM Space Thread structure. |
| OpenAI Chat Completions-style JSON | Chat exports containing fields such as `messages`, `role`, `content`, and `tool_calls`. |
| Anthropic Messages-style JSON | Chat exports containing fields such as `system`, `messages`, content blocks, `tool_use`, `tool_result`, and `input_schema`. |
| Aurora-style JSON | Aurora Thread exports containing `Messages` and `Tools`. |

After import, external formats are converted to the LLM Space Thread structure and written as new `.json` files under the current workspace directory. Files that cannot produce messages, System Prompt, Tools, or model information are skipped.
