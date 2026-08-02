"use client";

import { formatProviderProfileLabel } from "@llm-space/core";

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
}: {
  providerId: string;
  readonly?: boolean;
  className?: string;
  selectionScope?: string;
}) {
  const provider = useModels().find((candidate) => candidate.id === providerId);
  const { selectedProfileId, selectProfile } =
    useProviderProfileSelection(providerId, selectionScope);
  const profiles = provider?.profiles ?? [];
  if (profiles.length <= 1) {
    return null;
  }
  const value = profiles.some((profile) => profile.id === selectedProfileId)
    ? selectedProfileId
    : profiles[0].id;

  return (
    <Select
      value={value}
      disabled={readonly}
      onValueChange={(profileId) =>
        selectProfile(providerId, profileId, selectionScope)
      }
    >
      <SelectTrigger
        className={cn("max-w-40", className)}
        size="sm"
        aria-label={`${provider?.name ?? providerId} connection profile`}
      >
        <SelectValue />
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
