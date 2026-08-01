"use client";

import { formatProviderProfileLabel } from "@llm-space/core";

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
}: {
  providerId: string;
  readonly?: boolean;
}) {
  const provider = useModels().find((candidate) => candidate.id === providerId);
  const { selectedProfileId, selectProfile } =
    useProviderProfileSelection(providerId);
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
      onValueChange={(profileId) => selectProfile(providerId, profileId)}
    >
      <SelectTrigger
        size="sm"
        className="max-w-40"
        aria-label={`${provider?.name ?? providerId} connection profile`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
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
