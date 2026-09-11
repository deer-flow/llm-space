import { lazy, useState } from "react";

import { useRegisterCommands } from "@/commands";
import type { RuntimeId } from "@/shared/runtime";

import { LazyMount } from "./lazy-mount";

const DeployVercelDialog = lazy(() =>
  import("./deploy-vercel-dialog").then((module) => ({
    default: module.DeployVercelDialog,
  }))
);

/**
 * Owns deploy-command registration and the deploy dialog's target folder.
 * Mirrors {@link PageShareThreadController}: the command handler resolves the
 * workspace runtime lazily, the dialog stays mounted after its first open.
 */
export function PageDeployVercelController({
  workspaceRuntimeId,
}: {
  workspaceRuntimeId: RuntimeId;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ path: string; runtimeId: RuntimeId }>({
    path: "",
    runtimeId: "local",
  });

  useRegisterCommands({
    deployVercel: ({ path, runtimeId }) => {
      setTarget({ path, runtimeId: runtimeId ?? workspaceRuntimeId });
      setOpen(true);
    },
  });

  return (
    <LazyMount open={open}>
      <DeployVercelDialog
        open={open}
        onOpenChange={setOpen}
        path={target.path}
        runtimeId={target.runtimeId}
      />
    </LazyMount>
  );
}
