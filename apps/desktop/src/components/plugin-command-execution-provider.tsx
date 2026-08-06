import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import {
  PluginCommandExecutionManager,
  type PluginCommandRunInput,
} from "@/client/plugin-command-execution";
import { executePluginCommand } from "@/client/plugins";
import { electrobun } from "@/lib/electrobun";

interface PluginCommandExecutionContextValue {
  runPluginCommand: (input: PluginCommandRunInput) => string;
}

const PluginCommandExecutionContext =
  createContext<PluginCommandExecutionContextValue | null>(null);

export function PluginCommandExecutionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const manager = useMemo(
    () =>
      new PluginCommandExecutionManager({
        request: executePluginCommand,
        createExecutionId: () => crypto.randomUUID(),
        feedback: {
          loading: (id, title, description) => {
            toast.loading(title, { id, description, duration: Infinity });
          },
          success: (id, message, commandName) => {
            toast.success(message, { id, description: commandName });
          },
          warning: (id, message, commandName) => {
            toast.warning(message, { id, description: commandName });
          },
          error: (id, message, commandName) => {
            toast.error(message, { id, description: commandName });
          },
        },
      }),
    []
  );

  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;
    const handle = manager.handleEvent.bind(manager);
    rpc.addMessageListener("pluginCommandExecutionChanged", handle);
    return () =>
      rpc.removeMessageListener("pluginCommandExecutionChanged", handle);
  }, [manager]);

  const runPluginCommand = useCallback(
    (input: PluginCommandRunInput) => manager.run(input),
    [manager]
  );
  const value = useMemo(() => ({ runPluginCommand }), [runPluginCommand]);
  return (
    <PluginCommandExecutionContext.Provider value={value}>
      {children}
    </PluginCommandExecutionContext.Provider>
  );
}

export function usePluginCommandExecution(): PluginCommandExecutionContextValue {
  const value = useContext(PluginCommandExecutionContext);
  if (!value) {
    throw new Error(
      "usePluginCommandExecution must be used within PluginCommandExecutionProvider."
    );
  }
  return value;
}
