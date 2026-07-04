"use client";

import {
  parseJSON,
  uuid,
  type FunctionTool,
  type Message,
} from "@llm-space/core";
import {
  ActivityIcon,
  BotIcon,
  CloudSunIcon,
  CodeIcon,
  Edit3Icon,
  FileIcon,
  FileOutputIcon,
  FileSearchIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  ListTodoIcon,
  ListTreeIcon,
  PlayIcon,
  SearchIcon,
  SquareIcon,
  TerminalIcon,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CodeEditor } from "@/components/code-editor";
import { GeneratePopoverButton } from "@/components/thread-playground/generate-popover-button";
import {
  useThreadStore,
  useThreadStoreActions,
} from "@/components/thread-playground/stores/thread-store";
import { useStreamText } from "@/components/thread-playground/use-stream-text";

import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import metaToolPrompt from "../prompts/meta-tool.md?raw";

const DEFAULT_TOOL: FunctionTool = {
  name: "weather_report",
  description: "Get the weather report for a given location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The location to get the weather report for",
      },
    },
    required: ["location"],
  },
};

const WEB_SEARCH_TOOL: FunctionTool = {
  name: "web_search",
  description:
    "Searches the web for a given query and returns relevant results. Use when you need to find information, verify facts, or gather data from online sources. Do not use for queries requiring real-time personal or sensitive information.",
  strict: true,
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "The search query string to look up on the web",
      },
    },
    additionalProperties: false,
  },
};

const BASH_TOOL: FunctionTool = {
  name: "bash",
  description:
    "Executes a bash command and returns stdout, stderr, and exit code. Each invocation runs in a fresh shell — cwd, exported variables, and other shell state do not persist. Every command must be self-contained: re-cd to the target directory, re-export env vars, and re-source files as needed on every call.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "command"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining the purpose of the command",
      },
      command: {
        type: "string",
        description:
          "The bash command to execute. Must be self-contained — include cd, export, and any other setup inline, because prior invocations leave no lasting shell state.",
      },
    },
    additionalProperties: false,
  },
};

const READ_FILE_TOOL: FunctionTool = {
  name: "read",
  description:
    "Reads a file from the local filesystem. Use when you need to inspect source code, config, or any text file. Returns file contents; for images, returns a visual representation. Prefer this over bash for reading files.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining why this file is being read",
      },
      path: {
        type: "string",
        description: "Absolute path to the file to read",
      },
    },
    additionalProperties: false,
  },
};

const WRITE_FILE_TOOL: FunctionTool = {
  name: "write",
  description:
    "Writes content to a file on the local filesystem, creating parent directories if needed. Overwrites the file if it already exists. Use for creating new files or fully replacing file contents.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path", "contents"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what is being written and why",
      },
      path: {
        type: "string",
        description: "Absolute path to the file to write",
      },
      contents: {
        type: "string",
        description: "The full text content to write to the file",
      },
    },
    additionalProperties: false,
  },
};

const EDIT_TOOL: FunctionTool = {
  name: "edit",
  description:
    "Performs exact string replacement in a file. The old_string must match the file contents exactly (including whitespace and indentation). Use for surgical edits; prefer write_file when replacing the entire file.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path", "old_string", "new_string"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining the edit being made",
      },
      path: {
        type: "string",
        description: "Absolute path to the file to edit",
      },
      old_string: {
        type: "string",
        description:
          "The exact text to replace (must be unique within the file unless replace_all is true)",
      },
      new_string: {
        type: "string",
        description: "The replacement text (must differ from old_string)",
      },
      replace_all: {
        type: "boolean",
        description:
          "Replace all occurrences of old_string. Defaults to false (first match only).",
      },
    },
    additionalProperties: false,
  },
};

const LS_TOOL: FunctionTool = {
  name: "ls",
  description:
    "Lists files and directories at a given path. Returns entry names sorted by modification time (newest first). Use to explore directory structure before reading or editing files.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "path"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining why this directory is being listed",
      },
      path: {
        type: "string",
        description: "Absolute path to the directory to list",
      },
    },
    additionalProperties: false,
  },
};

const GREP_TOOL: FunctionTool = {
  name: "grep",
  description:
    "Search file contents with ripgrep. Supports regex patterns, glob filters, and context lines. Use to find symbols, usages, or text across the codebase. Prefer this over bash grep/rg for searching.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "pattern", "path"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what is being searched for",
      },
      pattern: {
        type: "string",
        description:
          "Regular expression pattern to search for in file contents",
      },
      path: {
        type: "string",
        description: "Absolute path to a file or directory to search in",
      },
      glob: {
        type: "string",
        description:
          'Glob filter for files (e.g. "*.ts", "**/*.tsx") — maps to rg --glob',
      },
      case_insensitive: {
        type: "boolean",
        description: "Case insensitive search",
      },
    },
    additionalProperties: false,
  },
};

const GLOB_TOOL: FunctionTool = {
  name: "glob",
  description:
    "Find files matching a glob pattern, sorted by modification time (newest first). Use when you need to locate files by name or extension rather than search their contents.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "glob_pattern"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what files are being searched for",
      },
      glob_pattern: {
        type: "string",
        description: 'Glob pattern to match (e.g. "*.ts", "**/test_*.ts")',
      },
      target_directory: {
        type: "string",
        description:
          "Absolute path to the directory to search in. Defaults to the workspace root if omitted.",
      },
    },
    additionalProperties: false,
  },
};

const PRESENT_FILES_TOOL: FunctionTool = {
  name: "present_files",
  description:
    "Presents one or more files to the user as rich visual cards in the chat, typically with download links. Use when delivering final artifacts, reports, charts, or other outputs the user should see or download. Not for your own inspection — use read_file instead.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "paths"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary explaining what files are being presented and why",
      },
      paths: {
        type: "array",
        items: {
          type: "string",
        },
        description: "Absolute paths to the files to present to the user",
      },
    },
    additionalProperties: false,
  },
};

const TODO_WRITE_TOOL: FunctionTool = {
  name: "todo_write",
  description:
    "Creates or updates the assistant's visible todo list for tracking multi-step work. Only use for non-trivial tasks with several concrete steps where tracking progress helps the user — skip it for single-step or trivial requests, where it just adds overhead. Each call replaces the entire list, so pass the full set of todos every time, and keep statuses current as work progresses.",
  strict: true,
  parameters: {
    type: "object",
    required: ["todos"],
    properties: {
      todos: {
        type: "array",
        description: "The complete set of todo items to display.",
        items: {
          type: "object",
          required: ["id", "content", "status"],
          properties: {
            id: {
              type: "string",
              description: "Stable unique identifier for this todo item.",
            },
            content: {
              type: "string",
              description: "Short description of the work item.",
            },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
              description: "Current state of the todo item.",
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};

const AGENT_TOOL: FunctionTool = {
  name: "agent",
  description:
    "Launches a sub-agent to autonomously carry out a self-contained task (e.g. a broad codebase search, multi-step research, or an isolated implementation) and returns its final result. Use to delegate work that doesn't need your ongoing input, or to run independent tasks in parallel. Do not use for simple lookups you can answer directly, or tasks that require interactive back-and-forth steering.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "prompt"],
    properties: {
      description: {
        type: "string",
        description: "A short (3-6 word) summary of the sub-agent's task.",
      },
      prompt: {
        type: "string",
        description:
          "The full, self-contained task for the sub-agent. It starts with no memory of this conversation, so include all relevant context, file paths, and the expected output.",
      },
      subagent_type: {
        type: "string",
        description:
          'Which specialized agent persona to launch (e.g. "general-purpose", "researcher", "code-reviewer"). Defaults to a general-purpose agent if omitted.',
      },
      run_in_background: {
        type: "boolean",
        description:
          "Run the sub-agent asynchronously and return immediately instead of blocking on its result. Defaults to false.",
      },
    },
    additionalProperties: false,
  },
};

const TASK_CREATE_TOOL: FunctionTool = {
  name: "task",
  description:
    "Starts a long-running command (a dev server, build, watcher, or other background process) and returns immediately with a task id, instead of blocking until it exits. Use for commands you expect to keep running or take a while, and check on later with task_monitor. Do not use for quick commands that finish right away — run those directly instead.",
  strict: true,
  parameters: {
    type: "object",
    required: ["description", "command"],
    properties: {
      description: {
        type: "string",
        description:
          "Must be the first parameter in the tool call. A short human-readable summary of what the task does",
      },
      command: {
        type: "string",
        description: "The shell command to run in the background",
      },
      timeout: {
        type: "number",
        description:
          "Optional maximum time in milliseconds to let the task run before it is automatically stopped",
      },
    },
    additionalProperties: false,
  },
};

const TASK_MONITOR_TOOL: FunctionTool = {
  name: "task_monitor",
  description:
    "Retrieves accumulated output (stdout/stderr) and current status from a task started with task_create. Use to check progress on a running task or read the result of one that has finished. Do not use on a task_id that was already killed with task_kill.",
  strict: true,
  parameters: {
    type: "object",
    required: ["task_id"],
    properties: {
      task_id: {
        type: "string",
        description: "The id of the task returned by task_create",
      },
      block: {
        type: "boolean",
        description:
          "Wait for the task to finish before returning, instead of immediately returning the output collected so far. Defaults to false.",
      },
    },
    additionalProperties: false,
  },
};

const TASK_KILL_TOOL: FunctionTool = {
  name: "task_kill",
  description:
    "Terminates a running background task started with task_create. Use once a task's output is no longer needed (e.g. a dev server you're done with), or to stop one that is stuck or misbehaving. Do not use on a task that has already finished — there's nothing to kill.",
  strict: true,
  parameters: {
    type: "object",
    required: ["task_id"],
    properties: {
      task_id: {
        type: "string",
        description:
          "The id of the task to terminate, as returned by task_create",
      },
    },
    additionalProperties: false,
  },
};

const GENERATE_IMAGE_TOOL: FunctionTool = {
  name: "generate_image",
  description:
    "Generate an image from a text prompt. Use when the user explicitly asks for an image, illustration, icon, mockup, or other visual asset. Do not use for data-heavy visualizations such as charts, plots, or tables — generate those with code instead.",
  strict: true,
  parameters: {
    type: "object",
    required: ["prompt", "aspect_ratio"],
    properties: {
      prompt: {
        type: "string",
        description:
          "A detailed description of the image: subject, layout, style, colors, text (if any), and constraints",
      },
      aspect_ratio: {
        type: "string",
        description:
          'Aspect ratio of the generated image (e.g. "1:1", "16:9", "9:16")',
      },
    },
    additionalProperties: false,
  },
};

const WEB_FETCH_TOOL: FunctionTool = {
  name: "web_fetch",
  description:
    "Fetches content from a specified URL and returns its contents in a readable markdown format. Use when you have a specific URL and need to read its text content, documentation, or articles. Do not use for search queries (use web_search instead) or binary file downloads.",
  strict: true,
  parameters: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        description:
          "The URL to fetch. Must be a fully qualified URL starting with http:// or https://",
      },
    },
    additionalProperties: false,
  },
};

type ToolExampleItem =
  | { type: "separator" }
  | { type: "tool"; label: string; tool: FunctionTool; icon: LucideIcon };

export const TOOL_EXAMPLES: ToolExampleItem[] = [
  {
    type: "tool",
    label: "get_weather",
    tool: DEFAULT_TOOL,
    icon: CloudSunIcon,
  },
  { type: "separator" },
  {
    type: "tool",
    label: "web_search",
    tool: WEB_SEARCH_TOOL,
    icon: SearchIcon,
  },
  {
    type: "tool",
    label: "web_fetch",
    tool: WEB_FETCH_TOOL,
    icon: GlobeIcon,
  },
  { type: "separator" },
  { type: "tool", label: "bash", tool: BASH_TOOL, icon: TerminalIcon },
  {
    type: "tool",
    label: "read",
    tool: READ_FILE_TOOL,
    icon: FileTextIcon,
  },
  {
    type: "tool",
    label: "write",
    tool: WRITE_FILE_TOOL,
    icon: FileOutputIcon,
  },
  { type: "tool", label: "edit", tool: EDIT_TOOL, icon: Edit3Icon },
  { type: "tool", label: "ls", tool: LS_TOOL, icon: ListTreeIcon },
  { type: "tool", label: "grep", tool: GREP_TOOL, icon: FileSearchIcon },
  { type: "tool", label: "glob", tool: GLOB_TOOL, icon: CodeIcon },
  {
    type: "tool",
    label: "present_files",
    tool: PRESENT_FILES_TOOL,
    icon: FileIcon,
  },
  { type: "separator" },
  {
    type: "tool",
    label: "todo_write",
    tool: TODO_WRITE_TOOL,
    icon: ListTodoIcon,
  },
  {
    type: "tool",
    label: "agent",
    tool: AGENT_TOOL,
    icon: BotIcon,
  },
  {
    type: "tool",
    label: "task_create",
    tool: TASK_CREATE_TOOL,
    icon: PlayIcon,
  },
  {
    type: "tool",
    label: "task_monitor",
    tool: TASK_MONITOR_TOOL,
    icon: ActivityIcon,
  },
  {
    type: "tool",
    label: "task_kill",
    tool: TASK_KILL_TOOL,
    icon: SquareIcon,
  },
  { type: "separator" },
  {
    type: "tool",
    label: "generate_image",
    tool: GENERATE_IMAGE_TOOL,
    icon: ImageIcon,
  },
];

export function ToolEditorDialog({
  open,
  onOpenChange,
  tool,
}: {
  open: boolean;

  onOpenChange: (open: boolean) => void;
  tool: FunctionTool | null;
}) {
  const { addTool, updateTool } = useThreadStoreActions();
  const threadModel = useThreadStore((s) => s.thread.model);
  const [text, setText] = useState("");
  const [originalName, setOriginalName] = useState<string | null>(null);

  const {
    text: generated,
    streaming,
    run: generate,
  } = useStreamText({
    systemPrompt: metaToolPrompt,
    reasoning: "off",
    // Use the thread's own model (id/provider only) when it has one.
    model: threadModel
      ? { id: threadModel.id, provider: threadModel.provider }
      : undefined,
  });

  // Stream the generated definition straight into the editor.
  useEffect(() => {
    if (generated) {
      setText(generated);
    }
  }, [generated]);

  const handleExampleSelect = (example: FunctionTool) => {
    setText(JSON.stringify(example, null, 2));
  };

  const handleGenerate = (prompt: string) => {
    // Feed the current definition (if any) as a prior assistant turn, so the
    // model refines it in response to the user's request.
    const original = text.trim();
    const messages: Message[] = original
      ? [
          {
            id: uuid(),
            role: "assistant",
            content: [
              { type: "text", text: `<original>\n${original}\n</original>` },
            ],
          },
        ]
      : [];
    void generate({
      messages,
      userPrompt: `<user-input>\n${prompt}\n</user-input>`,
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    if (tool) {
      setOriginalName(tool.name);
      setText(JSON.stringify(tool, null, 2));
    } else {
      setOriginalName(null);
      setText(JSON.stringify(DEFAULT_TOOL, null, 2));
    }
  }, [open, tool]);

  const handleSave = () => {
    let parsed: FunctionTool;
    try {
      parsed = parseJSON<FunctionTool>(text);
    } catch {
      toast.error("Error", { description: "Invalid JSON" });
      return;
    }

    const success = originalName
      ? updateTool(originalName, parsed)
      : addTool(parsed);

    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[75vh]! w-full flex-col gap-4 sm:max-w-4xl"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{originalName ? "Edit tool" : "Add tool"}</DialogTitle>
          <DialogDescription>
            A function tool consists of a name, description, and parameters.
            Parameters are defined using JSON Schema.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Definition</div>
            <div className="flex items-center gap-2">
              <GeneratePopoverButton
                placeholder="Describe what your function does (or paste your function declaration code), and we'll generate a definition."
                onGenerate={handleGenerate}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    Examples
                    <ChevronDown data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {TOOL_EXAMPLES.map((example, index) =>
                    example.type === "separator" ? (
                      <DropdownMenuSeparator key={`sep-${index}`} />
                    ) : (
                      (() => {
                        const Icon = example.icon;
                        return (
                          <DropdownMenuItem
                            key={example.label}
                            onSelect={() => handleExampleSelect(example.tool)}
                          >
                            <Icon />
                            {example.label}
                          </DropdownMenuItem>
                        );
                      })()
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <CodeEditor
            className="min-h-80 flex-1 font-mono text-sm"
            language="json"
            value={text}
            autoFocus
            readonly={streaming}
            onChange={setText}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>{tool ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
