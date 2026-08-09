import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

import {
  act,
  forwardRef,
  startTransition,
  Suspense,
  useLayoutEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";

import type { CommandHandlers } from "@/commands";
import type { RuntimeId } from "@/shared/runtime";
import {
  installReactTestDom,
  TestElement,
  TestEvent,
} from "@/test/react-test-dom";

const SHARE_REQUESTS: {
  runtimeId?: string;
  path: string;
  title?: string;
  description?: string;
}[] = [];

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function _deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

let pendingShare: Deferred<{ shareUrl: string; gistId: string }> | null = null;

const RPC = {
  request: {
    isFullScreen: async () => ({ fullScreen: false }),
    listRuntimes: async () => [
      { id: "local" as const, kind: "local" as const, name: "Local" },
      {
        id: "remote:workspace" as const,
        kind: "remote" as const,
        name: "Workspace",
      },
    ],
    remoteGetDefaultRuntime: async () => ({
      runtimeId: "remote:workspace" as const,
    }),
    githubAuthStatus: async () => ({
      status: "signedIn" as const,
      login: "review-test",
    }),
    fsRead: async ({ path }: { path: string }) => ({
      title: `Remote ${path}`,
    }),
    shareThread: async (input: (typeof SHARE_REQUESTS)[number]) => {
      SHARE_REQUESTS.push(input);
      if (pendingShare) return pendingShare.promise;
      return {
        shareUrl: "https://example.test/shared",
        gistId: "gist-review-test",
      };
    },
  },
  send: {
    executeCommand: () => undefined,
  },
  addMessageListener: () => undefined,
  removeMessageListener: () => undefined,
};

const TEST_DOM = installReactTestDom();
const WORKSPACE_TAB = {
  id: "thread:remote:workspace:threads/workspace.json",
  type: "thread" as const,
  path: "threads/workspace.json",
  runtimeId: "remote:workspace" as const,
  paneId: "pane-workspace",
};
const noOp = () => undefined;
const WORKSPACE_TABS = {
  tabs: [WORKSPACE_TAB],
  activeId: WORKSPACE_TAB.id,
  open: noOp,
  openTrace: noOp,
  close: noOp,
  closeOthers: noOp,
  closeOthersInRuntime: noOp,
  closeAll: noOp,
  closeAllInRuntime: noOp,
  closeRuntime: noOp,
  discardRuntime: noOp,
  reorder: noOp,
  reorderInRuntime: noOp,
  activate: noOp,
  activateNext: noOp,
  activatePrevious: noOp,
  refresh: noOp,
  handleRemove: noOp,
  handleMove: noOp,
  consumeDiscardedPane: () => false,
  handleTraceTitleChange: noOp,
  reopenClosed: noOp,
};

await mock.module("@/lib/electrobun", () => ({
  electrobun: { rpc: RPC },
}));
const TEST_CODE_EDITOR_MODULE = {
  CodeEditor: forwardRef<
    HTMLTextAreaElement,
    { value?: string; placeholder?: string }
  >(function TestCodeEditor({ value, placeholder }, ref) {
    return (
      <textarea ref={ref} value={value} placeholder={placeholder} readOnly />
    );
  }),
};
await mock.module(
  "@llm-space/ui/components/code-editor",
  () => TEST_CODE_EDITOR_MODULE
);
function _TestMenuItem({
  children,
  disabled,
  onSelect,
}: {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => onSelect?.()}
    >
      {children}
    </button>
  );
}

const _MenuContainer = ({ children }: { children?: ReactNode }) => (
  <div>{children}</div>
);
const _MenuPassThrough = ({ children }: { children?: ReactNode }) => (
  <>{children}</>
);

await mock.module("@llm-space/ui/ui/dropdown-menu", () => ({
  DropdownMenu: _MenuPassThrough,
  DropdownMenuContent: _MenuContainer,
  DropdownMenuItem: _TestMenuItem,
  DropdownMenuLabel: _MenuContainer,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: _MenuPassThrough,
}));
await mock.module("@llm-space/ui/ui/context-menu", () => ({
  ContextMenu: _MenuPassThrough,
  ContextMenuContent: _MenuContainer,
  ContextMenuGroup: _MenuPassThrough,
  ContextMenuItem: _TestMenuItem,
  ContextMenuSeparator: () => <hr />,
  ContextMenuTrigger: _MenuPassThrough,
}));
await mock.module("@sinm/react-chrome-tabs", () => ({
  Tabs: ({ className }: { className?: string }) => (
    <div className={className}>
      <div className="chrome-tabs" />
    </div>
  ),
}));
await mock.module("@llm-space/ui/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogClose: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogOverlay: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DialogPortal: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
await mock.module("@llm-space/ui/ui/select", () => ({
  Select: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));
await mock.module("@llm-space/ui/components/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));
await mock.module("react-resizable-panels", () => ({
  Group: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Separator: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  usePanelRef: () => ({
    current: {
      isCollapsed: () => false,
      collapse: noOp,
      expand: noOp,
    },
  }),
}));
await mock.module("@/components/thread-tabs", () => ({
  chooseActiveTabForRuntime: (
    tabs: typeof WORKSPACE_TABS.tabs,
    activeId: string | null,
    runtimeId: RuntimeId
  ) =>
    tabs.some((tab) => tab.id === activeId && tab.runtimeId === runtimeId)
      ? activeId
      : (tabs.find((tab) => tab.runtimeId === runtimeId)?.id ?? null),
  filterTabsForRuntime: (
    tabs: typeof WORKSPACE_TABS.tabs,
    runtimeId: RuntimeId
  ) => tabs.filter((tab) => tab.runtimeId === runtimeId),
  ThreadTabs: () => null,
  useThreadTabs: () => WORKSPACE_TABS,
}));
await mock.module("@/components/experimental-provider", () => ({
  ExperimentalProvider: ({ children }: { children?: ReactNode }) => (
    <>{children}</>
  ),
  useExperimental: () => ({ tracingEnabled: false }),
}));

for (const [moduleName, exportName] of [
  ["@/components/account-status", "AccountStatus"],
  ["@/components/feature-reminder-dialog", "FeatureReminderDialog"],
  ["@/components/file-system-tree-view", "FileSystemTreeView"],
  ["@/components/github-device-dialog", "GithubDeviceDialog"],
  ["@/components/github-star-reminder", "GithubStarReminder"],
  ["@/components/remote-status", "RemoteStatus"],
  ["@/components/shared-import-provider", "SharedImportProvider"],
  ["@/components/update-indicator", "UpdateIndicator"],
  ["@/components/welcome", "Welcome"],
] as const) {
  await mock.module(moduleName, () => ({ [exportName]: () => null }));
}
await mock.module("./thread-tabs/thread-tab-pane", () => ({
  ThreadTabPane: () => null,
}));
await mock.module("./thread-tabs/trace-tab-pane", () => ({
  TraceTabPane: () => null,
}));

const [
  { PageShareThreadController },
  { ShareThreadDialog },
  { CommandProvider, useCommands, useRegisterCommands },
  { NodeActions },
  { ThreadTabs },
  { GithubAuthProvider },
  { ThemeProvider },
  { TooltipProvider },
] = await Promise.all([
  import("./page-share-thread-controller"),
  import("./share-thread-dialog"),
  import("@/commands"),
  import("./file-system-tree-view/node-actions"),
  import("./thread-tabs/thread-tabs"),
  import("./github-auth-provider"),
  import("@llm-space/ui/components/theme-provider"),
  import("@llm-space/ui/ui/tooltip"),
]);

interface MountedTree {
  container: TestElement;
  root: Root;
}

async function _flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

async function _mount(element: ReactElement): Promise<MountedTree> {
  const container = TEST_DOM.document.createElement("div");
  TEST_DOM.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(element);
  });
  await _flush();
  return { container, root };
}

async function _unmount(tree: MountedTree): Promise<void> {
  await act(async () => tree.root.unmount());
  tree.container.remove();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function _findByText(text: string): TestElement {
  const element = TEST_DOM.document.body
    .querySelectorAll("[role=menuitem]")
    .find((candidate) => candidate.textContent.includes(text));
  if (!element) throw new Error(`Could not find menu item: ${text}`);
  return element;
}

async function _findButtonByText(text: string): Promise<TestElement> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const button = TEST_DOM.document.body
      .querySelectorAll("button")
      .find((candidate) => candidate.textContent.includes(text));
    if (button) return button;
    await _flush();
  }
  throw new Error(`Could not find button: ${text}`);
}

function _ShareCommandRegistrar({
  onShare,
}: {
  onShare: NonNullable<CommandHandlers["shareThread"]>;
}) {
  useRegisterCommands({ shareThread: onShare });
  return null;
}

function _CommandShareTrigger({
  path,
  runtimeId,
}: {
  path?: string;
  runtimeId?: RuntimeId;
}) {
  const { executeCommand } = useCommands();
  return (
    <button
      aria-label="Command share"
      onClick={() =>
        executeCommand({
          type: "shareThread",
          args: path ? { path, runtimeId } : {},
        })
      }
    />
  );
}

function _Providers({ children }: { children: ReactElement }) {
  return (
    <ThemeProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  SHARE_REQUESTS.length = 0;
  pendingShare = null;
});

afterAll(async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  TEST_DOM.restore();
  mock.restore();
});

describe("mounted share-thread parents preserve runtime ownership", () => {
  test("a discarded speculative Dialog render cannot stale the committed publication", async () => {
    const share = _deferred<{ shareUrl: string; gistId: string }>();
    const gate = _deferred<void>();
    pendingShare = share;
    let gateResolved = false;
    let setTarget:
      ((target: { runtimeId: RuntimeId; path: string }) => void) | undefined;

    function SpeculativeGate({ runtimeId }: { runtimeId: RuntimeId }) {
      if (runtimeId === "remote:beta" && !gateResolved) {
        // Suspense's API requires throwing the pending thenable.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw gate.promise;
      }
      return null;
    }

    function SpeculativeDialogHarness() {
      const [target, setTargetState] = useState<{
        runtimeId: RuntimeId;
        path: string;
      }>({
        runtimeId: "remote:alpha",
        path: "threads/a.json",
      });
      useLayoutEffect(() => {
        setTarget = setTargetState;
        return () => {
          setTarget = undefined;
        };
      }, []);
      return (
        <Suspense fallback={null}>
          <ShareThreadDialog
            open
            path={target.path}
            runtimeId={target.runtimeId}
            onOpenChange={() => undefined}
          />
          <SpeculativeGate runtimeId={target.runtimeId} />
        </Suspense>
      );
    }

    const tree = await _mount(
      <CommandProvider>
        <GithubAuthProvider>
          <SpeculativeDialogHarness />
        </GithubAuthProvider>
      </CommandProvider>
    );
    const generate = await _findButtonByText("Generate link");
    await act(async () => generate.click());
    if (!setTarget) throw new Error("Expected the committed dialog setter");
    const updateTarget = setTarget;

    await act(async () => {
      startTransition(() => {
        updateTarget({
          runtimeId: "remote:beta",
          path: "threads/b.json",
        });
      });
      await Promise.resolve();
    });

    await act(async () => {
      share.resolve({
        shareUrl: "https://example.test/a",
        gistId: "gist-alpha",
      });
      await share.promise;
    });
    await _flush();

    expect(SHARE_REQUESTS[0]).toMatchObject({
      runtimeId: "remote:alpha",
      path: "threads/a.json",
    });
    expect(TEST_DOM.document.body.textContent).toContain("Copy");

    gateResolved = true;
    gate.resolve();
    await _flush();
    await _unmount(tree);
  });

  test("NodeActions sends the selected file runtime through CommandProvider", async () => {
    const received: unknown[] = [];
    const tree = await _mount(
      <CommandProvider>
        <_ShareCommandRegistrar
          onShare={(args) => {
            received.push(args);
          }}
        />
        <NodeActions
          node={{ name: "tree.json", path: "threads/tree.json", type: "file" }}
          runtimeId="remote:tree"
          menuOpen
          onMenuOpenChange={() => undefined}
        />
      </CommandProvider>
    );

    await act(async () => _findByText("Share...").click());

    expect(received).toEqual([
      { path: "threads/tree.json", runtimeId: "remote:tree" },
    ]);
    await _unmount(tree);
  });

  test("ThreadTabs sends the context tab's remote runtime", async () => {
    const shared: { path: string; runtimeId: RuntimeId }[] = [];
    const tabId = "thread:remote:tabs:threads/tab.json";
    const tree = await _mount(
      <_Providers>
        <ThreadTabs
          tabs={[
            {
              id: tabId,
              type: "thread",
              path: "threads/tab.json",
              runtimeId: "remote:tabs",
              paneId: "pane-tabs",
            },
          ]}
          paneTabs={[]}
          activeId={tabId}
          activate={() => undefined}
          refresh={() => undefined}
          consumeDiscardedPane={() => false}
          close={() => undefined}
          closeOthers={() => undefined}
          closeAll={() => undefined}
          reveal={() => undefined}
          moveToTrash={() => undefined}
          share={(path, runtimeId) => shared.push({ path, runtimeId })}
          copyFile={() => undefined}
          openThread={() => undefined}
          reorder={() => undefined}
          lifecycleHost={{
            acquireMutation: () => () => undefined,
            isMutationReserved: () => false,
            onPersistenceChange: () => undefined,
            onRefreshSettled: () => undefined,
            onRunSettled: () => undefined,
            onRunStart: () => true,
          }}
          mutationRevision={0}
        />
      </_Providers>
    );
    const strip = tree.container.querySelector(".bg-tabs");
    if (!strip) throw new Error("Expected the mounted tab strip");
    const tab = TEST_DOM.document.createElement("div");
    tab.className = "chrome-tab";
    tab.setAttribute("data-tab-id", tabId);
    strip.appendChild(tab);

    await act(async () => tab.dispatchEvent(new TestEvent("contextmenu")));
    await _flush();
    await act(async () => _findByText("Share...").click());

    expect(shared).toEqual([
      { path: "threads/tab.json", runtimeId: "remote:tabs" },
    ]);
    await _unmount(tree);
  });

  test("an explicit command, Page registration, and Dialog request keep one remote target", async () => {
    const tree = await _mount(
      <_Providers>
        <CommandProvider>
          <GithubAuthProvider>
            <PageShareThreadController
              workspaceRuntimeId="local"
              getActiveThread={() => ({
                path: "threads/local-active.json",
                runtimeId: "local",
              })}
            />
            <_CommandShareTrigger
              path="threads/host.json"
              runtimeId="remote:integration"
            />
          </GithubAuthProvider>
        </CommandProvider>
      </_Providers>
    );

    await act(async () => {
      tree.container.querySelector("[aria-label=Command share]")?.click();
    });
    const generate = await _findButtonByText("Generate link");
    await act(async () => generate.click());
    await _flush();

    expect(SHARE_REQUESTS).toEqual([
      {
        runtimeId: "remote:integration",
        path: "threads/host.json",
        title: "Remote threads/host.json",
        description: "",
      },
    ]);
    await _unmount(tree);
  });

  test("Page registration resolves a bare command to the active remote tab", async () => {
    const tree = await _mount(
      <_Providers>
        <CommandProvider>
          <GithubAuthProvider>
            <PageShareThreadController
              workspaceRuntimeId="remote:active"
              getActiveThread={() => ({
                path: "threads/active.json",
                runtimeId: "remote:active",
              })}
            />
            <_CommandShareTrigger />
          </GithubAuthProvider>
        </CommandProvider>
      </_Providers>
    );

    await act(async () => {
      tree.container.querySelector("[aria-label=Command share]")?.click();
    });
    const generate = await _findButtonByText("Generate link");
    await act(async () => generate.click());
    await _flush();

    expect(SHARE_REQUESTS[0]).toMatchObject({
      runtimeId: "remote:active",
      path: "threads/active.json",
    });
    await _unmount(tree);
  });

});
