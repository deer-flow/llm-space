English | [中文](./sharing.zh-CN.md)

---

# Sharing a Thread

Sharing publishes a read-only copy of a Thread that other people can open in a browser or in LLM Space. The source Thread remains in its original workspace and is not modified.

## Requirements

- The desktop app must be able to reach GitHub.
- You must sign in to GitHub before publishing. If you are signed out, the sharing flow asks for confirmation and then starts GitHub Device Flow.
- A remote Runtime must be connected if the Thread belongs to that Runtime.

## How to share

1. Open the Thread.
2. Open **More Actions** (`...`) in the Thread header.
3. Choose **Share Thread**.
4. Review or edit the title and optionally add a description. These values affect only the shared copy.
5. Choose **Generate link**. Complete GitHub sign-in if prompted; publishing resumes automatically afterward.
6. Copy the resulting link or open it in the browser.

Each publish action creates a new share link. Closing the dialog or a failed publish does not change the local Thread.

## What viewers receive

The link opens the static LLM Space web viewer. It renders the complete shared Thread read-only, including its prompts, messages, tool calls, and other persisted Thread data. Viewers do not need a GitHub account. The page also offers **Open in LLM Space**, which opens the same shared Thread through the desktop deep link when the app is installed.

Before publishing, LLM Space resolves the Thread's effective model and stores its display name in the shared copy. This allows the web viewer to show the correct model even though it does not have access to the publisher's local provider settings.

## Privacy and GitHub Gists

Shared Threads are stored as **secret GitHub Gists**. A secret Gist is unlisted and does not appear in public search, but it is not private: anyone with the URL can read and forward it.

Review the Thread before sharing. Do not publish API keys, credentials, private source code, personal data, or other sensitive content. The title and description are also sent to GitHub. To revoke access, delete the Gist from your GitHub account; an already copied or downloaded version cannot be recalled.

## Implementation

- The desktop reads the Thread from its owning Runtime, so local and remote Thread ownership is preserved.
- The shared copy receives the optional title and resolved model metadata without mutating the source file.
- `GistThreadWriter` creates the secret Gist through GitHub's API.
- The returned browser URL points to `#/shared/gist/threads/<gistId>` on the static LLM Space viewer.
- The web viewer uses `GistThreadReader` and renders the result in presentational, read-only mode.

Relevant implementation files include `apps/desktop/src/components/share-thread-dialog.tsx`, `apps/desktop/src/bun/rpc/share-thread.ts`, and `packages/core/src/storage/gist/`.

## Troubleshooting

- **Sign-in does not finish:** cancel and retry the GitHub Device Flow, then confirm that GitHub is reachable through the configured proxy.
- **Runtime is not connected:** reconnect the Runtime that owns the Thread before sharing.
- **The clipboard is unavailable:** select and copy the visible URL manually.
- **The link should no longer work:** delete the corresponding secret Gist from GitHub.
