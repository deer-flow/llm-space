import type { PluginDiagnostic } from "./contracts";
import type {
  PluginContribution,
  PluginManifest,
  PluginSource,
} from "./manifest";

export type PluginLifecycleState =
  | "discovered"
  | "invalid"
  | "inactive"
  | "activating"
  | "active"
  | "failed"
  | "deactivating"
  | "disabled";

export interface PluginView {
  id: string;
  name: string;
  version: string;
  description?: string;
  source: PluginSource;
  compatible: boolean;
  enabled: boolean;
  state: PluginLifecycleState;
  capabilities: PluginManifest["capabilities"];
  contributions: PluginContribution[];
  diagnostics: PluginDiagnostic[];
}
