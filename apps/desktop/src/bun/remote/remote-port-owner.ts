import type { SshRemoteRuntimeConfig } from "./ssh-bootstrap-config";
import { shellPath, shellQuote } from "./ssh-command";

export type RemotePortOwner =
  | { kind: "llm-space"; pid: number; source: "port-scan" | "ps-scan" }
  | { kind: "other"; detail: string }
  | { kind: "unknown"; detail: string };

export function buildRemotePortOwnerProbeCommand(
  config: SshRemoteRuntimeConfig
): string {
  const port = String(config.remoteServerPort);
  const installDir = shellPath(config.remoteInstallDir);
  const quotedPort = shellQuote(port);
  return [
    "set +e",
    `PORT=${quotedPort}`,
    `INSTALL_DIR=${installDir}`,
    "PIDS=''",
    "if command -v lsof >/dev/null 2>&1; then PIDS=\"$PIDS $(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)\"; fi",
    "if command -v ss >/dev/null 2>&1; then PIDS=\"$PIDS $(ss -ltnp 2>/dev/null | awk -v port=\":$PORT\" '$4 ~ port { print $0 }' | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p')\"; fi",
    "if command -v fuser >/dev/null 2>&1; then PIDS=\"$PIDS $(fuser -n tcp $PORT 2>/dev/null)\"; fi",
    "FOUND=0",
    "for PID in $PIDS; do case \"$PID\" in ''|*[!0-9]*) continue ;; esac; ARGS=$(ps -p $PID -o args= 2>/dev/null); [ -z \"$ARGS\" ] && continue; FOUND=1; printf 'PID=%s\\nARGS=%s\\n' \"$PID\" \"$ARGS\"; done",
    "if [ \"$FOUND\" -eq 0 ]; then ps -u \"$(id -u)\" -o pid=,args= 2>/dev/null | awk -v port=\"$PORT\" -v install=\"$INSTALL_DIR\" 'index($0, \"llm-space-server\") && index($0, \"--port \" port) { sub(/^[[:space:]]+/, \"\"); print \"PS=\" $0 }'; fi",
    "true",
  ].join("; ");
}

export function parseRemotePortOwnerProbeOutput(
  output: string,
  config: Pick<SshRemoteRuntimeConfig, "remoteInstallDir" | "remoteServerPort">
): RemotePortOwner {
  const records = _probeRecords(output);
  if (records.length === 0) {
    return { kind: "unknown", detail: "No listening process was found." };
  }

  let other: string | null = null;
  for (const record of records) {
    if (_isLlmSpaceServerArgs(record.args, config)) {
      return { kind: "llm-space", pid: record.pid, source: record.source };
    }
    other ??= `pid ${record.pid}: ${record.args}`;
  }

  return other
    ? { kind: "other", detail: other }
    : { kind: "unknown", detail: "Unable to verify process command line." };
}

export function buildStopRemotePortOwnerCommand(pid: number): string {
  return [
    "set +e",
    `PID=${shellQuote(String(pid))}`,
    "kill -TERM $PID 2>/dev/null || true",
    "for i in 1 2 3 4 5; do kill -0 $PID 2>/dev/null || exit 0; sleep 1; done",
    "kill -KILL $PID 2>/dev/null || true",
    "true",
  ].join("; ");
}

interface ProbeRecord {
  pid: number;
  args: string;
  source: "port-scan" | "ps-scan";
}

function _probeRecords(output: string): ProbeRecord[] {
  const records: ProbeRecord[] = [];
  let pendingPid: number | null = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("PID=")) {
      const pid = Number(line.slice(4).trim());
      pendingPid = Number.isInteger(pid) ? pid : null;
      continue;
    }
    if (line.startsWith("ARGS=") && pendingPid) {
      records.push({
        pid: pendingPid,
        args: line.slice(5).trim(),
        source: "port-scan",
      });
      pendingPid = null;
      continue;
    }
    if (line.startsWith("PS=")) {
      const match = /^PS=\s*(\d+)\s+(.+)$/.exec(line);
      if (match) {
        records.push({
          pid: Number(match[1]),
          args: match[2].trim(),
          source: "ps-scan",
        });
      }
    }
  }
  return records;
}

function _isLlmSpaceServerArgs(
  args: string,
  config: Pick<SshRemoteRuntimeConfig, "remoteInstallDir" | "remoteServerPort">
): boolean {
  if (!args.includes("llm-space-server")) return false;
  if (!_argsContainPort(args, config.remoteServerPort)) return false;
  const installDir = config.remoteInstallDir.replace(/^~(?=\/|$)/, "");
  return (
    args.includes("/bin/llm-space-server") ||
    args.includes("llm-space-server --") ||
    Boolean(installDir && args.includes(installDir))
  );
}

function _argsContainPort(args: string, port: number): boolean {
  const escaped = String(port).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)--port(?:=|\\s+)${escaped}(?:\\s|$)`).test(args);
}
