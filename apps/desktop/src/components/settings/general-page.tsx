"use client";

import type { ReactNode } from "react";

import {
  usePrimaryColor,
  useTheme,
  type Theme,
} from "@/components/theme-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { PrimaryColorPicker } from "./primary-color-picker";
import { SettingsPage } from "./settings-page";

/** A single label-on-the-left, control-on-the-right settings row. */
function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-14 items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

export function GeneralPage() {
  const { theme, setTheme } = useTheme();
  const { primaryColor, setPrimaryColor } = usePrimaryColor();
  return (
    <SettingsPage title="General">
      <SettingsRow label="Appearance">
        <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <SelectTrigger className="w-32" aria-label="Appearance">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      <Separator />

      <SettingsRow label="Primary color">
        <PrimaryColorPicker
          value={primaryColor}
          onChange={setPrimaryColor}
        />
      </SettingsRow>

      <Separator />

      <SettingsRow label="Language">
        <Select defaultValue="en-US" disabled>
          <SelectTrigger className="w-32" aria-label="Language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en-US">English (US)</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
    </SettingsPage>
  );
}
