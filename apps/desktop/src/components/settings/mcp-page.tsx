"use client";

import {
  buildMcpToolName,
  getMcpReadinessLabel,
  normalizeMcpName,
  type McpDiagnosticStep,
  type McpServerDraft,
  type McpServerReadiness,
  type McpServerView,
  type McpToolSummary,
  type McpToolView,
  type McpTransportType,
} from "@llm-space/core";
import { ConfirmDialog } from "@llm-space/ui/components/confirm-dialog";
import { Tooltip } from "@llm-space/ui/components/tooltip";
import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@llm-space/ui/ui/empty";
import { Input } from "@llm-space/ui/ui/input";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Switch } from "@llm-space/ui/ui/switch";
import { Textarea } from "@llm-space/ui/ui/textarea";
import {
  CircleAlert,
  CircleDot,
  Copy,
  Database,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ServerCog,
  Sparkles,
  Trash2,
  Unplug,
  Waypoints,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { format } from "timeago.js";

import {
  addMcpServer,
  cancelMcpTest,
  disconnectMcpServer,
  listMcpServers,
  listMcpTools,
  removeMcpServer,
  updateMcpServer,
} from "@/client/mcp";
import type { RuntimeId } from "@/shared/runtime";

import { SettingsPage } from "./settings-page";

interface Row {
  id: string;
  key: string;
  value: string;
}

interface ServerForm {
  name: string;
  useOriginalToolNames: boolean;
  transport: McpTransportType;
  command: string;
  argsText: string;
  cwd: string;
  env: Row[];
  url: string;
  headers: Row[];
}

const EMPTY_FORM: ServerForm = {
  name: "",
  useOriginalToolNames: false,
  transport: "stdio",
  command: "",
  argsText: "",
  cwd: "",
  env: [],
  url: "",
  headers: [],
};

function _formFromServer(server: McpServerView | null): ServerForm {
  if (!server) {
    return { ...EMPTY_FORM };
  }
  return {
    name: server.name,
    useOriginalToolNames: server.useOriginalToolNames ?? false,
    transport: server.transport,
    command: server.command ?? "",
    argsText: (server.args ?? []).join("\n"),
    cwd: server.cwd ?? "",
    env: _rowsFromRecord(server.env),
    url: server.url ?? "",
    headers: _rowsFromRecord(server.headers),
  };
}

function _draftFromForm(form: ServerForm): McpServerDraft {
  if (form.transport === "stdio") {
    return {
      name: form.name,
      useOriginalToolNames: form.useOriginalToolNames,
      transport: "stdio",
      command: form.command,
      args: form.argsText
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      cwd: form.cwd.trim() || null,
      env: _recordFromRows(form.env),
    };
  }
  return {
    name: form.name,
    useOriginalToolNames: form.useOriginalToolNames,
    transport: form.transport,
    url: form.url,
    headers: _recordFromRows(form.headers),
  };
}

function _rowsFromRecord(record: Record<string, string> | undefined): Row[] {
  return Object.entries(record ?? {}).map(([key, value]) =>
    _createRow(key, value)
  );
}

function _createRow(key = "", value = ""): Row {
  return { id: crypto.randomUUID(), key, value };
}

function _recordFromRows(rows: Row[]): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) {
      result[key] = row.value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function _canCreateServer(form: ServerForm): boolean {
  if (!normalizeMcpName(form.name)) {
    return false;
  }
  if (form.transport === "stdio") {
    return form.command.trim().length > 0;
  }
  try {
    new URL(form.url);
    return true;
  } catch {
    return false;
  }
}

export function McpPage({ runtimeId }: { runtimeId: RuntimeId }) {
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIdBeforeCreate, setSelectedIdBeforeCreate] = useState<
    string | null
  >(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ServerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [tools, setTools] = useState<McpToolView[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [cancellingTest, setCancellingTest] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const formRef = useRef(form);
  const preserveFormAfterCreateRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  formRef.current = form;

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedId) ?? null,
    [selectedId, servers]
  );
  const normalizedName = normalizeMcpName(form.name);
  const testing = selectedServer?.id === testingServerId;
  const userServers = servers.filter((server) => server.source !== "plugin");
  const pluginServers = servers.filter((server) => server.source === "plugin");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listMcpServers(runtimeId);
      setServers(next);
      setSelectedId((current) => {
        if (creating) {
          return current;
        }
        if (current && next.some((server) => server.id === current)) {
          return current;
        }
        return next[0]?.id ?? null;
      });
    } catch (error) {
      toast.error("Failed to load MCP servers", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }, [creating, runtimeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!creating) {
      if (preserveFormAfterCreateRef.current) {
        preserveFormAfterCreateRef.current = false;
      } else {
        setForm(_formFromServer(selectedServer));
        setDirty(false);
      }
      setTools([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset form only when the selected server's id changes, not on every object update (would clobber in-progress edits)
  }, [creating, selectedServer?.id]);

  const createServer = () => {
    setSelectedIdBeforeCreate(selectedId);
    setCreating(true);
    setSelectedId(null);
    setFormError(null);
    setForm({ ...EMPTY_FORM });
    setDirty(false);
    setTools([]);
  };

  const cancelCreate = () => {
    setCreating(false);
    setFormError(null);
    setDirty(false);
    setTools([]);
    setSelectedId(
      selectedIdBeforeCreate &&
        servers.some((server) => server.id === selectedIdBeforeCreate)
        ? selectedIdBeforeCreate
        : (servers[0]?.id ?? null)
    );
    setSelectedIdBeforeCreate(null);
  };

  const save = useCallback(
    async (
      snapshot: ServerForm,
      targetId: string | null,
      isCreating: boolean
    ) => {
      setFormError(null);
      setSaving(true);
      try {
        const draft = _draftFromForm(snapshot);
        const next =
          isCreating || !targetId
            ? await addMcpServer(draft, runtimeId)
            : await updateMcpServer(targetId, draft, runtimeId);
        setServers(next);
        const saved =
          isCreating || !targetId
            ? [...next]
                .reverse()
                .find(
                  (server) =>
                    server.serverName === normalizeMcpName(snapshot.name)
                )
            : next.find((server) => server.id === targetId);
        const hasNewerChanges = formRef.current !== snapshot;
        preserveFormAfterCreateRef.current = isCreating && hasNewerChanges;
        setCreating(false);
        setSelectedIdBeforeCreate(null);
        setSelectedId(saved?.id ?? next[0]?.id ?? null);
        if (!hasNewerChanges) {
          setDirty(false);
        }
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Please try again."
        );
      } finally {
        setSaving(false);
      }
    },
    [runtimeId]
  );

  useEffect(() => {
    if (
      !dirty ||
      saving ||
      formError !== null ||
      (creating && !_canCreateServer(form)) ||
      (!creating && !selectedId)
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void save(form, selectedId, creating);
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [creating, dirty, form, formError, save, saving, selectedId]);

  const testServer = async () => {
    if (!selectedServer) {
      return;
    }
    const server = selectedServer;
    setFormError(null);
    cancelRequestedRef.current = false;
    setTestingServerId(server.id);
    try {
      const response = await listMcpTools(server.id, runtimeId);
      setTools(response.tools);
      setServers((current) =>
        current.map((server) =>
          server.id === response.server.id ? response.server : server
        )
      );
      toast.success("MCP server connected", {
        description: `${response.tools.length} tool${response.tools.length === 1 ? "" : "s"} discovered`,
      });
    } catch (error) {
      setTools([]);
      if (
        cancelRequestedRef.current ||
        (error instanceof Error && error.message === "MCP test cancelled.")
      ) {
        return;
      }
      await refresh();
      toast.error("Failed to connect MCP server", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      cancelRequestedRef.current = false;
      setTestingServerId((current) => (current === server.id ? null : current));
    }
  };

  const cancelTest = async () => {
    if (!testingServerId) return;
    cancelRequestedRef.current = true;
    setCancellingTest(true);
    try {
      const next = await cancelMcpTest(testingServerId, runtimeId);
      setServers(next);
      setTools([]);
    } catch (error) {
      cancelRequestedRef.current = false;
      toast.error("Failed to cancel MCP test", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setCancellingTest(false);
    }
  };

  const disconnectServer = async () => {
    if (!selectedServer) {
      return;
    }
    setDisconnecting(true);
    try {
      const next = await disconnectMcpServer(selectedServer.id, runtimeId);
      setServers(next);
      setTools([]);
      toast.success("MCP server disconnected");
    } catch (error) {
      toast.error("Failed to disconnect MCP server", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const confirmRemove = async () => {
    if (!selectedServer) {
      return;
    }
    setRemoveOpen(false);
    try {
      const next = await removeMcpServer(selectedServer.id, runtimeId);
      setServers(next);
      setSelectedId(next[0]?.id ?? null);
      toast.success("MCP server removed");
    } catch (error) {
      toast.error("Failed to remove MCP server", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  return (
    <SettingsPage
      title="MCP"
      description="Connect a server to expose its tools, which you can then add to a thread's tools."
    >
      {loading && servers.length === 0 && !creating ? (
        <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Loading MCP servers
        </div>
      ) : servers.length === 0 && !creating ? (
        <McpEmptyState onAdd={createServer} />
      ) : (
        <div className="flex h-full min-h-0 gap-6">
        <aside className="flex w-58 shrink-0 flex-col gap-3 border-r pr-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              SERVERS
            </span>
            <div className="flex items-center gap-1">
              <Tooltip content="Refresh servers">
                <button
                  type="button"
                  aria-label="Refresh MCP servers"
                  className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
                  onClick={() => void refresh()}
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </button>
              </Tooltip>
              <Tooltip content="Add MCP server">
                <button
                  type="button"
                  aria-label="Add MCP server"
                  disabled={saving || dirty || testingServerId !== null}
                  className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors disabled:pointer-events-none disabled:opacity-50"
                  onClick={createServer}
                >
                  <Plus className="size-4" />
                </button>
              </Tooltip>
            </div>
          </div>
          <ScrollArea className="min-h-0 grow">
            <div className="flex flex-col gap-1 pr-2">
              {userServers.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  disabled={saving || dirty || testingServerId !== null}
                  className={cn(
                    "hover:bg-accent flex min-w-0 flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
                    selectedId === server.id && "bg-accent"
                  )}
                  onClick={() => {
                    setCreating(false);
                    setFormError(null);
                    setSelectedId(server.id);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusDot server={server} />
                    <span className="truncate text-sm font-medium">
                      {server.name}
                    </span>
                  </span>
                  <span className="text-muted-foreground truncate pl-4 font-mono text-xs">
                    {server.transport}
                  </span>
                  <span className="text-muted-foreground truncate pl-4 text-xs">
                    {_sidebarReadiness(server)}
                  </span>
                </button>
              ))}
              {creating ? (
                <button
                  type="button"
                  className="bg-accent flex min-w-0 flex-col gap-1 rounded-md px-2 py-2 text-left"
                >
                  <span className="truncate text-sm font-medium">
                    Unsaved server
                  </span>
                </button>
              ) : null}
              {pluginServers.length > 0 ? (
                <>
                  <div className="text-muted-foreground mt-5 px-2 text-xs font-medium tracking-wide uppercase">
                    MCPs in Plugins
                  </div>
                  {pluginServers.map((server) => (
                    <button
                      key={server.id}
                      type="button"
                      disabled={saving || dirty || testingServerId !== null}
                      className={cn(
                        "hover:bg-accent flex min-w-0 flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
                        selectedId === server.id && "bg-accent"
                      )}
                      onClick={() => {
                        setCreating(false);
                        setFormError(null);
                        setSelectedId(server.id);
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <StatusDot server={server} />
                        <span className="truncate text-sm font-medium">
                          {server.name}
                        </span>
                      </span>
                      <span className="text-muted-foreground truncate pl-4 font-mono text-xs">
                        {server.transport}
                      </span>
                      <span className="text-muted-foreground truncate pl-4 text-xs">
                        {_sidebarReadiness(server)}
                      </span>
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        <main className="min-w-0 grow">
          {selectedServer?.readOnly ? (
            <div className="flex h-full flex-col gap-4 overflow-auto p-6">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-lg font-medium">
                    {selectedServer.name}
                  </h3>
                  <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] uppercase">
                    Plugin · Read only
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {selectedServer.id}
                </p>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Transport: </span>
                {selectedServer.transport}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={testing ? "outline" : "secondary"}
                  onClick={() =>
                    testing ? void cancelTest() : void testServer()
                  }
                  disabled={disconnecting || cancellingTest}
                >
                  {testing ? (
                    cancellingTest ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <X />
                    )
                  ) : (
                    <RefreshCw />
                  )}
                  {testing
                    ? "Cancel"
                    : selectedServer.connected
                      ? "Retest"
                      : "Connect & Test"}
                </Button>
                {selectedServer.connected ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void disconnectServer()}
                    disabled={testing || disconnecting}
                  >
                    {disconnecting ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Unplug />
                    )}
                    Disconnect
                  </Button>
                ) : null}
              </div>
              <ReadinessPanel
                server={selectedServer}
                liveToolsLoaded={tools.length > 0}
              />
            </div>
          ) : creating || selectedId ? (
            <ServerEditor
              form={form}
              normalizedName={normalizedName}
              server={selectedServer}
              formError={formError}
              saving={saving}
              dirty={dirty}
              testing={testing}
              cancellingTest={cancellingTest}
              disconnecting={disconnecting}
              creating={creating}
              tools={tools}
              onFormChange={(nextForm) => {
                setFormError(null);
                setForm(nextForm);
                setDirty(true);
              }}
              onTest={() => void testServer()}
              onCancelTest={() => void cancelTest()}
              onDisconnect={() => void disconnectServer()}
              onCancel={cancelCreate}
              onRemove={() => setRemoveOpen(true)}
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Select or add an MCP server
            </div>
          )}
          </main>
        </div>
      )}
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove MCP Server"
        description={
          selectedServer
            ? `Remove ${selectedServer.name} from local MCP settings?`
            : undefined
        }
        confirmLabel="Remove"
        dimBackground={false}
        onConfirm={() => void confirmRemove()}
      />
    </SettingsPage>
  );
}

function McpEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Empty className="relative h-full overflow-hidden rounded-none border-0 p-0">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="bg-primary/10 absolute top-[8%] left-1/2 size-[28rem] -translate-x-1/2 rounded-full blur-3xl dark:bg-blue-500/10" />
        <div className="absolute inset-x-[8%] top-[8%] h-[58%] bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--color-primary)_13%,transparent),transparent_68%)]" />
      </div>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center gap-8 px-5 py-8">
        <EmptyHeader className="max-w-xl gap-3">
          <EmptyMedia className="relative mb-1 size-32" aria-hidden>
            <div className="border-primary/20 bg-background/70 shadow-primary/10 absolute inset-[25%] z-10 flex items-center justify-center rounded-2xl border shadow-xl backdrop-blur-xl">
              <ServerCog className="text-primary size-7" />
            </div>
            {[
              { Icon: Search, className: "top-0 left-1/2 -translate-x-1/2" },
              { Icon: Database, className: "bottom-1 left-1" },
              { Icon: FileText, className: "right-1 bottom-1" },
            ].map(({ Icon, className }, index) => (
              <div
                key={index}
                className={`border-border/70 bg-background/65 text-muted-foreground absolute flex size-9 items-center justify-center rounded-xl border shadow-sm backdrop-blur-md ${className}`}
              >
                <Icon className="size-4" />
              </div>
            ))}
            <Waypoints className="text-primary/25 absolute inset-0 size-full stroke-[0.7]" />
          </EmptyMedia>
          <span className="text-muted-foreground text-xs font-semibold tracking-[0.22em] uppercase">
            No MCP servers
          </span>
          <EmptyTitle className="text-foreground text-3xl font-semibold sm:text-4xl">
            Connect tools through MCP
          </EmptyTitle>
          <EmptyDescription className="max-w-lg text-base leading-relaxed">
            Add a local command or remote endpoint, discover its tools, and make
            those capabilities available to your threads.
          </EmptyDescription>
        </EmptyHeader>

        <EmptyContent className="max-w-none">
          <Button size="lg" onClick={onAdd}>
            <Plus className="size-4" />
            Add MCP server
          </Button>
        </EmptyContent>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
          <EmptyFeature
            icon={<ServerCog />}
            title="Local or remote"
            description="Connect with stdio, HTTP, or SSE transports."
          />
          <EmptyFeature
            icon={<Sparkles />}
            title="Discover tools"
            description="Test the connection and inspect exposed capabilities."
          />
          <EmptyFeature
            icon={<Waypoints />}
            title="Use in threads"
            description="Choose the tools each thread can call."
          />
        </div>
      </div>
    </Empty>
  );
}

function EmptyFeature({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border/70 bg-card/55 flex gap-3 rounded-xl border p-4 text-left shadow-sm backdrop-blur-md">
      <div className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function ServerEditor({
  form,
  normalizedName,
  server,
  formError,
  saving,
  dirty,
  testing,
  cancellingTest,
  disconnecting,
  creating,
  tools,
  onFormChange,
  onTest,
  onCancelTest,
  onDisconnect,
  onCancel,
  onRemove,
}: {
  form: ServerForm;
  normalizedName: string;
  server: McpServerView | null;
  formError: string | null;
  saving: boolean;
  dirty: boolean;
  testing: boolean;
  cancellingTest: boolean;
  disconnecting: boolean;
  creating: boolean;
  tools: McpToolView[];
  onFormChange: (form: ServerForm) => void;
  onTest: () => void;
  onCancelTest: () => void;
  onDisconnect: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const patch = (partial: Partial<ServerForm>) =>
    onFormChange({ ...form, ...partial });
  const savedToolItems: McpToolSummary[] =
    tools.length > 0 ? tools : (server?.readiness?.tools ?? []);
  const previewServerName = normalizedName || server?.serverName || "server";
  const toolItems = savedToolItems.map((tool) => ({
    ...tool,
    directName: buildMcpToolName({
      serverName: previewServerName,
      toolName: tool.normalizedToolName,
      useOriginalToolNames: form.useOriginalToolNames,
    }),
  }));
  const toolsLabel =
    tools.length > 0
      ? "Current test"
      : server?.readiness?.testedAt
        ? `Last test ${format(server.readiness.testedAt)}`
        : null;
  return (
    <ScrollArea className="h-full">
      <div className="flex max-w-2xl flex-col gap-6 pb-6">
        <div className="flex items-center gap-2">
          <div className="min-w-0 grow">
            <h3 className="font-heading truncate text-lg font-medium">
              {form.name || "MCP Server"}
            </h3>
            <div className="text-muted-foreground font-mono text-xs">
              {form.useOriginalToolNames
                ? "tool"
                : normalizedName
                  ? `mcp__${normalizedName}__tool`
                  : "mcp__server__tool"}
            </div>
          </div>
          {creating ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          ) : null}
          {server ? (
            <>
              <Button
                size="sm"
                variant={testing ? "outline" : "secondary"}
                onClick={testing ? onCancelTest : onTest}
                disabled={disconnecting || saving || dirty || cancellingTest}
              >
                {testing ? (
                  cancellingTest ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <X />
                  )
                ) : (
                  <RefreshCw />
                )}
                {testing
                  ? "Cancel"
                  : server.connected
                    ? "Retest"
                    : "Connect & Test"}
              </Button>
              {server.connected ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onDisconnect}
                  disabled={testing || disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Unplug />
                  )}
                  Disconnect
                </Button>
              ) : null}
              <Tooltip content="Remove MCP server">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Remove MCP server"
                  onClick={onRemove}
                >
                  <Trash2 className="size-4" />
                </Button>
              </Tooltip>
            </>
          ) : null}
        </div>

        {formError ? (
          <div className="border-destructive/40 text-destructive flex items-start gap-2 rounded-md border px-3 py-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">{formError}</span>
          </div>
        ) : null}

        {server ? (
          <ReadinessPanel server={server} liveToolsLoaded={tools.length > 0} />
        ) : null}

        <Field label="Name">
          <Input
            value={form.name}
            aria-label="MCP server name"
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>

        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium">Use original tool names</span>
            <span className="text-muted-foreground text-xs">
              Expose tools without the MCP server prefix, for example web_fetch.
            </span>
          </div>
          <Switch
            checked={form.useOriginalToolNames}
            aria-label="Use original MCP tool names without a prefix"
            onCheckedChange={(useOriginalToolNames) =>
              patch({ useOriginalToolNames })
            }
          />
        </div>

        <Field label="Transport">
          <Select
            value={form.transport}
            onValueChange={(value) =>
              patch({ transport: value as McpTransportType })
            }
          >
            <SelectTrigger className="w-full" aria-label="MCP transport">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stdio">stdio</SelectItem>
              <SelectItem value="streamableHttp">Streamable HTTP</SelectItem>
              <SelectItem value="sse">SSE</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {form.transport === "stdio" ? (
          <>
            <Field label="Command">
              <Input
                value={form.command}
                aria-label="MCP stdio command"
                placeholder="npx"
                onChange={(event) => patch({ command: event.target.value })}
              />
            </Field>
            <Field label="Args">
              <Textarea
                className="min-h-18"
                value={form.argsText}
                aria-label="MCP stdio args"
                placeholder={"-y\n@modelcontextprotocol/server-filesystem"}
                onChange={(event) => patch({ argsText: event.target.value })}
              />
            </Field>
            <Field label="Working directory">
              <Input
                value={form.cwd}
                aria-label="MCP stdio working directory"
                onChange={(event) => patch({ cwd: event.target.value })}
              />
            </Field>
            <KeyValueRows
              label="Environment"
              rows={form.env}
              valueType="password"
              revealValue
              namePlaceholder="KEY"
              valuePlaceholder="$TOKEN"
              onChange={(env) => patch({ env })}
            />
          </>
        ) : (
          <>
            <Field label="URL">
              <Input
                value={form.url}
                aria-label="MCP remote URL"
                placeholder="https://example.com/mcp"
                onChange={(event) => patch({ url: event.target.value })}
              />
            </Field>
            <KeyValueRows
              label="Headers"
              rows={form.headers}
              valueType="password"
              namePlaceholder="Authorization"
              valuePlaceholder="Bearer $TOKEN"
              onChange={(headers) => patch({ headers })}
            />
          </>
        )}

        {server ? (
          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-medium">Tools</span>
              {server.toolCount !== null ? (
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                  {server.toolCount}
                </span>
              ) : null}
              {toolsLabel ? (
                <span className="text-muted-foreground truncate text-xs">
                  {toolsLabel}
                </span>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              {toolItems.length === 0 ? (
                <div className="text-muted-foreground px-1 py-2 text-xs">
                  No tools loaded.
                </div>
              ) : (
                toolItems.map((tool) => (
                  <ToolSummaryRow
                    key={`${tool.directName}:${tool.toolName}`}
                    tool={tool}
                  />
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function ReadinessPanel({
  server,
  liveToolsLoaded,
}: {
  server: McpServerView;
  liveToolsLoaded: boolean;
}) {
  const readiness = server.readiness ?? _emptyReadiness();
  const label = getMcpReadinessLabel(readiness);
  const statusClass =
    readiness.status === "ready"
      ? "text-emerald-400"
      : readiness.status === "error"
        ? "text-destructive"
        : readiness.status === "stale"
          ? "text-amber-400"
          : "text-muted-foreground";
  const detail = _readinessDetail(readiness, liveToolsLoaded);
  const diagnostic = readiness.diagnostic;

  return (
    <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <StatusDot server={server} />
        <span className={cn("text-sm font-medium", statusClass)}>{label}</span>
        <span className="text-muted-foreground truncate text-xs">{detail}</span>
      </div>
      {server.lastError ? (
        <div className="text-destructive flex min-w-0 items-start gap-2 text-xs">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{server.lastError}</span>
        </div>
      ) : null}
      {server.connected ? (
        <div className="text-muted-foreground text-xs">
          Connected now in this app session.
        </div>
      ) : readiness.status === "ready" || readiness.status === "stale" ? (
        <div className="text-muted-foreground text-xs">
          Not connected. This is the last saved test result.
        </div>
      ) : null}
      {diagnostic ? (
        <div className="border-border/70 mt-1 flex flex-col gap-2 border-t pt-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium">Diagnostics</div>
              <div className="text-muted-foreground truncate text-xs">
                {diagnostic.headline}
              </div>
            </div>
            <Tooltip content="Copy diagnostic summary">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Copy diagnostic summary"
                onClick={() => void _copyDiagnosticSummary(diagnostic.summary)}
              >
                <Copy className="size-3.5" />
              </Button>
            </Tooltip>
          </div>
          {diagnostic.endpoint ? (
            <div className="text-muted-foreground truncate font-mono text-[11px]">
              {diagnostic.endpoint}
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            {diagnostic.steps.map((step) => (
              <DiagnosticStepRow key={step.id} step={step} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders one persisted diagnostic phase. Input is already redacted by the Bun
 * process; this component only maps status to compact visual state.
 */
function DiagnosticStepRow({ step }: { step: McpDiagnosticStep }) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-xs">
      <span
        className={cn(
          "mt-1.5 size-1.5 shrink-0 rounded-full",
          step.status === "passed"
            ? "bg-emerald-500"
            : step.status === "failed"
              ? "bg-destructive"
              : "bg-muted-foreground/50"
        )}
      />
      <div className="min-w-0 grow">
        <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
          <span className="font-medium">{step.label}</span>
          <span className="text-muted-foreground">{step.message}</span>
        </div>
        {step.detail ? (
          <div
            className={cn(
              "break-words",
              step.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {step.detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Copies the redacted diagnostic summary for support/debugging. It has no app
 * state side effects beyond a toast because the summary is already persisted.
 */
async function _copyDiagnosticSummary(summary: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(summary);
    toast.success("Diagnostic copied");
  } catch (error) {
    toast.error("Failed to copy diagnostic", {
      description: error instanceof Error ? error.message : "Please try again.",
    });
  }
}

function ToolSummaryRow({ tool }: { tool: McpToolSummary }) {
  const schemaJson = JSON.stringify(tool.inputSchema, null, 2);
  return (
    <div className="bg-muted/40 flex min-w-0 flex-col gap-1.5 rounded-md px-2 py-1.5">
      <div className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            tool.available ? "bg-emerald-500" : "bg-destructive"
          )}
        />
        <div className="min-w-0 grow">
          <div className="truncate font-mono text-xs">{tool.directName}</div>
          <div className="text-muted-foreground truncate font-mono text-[11px]">
            raw: {tool.toolName}
          </div>
          {tool.description ? (
            <div className="text-muted-foreground line-clamp-2 text-xs">
              {tool.description}
            </div>
          ) : null}
          <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span>required: {_joinOrNone(tool.requiredFields)}</span>
            <span>properties: {_joinOrNone(tool.topLevelProperties)}</span>
          </div>
          {tool.disabledReason ? (
            <div className="text-destructive text-xs">
              {tool.disabledReason}
            </div>
          ) : null}
          <details className="text-muted-foreground mt-1 text-xs">
            <summary className="cursor-pointer select-none">
              JSON schema
            </summary>
            <pre className="border-border bg-background/60 mt-1 max-h-48 overflow-auto rounded border p-2 text-[11px] whitespace-pre-wrap">
              {schemaJson}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}

function KeyValueRows({
  label,
  rows,
  valueType = "text",
  revealValue = false,
  namePlaceholder,
  valuePlaceholder,
  onChange,
}: {
  label: string;
  rows: Row[];
  valueType?: "text" | "password";
  revealValue?: boolean;
  namePlaceholder: string;
  valuePlaceholder: string;
  onChange: (rows: Row[]) => void;
}) {
  const setRow = (index: number, row: Row) =>
    onChange(rows.map((item, itemIndex) => (itemIndex === index ? row : item)));
  const removeRow = (index: number) =>
    onChange(rows.filter((_, itemIndex) => itemIndex !== index));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {rows.map((row, index) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            value={row.key}
            placeholder={namePlaceholder}
            aria-label={`${label} ${index + 1} name`}
            onChange={(event) =>
              setRow(index, { ...row, key: event.target.value })
            }
          />
          <SecretValueInput
            type={valueType}
            revealable={revealValue}
            value={row.value}
            placeholder={valuePlaceholder}
            aria-label={`${label} ${index + 1} value`}
            onChange={(value) => setRow(index, { ...row, value })}
          />
          <Tooltip content={`Remove ${label.toLowerCase()} row`}>
            <button
              type="button"
              aria-label={`Remove ${label} row ${index + 1}`}
              className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 shrink-0 items-center justify-center rounded transition-colors"
              onClick={() => removeRow(index)}
            >
              <Trash2 className="size-4" />
            </button>
          </Tooltip>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange([...rows, _createRow()])}
      >
        <Plus /> Add {label.toLowerCase()}
      </Button>
    </div>
  );
}

function SecretValueInput({
  type,
  revealable,
  value,
  placeholder,
  "aria-label": ariaLabel,
  onChange,
}: {
  type: "text" | "password";
  revealable: boolean;
  value: string;
  placeholder: string;
  "aria-label": string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative w-full">
      <Input
        type={revealable && visible ? "text" : type}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={revealable ? "pr-9" : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {revealable ? (
        <Tooltip content={visible ? "Hide value" : "Show value"}>
          <button
            type="button"
            aria-label={`${visible ? "Hide" : "Show"} ${ariaLabel}`}
            aria-pressed={visible}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded transition-colors"
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

function StatusDot({ server }: { server: McpServerView }) {
  const status = server.readiness?.status ?? "untested";
  if (status === "error" || server.lastError) {
    return <CircleAlert className="text-destructive size-3.5 shrink-0" />;
  }
  if (status === "ready" || server.connected) {
    return <CircleDot className="size-3.5 shrink-0 text-emerald-500" />;
  }
  if (status === "stale") {
    return <CircleDot className="size-3.5 shrink-0 text-amber-400" />;
  }
  return <CircleDot className="text-muted-foreground size-3.5 shrink-0" />;
}

function _emptyReadiness(): McpServerReadiness {
  return { status: "untested", toolCount: null, tools: [] };
}

function _readinessDetail(
  readiness: McpServerReadiness,
  liveToolsLoaded: boolean
): string {
  const parts: string[] = [];
  if (readiness.toolCount !== null) {
    parts.push(
      `${readiness.toolCount} tool${readiness.toolCount === 1 ? "" : "s"}`
    );
  }
  if (readiness.testedAt) {
    parts.push(
      `${liveToolsLoaded ? "tested" : "last tested"} ${format(readiness.testedAt)}`
    );
  }
  return parts.join(" · ") || "Run Test to discover tools";
}

function _joinOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

function _sidebarReadiness(server: McpServerView): string {
  const readiness = server.readiness ?? _emptyReadiness();
  const label = getMcpReadinessLabel(readiness);
  if (readiness.toolCount === null) {
    return label;
  }
  return `${label} · ${readiness.toolCount} tool${
    readiness.toolCount === 1 ? "" : "s"
  }`;
}
