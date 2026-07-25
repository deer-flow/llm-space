"use client";

import { cn } from "@llm-space/ui/lib/utils";
import { Button } from "@llm-space/ui/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@llm-space/ui/ui/dialog";
import { Input } from "@llm-space/ui/ui/input";
import { Separator } from "@llm-space/ui/ui/separator";
import {
  Check,
  Circle,
  ShieldAlert,
  Loader2,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  addRemoteServer,
  connectRemoteServer,
  disconnectRemoteServer,
  listRemoteServers,
  rejectRemoteServerHostKey,
  removeRemoteServer,
  subscribeRemoteServerStatusChanged,
  trustRemoteServerHostKey,
  updateRemoteServer,
} from "@/client/remote-servers";
import type {
  RemoteHostKeyTrustRequest,
  RemoteServerDraft,
  RemoteServerView,
} from "@/shared/remote-servers";
import type { RuntimeId } from "@/shared/runtime";

import { remoteConnectionFlow } from "./remote-server-display";
import { SettingsPage } from "./settings-page";

interface FormState {
  id?: string;
  name: string;
  host: string;
  user: string;
}

function _emptyForm(): FormState {
  return {
    name: "",
    host: "",
    user: "",
  };
}

export function RemoteServersPage({
  onConnected,
  onDisconnected,
}: {
  onConnected?: (runtimeId: RuntimeId) => void;
  onDisconnected?: (runtimeId: RuntimeId) => void;
}) {
  const [servers, setServers] = useState<RemoteServerView[]>([]);
  const serversRef = useRef<RemoteServerView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trustBusy, setTrustBusy] = useState(false);

  const selected = useMemo(
    () => servers.find((server) => server.id === selectedId) ?? null,
    [selectedId, servers]
  );

  const updateServers = useCallback((next: RemoteServerView[]) => {
    serversRef.current = next;
    setServers(next);
  }, []);

  const refresh = useCallback(async () => {
    const next = await listRemoteServers();
    updateServers(next);
    setSelectedId((current) =>
      current && next.some((server) => server.id === current)
        ? current
        : (next[0]?.id ?? null)
    );
  }, [updateServers]);

  useEffect(() => {
    void refresh().catch((error) =>
      toast.error("Failed to load remote servers", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    );
  }, [refresh]);

  useEffect(
    () =>
      subscribeRemoteServerStatusChanged(({ servers }) => {
        updateServers(servers);
        setSelectedId((current) =>
          current && servers.some((server) => server.id === current)
            ? current
            : (servers[0]?.id ?? null)
        );
      }),
    [updateServers]
  );

  const save = async () => {
    if (!form) return;
    try {
      const draft = _draft(form);
      const next = form.id
        ? await updateRemoteServer(form.id, draft)
        : await addRemoteServer(draft);
      updateServers(next);
      const nextId = form.id ?? next.at(-1)?.id ?? null;
      setSelectedId(nextId);
      setForm(null);
      toast.success("Remote server saved");
    } catch (error) {
      toast.error("Failed to save remote server", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  };

  const run = async (
    id: string,
    action: (id: string) => Promise<RemoteServerView[]>,
    options: { closeOnConnected?: boolean; notifyDisconnected?: boolean } = {}
  ) => {
    setBusyId(id);
    try {
      const previousRuntimeId = servers.find(
        (server) => server.id === id
      )?.runtimeId;
      const next = await action(id);
      updateServers(next);
      setSelectedId(id);
      if (options.closeOnConnected) {
        const connected = next.find((server) => server.id === id);
        if (connected?.status === "connected") onConnected?.(connected.runtimeId);
      }
      if (options.notifyDisconnected && previousRuntimeId) {
        onDisconnected?.(previousRuntimeId);
      }
    } catch (error) {
      let failed = serversRef.current.find((server) => server.id === id);
      try {
        const latest = await listRemoteServers();
        updateServers(latest);
        failed = latest.find((server) => server.id === id) ?? failed;
      } catch {
        // Keep the best-known local snapshot for the toast title.
      }
      toast.error(_failureTitle(failed), {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const trustHostKey = async (
    server: RemoteServerView,
    request: RemoteHostKeyTrustRequest
  ) => {
    setTrustBusy(true);
    try {
      const next = await trustRemoteServerHostKey(server.id, request.requestId);
      updateServers(next);
      const connected = next.find((item) => item.id === server.id);
      if (connected?.status === "connected") onConnected?.(connected.runtimeId);
    } catch (error) {
      toast.error("Failed to trust SSH host", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setTrustBusy(false);
    }
  };

  const rejectHostKey = async (
    server: RemoteServerView,
    request: RemoteHostKeyTrustRequest
  ) => {
    setTrustBusy(true);
    try {
      const next = await rejectRemoteServerHostKey(server.id, request.requestId);
      updateServers(next);
    } catch (error) {
      toast.error("Failed to cancel SSH host trust", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setTrustBusy(false);
    }
  };

  const startAdd = () => {
    setSelectedId(null);
    setForm(_emptyForm());
  };

  const startEdit = (server: RemoteServerView) => {
    setSelectedId(server.id);
    setForm(_form(server));
  };

  return (
    <SettingsPage
      title="Remote Servers"
      description="Connect LLM Space to a prepared SSH server. Passwords and passphrases are not stored."
      className="p-0"
    >
      <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] border-t">
        <aside className="bg-muted/20 flex min-h-0 flex-col border-r">
          <div className="flex h-11 items-center justify-between px-3">
            <span className="text-sm font-medium">Servers</span>
            <div className="flex gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Refresh remote servers"
                onClick={() => void refresh()}
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Add remote server"
                onClick={startAdd}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <Separator />
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {servers.length === 0 ? (
              <div className="text-muted-foreground p-4 text-sm">
                No remote servers. Click + to add one.
              </div>
            ) : (
              <div className="space-y-2">
                {servers.map((server) => (
                  <div
                    key={server.id}
                    className={cn(
                      "hover:bg-accent/70 flex w-full items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                      selectedId === server.id
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-card/30"
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 grow items-center gap-2 text-left"
                      onClick={() => {
                        setSelectedId(server.id);
                        setForm(null);
                      }}
                    >
                      <Server className="text-muted-foreground size-4 shrink-0" />
                      <span className="min-w-0 grow">
                        <span className="block truncate text-sm font-medium">
                          {server.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {server.user ? `${server.user}@` : ""}
                          {server.host}
                        </span>
                      </span>
                    </button>
                    {server.status === "connected" ? (
                      <span className="border-primary bg-primary/15 text-primary flex size-4 shrink-0 items-center justify-center rounded-full border">
                        <Check className="size-3" />
                      </span>
                    ) : server.status === "trust-required" ? (
                      <ShieldAlert className="size-4 shrink-0 text-amber-500" />
                    ) : busyId === server.id ||
                      server.status === "connecting" ? (
                      <Loader2 className="size-4 shrink-0 animate-spin" />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section className="min-h-0 overflow-auto p-5">
          {form ? (
            <RemoteServerForm
              form={form}
              onChange={setForm}
              onCancel={() => setForm(null)}
              onSave={() => void save()}
            />
          ) : selected ? (
            <RemoteServerDetails
              server={selected}
              busy={busyId === selected.id}
              onConnect={() =>
                void run(selected.id, connectRemoteServer, {
                  closeOnConnected: true,
                })
              }
              onDisconnect={() =>
                void run(selected.id, disconnectRemoteServer, {
                  notifyDisconnected: true,
                })
              }
              onEdit={() => startEdit(selected)}
              onRemove={() =>
                void run(selected.id, removeRemoteServer, {
                  notifyDisconnected: true,
                })
              }
              onTrustHostKey={(request) => void trustHostKey(selected, request)}
              onRejectHostKey={(request) => void rejectHostKey(selected, request)}
              trustBusy={trustBusy}
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              Select a server or click + to add one.
            </div>
          )}
        </section>
      </div>
    </SettingsPage>
  );
}

function RemoteServerDetails({
  server,
  busy,
  onConnect,
  onDisconnect,
  onEdit,
  onRemove,
  onTrustHostKey,
  onRejectHostKey,
  trustBusy,
}: {
  server: RemoteServerView;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onTrustHostKey: (request: RemoteHostKeyTrustRequest) => void;
  onRejectHostKey: (request: RemoteHostKeyTrustRequest) => void;
  trustBusy: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-medium">{server.name}</h3>
          <p className="text-muted-foreground truncate text-sm">
            {server.user ? `${server.user}@` : ""}
            {server.host}
          </p>
        </div>
      </div>
      <div className="grid gap-2 rounded-lg border p-3 text-sm">
        <Info label="Status" value={server.status} />
        <Info label="Runtime" value={server.runtimeId} />
        <Info label="Workspace" value={_remoteWorkspacePath(server)} />
      </div>
      <ConnectionFlow server={server} />
      {server.error ? (
        <p className="text-destructive text-sm">{server.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {server.status === "connected" ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={
              busy ||
              server.status === "connecting" ||
              server.status === "trust-required"
            }
            onClick={onConnect}
          >
            {server.status === "connecting" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {server.status === "connecting" ? "Connecting" : "Connect"}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={server.status === "connected"}
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
          <Trash2 className="size-4" />
          Remove
        </Button>
      </div>
      {server.trustRequest ? (
        <SshHostKeyDialog
          request={server.trustRequest}
          busy={trustBusy}
          onTrust={() => onTrustHostKey(server.trustRequest!)}
          onReject={() => onRejectHostKey(server.trustRequest!)}
        />
      ) : null}
    </div>
  );
}

function ConnectionFlow({ server }: { server: RemoteServerView }) {
  const steps = remoteConnectionFlow(server);
  if (steps.length === 0) return null;
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-sm font-medium">Connection flow</div>
      <div className="grid gap-2">
        {steps.map((step) => (
          <div key={step.stage} className="grid gap-1 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <StepIcon status={step.status} />
              <span className="min-w-0 grow truncate">{step.label}</span>
              <span className="text-muted-foreground text-xs capitalize">
                {step.status}
              </span>
            </div>
            {step.message ? (
              <div
                className="text-muted-foreground ml-5 truncate text-xs"
                title={step.message}
              >
                {step.message}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepIcon({
  status,
}: {
  status: NonNullable<RemoteServerView["steps"]>[number]["status"];
}) {
  if (status === "success") {
    return <Check className="text-primary size-3.5 shrink-0" />;
  }
  if (status === "running") {
    return <Loader2 className="text-primary size-3.5 shrink-0 animate-spin" />;
  }
  if (status === "error") {
    return <X className="text-destructive size-3.5 shrink-0" />;
  }
  return <Circle className="text-muted-foreground size-3.5 shrink-0" />;
}

function SshHostKeyDialog({
  request,
  busy,
  onTrust,
  onReject,
}: {
  request: RemoteHostKeyTrustRequest;
  busy: boolean;
  onTrust: () => void;
  onReject: () => void;
}) {
  const [verified, setVerified] = useState(false);
  const changed = request.kind === "changed";

  useEffect(() => {
    setVerified(false);
  }, [request.requestId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onReject()}>
      <DialogContent className="sm:max-w-xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {changed ? "SSH host key changed" : "Trust this SSH host?"}
          </DialogTitle>
          <DialogDescription>
            {changed
              ? "OpenSSH reports this host key changed. Continue only after you have verified this is the expected server."
              : "LLM Space has not connected to this SSH host before. Confirm the fingerprint before continuing."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 rounded-lg border p-3 text-sm">
          <Info label="Host" value={request.host} />
          <Info label="Target" value={request.target} />
          {request.resolvedHost ? (
            <Info label="Resolved" value={_endpoint(request)} />
          ) : null}
          {request.user ? <Info label="User" value={request.user} /> : null}
          <Info label="Key type" value={request.keyType} />
          <Info label="Fingerprint" value={request.fingerprint} />
          {request.knownHostsFile ? (
            <Info label="known_hosts" value={request.knownHostsFile} />
          ) : null}
          {request.knownHostsLine ? (
            <Info label="Offending line" value={String(request.knownHostsLine)} />
          ) : null}
        </div>
        {changed ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={verified}
              onChange={(event) => setVerified(event.target.checked)}
            />
            <span>
              I verified this host identity with the administrator or server
              console.
            </span>
          </label>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onReject}>
            Cancel
          </Button>
          <Button
            variant={changed ? "destructive" : "default"}
            disabled={busy || (changed && !verified)}
            onClick={onTrust}
          >
            {changed ? "Replace key and continue" : "Trust and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoteServerForm({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: FormState;
  onChange: (form: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">
          {form.id ? "Edit server" : "Add server"}
        </h3>
        <p className="text-muted-foreground text-sm">
          Configure SSH details such as port, identity file, and jump host in
          your system ~/.ssh/config.
        </p>
      </div>
      <div className="grid gap-3 rounded-lg border p-3">
        <Field
          label="Name"
          value={form.name}
          onChange={(name) => onChange({ ...form, name })}
        />
        <Field
          label="Host"
          value={form.host}
          onChange={(host) => onChange({ ...form, host })}
        />
        <Field
          label="User"
          value={form.user}
          onChange={(user) => onChange({ ...form, user })}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>
          {form.id ? "Update" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  title = value,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate" title={title}>
        <code>{value}</code>
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function _draft(form: FormState): RemoteServerDraft {
  return {
    name: form.name,
    host: form.host,
    user: form.user || undefined,
  };
}

function _form(server: RemoteServerView): FormState {
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    user: server.user ?? "",
  };
}

function _remoteWorkspacePath(server: RemoteServerView): string {
  return `${server.remoteHome.replace(/\/+$/, "")}/workspace`;
}

function _failureTitle(server: RemoteServerView | undefined): string {
  if (!server?.stageLabel || server.stage === "error") {
    return "Remote server action failed";
  }
  return `${server.stageLabel} failed`;
}

function _endpoint(request: RemoteHostKeyTrustRequest): string {
  const port = request.port ? `:${request.port}` : "";
  return `${request.resolvedHost}${port}`;
}
