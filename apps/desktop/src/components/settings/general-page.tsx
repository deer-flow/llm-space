"use client";

import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

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
  return (
    <SettingsPage title="General">
      <SettingsRow label="Appearance">
        <Select defaultValue="dark" disabled>
          <SelectTrigger className="w-32" aria-label="Appearance">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>

      <Separator />

      <SettingsRow label="Primary color">
        <Select defaultValue="default" disabled>
          <SelectTrigger className="w-32" aria-label="Primary color">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">
              <span className="bg-primary size-2.5 shrink-0 rounded-full" />
              Default
            </SelectItem>
          </SelectContent>
        </Select>
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
