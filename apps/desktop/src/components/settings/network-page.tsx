"use client";

import {
  DEFAULT_NETWORK_SETTINGS,
  isSupportedProxyUrl,
  type NetworkSettings,
  type SystemProxyDetection,
} from "@llm-space/core";
import { Input } from "@llm-space/ui/ui/input";
import { Separator } from "@llm-space/ui/ui/separator";
import { Switch } from "@llm-space/ui/ui/switch";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  detectSystemProxy,
  getNetworkSettings,
  setNetworkSettings,
} from "@/client/network";

import { SettingsPage } from "./settings-page";

/** A label-left, control-right row with an optional muted hint line. */
function ToggleRow({
  title,
  hint,
  checked,
  onCheckedChange,
}: {
  title: string;
  hint?: ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        {hint ? (
          <span className="text-muted-foreground text-xs">{hint}</span>
        ) : null}
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </div>
  );
}

/** A titled proxy URL field with an inline "unsupported" warning. */
function ProxyField({
  label,
  value,
  placeholder,
  disabled,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const invalid = !isSupportedProxyUrl(value);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {invalid ? (
        <span className="text-destructive text-xs">
          Only <code>http://</code> and <code>https://</code> proxies are
          supported.
        </span>
      ) : null}
    </div>
  );
}

/** Strip the scheme from a proxy URL for a compact "host:port" display. */
function _hostPort(url: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.host || url;
  } catch {
    return url.replace(/^\w+:\/\//, "");
  }
}

/** The muted "Detected: …" line under the system-proxy toggle. */
function DetectedProxy({
  detection,
  environmentOnly,
}: {
  detection: SystemProxyDetection | null;
  environmentOnly: boolean;
}) {
  if (!detection) {
    return null;
  }
  if (detection.socksOnly) {
    return (
      <span className="text-destructive text-xs">
        A SOCKS proxy is set in System Settings, but SOCKS is not supported.
      </span>
    );
  }
  const hostPort = _hostPort(detection.httpProxy ?? detection.httpsProxy);
  if (!hostPort) {
    return (
      <span className="text-muted-foreground text-xs">
        {environmentOnly
          ? "No proxy environment variables detected."
          : "No system proxy detected."}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground text-xs">
      Detected: <span className="font-mono">{hostPort}</span>{" "}
      {environmentOnly ? "(environment variables)" : "(System Settings)"}
    </span>
  );
}

export function NetworkPage() {
  const environmentOnly = navigator.userAgent.includes("Windows");
  const [settings, setSettings] = useState<NetworkSettings>(
    DEFAULT_NETWORK_SETTINGS
  );
  const [detection, setDetection] = useState<SystemProxyDetection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getNetworkSettings()
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
        }
      })
      .catch(() => {
        // Keep defaults; a load failure is non-fatal for the form.
      });
    void detectSystemProxy()
      .then((result) => {
        if (!cancelled) {
          setDetection(result);
        }
      })
      .catch(() => {
        // Detection is best-effort; leave it unset on failure.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: NetworkSettings) => {
    setSettings(next);
    try {
      const saved = await setNetworkSettings(next);
      setSettings(saved);
    } catch (error) {
      toast.error("Failed to save network settings", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }, []);

  return (
    <SettingsPage
      title="Network"
      description="Configure proxy settings for model requests and local network calls."
      className="overflow-y-auto"
    >
      <div className="flex flex-col gap-6 pb-2">
        <ToggleRow
          title="Enable proxy"
          hint="Connect through a proxy for model requests and other network calls."
          checked={settings.enabled}
          onCheckedChange={(next) => void persist({ ...settings, enabled: next })}
        />

        {settings.enabled ? (
          <>
            <Separator />

            <div className="flex flex-col gap-2">
              <ToggleRow
                title={
                  environmentOnly
                    ? "Use proxy environment variables"
                    : "Use system proxy"
                }
                hint={
                  environmentOnly
                    ? "Reads HTTP_PROXY, HTTPS_PROXY, and NO_PROXY. Windows Internet Settings and WinHTTP are not detected automatically."
                    : undefined
                }
                checked={settings.useSystemProxy}
                onCheckedChange={(next) =>
                  void persist({ ...settings, useSystemProxy: next })
                }
              />
              <DetectedProxy
                detection={detection}
                environmentOnly={environmentOnly}
              />
            </div>

            {settings.useSystemProxy ? null : (
              <>
                <ProxyField
                  label="HTTP Proxy"
                  value={settings.httpProxy}
                  placeholder="http://127.0.0.1:7890"
                  onChange={(value) =>
                    setSettings({ ...settings, httpProxy: value })
                  }
                  onBlur={() => void persist(settings)}
                />

                <ProxyField
                  label="HTTPS Proxy"
                  value={settings.httpsProxy}
                  placeholder="http://127.0.0.1:7890"
                  onChange={(value) =>
                    setSettings({ ...settings, httpsProxy: value })
                  }
                  onBlur={() => void persist(settings)}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Bypass list</span>
                  <Input
                    value={settings.noProxy}
                    placeholder="localhost, 127.0.0.1, .local"
                    aria-label="Bypass list"
                    onChange={(event) =>
                      setSettings({ ...settings, noProxy: event.target.value })
                    }
                    onBlur={() => void persist(settings)}
                  />
                  <span className="text-muted-foreground text-xs">
                    Comma-separated hosts that bypass the proxy.
                  </span>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </SettingsPage>
  );
}
