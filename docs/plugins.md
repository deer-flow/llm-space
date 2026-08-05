English | [中文](./plugins.zh-CN.md)

---

# Plugin Development Guide

An LLM Space Plugin is an npm-compatible package installed under `LLM_SPACE_HOME/plugins/`. A Plugin may contribute zero or more Extensions, including Skills, MCP servers, model providers, Tools, commands, and Thread Storages.

This guide describes the current Plugin system: package layout, metadata, Settings, supported Extensions, lifecycle, diagnostics, and development practices.

## 1. Concepts

A **Plugin** is the unit of distribution, versioning, configuration, reload, enablement, and disablement. An **Extension** is one capability contributed by a Plugin.

```text
Plugin
├── Metadata (package.json)
├── Settings (optional)
└── Extensions (zero or more)
    ├── Skill
    ├── MCP server
    ├── Model provider
    ├── Command
    └── Thread Storage
```

The main rules are:

- `package.json` is the only metadata file. Its `name` is also the stable Plugin ID.
- Extensions are discovered from conventional paths. They are not enumerated in `package.json`.
- A newly discovered Plugin is enabled by default.
- A Plugin can be enabled or disabled as a whole. Plugin Skills can also be enabled individually from Settings → Skills; other Extension types cannot currently be toggled individually.
- Plugin Settings are saved automatically. Changing Settings reloads the Plugin.
- Plugin files are read-only contributions. LLM Space does not rewrite `mcp.json`, `models.json`, Skill files, or executable Extension files.
- Local Plugins are fully trusted. Runtime process isolation is not a security sandbox.

## 2. Installation and discovery

`LLM_SPACE_HOME` defaults to `~/.llm-space`, so the default installation directory is:

```text
~/.llm-space/plugins/
```

Set `LLM_SPACE_HOME` before starting LLM Space to use a separate data directory.

### 2.1 Regular and scoped packages

The Plugin scanner recognizes these layouts:

```text
plugins/
├── weather-kit/
│   └── package.json
└── @example/
    └── team-tools/
        └── package.json
```

- Regular package: `plugins/<name>/package.json`
- Scoped package: `plugins/@<scope>/<name>/package.json`

Regular packages are scanned one level deep; scoped packages are scanned two levels deep. Discovery is not recursive and ignores `node_modules`.

The directory must match `package.json.name` exactly:

| Installation directory         | Required `name`       |
| ------------------------------ | --------------------- |
| `plugins/weather-kit/`         | `weather-kit`         |
| `plugins/@example/team-tools/` | `@example/team-tools` |

The Plugin root, Extension directories, and discovered files must be real directories or regular files. Symlinks are rejected, and discovered paths may not escape the Plugin root.

### 2.2 Extension discovery

LLM Space discovers Extensions only at these paths:

| Path                            | Extension                  |
| ------------------------------- | -------------------------- |
| `skills/*/SKILL.md`             | Skills                     |
| `mcp.json`                      | MCP servers and tools      |
| `models.json`                   | Model providers and models |
| `tools/*.{ts,js,mjs}`           | Executable Plugin Tools    |
| `commands/*.{ts,js,mjs}`        | Command Palette commands   |
| `thread-storages/*.{ts,js,mjs}` | Thread Storages            |
| `config.schema.json`            | Plugin Settings form       |

Except for the contents of each Skill directory, Extension discovery is not recursive. For example, `commands/open-dashboard.ts` is discovered, while `commands/admin/open-dashboard.ts` is not.

A complete Plugin might look like this:

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

Do not create empty directories merely to satisfy the layout. A Skill-only Plugin needs only `package.json` and its Skill directory.

## 3. Metadata in `package.json`

Minimal metadata:

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

Required fields:

- `name`: an npm-style package name and the Plugin ID. Use lowercase letters, digits, dots, underscores, and hyphens, optionally with a scope.
- `version`: a valid SemVer version.
- `engines["llm-space"]`: the supported LLM Space SemVer range.

`displayName`, `description`, `author`, `license`, and `homepage` are recommended. Other npm fields may remain in the file, but LLM Space does not execute code because a package declares `scripts`, `main`, `module`, `exports`, or `bin`.

Changing `name` creates a different Plugin identity. Settings and persisted references associated with the old name are not migrated automatically.

### 3.1 Icon

Place the icon at the Plugin root:

```text
icon.png
```

A 512 × 512 PNG is recommended. The file must be a valid PNG, no larger than 2 MiB, with neither dimension exceeding 4096 pixels. A missing or invalid icon falls back to the default Plugin icon and does not prevent loading.

## 4. Install, refresh, and reload

To install a Plugin manually:

1. Copy the complete Plugin directory to the correct location under `LLM_SPACE_HOME/plugins/`.
2. Open Settings → Plugins.
3. Select **Refresh plugins** to discover added, removed, or renamed packages.
4. Select the Plugin and inspect compatibility, location, Extensions, and diagnostics on the General tab.

After editing files in an already discovered Plugin, select **Reload** on that Plugin.

- **Refresh plugins** rescans the installation directory. Use it for additions, removals, and renames.
- **Reload** reloads one existing Plugin. Use it after changing its metadata, schema, configuration, or Extension files.

LLM Space does not download Plugins, run `npm install`, install dependencies, update packages, or roll versions back. Any runtime dependencies must be shipped with the Plugin directory.

## 5. Settings

Plugin enablement and configuration are stored in:

```text
LLM_SPACE_HOME/settings/plugins.json
```

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

A Plugin without a stored entry behaves as if it had:

```json
{
  "enabled": true,
  "settings": {}
}
```

Settings are saved automatically. Disabling or removing a Plugin does not delete its Settings, so reinstalling or re-enabling the same Plugin restores them.

If the Settings file is corrupt and cannot be recovered, third-party Plugins are disabled for that startup. The application itself continues to start.

### 5.1 Settings forms with JSON Schema

Add `config.schema.json` to generate the Plugin's Settings tab. The current form renderer supports:

- nested objects;
- `string`, `number`, `integer`, and `boolean`;
- `enum`;
- arrays of primitive values;
- `required`, `default`, `title`, and `description`.

Example:

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

Defaults are merged with previously saved values. Code Extensions receive a read-only Settings snapshot for each invocation. An invalid schema disables the form and records an Extension error without overwriting existing Settings.

### 5.2 Environment variables and Settings interpolation

Strings in `mcp.json` and `models.json` support:

```json
{
  "token": "$EXAMPLE_API_TOKEN",
  "url": "${settings.endpoint}/v1",
  "label": "Workspace: ${settings.workspace}"
}
```

- A complete string in the form `$ENV_NAME` reads that environment variable. A missing variable resolves to an empty string.
- `${settings.key}` reads Plugin Settings and supports nested paths such as `${settings.network.endpoint}`.
- Non-string Settings values are JSON-serialized before interpolation.

Keep passwords, API keys, and tokens in environment variables. Do not commit them to the Plugin directory.

## 6. Skills

Plugin Skills use the Agent Skills directory format:

```text
skills/
└── release-checklist/
    ├── SKILL.md
    ├── references/
    │   └── checklist.md
    └── scripts/
        └── verify.ts
```

Minimal `SKILL.md`:

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

Plugin Skills appear as a Plugin source in Settings → Skills. The source cannot be removed, but its menu supports revealing the directory and enabling or disabling all of its Skills. Each Skill can also be enabled or disabled individually.

These choices are stored as user overrides in LLM Space's Skills Settings; Plugin files are never modified. Disabled Plugin Skills remain visible in Settings but are excluded from `available_skills` and cannot be loaded by the built-in `skill()` tool. Disabling the entire Plugin removes all of its Skills from new Agent Runs. Re-enabling the Plugin restores the previous per-Skill choices.

## 7. MCP servers

`mcp.json` may declare one or more MCP servers. They are shown in Settings → MCP under **MCPs in Plugins** and remain separate from user-managed servers.

### 7.1 Stdio example

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

### 7.2 Streamable HTTP example

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

Each server requires:

- `id`: a stable ID unique within the Plugin;
- `name`: the display name;
- `transport`: `stdio`, `streamableHttp`, or `sse`.

LLM Space derives the final ID by adding the Plugin namespace:

```text
plugin:@example/team-tools:mcp:knowledge-base
```

Do not include this prefix in `mcp.json`. Plugin MCP definitions cannot be edited or removed from the MCP page; configure them with Plugin Settings or environment variables. Disabling the Plugin closes its MCP connections and rejects new calls.

Plugins can contribute local executable Tools through `tools/*.{ts,js,mjs}` or expose remote and shared tools through MCP.

## 8. Models

`models.json` can declare providers and models using an API adapter already supported by LLM Space:

- `anthropic-messages`
- `openai-completions`
- `openai-responses`

Example:

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

A Plugin can declare configuration but cannot load a custom provider implementation. Provider IDs are namespaced automatically. Plugin and user providers remain separate sources. Models from a disabled Plugin are unavailable to new Runs.

## 9. Plugin Tools

Plugin Tools are executable PI-compatible tools that can be added to a local
Thread. Every direct `tools/*.{ts,js,mjs}` file must default-export a class with
a zero-argument constructor:

```ts
export default class ProjectInfoTool {
  name = "project_info";
  description = "Read information about the current project.";
  parameters = {
    type: "object",
    properties: {},
    additionalProperties: false,
  };
  strict = true;

  async execute(context, args) {
    const cwd = context.variables.current_working_directory;
    const rawDefinition =
      context.thread.context?.variables?.current_working_directory;
    return { cwd, rawDefinition, args };
  }
}
```

The file name determines the stable Extension ID persisted with the Tool:

```text
tools/project-info.ts
→ plugin:@example/team-tools:tool:project-info
```

The class is instantiated once per Plugin load and may implement `dispose()`.
Changing the Plugin package name or Tool file name breaks persisted references.
Disabling or removing a Plugin does not delete its Tools from saved Threads;
calls fail as unavailable until the Plugin returns.

### 9.1 Tool context and variables

`execute(context, args)` receives the Thread that owns the Tool Call, not the
selected UI tab. `context.thread` is a detached, deeply frozen snapshot and has
no filename, tab API, or write method. Parallel Tool Calls in one batch share
the same Thread and resolved-variable snapshot.

`context.variables` resolves all configured variables at invocation time:

| Variable type | Resolved value |
| --- | --- |
| Custom, working directory, current date | String |
| Skills | Formatted string using the configured format |
| File | UTF-8 file contents |
| JSON | Parsed JSON value |

Empty or unresolvable variables are omitted. Original definitions remain under
`context.thread.context.variables`; custom variants remain under
`context.thread.context.variableVariants`. The context also exposes read-only
Plugin `settings` and common host methods such as `notify`, `openLink`,
`readWorkspaceFile`, and `writeWorkspaceFile`.

Ordinary string and JSON return values become text. For explicit text/image
Tool content, use:

```ts
return context.createResult([
  { type: "text", text: "Completed" },
  { type: "image", data: base64Data, mimeType: "image/png" },
]);
```

Plugin Tools are local-runtime only. They are not listed for remote Threads,
cannot execute remotely, and cannot currently be exported to LangGraph.

## 10. Commands

Commands are dynamic actions shown in the Command Palette. Every `commands/*.{ts,js,mjs}` file must default-export a class with a zero-argument constructor.

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

The file name determines the stable ID:

```text
commands/open-documentation.ts
→ plugin:@example/team-tools:command:open-documentation
```

Each class is instantiated once per Plugin load. An instance may hold short-lived in-memory state and may implement `dispose()` to clean up resources when the Plugin is disabled, reloaded, or the app exits.

### 10.1 Command context

`execute(context)` can use:

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
```

The palette accepts shell-style arguments after either the command's display
name or its stable file-stem alias. For example,
`sync skill "abc" '123'` exposes `["skill", "abc", "123"]` as both
`context.arguments` and the optional second `execute(context, arguments)`
parameter. Quotes group values and are not included in them.

`context.activeTab` is the thread tab that was active when the command started,
or `null` when the active tab is not a thread. Its `filename` identifies the
file and `thread` is a detached snapshot of the complete `Thread`, including
model, prompt variables, messages, tools, run history, and evaluations.
`activeTab.writeThread(thread)` stages a whole-thread replacement. LLM Space
validates and commits it only when the command succeeds, the same tab is still
active, and the pane has no run or persistence operation in progress; the
mounted pane is then refreshed from the committed value.

The currently allowed host Commands are `openSettings` and `refreshTree`. Other command types are rejected. Workspace file paths are resolved relative to the LLM Space workspace.

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

Plugin Commands currently appear only in the Command Palette. They do not automatically receive native menu entries, shortcuts, or context-menu entries.

## 11. Thread Storages

A Thread Storage reads a Thread from an external backend or writes a Thread to one. It does not replace the workspace: imported Threads are saved under the local `workspace/imported/` directory.

Each file must default-export a zero-argument class implementing `PluginThreadStorage`:

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

The response format in this example is illustrative. A real Storage must validate remote data before converting it to a valid LLM Space `Thread` or `ThreadLocator`.

### 11.1 Capabilities

| Capabilities                   | Required methods            | Product entry point |
| ------------------------------ | --------------------------- | ------------------- |
| `{ read: true, write: false }` | `resolveLatest()`, `read()` | Import from…        |
| `{ read: false, write: true }` | `write()`                   | Save to…            |
| `{ read: true, write: true }`  | all three methods           | both                |

`resolveLatest()` converts an opaque backend resource ID into a `ThreadLocator`. Both `filename` and `version` are optional. Callers should treat locators as opaque addresses rather than reconstructing them.

### 11.2 Deep links

A readable Storage may register:

```ts
deepLinkId = "team-library";
```

Production deep link:

```text
llm-space://threads/team-library/project/alpha?revision=latest
```

Development deep link:

```text
llm-space-dev://threads/team-library/project/alpha?revision=latest
```

LLM Space uses `threads` and `deepLinkId` to select the Storage. Everything after `team-library/`, including multiple path segments and the query string, is passed to that Storage as the resource identifier. A `deepLinkId` must be unique across enabled Storages and may contain lowercase letters, digits, dots, underscores, and hyphens.

A Plugin Storage deep link imports into the local workspace. It does not automatically add Web Viewer, public sharing, or `shared` route support.

## 12. Runtime and lifecycle

| Extension       | Runtime behavior                                   |
| --------------- | -------------------------------------------------- |
| Skills          | merged into the effective Skills list              |
| MCP             | connections managed from `mcp.json`                |
| Models          | merged into the effective provider and model lists |
| Commands        | loaded and executed in a Bun runtime               |
| Thread Storages | loaded and executed in a Bun runtime               |

LLM Space imports code files one at a time, invokes their zero-argument constructors, and validates their contracts. An import, constructor, or contract error disables only that Extension. It does not crash the application or disable unrelated Plugins.

Lifecycle events:

- **Discovery:** validate paths, metadata, compatibility, and Extension files.
- **Enable:** register Extensions and start required MCP or code runtimes.
- **Settings change:** save Settings and reload the Plugin.
- **Reload:** stop existing connections and instances, then rediscover and activate.
- **Disable:** reject new calls, remove Extensions, and close Plugin resources.
- **Shutdown:** best-effort `dispose()` calls and resource cleanup.

## 13. IDs, read-only sources, and conflicts

Stable Extension IDs are derived from the Plugin ID and a file name or local ID:

```text
plugin:@example/team-tools:mcp:knowledge-base
plugin:@example/team-tools:model-provider:example-cloud
plugin:@example/team-tools:command:open-documentation
plugin:@example/team-tools:thread-storage:team-library
```

Display names may repeat; canonical IDs may not. When IDs or canonical Skill names conflict, LLM Space does not choose a winner. Conflicting contributions remain inactive and the Plugin details show an Extension error with the files involved.

Plugin contributions and user configuration remain separate:

- Overall Plugin enablement does not rewrite user MCP or model configuration.
- Per-Skill visibility overrides are stored in `skills.json`, but Plugin Skill files are not modified.
- Plugin MCP and model definitions cannot be edited or removed from their respective Settings pages.
- To change a Plugin definition, edit its files or Settings and then reload it.

## 14. Trust and security

LLM Space currently has no Plugin trust prompt or permission manifest. Installing and enabling a local Plugin means fully trusting it.

- Runtime process isolation contains failures; it is not an operating-system sandbox.
- Plugin code can use Bun and Node APIs and can access files, processes, environment variables, and networks available to the current user.
- Plugins may ship and load dependencies. LLM Space does not audit their supply chain.
- Context APIs do not restrict a Plugin from calling system APIs directly.
- Do not install a Plugin from an untrusted source merely because it can later be disabled.

Plugin authors should:

- keep secrets in environment variables, not source, logs, or example files;
- validate remote JSON, file contents, and deep-link resource IDs at runtime;
- use reasonable network timeouts and respond to cancellation signals;
- exclude credentials, headers, full prompts, and tool payloads from errors;
- close connections, timers, and temporary resources in `dispose()`;
- avoid symlinks and dependencies on paths outside the Plugin directory.

## 15. Status, errors, and logs

| Status         | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| `active`       | enabled and all Extensions activated normally          |
| `degraded`     | usable, but at least one Extension failed              |
| `error`        | unable to activate normally                            |
| `incompatible` | `engines["llm-space"]` does not match this app version |
| `disabled`     | disabled by the user                                   |

The UI shows a safe summary, an `error-id`, and the log path. The complete error chain, stack, and sanitized, truncated process output are written to:

```text
LLM_SPACE_HOME/logs/plugins/<encoded-plugin-name>/<timestamp>-<stage>-<error-id>.log
```

Discovery failures without a valid Plugin ID are written to:

```text
LLM_SPACE_HOME/logs/plugins/_invalid/<timestamp>-discovery-<error-id>.log
```

Use **Reveal log** or **Copy path** from Settings → Plugins.

To troubleshoot startup while skipping all third-party Plugins for one run:

```sh
LLM_SPACE_DISABLE_PLUGINS=1 mise run dev
```

## 16. Minimal Plugin example

This example contributes one Command:

```text
plugins/hello-space/
├── package.json
└── commands/
    └── hello.ts
```

`package.json`:

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

`commands/hello.ts`:

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

Select **Refresh plugins** after copying the directory. The General tab should show one Command Extension, and **Say hello** should appear in the Command Palette.

Optionally add `config.schema.json`:

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

The Settings tab now displays an Audience field. Editing it saves automatically and reloads the Plugin.

## 17. Development checklist

Before distributing a Plugin, verify that:

- `package.json.name` exactly matches the installation directory;
- `version` is valid SemVer and `engines["llm-space"]` covers tested versions;
- `icon.png` satisfies the format and size limits;
- Extension files are direct children of their discovery directories;
- all runtime dependencies ship with the Plugin;
- the Settings schema accepts defaults and previously saved values;
- secrets come from environment variables;
- MCP commands, working directories, and remote URLs work in a clean environment;
- models use supported adapters and include all required fields;
- Command and Thread Storage constructors require no arguments;
- readable Storages return valid Threads and writable Storages return valid locators;
- deep links use a unique, stable `deepLinkId` and validate arbitrary suffixes;
- one failed Extension does not prevent other Extensions from working;
- reload, disable, enable, and shutdown clean up resources correctly;
- logs contain no secrets, full prompts, or sensitive tool payloads.

## 18. Currently unsupported

The current Plugin system does not include:

- before/after agent, turn, or model hooks;
- a Plugin marketplace;
- automatic installation, update, dependency installation, or rollback;
- project-scoped Plugins;
- Remote Runtime Plugins;
- permission manifests or trust review;
- per-Extension enablement except for Plugin Skills;
- custom Plugin Settings pages or other custom UI;
- automatic Web Viewer or public-sharing integration for Plugin Thread Storages.

These boundaries keep discovery predictable, failures diagnosable, and startup resilient while leaving room for compatible additions in future versions.
