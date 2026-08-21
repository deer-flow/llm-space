"use client";

import {
  DEFAULT_NETWORK_SETTINGS,
  isSupportedProxyUrl,
  type NetworkSettings,
  type SystemProxyDetection,
} from "@llm-space/core";
import { useI18n } from "@llm-space/ui/lib/i18n";
import { Input } from "@llm-space/ui/ui/input";
import { Separator } from "@llm-space/ui/ui/separator";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  detectSystemProxy,
  getNetworkSettings,
  setNetworkSettings,
} from "@/client/network";
import type { RuntimeId } from "@/shared/runtime";

import { SettingsPage } from "./settings-page";
import { SettingsToggleRow } from "./settings-toggle-row";

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
  const { t } = useI18n();
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
          {t.settings.network.schemePrefix} <code>http://</code>
          {t.settings.network.schemeMiddle} <code>https://</code>
          {t.settings.network.schemeSuffix}
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
}: {
  detection: SystemProxyDetection | null;
}) {
  const { t } = useI18n();
  if (!detection) {
    return null;
  }
  if (detection.socksOnly) {
    return (
      <span className="text-destructive text-xs">
        {t.settings.network.socksUnsupported}
      </span>
    );
  }
  const hostPort = _hostPort(detection.httpProxy ?? detection.httpsProxy);
  if (!hostPort) {
    return (
      <span className="text-muted-foreground text-xs">
        {t.settings.network.noSystemProxy}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground text-xs">
      {t.settings.network.detectedPrefix}
      <span className="font-mono">{hostPort}</span>
      {t.settings.network.detectedSuffix}
    </span>
  );
}

export function NetworkPage({ runtimeId }: { runtimeId: RuntimeId }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<NetworkSettings>(
    DEFAULT_NETWORK_SETTINGS
  );
  const [detection, setDetection] = useState<SystemProxyDetection | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getNetworkSettings(runtimeId)
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
        }
      })
      .catch(() => {
        // Keep defaults; a load failure is non-fatal for the form.
      });
    void detectSystemProxy(runtimeId)
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
  }, [runtimeId]);

  const persist = useCallback(
    async (next: NetworkSettings) => {
      setSettings(next);
      try {
        const saved = await setNetworkSettings(next, runtimeId);
        setSettings(saved);
      } catch (error) {
        toast.error(t.settings.network.failedToSave, {
          description:
            error instanceof Error ? error.message : t.common.pleaseTryAgain,
        });
      }
    },
    [runtimeId, t]
  );

  return (
    <SettingsPage
      title={t.settings.network.title}
      description={t.settings.network.description}
      className="overflow-y-auto"
    >
      <div className="flex flex-col gap-6 pb-2">
        <SettingsToggleRow
          title={t.settings.network.enableProxy}
          hint={t.settings.network.enableProxyHint}
          checked={settings.enabled}
          onCheckedChange={(next) =>
            void persist({ ...settings, enabled: next })
          }
        />

        {settings.enabled ? (
          <>
            <Separator />

            <div className="flex flex-col gap-2">
              <SettingsToggleRow
                title={t.settings.network.useSystemProxy}
                checked={settings.useSystemProxy}
                onCheckedChange={(next) =>
                  void persist({ ...settings, useSystemProxy: next })
                }
              />
              <DetectedProxy detection={detection} />
            </div>

            {settings.useSystemProxy ? null : (
              <>
                <ProxyField
                  label={t.settings.network.httpProxy}
                  value={settings.httpProxy}
                  placeholder="http://127.0.0.1:7890"
                  onChange={(value) =>
                    setSettings({ ...settings, httpProxy: value })
                  }
                  onBlur={() => void persist(settings)}
                />

                <ProxyField
                  label={t.settings.network.httpsProxy}
                  value={settings.httpsProxy}
                  placeholder="http://127.0.0.1:7890"
                  onChange={(value) =>
                    setSettings({ ...settings, httpsProxy: value })
                  }
                  onBlur={() => void persist(settings)}
                />

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {t.settings.network.bypassList}
                  </span>
                  <Input
                    value={settings.noProxy}
                    placeholder="localhost, 127.0.0.1, .local"
                    aria-label={t.settings.network.bypassList}
                    onChange={(event) =>
                      setSettings({ ...settings, noProxy: event.target.value })
                    }
                    onBlur={() => void persist(settings)}
                  />
                  <span className="text-muted-foreground text-xs">
                    {t.settings.network.bypassListHint}
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
