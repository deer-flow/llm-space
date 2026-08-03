"use client";

import { formatProviderProfileLabel } from "@llm-space/core";
import { CableIcon } from "lucide-react";

import { cn } from "../../../lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../ui/select";
import { useModels } from "../../model-provider";

import { useProviderProfileSelection } from "./provider-profile-selection-provider";

export function ProviderProfileSelector({
  providerId,
  readonly,
  className,
  selectionScope,
  variant = "default",
}: {
  providerId: string;
  readonly?: boolean;
  className?: string;
  selectionScope?: string;
  variant?: "default" | "compact";
}) {
  const provider = useModels().find((candidate) => candidate.id === providerId);
  const { selectedProfileId, selectProfile } = useProviderProfileSelection(
    providerId,
    selectionScope
  );
  const profiles = provider?.profiles ?? [];
  if (profiles.length <= 1) {
    return null;
  }
  const requestedProfileIndex = profiles.findIndex(
    (profile) => profile.id === selectedProfileId
  );
  const selectedProfileIndex =
    requestedProfileIndex >= 0 ? requestedProfileIndex : 0;
  const selectedProfile = profiles[selectedProfileIndex];
  const value = selectedProfile.id;
  const isDefaultProfile = selectedProfileIndex === 0;

  return (
    <Select
      value={value}
      disabled={readonly}
      onValueChange={(profileId) =>
        selectProfile(providerId, profileId, selectionScope)
      }
    >
      <SelectTrigger
        className={cn(
          "max-w-40",
          variant === "compact" && "border-0 bg-transparent! ml-auto shrink-0",
          className
        )}
        size="sm"
        noIcon={variant === "compact"}
        aria-label={`${provider?.name ?? providerId} connection profile: ${
          selectedProfile?.name ?? "Default"
        }`}
      >
        {variant === "compact" ? (
          <SelectValue>
            {isDefaultProfile ? <CableIcon /> : selectedProfile?.name}
          </SelectValue>
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent onPointerDownOutside={(e) => e.preventDefault()}>
        <SelectGroup>
          {profiles.map((profile, index) => (
            <SelectItem key={profile.id} value={profile.id}>
              {formatProviderProfileLabel(profile, index)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
