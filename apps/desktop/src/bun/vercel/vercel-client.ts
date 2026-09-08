import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Vercel REST deployment client (no SDK — plain `fetch`). Deploys a directory
 * of static files via `POST /v13/deployments` and polls until the deployment
 * is ready. Runs in the bun main process only: the API token and the request
 * both stay on the trusted side of the RPC bridge.
 */

/** Extensions deployed as static assets. Everything else is skipped. */
const DEPLOYABLE_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".txt",
  ".xml",
  ".webmanifest",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp4",
  ".webm",
  ".mp3",
  ".pdf",
]);

/** Directory names never deployed (dependencies, VCS, generated junk). */
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".cache",
  ".venv",
  "__pycache__",
]);

/** Guardrails matching Vercel's platform limits with room to spare. */
const MAX_FILES = 500;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const DEPLOY_TIMEOUT_MS = 3 * 60_000;
const POLL_INTERVAL_MS = 2_000;

const DEPLOYABLE_TEXT_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".txt",
  ".xml",
  ".webmanifest",
  ".svg",
]);

export interface StaticFile {
  /** Repo-relative POSIX path inside the deployment (e.g. `index.html`). */
  file: string;
  /** File bytes: inline text, or base64 for binary assets. */
  data: string;
  /** Set to `"base64"` for binary assets; absent for text. */
  encoding?: "base64";
  sizeBytes: number;
}

export interface CollectedDeployment {
  name: string;
  files: StaticFile[];
  totalBytes: number;
}

export interface DeployResult {
  /** The public URL of the ready deployment. */
  url: string;
  /** The deployment id, for reference/debugging. */
  deploymentId: string;
  /** Number of files uploaded, for the renderer's success summary. */
  fileCount: number;
}

/** Human-readable failure for a caught deploy error (renderer-visible). */
export class VercelDeployError extends Error {}

interface VercelFilePayload {
  file: string;
  data: string;
  encoding?: "base64";
}

interface VercelDeploymentResponse {
  id?: string;
  url?: string;
  readyState?: string;
  statusCode?: number;
  message?: string;
  error?: { message?: string; code?: string };
}

export interface VercelClientOptions {
  /** Injectable fetch for tests; defaults to the global. */
  fetchImpl?: typeof fetch;
  /** Injectable sleep for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Poll budget override (tests); defaults to 3 minutes. */
  timeoutMs?: number;
}

/**
 * Walk `dir` and collect the deployable static files. Throws a
 * {@link VercelDeployError} with a user-facing message when the folder holds
 * no static entrypoint, exceeds the platform limits, or can't be read.
 */
export async function collectStaticFiles(
  dir: string,
  options: { withContents?: boolean } = {}
): Promise<CollectedDeployment> {
  const { withContents = true } = options;
  const root = path.resolve(dir);
  const files: StaticFile[] = [];
  let totalBytes = 0;

  const walk = async (current: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      throw new VercelDeployError(
        `Cannot read directory ${current}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          !SKIPPED_DIRECTORIES.has(entry.name) &&
          !entry.name.startsWith(".")
        ) {
          await walk(full);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!DEPLOYABLE_EXTENSIONS.has(ext)) {
        continue;
      }
      const relative = path.relative(root, full).split(path.sep).join("/");
      const info = await stat(full);
      if (info.size > MAX_FILE_BYTES) {
        throw new VercelDeployError(
          `File is too large to deploy (${_formatBytes(info.size)}): ${relative}`
        );
      }
      totalBytes += info.size;
      if (files.length + 1 > MAX_FILES) {
        throw new VercelDeployError(
          `Too many files to deploy (limit ${MAX_FILES}). Deploy a smaller folder.`
        );
      }
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new VercelDeployError(
          `Folder is too large to deploy (limit ${_formatBytes(MAX_TOTAL_BYTES)}).`
        );
      }
      const data = withContents ? await readFile(full) : Buffer.alloc(0);
      const isText = DEPLOYABLE_TEXT_EXTENSIONS.has(ext);
      files.push({
        file: relative,
        data: withContents
          ? isText
            ? data.toString("utf8")
            : data.toString("base64")
          : "",
        ...(withContents && !isText ? { encoding: "base64" as const } : {}),
        sizeBytes: info.size,
      });
    }
  };

  await walk(root);

  const hasIndex = files.some(
    (file) => file.file === "index.html" || file.file === "index.htm"
  );
  if (!hasIndex) {
    throw new VercelDeployError(
      "No static site found: the folder must contain an index.html to deploy."
    );
  }

  return { name: path.basename(root), files, totalBytes };
}

/**
 * Deploy a static folder to Vercel and wait for it to become ready. The
 * deployment is public by nature — callers must surface that in the UI before
 * invoking this.
 */
export async function deployStaticFolder(
  options: {
    token: string;
    dir: string;
    projectName?: string;
  } & VercelClientOptions
): Promise<DeployResult> {
  const collected = await collectStaticFiles(options.dir);
  return _deployCollected({ ...options, collected });
}

/**
 * Collect one HTML file as a self-contained deployment: the file is served as
 * the site's `index.html` regardless of its original name. For pages that
 * reference sibling assets, deploy the containing folder instead.
 */
export async function collectSingleFile(
  file: string,
  options: { withContents?: boolean } = {}
): Promise<CollectedDeployment> {
  const { withContents = true } = options;
  const info = await stat(file);
  if (!info.isFile()) {
    throw new VercelDeployError(
      "Only a single HTML file (or a folder) can be deployed."
    );
  }
  if (info.size > MAX_FILE_BYTES) {
    throw new VercelDeployError(
      `File is too large to deploy (${_formatBytes(info.size)}).`
    );
  }
  const data = withContents ? await readFile(file) : Buffer.alloc(0);
  return {
    name: path.basename(file, path.extname(file)),
    files: [
      {
        file: "index.html",
        data: data.toString("utf8"),
        sizeBytes: info.size,
      },
    ],
    totalBytes: info.size,
  };
}

/**
 * Deploy one self-contained HTML file as a single-page site and wait for it
 * to become ready.
 */
export async function deploySingleFile(
  options: {
    token: string;
    file: string;
    projectName?: string;
  } & VercelClientOptions
): Promise<DeployResult> {
  const collected = await collectSingleFile(options.file);
  return _deployCollected({ ...options, collected });
}

async function _deployCollected(
  options: {
    token: string;
    projectName?: string;
    collected: CollectedDeployment;
  } & VercelClientOptions
): Promise<DeployResult> {
  const {
    token,
    projectName,
    collected,
    fetchImpl = fetch,
    sleep = _defaultSleep,
    timeoutMs = DEPLOY_TIMEOUT_MS,
  } = options;
  const name = projectName ?? collected.name;

  let createResponse: Response;
  try {
    createResponse = await fetchImpl("https://api.vercel.com/v13/deployments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        files: collected.files.map(
          ({ file, data, encoding }): VercelFilePayload => ({
            file,
            data,
            ...(encoding ? { encoding } : {}),
          })
        ),
        projectSettings: { framework: null },
      }),
    });
  } catch (error) {
    throw new VercelDeployError(
      `Network error while contacting Vercel: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const created = (await _parseResponse(
    createResponse
  )) as VercelDeploymentResponse;
  const deploymentId = created.id;
  if (!deploymentId) {
    throw new VercelDeployError("Vercel did not return a deployment id.");
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let pollResponse: Response;
    try {
      pollResponse = await fetchImpl(
        `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      // Transient network blips during polling are retried until the deadline.
      continue;
    }
    const deployment = (await _parseResponse(
      pollResponse
    )) as VercelDeploymentResponse;
    if (deployment.readyState === "READY") {
      return {
        url: deployment.url
          ? `https://${deployment.url}`
          : `https://${name}.vercel.app`,
        deploymentId,
        fileCount: collected.files.length,
      };
    }
    if (
      deployment.readyState === "ERROR" ||
      deployment.readyState === "CANCELED"
    ) {
      throw new VercelDeployError(
        `Vercel deployment failed${deployment.message ? `: ${deployment.message}` : "."}`
      );
    }
  }
  throw new VercelDeployError(
    "Vercel deployment timed out. Check its status in the Vercel dashboard."
  );
}

/** Parse a Vercel response, mapping HTTP errors to friendly messages. */
async function _parseResponse(response: Response): Promise<unknown> {
  let payload: VercelDeploymentResponse;
  try {
    payload = (await response.json()) as VercelDeploymentResponse;
  } catch {
    throw new VercelDeployError(
      `Unexpected response from Vercel (HTTP ${response.status}).`
    );
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new VercelDeployError(
        "Vercel rejected the token (401/403). Check that it is valid and has deploy access."
      );
    }
    const detail = payload.error?.message ?? payload.message;
    throw new VercelDeployError(
      `Vercel request failed (HTTP ${response.status})${detail ? `: ${detail}` : "."}`
    );
  }
  return payload;
}

function _defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function _formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
