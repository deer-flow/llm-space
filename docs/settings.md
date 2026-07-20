English | [中文](./settings.zh-CN.md)

---

# Settings

Settings is the global configuration center for LLM Space. It manages application appearance, default model, model providers, MCP Servers, built-in search tools, and Skill discovery folders.

![Open Settings from the menu](./images/settings-00-entry.png)

# How to Open Settings

On the macOS menu bar, click `LLM Space`, or `LLM Space-dev` in the development build, then choose `Settings...`.

You can also use the shortcut:

```text
Command + ,
```

After Settings opens, the left side shows categories, and the right side shows the configuration form for the selected category. This document covers:

| Page | Purpose |
| --- | --- |
| General | Configure language, appearance, default model, workspace folder, and anonymous analytics. |
| Models | Add and manage Model Providers, enable or disable models, and add custom models. |
| MCP | Add and test MCP Servers so Threads can use external MCP tools. |
| Search | Configure the search service used by the built-in `web_search` and `web_fetch` tools. |
| Skills | Configure Skill discovery folders used by the built-in `skill()` tool. |

# General

The General page configures app-level defaults.

![General settings page](./images/settings-01-general.png)

| Setting | Description |
| --- | --- |
| Language | Language setting. Only English (US) is supported for now; more languages are coming. |
| Appearance | App theme. Match the system setting, or force light or dark mode. |
| Primary color | Accent color used for buttons, links, and highlights. |
| Rendering | Message rendering mode. `Full` renders messages with full editors; `Fast` shows plain text for smoother scrolling in large Threads. |
| Default model | The model used for new Threads. Also used as fallback when a Thread's saved model is no longer available. |
| Workspace folder | The current workspace directory, where Thread files are stored. Click the path to open it in the system file manager. |
| Share anonymous usage analytics | Whether to share anonymous usage data. Anonymous data only includes product actions, never prompts, messages, or API keys. |

## Default model

`Default model` can be a specific enabled model, or it can stay as `Automatic`.

- Choose a specific model: new Threads use that model by default.
- Choose `Automatic`: LLM Space automatically picks from currently available models.

If newly created Threads keep using an unexpected model, check the default model setting first.

## Workspace folder

`Workspace folder` shows where Thread files are stored. By default, it is:

```text
~/.llm-space/workspace
```

Each `.json` file there corresponds to a Thread. For more details about Thread file format, see [Core Concepts](./core-concepts.md).

# Models

The Models page manages model providers and model lists. Models selected by Threads come from Model Providers configured and enabled here.

![Models settings page](./images/settings-02-models.png)

## Add Provider

Click `Add provider` in the lower-left corner to add a model provider.

![Add provider menu](./images/settings-03-add-provider.png)

The Provider menu is usually split into groups:

| Group | Description |
| --- | --- |
| Customized | Add a custom Provider. Use this for third-party services compatible with OpenAI, Anthropic, or Responses APIs. |
| Discovered | Providers for which LLM Space detected API Keys in local environment variables. |
| Recommended | Recommended common built-in Providers. |
| Built-in | Other built-in Providers. |

After adding a built-in Provider, the right side shows API Key, Base URL, model list, and related settings.

## Configure a Built-in Provider

The right side of the Models page shows the selected Provider's configuration. Built-in Providers usually include:

| Setting | Description |
| --- | --- |
| API key | API Key for the Provider. Enter it directly or reference an environment variable. |
| Custom base URL | Whether to use a custom API endpoint. When disabled, the Provider default endpoint is used. |
| Models | Models under this Provider. You can enable or disable models individually. |

API Keys can reference environment variables. For example:

```text
"$OPENAI_API_KEY"
```

If the API Key is left blank, LLM Space attempts to use the Provider's official environment variable.

## Add a Custom Provider

If your model service is compatible with OpenAI, Anthropic, or OpenAI Responses APIs, you can add a custom Provider.

![Custom provider settings page](./images/settings-05-custom-provider.png)

Common custom Provider settings:

| Setting | Description |
| --- | --- |
| Name | Provider display name. |
| API type | API compatibility type, such as OpenAI Completions, Anthropic Messages, or OpenAI Responses. |
| Icon | Provider icon keyword. Leave empty to let LLM Space auto-match by name. |
| API key | API Key required to call this Provider. |
| Base URL | API service endpoint. Required for custom Providers. |
| Headers | Extra HTTP headers. Useful for special authentication or gateway parameters. |

## Add a Custom Model

In the Provider's `Models` area, click the add button to add a custom model.

![Add custom model dialog](./images/settings-06-custom-model.png)

Common custom model fields:

| Field | Description |
| --- | --- |
| Model ID | The actual model ID used by the Provider API. |
| Model name | The model name displayed in LLM Space. |
| Icon | Model icon keyword. |
| API type | API compatibility type used by this model. |
| Reasoning supported | Whether the model supports reasoning parameters or reasoning capability. |
| Use DeepSeek thinking format | Whether to use the DeepSeek-style thinking format. |
| Image supported | Whether the model supports image input. |
| Context window | Context window size. |
| Max tokens | Maximum output token count. |

After configuration, the model appears in the Thread model selector.

## Enable, Disable, and Remove

The Models page also lets you:

- Enable or disable an individual model in the model list.
- Enable or disable models in bulk from the model list menu.
- Remove a Provider from the Provider list item menu.
- Edit a custom model, or delete custom models you no longer need.

Removing a Provider does not delete existing Thread files. If a Thread references a removed model, the app falls back to an available model or the default model at runtime.

# MCP

The MCP page connects MCP Servers. After a server is connected, its tools can be added to a Thread's Tools so the model can call external capabilities through MCP.

## Add MCP Server

Click `+` in the upper-right corner of the `Servers` list to create a new MCP Server.

![New MCP Server form](./images/settings-07-mcp-new.png)

MCP Server settings:

| Setting | Description |
| --- | --- |
| Name | Server display name. LLM Space generates a tool prefix from it. |
| Transport | Connection type. Supports `stdio`, `Streamable HTTP`, and `SSE`. |
| Command | Command used to start the MCP Server in `stdio` mode. |
| Args | Arguments passed to the command in `stdio` mode, one argument per line. |
| Working directory | Working directory in `stdio` mode. |
| Environment | Environment variables passed to the process in `stdio` mode. |
| URL | Remote MCP endpoint for `Streamable HTTP` or `SSE` mode. |
| Headers | Extra HTTP headers for remote MCP requests. |

After configuration, click `Save`.

## Test MCP Server

After saving, click `Connect & Test`. LLM Space connects to the MCP Server and attempts to list the tools it exposes.

![MCP Server after saving, showing Connect & Test](./images/settings-08-mcp-test.png)

The test result appears above the Server details:

| Status | Meaning |
| --- | --- |
| Untested | Saved, but not tested yet. |
| Connected | Connected successfully and loaded the tool list. |
| Failed | Connection or protocol handshake failed. Check the configuration. |

After the test succeeds, you can add these MCP tools in the Thread's Tools area. MCP tool names usually include the Server prefix, for example:

```text
mcp__tavily__search
```

# Search

The Search page configures the search service used by the built-in `web_search` and `web_fetch` tools.

**Note: Search settings only apply to the built-in `web_search` and `web_fetch` tools.** They do not affect Model Providers, MCP tools, or normal Thread model calls.

![Search settings page](./images/settings-09-search.png)

Supported Search Providers:

| Provider | Description |
| --- | --- |
| Firecrawl | Default Search Provider. Requires a Firecrawl API Key. |
| Tavily | Optional Search Provider. Requires a Tavily API Key. |

API Keys on this page support two forms:

```text
Enter the API Key directly
```

Or reference environment variables:

```text
$FIRECRAWL_API_KEY
$TAVILY_API_KEY
```

If your Thread does not enable the `web_search` or `web_fetch` tool, the Provider and API Key settings here are not used during the run.

# Skills

The Skills page configures discovery folders for the built-in `skill()` tool. After a Thread enables the `skill()` tool, the model can request to load Skills from these folders.

**Note: Skills settings only apply to the built-in `skill()` tool.** They do not affect MCP tools, Custom Function Tools, or automatically add Skills as normal tools to a Thread.

![Skills settings page](./images/settings-10-skills.png)

## Skill Discovery Folders

The left side lists Skill discovery folders. LLM Space scans these folders and shows each Skill's name, description, and enabled state on the right.

Default folders usually include:

```text
~/.claude/skills
~/.codex/skills
~/.agents/skills
```

It may also include a Skill folder managed by LLM Space.

## Add and Remove Folders

Click `Add folder` to add a new Skill folder.

The folder must follow the Skill structure convention: each Skill is a subdirectory containing `SKILL.md`.

Example:

```text
my-skills/
  deep-research/
    SKILL.md
  writing-assistant/
    SKILL.md
```

You can remove a folder from the folder item's menu. Removing a folder only removes it from LLM Space's discovery list; it does not delete the actual files from disk.

## Enable and Disable Skills

Each Skill in the right-side list has its own switch:

- On: the `skill()` tool can discover and use this Skill.
- Off: the Skill is hidden and will not be provided to the `skill()` tool.

The folder item menu also supports `Enable all skills` and `Disable all skills`.

# Settings Storage Location

Most Settings are saved under the local data directory:

```text
~/.llm-space/settings
```

Common files:

| File | Content |
| --- | --- |
| `models.json` | Model Providers, API Key references, Base URLs, custom models, and model enabled state. |
| `mcp.json` | MCP Server configuration. |
| `search.json` | Search Provider and search API Key configuration. |
| `skills.json` | Skill discovery folders and hidden state. |
| `analytics.json` | Anonymous analytics setting and anonymous install ID. |
| `window.json` | Desktop window position, size, zoom, and related state. |

If settings behave unexpectedly, back up the entire `~/.llm-space` directory first, then inspect the corresponding JSON file.
