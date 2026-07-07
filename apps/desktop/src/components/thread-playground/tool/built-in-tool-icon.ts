import {
  CloudSunIcon,
  Edit3Icon,
  FileOutputIcon,
  FileSearchIcon,
  FileTextIcon,
  FilesIcon,
  FolderSearchIcon,
  GlobeIcon,
  ListTodoIcon,
  ListTreeIcon,
  PackageCheckIcon,
  SearchIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";

/** Stable icon keys set on each built-in tool's `icon` field (bun side). */
const ICON_BY_KEY: Record<string, LucideIcon> = {
  "file-text": FileTextIcon,
  "file-output": FileOutputIcon,
  pencil: Edit3Icon,
  "list-tree": ListTreeIcon,
  "file-search": FileSearchIcon,
  "folder-search": FolderSearchIcon,
  terminal: TerminalIcon,
  globe: GlobeIcon,
  search: SearchIcon,
  "cloud-sun": CloudSunIcon,
  files: FilesIcon,
  "list-todo": ListTodoIcon,
};

/** Fallback for tools persisted before the `icon` field existed. */
const ICON_KEY_BY_NAME: Record<string, string> = {
  read: "file-text",
  write: "file-output",
  edit: "pencil",
  ls: "list-tree",
  grep: "file-search",
  glob: "folder-search",
  bash: "terminal",
  web_fetch: "globe",
  web_search: "search",
  weather_report: "cloud-sun",
  present_files: "files",
  todo_write: "list-todo",
};

/**
 * Resolve a built-in tool's icon from its `icon` key, falling back to a
 * name-based lookup for legacy tools and finally a generic icon.
 */
export function getBuiltInToolIcon(tool: {
  name: string;
  icon?: string;
}): LucideIcon {
  const key = tool.icon ?? ICON_KEY_BY_NAME[tool.name];
  return (key ? ICON_BY_KEY[key] : undefined) ?? PackageCheckIcon;
}
