"use client";

import { Button } from "@llm-space/ui/ui/button";
import { Server, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  disconnectRemoteServer,
  listRemoteServers,
  subscribeRemoteServersChanged,
} from "@/client/remote-servers";
import type { RemoteServerView } from "@/shared/remote-servers";
import type { RuntimeId } from "@/shared/runtime";

import { runRemoteRuntimeActionIfAllowed } from "./remote-runtime-actions";

export function RemoteStatus({
  runtimeId,
  canDisconnect,
  onDisconnecting,
  onDisconnected,
}: {
  runtimeId: RuntimeId;
  canDisconnect?: (runtimeId: RuntimeId) => boolean;
  onDisconnecting?: (runtimeId: RuntimeId) => void;
  onDisconnected: (runtimeId: RuntimeId) => void;
}) {
  const [server, setServer] = useState<RemoteServerView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (runtimeId === "local") {
        setServer(null);
        return;
      }
      void listRemoteServers()
        .then((servers) => {
          if (cancelled) return;
          setServer(
            servers.find((item) => item.runtimeId === runtimeId) ?? null
          );
        })
        .catch(() => {
          if (!cancelled) setServer(null);
        });
    };

    refresh();
    const unsubscribe = subscribeRemoteServersChanged(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [runtimeId]);

  if (runtimeId === "local" || !server) {
    return null;
  }

  const disconnect = async () => {
    await runRemoteRuntimeActionIfAllowed({
      allowed: () => canDisconnect?.(runtimeId) ?? true,
      beforeAction: () => onDisconnecting?.(runtimeId),
      action: async () => {
        setBusy(true);
        try {
          await disconnectRemoteServer(server.id);
          onDisconnected(runtimeId);
        } catch (error) {
          toast.error("Failed to disconnect remote", {
            description:
              error instanceof Error ? error.message : "Please try again.",
          });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <div className="border-border/70 electrobun-webkit-app-region-no-drag shrink-0 border-t p-2">
      <div className="bg-muted/40 flex flex-col gap-2 rounded-md p-2">
        <div className="flex min-w-0 items-center gap-2">
          <Server className="text-primary size-4 shrink-0" />
          <div className="min-w-0 grow">
            <div className="truncate text-sm font-medium">
              Remote: {server.name}
            </div>
            <div className="text-muted-foreground truncate text-xs">
              {server.user ? `${server.user}@` : ""}
              {server.host}
            </div>
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 justify-start"
          disabled={busy}
          onClick={() => void disconnect()}
        >
          <Unplug className="size-3.5" />
          Disconnect
        </Button>
      </div>
    </div>
  );
}
