# Telemetry

llm-space collects a small amount of **anonymous, behaviour-only** usage data
to understand which features are used and where the app fails. This document
describes exactly what is sent, what is never sent, and how to turn it off.

The implementation is intentionally auditable: every event must be declared in
the typed map in [`apps/desktop/src/shared/analytics.ts`](apps/desktop/src/shared/analytics.ts),
and the **only** code that talks to the network is the bun main-process module
[`apps/desktop/src/bun/analytics/`](apps/desktop/src/bun/analytics/). Events go
to PostHog (EU Cloud, `eu.i.posthog.com`).

## How you are identified

By a random UUID minted on first launch and stored in
`~/.llm-space/settings/analytics.json`. It is not derived from anything on your
machine and is never linked to a user identity. PostHog person profiles are
disabled (`$process_person_profile: false`) and GeoIP lookup is disabled.
Deleting the file (or the whole `~/.llm-space` directory) resets the id.

## What is sent

Every event carries three anonymous build/platform facts: the app version,
`process.platform` (e.g. `darwin`), and `process.arch` (e.g. `arm64`), plus:

| Event | Properties |
|---|---|
| `app_opened` | `isFirstOpen` - whether this launch minted the install id |
| `thread_run` | `provider`, `model` (see note below), `outcome` (`completed` / `error` / `aborted`), `durationMs`, `messageCount`, `toolCount`, `hasSystemPrompt` |
| `provider_added` | `providerId` (builtin id, or a generated UUID for custom), `kind` (`builtin` / `custom`) |
| `mcp_server_added` | none |
| `settings_opened` | none |
| `onboarding_choice` | `choice` (which onboarding button was clicked) |

**Note on `provider` / `model`:** these are reported verbatim only when they
come from a shipped builtin catalog (e.g. `openai` / `gpt-4o`). Anything you
typed in yourself - a custom provider, or a custom model added to a builtin
provider - is collapsed to the literal string `"custom"` before capture.

## What is never sent

- Prompt text, message bodies, system prompts, or model responses
- File names or file contents from your workspace
- API keys, base URLs, or request headers
- Names you typed in (custom provider names, custom model ids)
- Your IP-derived location (GeoIP is disabled at capture time)

## How to opt out

Any of the following, in order of convenience:

1. **Settings › General › "Share anonymous usage analytics"** - toggle off.
   Persisted immediately; the client is torn down and nothing further is sent.
2. Set the environment variable `LLM_SPACE_ANALYTICS_DISABLED=1` - a hard
   override that wins over everything else.
3. Set `LLM_SPACE_POSTHOG_KEY=""` (empty) - with no key, no client is ever
   created.

## For forks

The baked-in PostHog key is a write-only, client-side project key. If you fork
llm-space, point telemetry at your own project via `LLM_SPACE_POSTHOG_KEY`, or
disable it entirely as above.
