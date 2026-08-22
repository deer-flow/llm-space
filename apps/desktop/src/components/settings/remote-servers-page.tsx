"use client";

import { formatString, useI18n } from "@llm-space/ui/lib/i18n";
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
  FolderSync,
  ShieldAlert,
  ShieldCheck,
  Laptop,
  Loader2,
  Network,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  RemoteDisconnectResult,
  RemoteHostKeyTrustRequest,
  RemoteServerDraft,
  RemoteServerView,
} from "@/shared/remote-servers";
import type { RuntimeId } from "@/shared/runtime";

import {
  runRemoteRuntimeActionIfAllowed,
  type RemoteRuntimeActionOutcome,
} from "../remote-runtime-actions";
import { runRemoteTrustContinuationIfAllowed } from "../remote-trust-continuation";

import {
  canConnectRemoteServer,
  canEditRemoteServer,
  canRemoveRemoteServer,
  remoteConnectionFlow,
} from "./remote-server-display";
import { SettingsEmptyState } from "./settings-empty-state";
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
  canConnect,
  canDisconnect,
  acquireConnect,
  acquireDisconnect,
  onConnected,
  onDisconnected,
}: {
  canConnect?: () => boolean;
  canDisconnect?: (runtimeId: RuntimeId) => boolean;
  acquireConnect?: () => (() => void) | null;
  acquireDisconnect?: (runtimeId: RuntimeId) => (() => void) | null;
  onConnected?: (runtimeId: RuntimeId) => void;
  onDisconnected?: (runtimeId: RuntimeId) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [servers, setServers] = useState<RemoteServerView[]>([]);
  const serversRef = useRef<RemoteServerView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [trustBusy, setTrustBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const selected = useMemo(
    () => servers.find((server) => server.id === selectedId) ?? null,
    [selectedId, servers]
  );

  const updateServers = useCallback((next: RemoteServerView[]) => {
    serversRef.current = next;
    setServers(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listRemoteServers();
      updateServers(next);
      setSelectedId((current) =>
        current && next.some((server) => server.id === current)
          ? current
          : (next[0]?.id ?? null)
      );
    } finally {
      setLoading(false);
    }
  }, [updateServers]);

  useEffect(() => {
    void refresh().catch((error) =>
      toast.error(t.settings.remoteServers.failedToLoad, {
        description:
          error instanceof Error ? error.message : t.common.pleaseTryAgain,
      })
    );
  }, [refresh, t]);

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
    const previousRuntimeId = form.id
      ? servers.find((server) => server.id === form.id)?.runtimeId
      : undefined;
    const persist = async (): Promise<boolean> => {
      try {
        const draft = _draft(form);
        const next = form.id
          ? await updateRemoteServer(form.id, draft)
          : await addRemoteServer(draft);
        updateServers(next);
        const nextId = form.id ?? next.at(-1)?.id ?? null;
        setSelectedId(nextId);
        setForm(null);
        toast.success(t.settings.remoteServers.saved);
        return true;
      } catch (error) {
        toast.error(t.settings.remoteServers.failedToSave, {
          description:
            error instanceof Error ? error.message : t.common.pleaseTryAgain,
        });
        return false;
      }
    };
    if (!previousRuntimeId) {
      await persist();
      return;
    }
    await runRemoteRuntimeActionIfAllowed({
      allowed: () => canDisconnect?.(previousRuntimeId) ?? true,
      acquire: acquireDisconnect
        ? () => acquireDisconnect(previousRuntimeId)
        : undefined,
      action: persist,
      afterAction: () => onDisconnected?.(previousRuntimeId),
    });
  };

  const run = async (
    id: string,
    action: (
      id: string
    ) => Promise<RemoteServerView[] | RemoteDisconnectResult>,
    options: {
      closeOnConnected?: boolean;
      selectFallback?: boolean;
    } = {}
  ): Promise<boolean | RemoteRuntimeActionOutcome> => {
    setBusyId(id);
    try {
      const result = await action(id);
      const next = Array.isArray(result) ? result : result.servers;
      updateServers(next);
      setSelectedId(
        options.selectFallback && !next.some((server) => server.id === id)
          ? (next[0]?.id ?? null)
          : id
      );
      if (options.closeOnConnected) {
        const connected = next.find((server) => server.id === id);
        if (connected?.status === "connected")
          onConnected?.(connected.runtimeId);
      }
      return !Array.isArray(result) && result.status === "applied-with-error"
        ? { applied: true, error: new Error(result.error) }
        : true;
    } catch (error) {
      try {
        const latest = await listRemoteServers();
        updateServers(latest);
      } catch {
        // Keep the best-known local snapshot for error reporting.
      }
      return { applied: false, error };
    } finally {
      setBusyId(null);
    }
  };

  const reportRunError = (id: string, error: unknown) => {
    const failed = serversRef.current.find((server) => server.id === id);
    toast.error(_failureTitle(failed, t), {
      description:
        error instanceof Error ? error.message : t.common.pleaseTryAgain,
    });
  };

  const trustHostKey = async (
    server: RemoteServerView,
    request: RemoteHostKeyTrustRequest
  ) => {
    await runRemoteTrustContinuationIfAllowed({
      allowed: () => canConnect?.() ?? true,
      acquire: acquireConnect,
      trust: async () => {
        setTrustBusy(true);
        try {
          const next = await trustRemoteServerHostKey(
            server.id,
            request.requestId
          );
          updateServers(next);
          const connected = next.find((item) => item.id === server.id);
          if (connected?.status === "connected") {
            onConnected?.(connected.runtimeId);
          }
        } catch (error) {
          toast.error(t.settings.remoteServers.failedToTrustHost, {
            description:
              error instanceof Error ? error.message : t.common.pleaseTryAgain,
          });
        } finally {
          setTrustBusy(false);
        }
      },
    });
  };

  const rejectHostKey = async (
    server: RemoteServerView,
    request: RemoteHostKeyTrustRequest
  ) => {
    setTrustBusy(true);
    try {
      const next = await rejectRemoteServerHostKey(
        server.id,
        request.requestId
      );
      updateServers(next);
    } catch (error) {
      toast.error(t.settings.remoteServers.failedToCancelHostTrust, {
        description:
          error instanceof Error ? error.message : t.common.pleaseTryAgain,
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
      title={t.settings.dialog.tabs.remoteServers}
      description={t.settings.remoteServers.description}
      className={servers.length === 0 && !form ? undefined : "p-0"}
    >
      {loading && servers.length === 0 && !form ? (
        <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          {t.settings.remoteServers.loading}
        </div>
      ) : servers.length === 0 && !form ? (
        <RemoteServersEmptyState onAdd={startAdd} />
      ) : (
        <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)]">
        <aside className="bg-muted/20 flex min-h-0 flex-col border-r">
          <div className="flex h-11 items-center justify-between px-3">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t.settings.remoteServers.serversHeading}
            </span>
            <div className="flex gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t.settings.remoteServers.refreshAria}
                onClick={() => void refresh()}
              >
                <RefreshCw className="size-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t.settings.remoteServers.addServer}
                onClick={startAdd}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <Separator />
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {servers.length > 0 ? (
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
            ) : null}
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
                void runRemoteRuntimeActionIfAllowed({
                  allowed: () => canConnect?.() ?? true,
                  acquire: acquireConnect,
                  action: () =>
                    run(selected.id, connectRemoteServer, {
                      closeOnConnected: true,
                    }),
                  onError: (error) => reportRunError(selected.id, error),
                })
              }
              onDisconnect={() =>
                void runRemoteRuntimeActionIfAllowed({
                  allowed: () => canDisconnect?.(selected.runtimeId) ?? true,
                  acquire: acquireDisconnect
                    ? () => acquireDisconnect(selected.runtimeId)
                    : undefined,
                  action: () => run(selected.id, disconnectRemoteServer),
                  afterAction: () => onDisconnected?.(selected.runtimeId),
                  onError: (error) => reportRunError(selected.id, error),
                })
              }
              onEdit={() => startEdit(selected)}
              onRemove={() =>
                void runRemoteRuntimeActionIfAllowed({
                  allowed: () => canDisconnect?.(selected.runtimeId) ?? true,
                  acquire: acquireDisconnect
                    ? () => acquireDisconnect(selected.runtimeId)
                    : undefined,
                  action: () =>
                    run(selected.id, removeRemoteServer, {
                      selectFallback: true,
                    }),
                  afterAction: () => onDisconnected?.(selected.runtimeId),
                  onError: (error) => reportRunError(selected.id, error),
                })
              }
              onTrustHostKey={(request) => void trustHostKey(selected, request)}
              onRejectHostKey={(request) =>
                void rejectHostKey(selected, request)
              }
              trustBusy={trustBusy}
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
              {t.settings.remoteServers.selectServer}
            </div>
          )}
          </section>
        </div>
      )}
    </SettingsPage>
  );
}

function RemoteServersEmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  return (
    <SettingsEmptyState
      icon={Server}
      wallIcons={REMOTE_SERVER_WALL_ICONS}
      label={t.settings.remoteServers.noServers}
      title={t.settings.remoteServers.emptyTitle}
      description={t.settings.remoteServers.emptyDescription}
      actions={
        <>
          <Button onClick={onAdd}>
            <Plus className="size-4" />
            {t.settings.remoteServers.addServer}
          </Button>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            {t.settings.remoteServers.passwordsNeverStored}
          </p>
        </>
      }
      capabilities={[
        {
          icon: FolderSync,
          title: t.settings.remoteServers.capabilities.yourWorkspaceAnywhere
            .title,
          description:
            t.settings.remoteServers.capabilities.yourWorkspaceAnywhere
              .description,
        },
        {
          icon: Network,
          title: t.settings.remoteServers.capabilities.sshNative.title,
          description: t.settings.remoteServers.capabilities.sshNative
            .description,
        },
        {
          icon: ShieldCheck,
          title: t.settings.remoteServers.capabilities.credentialsStayYours
            .title,
          description:
            t.settings.remoteServers.capabilities.credentialsStayYours
              .description,
        },
      ]}
    />
  );
}

const REMOTE_SERVER_WALL_ICONS = [
  Server,
  Laptop,
  Network,
  FolderSync,
  ShieldCheck,
  RefreshCw,
] as const;

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
  const { t } = useI18n();
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
        <Info
          label={t.settings.remoteServers.details.status}
          value={server.status}
        />
        <Info
          label={t.settings.remoteServers.details.runtime}
          value={server.runtimeId}
        />
        <Info
          label={t.settings.remoteServers.details.workspace}
          value={_remoteWorkspacePath(server)}
        />
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
            {t.settings.remoteServers.disconnect}
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={!canConnectRemoteServer(server, busy)}
            onClick={onConnect}
          >
            {server.status === "connecting" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {server.status === "connecting"
              ? t.settings.remoteServers.connecting
              : t.settings.remoteServers.connect}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={!canEditRemoteServer(server, busy)}
          onClick={onEdit}
        >
          {t.settings.remoteServers.edit}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canRemoveRemoteServer(server, busy)}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
          {t.common.remove}
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
  const { t } = useI18n();
  const steps = remoteConnectionFlow(server);
  if (steps.length === 0) return null;
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 text-sm font-medium">
        {t.settings.remoteServers.connectionFlow}
      </div>
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
  const { t } = useI18n();
  const [verified, setVerified] = useState(false);
  const changed = request.kind === "changed";

  useEffect(() => {
    setVerified(false);
  }, [request.requestId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onReject()}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {changed
              ? t.settings.remoteServers.hostKey.title
              : t.settings.remoteServers.hostKey.trustTitle}
          </DialogTitle>
          <DialogDescription>
            {changed
              ? t.settings.remoteServers.hostKey.changedDescription
              : t.settings.remoteServers.hostKey.description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 shrink flex-col gap-4 overflow-y-auto">
          <div className="grid gap-2 rounded-lg border p-3 text-sm">
            <Info
              label={t.settings.remoteServers.hostKey.infoHost}
              value={request.host}
            />
            <Info
              label={t.settings.remoteServers.hostKey.infoTarget}
              value={request.target}
            />
            {request.resolvedHost ? (
              <Info
                label={t.settings.remoteServers.hostKey.infoResolved}
                value={_endpoint(request)}
              />
            ) : null}
            {request.user ? (
              <Info
                label={t.settings.remoteServers.hostKey.infoUser}
                value={request.user}
              />
            ) : null}
            <Info
              label={t.settings.remoteServers.hostKey.infoKeyType}
              value={request.keyType}
            />
            <Info
              label={t.settings.remoteServers.hostKey.infoFingerprint}
              value={request.fingerprint}
            />
            {request.knownHostsFile ? (
              <Info
                label={t.settings.remoteServers.hostKey.infoKnownHosts}
                value={request.knownHostsFile}
              />
            ) : null}
            {request.knownHostsLine ? (
              <Info
                label={t.settings.remoteServers.hostKey.infoOffendingLine}
                value={String(request.knownHostsLine)}
              />
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
              <span>{t.settings.remoteServers.hostKey.verified}</span>
            </label>
          ) : null}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="ghost" disabled={busy} onClick={onReject}>
            {t.common.cancel}
          </Button>
          <Button
            variant={changed ? "destructive" : "default"}
            disabled={busy || (changed && !verified)}
            onClick={onTrust}
          >
            {changed
              ? t.settings.remoteServers.hostKey.replaceAndContinue
              : t.settings.remoteServers.hostKey.trustAndContinue}
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
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h3 className="text-base font-medium">
          {form.id
            ? t.settings.remoteServers.form.editTitle
            : t.settings.remoteServers.form.addTitle}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t.settings.remoteServers.form.hint}
        </p>
      </div>
      <div className="grid gap-3 rounded-lg border p-3">
        <Field
          label={t.settings.remoteServers.form.name}
          value={form.name}
          onChange={(name) => onChange({ ...form, name })}
        />
        <Field
          label={t.settings.remoteServers.form.host}
          value={form.host}
          onChange={(host) => onChange({ ...form, host })}
        />
        <Field
          label={t.settings.remoteServers.form.user}
          value={form.user}
          onChange={(user) => onChange({ ...form, user })}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>
          {form.id
            ? t.settings.remoteServers.form.update
            : t.settings.remoteServers.form.add}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t.common.cancel}
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

function _failureTitle(
  server: RemoteServerView | undefined,
  t: ReturnType<typeof useI18n>["t"]
): string {
  if (!server?.stageLabel || server.stage === "error") {
    return t.settings.remoteServers.actionFailed;
  }
  return formatString(t.settings.remoteServers.stageFailed, {
    stage: server.stageLabel,
  });
}

function _endpoint(request: RemoteHostKeyTrustRequest): string {
  const port = request.port ? `:${request.port}` : "";
  return `${request.resolvedHost}${port}`;
}
