import {
  CircleHelpIcon,
  CloudSunIcon,
  Edit3Icon,
  FilePenLineIcon,
  FileOutputIcon,
  FileSearchIcon,
  FileTextIcon,
  FilesIcon,
  FolderSearchIcon,
  FolderTreeIcon,
  GlobeIcon,
  ImageIcon,
  ListChecksIcon,
  ListTodoIcon,
  ListTreeIcon,
  PackageCheckIcon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  type LucideIcon,
} from "lucide-react";

/** Stable icon keys set on each built-in tool's `icon` field (bun side). */
const ICON_BY_KEY: Record<string, LucideIcon> = {
  "file-text": FileTextIcon,
  "file-output": FileOutputIcon,
  "file-pen-line": FilePenLineIcon,
  pencil: Edit3Icon,
  "list-tree": ListTreeIcon,
  "folder-tree": FolderTreeIcon,
  "file-search": FileSearchIcon,
  "folder-search": FolderSearchIcon,
  terminal: TerminalIcon,
  globe: GlobeIcon,
  search: SearchIcon,
  sparkles: SparklesIcon,
  "circle-help": CircleHelpIcon,
  "cloud-sun": CloudSunIcon,
  files: FilesIcon,
  "list-todo": ListTodoIcon,
  "list-checks": ListChecksIcon,
  image: ImageIcon,
};

/** Fallback for tools persisted before the `icon` field existed. */
const ICON_KEY_BY_NAME: Record<string, string> = {
  read: "file-text",
  write: "file-output",
  edit: "pencil",
  apply_patch: "file-pen-line",
  ls: "list-tree",
  tree: "folder-tree",
  skill: "sparkles",
  grep: "file-search",
  glob: "folder-search",
  bash: "terminal",
  web_fetch: "globe",
  web_search: "search",
  weather_report: "cloud-sun",
  present_files: "files",
  todo_write: "list-todo",
  rewrite_todo_list: "list-checks",
  update_todo_status: "list-checks",
  ask_user_question: "circle-help",
  generate_image: "image",
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
