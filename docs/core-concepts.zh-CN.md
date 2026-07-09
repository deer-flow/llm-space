# 核心概念

LLM Space 是一个用于开发、调试和评估提示词与智能体的桌面工作台。你可以把一个 Thread 理解为一份可保存、可复制、可导入导出的实验文件：它记录一次对话的上下文、使用的模型、可调用的工具，以及运行后产生的消息和工具调用结果。

# Thread

Thread 是 LLM Space 的基本工作单元。一个 Thread 通常包含：

- 标题：显示在文件树和标签页中。
- Model：当前 Thread 运行时默认使用的模型。
- System Prompt：发送给模型的全局指令。
- Variables：可在 System Prompt、消息和工具结果中引用的变量占位符。
- Tools：模型可以调用的工具定义。
- Messages：用户消息和助手消息组成的对话历史。
- Tool Calls：助手消息中记录的工具调用请求和调用结果。
- Run History：历史运行快照，用于回放、比较和调试。
- Evaluations：人工评测记录，用于比较不同运行结果。

在界面里，新建、打开、复制、移动和删除 Thread，本质上是在管理工作区里的 Thread 文件。

# Model

Model 是一次运行实际调用的语言模型，例如某个 OpenAI、Anthropic、Ark 或自定义兼容接口下的模型 ID。

一个 Thread 可以保存自己的模型配置：

| 字段 | 含义 |
| --- | --- |
| `provider` | 模型提供方 ID。 |
| `id` | 模型 ID。 |
| `params.maxTokens` | 本次运行允许生成的最大 token 数。 |
| `params.temperature` | 采样温度。 |
| `params.reasoning` | 推理强度或推理级别，取决于模型是否支持。 |
| `params.responseType` | 响应类型，例如普通文本或结构化输出。 |
| `params.extra` | 传给特定模型的额外参数。 |

如果 Thread 没有保存模型，界面会用当前可用模型作为显示和运行时的回退选择；当你手动选择模型后，模型配置会随 Thread 保存。

# Model Provider

Model Provider 是模型提供方配置。它负责告诉 LLM Space 去哪里调用模型、使用什么 API 兼容模式、用哪个 API Key，以及有哪些模型可选。

常见的 Provider 信息包括：

| 配置 | 说明 |
| --- | --- |
| Provider 名称和 ID | 用于在模型选择器和配置文件中识别提供方。 |
| API Key | 调用该提供方模型所需的密钥。 |
| Base URL | 自定义 API 地址；使用默认地址时可以留空。 |
| API 兼容模式 | 例如 Anthropic Messages、OpenAI Chat Completions、OpenAI Responses。 |
| Models | 该 Provider 下可用的模型列表。 |
| Disabled Models | 用户在界面中隐藏或禁用的模型。 |
| Custom Models | 用户手动添加的模型 ID。 |

Model Provider 是全局设置；Model 是某个 Thread 选择的具体运行模型。

# Tools

Tools 是模型可以请求调用的能力。工具定义会发送给模型，模型根据名称、描述和参数 schema 决定是否调用。

LLM Space 中的工具主要分三类：

| 类型 | 说明 | 结果来源 |
| --- | --- | --- |
| Built-in | 例如文件、命令、网页搜索等由应用运行时提供的能力。其定义与常见的 Agent 实现逻辑基本一致。 | LLM Space 内部实现了这些工具。应用自动执行，或在需要人工确认时由用户触发。 |
| Custom Function Tool | 用户自定义的函数工具定义。它只描述工具名称、用途和参数，没有内置执行后端。 | 用户手动填写或外部流程补充工具结果。 |
| MCP | 来自 MCP Server 的工具。LLM Space 连接 MCP Server 后，把服务端暴露的工具提供给模型。 | 由对应 MCP Server 执行并返回结果。 |

一个工具通常包含：

| 字段 | 含义 |
| --- | --- |
| `type` | `builtin`、`function` 或 `mcp`。 |
| `name` | 暴露给模型的工具名称。 |
| `description` | 告诉模型什么时候使用这个工具。 |
| `parameters` | JSON Schema，描述工具参数。 |

MCP 工具还会保存它来自哪个 MCP Server，例如 `serverId`、`serverName` 和原始 `toolName`。

# System Prompt

System Prompt 是 Thread 的全局指令。它通常用于定义助手的身份、目标、约束、输出格式和工具使用策略。

System Prompt 不显示为普通用户消息，但会作为上下文的一部分发送给模型。相比把规则反复写进每条用户消息，把稳定的行为要求放在 System Prompt 中更容易复用和比较。

# Variables

Variables（变量）是可以在 System Prompt、消息和工具结果中复用的占位符。你在文本里写 `{{变量名}}`，运行时 LLM Space 会把它替换成变量对应的真实值。这样可以把会变化或需要复用的内容（当前日期、可用技能列表、常用片段等）抽出来集中管理，而不必在多处手写和维护。

引用语法固定为双花括号，例如 `{{current_date}}`。变量分为两类：内置变量和自定义变量。

## 内置变量

内置变量由应用根据当前环境或配置自动计算取值，你只需要引用，不需要手动填值：

| 变量 | 说明 | 可配置项 |
| --- | --- | --- |
| `current_date` | 当前系统日期与时间，按本地时区计算。 | 格式：可读日期、ISO 日期、本地日期与时间。 |
| `available_skills` | 当前启用的 Skill 列表（名称与描述），让模型了解可用的能力。 | 格式：Markdown 列表或 XML；缩进；默认包含所有启用的 Skill，也可以只挑选其中部分。 |

`available_skills` 默认展开为所有启用的 Skill；如果只想暴露其中一部分，可以在变量设置里挑选具体的 Skill，未选择时即代表“全部启用的 Skill”。

## 自定义变量

自定义变量是你手动定义的“名称 → 值”对，值是一段固定文本。适合放置需要在多个位置复用的片段，例如统一的语气说明、公司信息或常用约束。定义后同样通过 `{{变量名}}` 引用。

变量名需以字母或下划线开头，且只包含字母、数字和下划线。

## 取值与存储

- 运行时，文本中的 `{{变量名}}` 会被替换为变量的当前取值，Thread 保存的原始模板保持不变。
- 内置变量的定义保存在 `context.variables`，自定义变量的取值保存在 `context.variableVariants`。
- 如果引用了不存在或取值为空的变量，界面会给出提示。

# Messages

Messages 是 Thread 的对话历史。LLM Space 当前主要使用两种消息角色：

| 角色 | 说明 | 内容 |
| --- | --- | --- |
| User | 用户输入的消息。 | 文本，也可以包含图片数据。 |
| Assistant | 模型生成的消息。 | 文本、推理内容、工具调用和 token 使用量。 |

用户消息的内容可以是：

- 文本：`{ "type": "text", "text": "..." }`
- 图片数据：`{ "type": "image_data", "mimeType": "image/png", "data": "..." }`

助手消息的内容主要是文本，也可以附带：

- `thinking`：模型返回的推理或思考内容，取决于提供方是否支持。
- `toolCalls`：模型请求调用工具的记录。
- `usage`：模型提供方返回的 token 使用量。

# Tool Calls

Tool Call 是助手消息里记录的一次工具调用。它表示模型决定调用某个工具，并给出了参数。

一个 Tool Call 通常包含：

| 字段 | 含义 |
| --- | --- |
| `id` | 工具调用 ID，用于把调用请求和结果对应起来。 |
| `input.name` | 要调用的工具名称。 |
| `input.arguments` | 工具参数对象。 |
| `input.partialArguments` | 未能完整解析的原始参数文本，通常用于保留调试信息。 |
| `output.content` | 工具返回的文本内容。 |
| `output.isError` | 工具运行是否失败。 |

工具调用结果会保存在 Thread 中，因此你可以回看模型为什么调用某个工具、调用时传了什么参数，以及工具返回了什么。

# 文件保存位置

LLM Space 是桌面应用，用户数据保存在本机。默认根目录是：

```text
~/.llm-space
```

也可以通过环境变量覆盖：

```text
LLM_SPACE_HOME=/path/to/data
```

常见目录：

| 路径 | 内容 |
| --- | --- |
| `workspace/` | Thread 文件。 |
| `settings/models.json` | Model Provider 和模型设置。 |
| `settings/mcp.json` | MCP Server 设置。 |
| `settings/window.json` | 桌面窗口状态。 |
| `settings/skills.json` | Skill 发现目录设置。 |
| `traces/` | Trace 和调试工作台数据。 |

Thread 文件保存在：

```text
~/.llm-space/workspace/
```

工作区里的子目录会映射到应用左侧文件树。Thread 文件使用 `.json` 后缀，文件名就是界面中显示的标题来源；保存时应用会让 Thread 的 `title` 和文件名保持一致。

# Thread JSON 格式

原生 Thread 文件是格式化后的 JSON。核心结构如下：

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
            "text": "帮我查询订单 A123。"
          }
        ]
      },
      {
        "id": "msg_2",
        "role": "assistant",
        "content": [
          {
            "type": "text",
            "text": "我来查询。"
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
                  "text": "订单 A123 已发货。"
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

实际文件还可能包含 `runHistory` 和 `evaluations`。这些字段主要用于调试、回放和人工评估，通常由应用自动维护。

# 支持导入的 schema

当前导入入口按文件扩展名选择解析器；已支持 `.json`。导入 JSON 时，LLM Space 会尝试识别并归一化以下格式：

| 格式 | 说明 |
| --- | --- |
| 原生 Thread JSON | 已经符合 LLM Space Thread 结构的 JSON。 |
| OpenAI Chat Completions 风格 JSON | 包含 `messages`、`role`、`content`、`tool_calls` 等字段的聊天导出。 |
| Anthropic Messages 风格 JSON | 包含 `system`、`messages`、内容块、`tool_use`、`tool_result`、`input_schema` 等字段的聊天导出。 |
| Aurora 风格 JSON | 包含 `Messages` 和 `Tools` 的 Aurora 线程导出。 |

导入后，外部格式会转换为 LLM Space 的 Thread 结构，并写入当前工作区目录下的新 `.json` 文件。无法解析出消息、System Prompt、Tools 或模型信息的文件会被跳过。
