import { Type, type Static } from "typebox";
import { Compile } from "typebox/compile";

const DOTTED_ID_PATTERN =
  "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$";
const CONTRIBUTION_ID_PATTERN = "^[a-zA-Z0-9][a-zA-Z0-9._-]*$";
const SEMVER_PATTERN =
  "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$";

export const PluginSource = Type.Union([
  Type.Literal("bundled"),
  Type.Literal("local"),
]);
export type PluginSource = Static<typeof PluginSource>;

export const PluginCapability = Type.Union([
  Type.Literal("environment"),
  Type.Literal("filesystem"),
  Type.Literal("network"),
  Type.Literal("process"),
  Type.Literal("storage"),
]);
export type PluginCapability = Static<typeof PluginCapability>;

const ContributionBase = Type.Object({
  id: Type.String({ pattern: CONTRIBUTION_ID_PATTERN }),
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
});

export const SourceImporterContribution = Type.Intersect([
  ContributionBase,
  Type.Object({
    kind: Type.Literal("sourceImporter"),
  }),
]);
export type SourceImporterContribution = Static<
  typeof SourceImporterContribution
>;

export const ToolProviderContribution = Type.Intersect([
  ContributionBase,
  Type.Object({
    kind: Type.Literal("toolProvider"),
  }),
]);
export type ToolProviderContribution = Static<typeof ToolProviderContribution>;

export const SkillProviderContribution = Type.Intersect([
  ContributionBase,
  Type.Object({
    kind: Type.Literal("skillProvider"),
  }),
]);
export type SkillProviderContribution = Static<
  typeof SkillProviderContribution
>;

export const DevelopmentSeederContribution = Type.Intersect([
  ContributionBase,
  Type.Object({
    kind: Type.Literal("developmentSeeder"),
    environmentVariables: Type.Array(Type.String({ minLength: 1 })),
  }),
]);
export type DevelopmentSeederContribution = Static<
  typeof DevelopmentSeederContribution
>;

export const PluginContribution = Type.Union([
  SourceImporterContribution,
  ToolProviderContribution,
  SkillProviderContribution,
  DevelopmentSeederContribution,
]);
export type PluginContribution = Static<typeof PluginContribution>;
export type PluginContributionKind = PluginContribution["kind"];

export const PluginManifest = Type.Object({
  id: Type.String({ pattern: DOTTED_ID_PATTERN }),
  name: Type.String({ minLength: 1 }),
  version: Type.String({ pattern: SEMVER_PATTERN }),
  runtime: Type.String({ minLength: 1 }),
  apiVersion: Type.String({ pattern: SEMVER_PATTERN }),
  engines: Type.Object({
    llmSpace: Type.String({ minLength: 1 }),
  }),
  source: PluginSource,
  description: Type.Optional(Type.String()),
  capabilities: Type.Array(PluginCapability),
  contributions: Type.Array(PluginContribution),
});
export type PluginManifest = Static<typeof PluginManifest>;

export interface PluginManifestValidationResult {
  valid: boolean;
  manifest?: PluginManifest;
  errors: string[];
}

const MANIFEST_VALIDATOR = Compile(PluginManifest);

/**
 * Validate static manifest shape and contribution identity without importing
 * plugin runtime code. Duplicate IDs are checked per extension-point kind.
 */
export function validatePluginManifest(
  input: unknown
): PluginManifestValidationResult {
  if (!MANIFEST_VALIDATOR.Check(input)) {
    return {
      valid: false,
      errors: [...MANIFEST_VALIDATOR.Errors(input)].map(
        (error) => `${error.instancePath || "/"}: ${error.message}`
      ),
    };
  }

  const manifest = input;
  const errors: string[] = [];
  const contributionKeys = new Set<string>();
  for (const contribution of manifest.contributions) {
    const key = `${contribution.kind}:${contribution.id}`;
    if (contributionKeys.has(key)) {
      errors.push(
        `Duplicate ${contribution.kind} contribution id: ${contribution.id}`
      );
    }
    contributionKeys.add(key);
  }
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
    errors.push("Duplicate capability declaration.");
  }
  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, manifest, errors: [] };
}
