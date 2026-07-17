"use client";

import {
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
import { Input } from "@llm-space/ui/ui/input";
import { ScrollArea } from "@llm-space/ui/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@llm-space/ui/ui/select";
import { Textarea } from "@llm-space/ui/ui/textarea";
import {
  Check,
  CircleAlert,
  CircleDot,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { format } from "timeago.js";

import {
  addMcpServer,
  disconnectMcpServer,
  listMcpServers,
  listMcpTools,
  removeMcpServer,
  updateMcpServer,
} from "@/client/mcp";

import { SettingsPage } from "./settings-page";

interface Row {
  key: string;
  value: string;
}

interface ServerForm {
  name: string;
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
    transport: form.transport,
    url: form.url,
    headers: _recordFromRows(form.headers),
  };
}

function _rowsFromRecord(record: Record<string, string> | undefined): Row[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }));
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

export function McpPage() {
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIdBeforeCreate, setSelectedIdBeforeCreate] = useState<
    string | null
  >(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ServerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [tools, setTools] = useState<McpToolView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const selectedServer = useMemo(
    () => servers.find((server) => server.id === selectedId) ?? null,
    [selectedId, servers]
  );
  const normalizedName = normalizeMcpName(form.name);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listMcpServers();
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
  }, [creating]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!creating) {
      setForm(_formFromServer(selectedServer));
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
    setTools([]);
  };

  const cancelCreate = () => {
    setCreating(false);
    setFormError(null);
    setTools([]);
    setSelectedId(
      selectedIdBeforeCreate &&
        servers.some((server) => server.id === selectedIdBeforeCreate)
        ? selectedIdBeforeCreate
        : (servers[0]?.id ?? null)
    );
    setSelectedIdBeforeCreate(null);
  };

  const save = async () => {
    setFormError(null);
    setSaving(true);
    try {
      const draft = _draftFromForm(form);
      const next =
        creating || !selectedId
          ? await addMcpServer(draft)
          : await updateMcpServer(selectedId, draft);
      setServers(next);
      const saved =
        creating || !selectedId
          ? [...next]
              .reverse()
              .find(
                (server) => server.serverName === normalizeMcpName(form.name)
              )
          : next.find((server) => server.id === selectedId);
      setCreating(false);
      setSelectedIdBeforeCreate(null);
      setSelectedId(saved?.id ?? next[0]?.id ?? null);
      toast.success("MCP server saved");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const testServer = async () => {
    if (!selectedServer) {
      return;
    }
    setFormError(null);
    setTesting(true);
    try {
      const response = await listMcpTools(selectedServer.id);
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
      await refresh();
      toast.error("Failed to connect MCP server", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setTesting(false);
    }
  };

  const disconnectServer = async () => {
    if (!selectedServer) {
      return;
    }
    setDisconnecting(true);
    try {
      const next = await disconnectMcpServer(selectedServer.id);
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
      const next = await removeMcpServer(selectedServer.id);
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
      <div className="flex h-full min-h-0 gap-6">
        <aside className="flex w-58 shrink-0 flex-col gap-3 border-r pr-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Servers
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
                  className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded transition-colors"
                  onClick={createServer}
                >
                  <Plus className="size-4" />
                </button>
              </Tooltip>
            </div>
          </div>
          <ScrollArea className="min-h-0 grow">
            <div className="flex flex-col gap-1 pr-2">
              {servers.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  className={cn(
                    "hover:bg-accent flex min-w-0 flex-col gap-1 rounded-md px-2 py-2 text-left transition-colors",
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
              {servers.length === 0 && !creating ? (
                <div className="text-muted-foreground px-1 py-2 text-xs">
                  No MCP servers.
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </aside>

        <main className="min-w-0 grow">
          {creating || selectedId ? (
            <ServerEditor
              form={form}
              normalizedName={normalizedName}
              server={selectedServer}
              formError={formError}
              saving={saving}
              testing={testing}
              disconnecting={disconnecting}
              creating={creating}
              tools={tools}
              onFormChange={(nextForm) => {
                setFormError(null);
                setForm(nextForm);
              }}
              onSave={() => void save()}
              onTest={() => void testServer()}
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

function ServerEditor({
  form,
  normalizedName,
  server,
  formError,
  saving,
  testing,
  disconnecting,
  creating,
  tools,
  onFormChange,
  onSave,
  onTest,
  onDisconnect,
  onCancel,
  onRemove,
}: {
  form: ServerForm;
  normalizedName: string;
  server: McpServerView | null;
  formError: string | null;
  saving: boolean;
  testing: boolean;
  disconnecting: boolean;
  creating: boolean;
  tools: McpToolView[];
  onFormChange: (form: ServerForm) => void;
  onSave: () => void;
  onTest: () => void;
  onDisconnect: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const patch = (partial: Partial<ServerForm>) =>
    onFormChange({ ...form, ...partial });
  const toolItems: McpToolSummary[] =
    tools.length > 0 ? tools : (server?.readiness?.tools ?? []);
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
              {normalizedName
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
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            Save
          </Button>
          {server ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={onTest}
                disabled={testing || disconnecting}
              >
                {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {server.connected ? "Retest" : "Connect & Test"}
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
  namePlaceholder,
  valuePlaceholder,
  onChange,
}: {
  label: string;
  rows: Row[];
  valueType?: "text" | "password";
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
        <div key={index} className="flex items-center gap-2">
          <Input
            value={row.key}
            placeholder={namePlaceholder}
            aria-label={`${label} ${index + 1} name`}
            onChange={(event) =>
              setRow(index, { ...row, key: event.target.value })
            }
          />
          <Input
            type={valueType}
            value={row.value}
            placeholder={valuePlaceholder}
            aria-label={`${label} ${index + 1} value`}
            onChange={(event) =>
              setRow(index, { ...row, value: event.target.value })
            }
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
        onClick={() => onChange([...rows, { key: "", value: "" }])}
      >
        <Plus /> Add {label.toLowerCase()}
      </Button>
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
