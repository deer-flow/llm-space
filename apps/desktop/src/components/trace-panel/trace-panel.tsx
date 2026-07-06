"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckIcon,
  DatabaseIcon,
  FolderPlusIcon,
  ImportIcon,
  KeyRoundIcon,
  LinkIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { traceClient } from "@/client";
import { useCommands, useRegisterCommands } from "@/commands";
import { cn } from "@/lib/utils";
import type {
  TraceConnectedProjectInput,
  TraceImportFile,
  TraceLangfuseSearchInput,
  TraceProject,
  TraceRecord,
  TraceRemoteTraceSummary,
} from "@/shared/traces";

import { Tooltip } from "../tooltip";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../ui/empty";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Spinner } from "../ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

interface TracePanelProps {
  className?: string;
  headerStart?: ReactNode;
  onOpenTrace: (trace: TraceRecord) => void;
}

type ConnectedTraceProject = TraceProject & {
  source: Extract<TraceProject["source"], { mode: "connected" }>;
};

interface TraceSearchFormState {
  traceId: string;
  query: string;
  name: string;
  userId: string;
  sessionId: string;
  tags: string;
  version: string;
  release: string;
  environment: string;
  fromTimestamp: string;
  toTimestamp: string;
  orderBy: string;
  limit: string;
}

const DEFAULT_TRACE_SEARCH_FORM: TraceSearchFormState = {
  traceId: "",
  query: "",
  name: "",
  userId: "",
  sessionId: "",
  tags: "",
  version: "",
  release: "",
  environment: "",
  fromTimestamp: "",
  toTimestamp: "",
  orderBy: "timestamp.desc",
  limit: "50",
};

const TRACE_SEARCH_ORDER_OPTIONS = [
  { value: "timestamp.desc", label: "Newest" },
  { value: "timestamp.asc", label: "Oldest" },
  { value: "name.asc", label: "Name A-Z" },
  { value: "userId.asc", label: "User A-Z" },
  { value: "sessionId.asc", label: "Session A-Z" },
  { value: "id.asc", label: "ID A-Z" },
];

const TRACE_SEARCH_LIMIT_OPTIONS = ["25", "50", "100"];

export function TracePanel({ className, onOpenTrace }: TracePanelProps) {
  const { executeCommand } = useCommands();
  const qc = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  );
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [connectionPending, setConnectionPending] = useState(false);
  const [importProjectId, setImportProjectId] = useState<string | null>(null);
  const [syncProjectId, setSyncProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [importing, setImporting] = useState(false);
  const [syncingProjectId, setSyncingProjectId] = useState<string | null>(null);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["trace", "projects"],
    queryFn: () => traceClient.listProjects(),
  });
  const selectedProject = useMemo(
    () =>
      projects.find((project) => project.id === selectedProjectId) ??
      projects[0] ??
      null,
    [projects, selectedProjectId]
  );
  const syncProject = useMemo(() => {
    const project =
      projects.find((project) => project.id === syncProjectId) ?? null;
    return project?.source.mode === "connected"
      ? (project as ConnectedTraceProject)
      : null;
  }, [projects, syncProjectId]);
  const importProject = useMemo(() => {
    const project =
      projects.find((project) => project.id === importProjectId) ?? null;
    return project?.source.mode === "manual" ? project : null;
  }, [importProjectId, projects]);

  useEffect(() => {
    if (!selectedProjectId && projects[0]) {
      setSelectedProjectId(projects[0].id);
    }
    if (
      selectedProjectId &&
      projects.length > 0 &&
      !projects.some((project) => project.id === selectedProjectId)
    ) {
      setSelectedProjectId(projects[0]?.id ?? null);
    }
  }, [projects, selectedProjectId]);

  const createProject = useCallback(
    async (name: string) => {
      try {
        const project = await traceClient.createProject(name);
        setProjectName("");
        setProjectDialogOpen(false);
        setSelectedProjectId(project.id);
        await qc.invalidateQueries({ queryKey: ["trace", "projects"] });
      } catch (error) {
        toast.error("Could not create trace project", {
          description:
            error instanceof Error ? error.message : "Project creation failed.",
        });
      }
    },
    [qc]
  );

  const createConnectedProject = useCallback(
    async (input: TraceConnectedProjectInput) => {
      setConnectionPending(true);
      try {
        const project = await traceClient.createConnectedProject(input);
        setProjectDialogOpen(false);
        setSelectedProjectId(project.id);
        await qc.invalidateQueries({ queryKey: ["trace", "projects"] });
        toast.success("Connected Langfuse project", {
          description: project.source.langfuseProjectName ?? project.name,
        });
      } catch (error) {
        toast.error("Could not connect Langfuse", {
          description:
            error instanceof Error ? error.message : "Connection failed.",
        });
      } finally {
        setConnectionPending(false);
      }
    },
    [qc]
  );

  const importLangfuseFiles = useCallback(
    async (projectId: string, files: TraceImportFile[]) => {
      setImporting(true);
      try {
        const result = await traceClient.importLangfuseJson(projectId, files);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["trace", "projects"] }),
          qc.invalidateQueries({
            queryKey: ["trace", "traces", projectId],
          }),
        ]);
        if (result.imported.length > 0) {
          setImportProjectId(null);
          toast.success(
            `Imported ${result.imported.length} trace${
              result.imported.length === 1 ? "" : "s"
            }`,
            result.warnings.length > 0
              ? { description: result.warnings[0] }
              : undefined
          );
        } else {
          toast.error("No Langfuse traces imported", {
            description:
              result.warnings[0] ??
              "Select a Langfuse Observations JSON export.",
          });
        }
      } catch (error) {
        toast.error("Import failed", {
          description:
            error instanceof Error ? error.message : "Could not import traces.",
        });
      } finally {
        setImporting(false);
      }
    },
    [qc]
  );

  const syncLangfuseTraceIds = useCallback(
    async (projectId: string, traceIds: string[]) => {
      setSyncingProjectId(projectId);
      try {
        const result = await traceClient.syncLangfuseTraces(
          projectId,
          traceIds
        );
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["trace", "projects"] }),
          qc.invalidateQueries({
            queryKey: ["trace", "traces", projectId],
          }),
        ]);
        if (result.imported.length > 0) {
          toast.success(
            `Synced ${result.imported.length} trace${
              result.imported.length === 1 ? "" : "s"
            }`,
            result.warnings.length > 0
              ? { description: result.warnings[0] }
              : undefined
          );
        } else {
          toast.error("No traces synced", {
            description:
              result.warnings[0] ?? "Select a Langfuse trace id to sync.",
          });
        }
      } catch (error) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["trace", "projects"] }),
          qc.invalidateQueries({
            queryKey: ["trace", "traces", projectId],
          }),
        ]);
        toast.error("Sync failed", {
          description:
            error instanceof Error ? error.message : "Could not sync traces.",
        });
      } finally {
        setSyncingProjectId(null);
      }
    },
    [qc]
  );

  useRegisterCommands({
    createTraceProject: ({ name }) => void createProject(name),
    createConnectedTraceProject: (input) => void createConnectedProject(input),
    importLangfuseTraceFiles: ({ projectId, files }) =>
      void importLangfuseFiles(projectId, files),
    syncLangfuseTraceIds: ({ projectId, traceIds }) =>
      void syncLangfuseTraceIds(projectId, traceIds),
  });

  const requestCreateProject = useCallback(() => {
    const name = projectName.trim();
    if (!name) {
      return;
    }
    executeCommand({ type: "createTraceProject", args: { name } });
  }, [executeCommand, projectName]);

  const importFilesIntoProject = useCallback(
    (projectId: string, files: TraceImportFile[]) => {
      executeCommand({
        type: "importLangfuseTraceFiles",
        args: { projectId, files },
      });
    },
    [executeCommand]
  );

  const selectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
  }, []);
  const cancelCreateProject = useCallback(() => {
    setProjectDialogOpen(false);
    setProjectName("");
  }, []);
  const openProjectDialog = useCallback(() => {
    setProjectDialogOpen(true);
  }, []);
  const setSyncDialogOpen = useCallback((open: boolean) => {
    if (!open) {
      setSyncProjectId(null);
    }
  }, []);

  const handleCreateConnectedProject = useCallback(
    (input: TraceConnectedProjectInput) => {
      executeCommand({
        type: "createConnectedTraceProject",
        args: input,
      });
    },
    [executeCommand]
  );

  const handleSyncTraceIds = useCallback(
    (projectId: string, traceIds: string[]) => {
      executeCommand({
        type: "syncLangfuseTraceIds",
        args: { projectId, traceIds },
      });
    },
    [executeCommand]
  );

  const addTraceToProject = useCallback((project: TraceProject) => {
    setSelectedProjectId(project.id);
    if (project.source.mode === "connected") {
      setSyncProjectId(project.id);
      return;
    }
    setImportProjectId(project.id);
  }, []);

  return (
    <div className={cn("bg-sidebar flex h-full flex-col", className)}>
      <header className="electrobun-webkit-app-region-drag flex h-11.5 items-center justify-between px-3">
        <span className="ml-auto flex items-center gap-0.5">
          <Tooltip content="Add Trace Project">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Add Trace Project"
              onClick={openProjectDialog}
            >
              <PlusIcon className="size-4" />
            </Button>
          </Tooltip>
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {projectsLoading ? (
          <div className="flex items-center justify-center p-4">
            <Spinner />
          </div>
        ) : projects.length === 0 ? (
          <_EmptyProjects onAddProject={openProjectDialog} />
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map((project) => (
              <TraceProjectGroup
                key={project.id}
                project={project}
                selected={project.id === selectedProject?.id}
                adding={importing || syncingProjectId === project.id}
                onSelectProject={selectProject}
                onAddTrace={addTraceToProject}
                onOpenTrace={onOpenTrace}
              />
            ))}
          </div>
        )}
      </div>
      <_TraceProjectDialog
        open={projectDialogOpen}
        pending={connectionPending}
        onOpenChange={(open) => {
          if (!connectionPending) {
            setProjectDialogOpen(open);
          }
        }}
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onCreateManual={requestCreateProject}
        onCancelManual={cancelCreateProject}
        onCreate={handleCreateConnectedProject}
      />
      <_ImportLangfuseDialog
        open={Boolean(importProject)}
        project={importProject}
        importing={importing}
        onOpenChange={(open) => {
          if (!open && !importing) {
            setImportProjectId(null);
          }
        }}
        onImport={importFilesIntoProject}
      />
      <_SyncProjectDialog
        open={Boolean(syncProject)}
        project={syncProject}
        syncing={syncProject ? syncingProjectId === syncProject.id : false}
        onOpenChange={setSyncDialogOpen}
        onSyncTraceIds={handleSyncTraceIds}
      />
    </div>
  );
}

function _EmptyProjects({ onAddProject }: { onAddProject: () => void }) {
  return (
    <Empty className="h-full border-0 px-3">
      <EmptyHeader>
        <EmptyTitle>No Trace Projects</EmptyTitle>
        <EmptyDescription>
          Connect Langfuse or create a manual project for JSON exports.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          className="w-full justify-start"
          size="sm"
          onClick={onAddProject}
        >
          <PlusIcon className="size-3" />
          Add Trace Project
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function _TraceProjectDialog({
  open,
  pending,
  onOpenChange,
  projectName,
  onProjectNameChange,
  onCreateManual,
  onCancelManual,
  onCreate,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onCreateManual: () => void;
  onCancelManual: () => void;
  onCreate: (input: TraceConnectedProjectInput) => void;
}) {
  const [tab, setTab] = useState<"langfuse" | "manual">("langfuse");

  useEffect(() => {
    if (open) {
      setTab("langfuse");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
        onInteractOutside={(event) => {
          if (pending) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (pending) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Add Trace Project</DialogTitle>
          <DialogDescription>
            Create a local project or connect a trace provider. More providers
            can plug into this flow later.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as "langfuse" | "manual")}
          className="gap-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="langfuse" disabled={pending}>
              <LinkIcon className="size-3.5" />
              Langfuse
            </TabsTrigger>
            <TabsTrigger value="manual" disabled={pending}>
              <FolderPlusIcon className="size-3.5" />
              Manual
            </TabsTrigger>
          </TabsList>
          <TabsContent value="langfuse" className="mt-0">
            <_ConnectProjectForm
              onCreate={onCreate}
              onCancel={() => onOpenChange(false)}
              pending={pending}
            />
          </TabsContent>
          <TabsContent value="manual" className="mt-0">
            <_ManualProjectForm
              projectName={projectName}
              onNameChange={onProjectNameChange}
              onCreate={onCreateManual}
              onCancel={onCancelManual}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function _ManualProjectForm({
  projectName,
  onNameChange,
  onCreate,
  onCancel,
}: {
  projectName: string;
  onNameChange: (name: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      <_Field label="Project name">
        <Input
          placeholder="Local traces"
          aria-label="Trace project name"
          value={projectName}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCreate();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        />
      </_Field>
      <div className="text-muted-foreground bg-muted/30 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
        <FolderPlusIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Manual projects are for Langfuse JSON exports and any provider import
          we add later.
        </span>
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!projectName.trim()} onClick={onCreate}>
          Create
        </Button>
      </DialogFooter>
    </div>
  );
}

function _ConnectProjectForm({
  onCreate,
  onCancel,
  pending = false,
}: {
  onCreate: (input: TraceConnectedProjectInput) => void;
  onCancel: () => void;
  pending?: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState("https://cloud.langfuse.com");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const canCreate = Boolean(
    baseUrl.trim() && publicKey.trim() && secretKey.trim()
  );
  const submit = useCallback(() => {
    if (!canCreate || pending) {
      return;
    }
    onCreate({
      baseUrl: baseUrl.trim(),
      publicKey: publicKey.trim(),
      secretKey: secretKey.trim(),
    });
  }, [baseUrl, canCreate, onCreate, pending, publicKey, secretKey]);
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <_Field label="Langfuse base URL" className="sm:col-span-2">
          <Input
            autoFocus
            placeholder="https://cloud.langfuse.com"
            aria-label="Langfuse base URL"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </_Field>
        <_Field label="Public key">
          <Input
            placeholder="pk-lf-..."
            aria-label="Langfuse public key"
            value={publicKey}
            onChange={(event) => setPublicKey(event.target.value)}
          />
        </_Field>
        <_Field label="Secret key">
          <Input
            type="password"
            placeholder="sk-lf-..."
            aria-label="Langfuse secret key"
            value={secretKey}
            onChange={(event) => setSecretKey(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onCancel();
              }
            }}
          />
        </_Field>
      </div>
      <div className="text-muted-foreground bg-muted/30 flex items-start gap-2 rounded-md border px-3 py-2 text-xs">
        <KeyRoundIcon className="mt-0.5 size-3.5 shrink-0" />
        <span>
          The connection is tested before the project is created. Connecting
          does not sync traces automatically.
        </span>
      </div>
      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!canCreate || pending} onClick={submit}>
          {pending && <Spinner className="size-3" />}
          Connect
        </Button>
      </DialogFooter>
    </div>
  );
}

function _Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

function _TraceProjectGroup({
  project,
  selected,
  adding,
  onSelectProject,
  onAddTrace,
  onOpenTrace,
}: {
  project: TraceProject;
  selected: boolean;
  adding: boolean;
  onSelectProject: (projectId: string) => void;
  onAddTrace: (project: TraceProject) => void;
  onOpenTrace: (trace: TraceRecord) => void;
}) {
  const { data: traces = [], isLoading } = useQuery({
    queryKey: ["trace", "traces", project.id],
    queryFn: () => traceClient.listTraces(project.id),
    enabled: selected,
  });
  const addLabel =
    project.source.mode === "connected"
      ? "Sync Langfuse Traces"
      : "Import Langfuse Export";

  return (
    <section className="flex flex-col gap-1">
      <div
        className={cn(
          "hover:bg-muted/70 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors",
          selected && "bg-muted/70"
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelectProject(project.id)}
        >
          <span className="bg-primary/10 flex size-6 shrink-0 items-center justify-center rounded-md">
            <DatabaseIcon className="text-primary size-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {project.name}
            </span>
            <span className="text-muted-foreground block truncate text-[0.625rem]">
              {_projectSourceSummary(project)}
            </span>
          </span>
        </button>
        <Tooltip content={addLabel}>
          <Button
            className="size-7 shrink-0"
            variant="secondary"
            size="icon-sm"
            aria-label={addLabel}
            disabled={adding}
            onClick={() => onAddTrace(project)}
          >
            {adding ? (
              <Spinner className="size-3" />
            ) : (
              <PlusIcon className="size-3.5" />
            )}
          </Button>
        </Tooltip>
      </div>
      {selected && (
        <div className="flex flex-col gap-1.5 pl-1">
          {isLoading ? (
            <div className="flex items-center justify-center p-3">
              <Spinner className="size-3.5" />
            </div>
          ) : traces.length === 0 ? (
            <div className="text-muted-foreground bg-muted/20 rounded-md border border-dashed px-3 py-4 text-xs">
              {project.source.mode === "connected"
                ? "No synced traces yet. Use Sync to pull selected Langfuse traces."
                : "No imported traces yet. Import a Langfuse JSON export."}
            </div>
          ) : (
            traces.map((trace) => (
              <TraceRow key={trace.key} trace={trace} onOpen={onOpenTrace} />
            ))
          )}
        </div>
      )}
    </section>
  );
}

const TraceProjectGroup = memo(_TraceProjectGroup);

function _ImportLangfuseDialog({
  open,
  project,
  importing,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  project: TraceProject | null;
  importing: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (projectId: string, files: TraceImportFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [reading, setReading] = useState(false);
  const pending = importing || reading;

  useEffect(() => {
    if (open) {
      setSelectedFiles([]);
      setReading(false);
    }
  }, [open, project?.id]);

  const selectFiles = useCallback((files: FileList | null) => {
    setSelectedFiles(files ? [...files] : []);
  }, []);

  const submit = useCallback(async () => {
    if (!project || selectedFiles.length === 0 || pending) {
      return;
    }
    setReading(true);
    try {
      const records = await Promise.all(
        selectedFiles.map(async (file) => ({
          name: file.name,
          text: await file.text(),
        }))
      );
      onImport(project.id, records);
    } catch (error) {
      toast.error("Import failed", {
        description:
          error instanceof Error ? error.message : "Could not read files.",
      });
    } finally {
      setReading(false);
    }
  }, [onImport, pending, project, selectedFiles]);

  return (
    <Dialog open={open && project !== null} onOpenChange={onOpenChange}>
      {project && (
        <DialogContent
          className="max-h-[85vh] overflow-y-auto sm:max-w-xl"
          onInteractOutside={(event) => {
            if (pending) {
              event.preventDefault();
            }
          }}
          onPointerDownOutside={(event) => {
            if (pending) {
              event.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Import Langfuse Export</DialogTitle>
            <DialogDescription>
              {project.name} accepts JSON exports from one Langfuse project.
            </DialogDescription>
          </DialogHeader>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".json,application/json"
            aria-label="Choose Langfuse JSON files"
            className="hidden"
            onChange={(event) => {
              selectFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <div className="flex flex-col gap-3">
            <Button
              className="justify-start"
              variant="secondary"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              <ImportIcon className="size-4" />
              Choose JSON Files
            </Button>
            <div className="bg-muted/30 border-border/70 min-h-24 rounded-md border p-3">
              {selectedFiles.length === 0 ? (
                <div className="text-muted-foreground flex h-20 items-center justify-center text-center text-xs">
                  Select Langfuse Observations JSON exports to import.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {selectedFiles.map((file) => (
                    <div
                      key={`${file.name}:${file.size}:${file.lastModified}`}
                      className="flex min-w-0 items-center justify-between gap-3 text-xs"
                    >
                      <span className="truncate">{file.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        {_formatBytes(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={selectedFiles.length === 0 || pending}
              onClick={() => void submit()}
            >
              {pending && <Spinner className="size-3" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function _SyncProjectDialog({
  open,
  project,
  syncing,
  onOpenChange,
  onSyncTraceIds,
}: {
  open: boolean;
  project: ConnectedTraceProject | null;
  syncing: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncTraceIds: (projectId: string, traceIds: string[]) => void;
}) {
  const [form, setForm] = useState<TraceSearchFormState>(
    DEFAULT_TRACE_SEARCH_FORM
  );
  const [remoteTraces, setRemoteTraces] = useState<TraceRemoteTraceSummary[]>(
    []
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const selectedIds = useMemo(() => [...selected], [selected]);
  const searchFilters = useMemo(
    () => _traceSearchFiltersFromForm(form),
    [form]
  );

  useEffect(() => {
    if (open) {
      setForm(DEFAULT_TRACE_SEARCH_FORM);
      setRemoteTraces([]);
      setSelected(new Set());
    }
  }, [open, project?.id]);

  const setFormValue = useCallback(
    (key: keyof TraceSearchFormState, value: string) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const search = useCallback(async () => {
    if (!project) {
      return;
    }
    setSearching(true);
    try {
      const rows = await traceClient.searchLangfuseTraces(
        project.id,
        searchFilters
      );
      setRemoteTraces(rows);
      setSelected(new Set());
    } catch (error) {
      toast.error("Search failed", {
        description:
          error instanceof Error ? error.message : "Could not search traces.",
      });
    } finally {
      setSearching(false);
    }
  }, [project, searchFilters]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const syncSelected = useCallback(() => {
    if (!project || selectedIds.length === 0) {
      return;
    }
    onSyncTraceIds(project.id, selectedIds);
  }, [onSyncTraceIds, project, selectedIds]);

  const searchSummary =
    remoteTraces.length > 0
      ? `${remoteTraces.length} shown · ${selectedIds.length} selected`
      : "Search remote traces without syncing them.";

  return (
    <Dialog open={open && project !== null} onOpenChange={onOpenChange}>
      {project && (
        <DialogContent
          className="flex max-h-[85vh] w-[min(920px,calc(100vw-2rem))] max-w-none! flex-col gap-0 overflow-hidden p-0"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Sync Langfuse Traces</DialogTitle>
            <DialogDescription>
              {project.name}
              {project.source.langfuseProjectName
                ? ` · ${project.source.langfuseProjectName}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-4">
            <div className="flex flex-col gap-4">
              <section className="flex min-w-0 flex-col gap-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      Search Remote Traces
                    </div>
                    <div className="text-muted-foreground truncate text-xs">
                      {searchSummary}
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem_7rem_auto]">
                  <_Field label="Search">
                    <Input
                      placeholder="Trace ID, name, user, or session"
                      aria-label="Search remote Langfuse traces"
                      value={form.query}
                      onChange={(event) =>
                        setFormValue("query", event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void search();
                        }
                      }}
                    />
                  </_Field>
                  <_Field label="Sort">
                    <Select
                      value={form.orderBy}
                      onValueChange={(value) => setFormValue("orderBy", value)}
                    >
                      <SelectTrigger aria-label="Sort remote Langfuse traces">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRACE_SEARCH_ORDER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </_Field>
                  <_Field label="Limit">
                    <Select
                      value={form.limit}
                      onValueChange={(value) => setFormValue("limit", value)}
                    >
                      <SelectTrigger aria-label="Remote Langfuse trace limit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRACE_SEARCH_LIMIT_OPTIONS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </_Field>
                  <Button
                    className="mt-5 shrink-0 justify-center"
                    variant="secondary"
                    disabled={searching}
                    onClick={() => void search()}
                  >
                    {searching ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <SearchIcon className="size-4" />
                    )}
                    Search
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <_Field label="Trace ID">
                    <Input
                      placeholder="exact trace id"
                      value={form.traceId}
                      onChange={(event) =>
                        setFormValue("traceId", event.target.value)
                      }
                    />
                  </_Field>
                  <_Field label="Name">
                    <Input
                      placeholder="trace name"
                      value={form.name}
                      onChange={(event) =>
                        setFormValue("name", event.target.value)
                      }
                    />
                  </_Field>
                  <_Field label="User ID">
                    <Input
                      placeholder="user id"
                      value={form.userId}
                      onChange={(event) =>
                        setFormValue("userId", event.target.value)
                      }
                    />
                  </_Field>
                  <_Field label="Session ID">
                    <Input
                      placeholder="session id"
                      value={form.sessionId}
                      onChange={(event) =>
                        setFormValue("sessionId", event.target.value)
                      }
                    />
                  </_Field>
                  <_Field label="Tags">
                    <Input
                      placeholder="tag-a, tag-b"
                      value={form.tags}
                      onChange={(event) =>
                        setFormValue("tags", event.target.value)
                      }
                    />
                  </_Field>
                  <_Field label="Environment">
                    <Input
                      placeholder="production"
                      value={form.environment}
                      onChange={(event) =>
                        setFormValue("environment", event.target.value)
                      }
                    />
                  </_Field>
                  <_Field label="Version">
                    <Input
                      placeholder="version"
                      value={form.version}
                      onChange={(event) =>
                        setFormValue("version", event.target.value)
                      }
                    />
                  </_Field>
                  <_Field label="Release">
                    <Input
                      placeholder="release"
                      value={form.release}
                      onChange={(event) =>
                        setFormValue("release", event.target.value)
                      }
                    />
                  </_Field>
                  <div className="grid grid-cols-2 gap-3 lg:col-span-1">
                    <_Field label="From">
                      <Input
                        type="datetime-local"
                        value={form.fromTimestamp}
                        onChange={(event) =>
                          setFormValue("fromTimestamp", event.target.value)
                        }
                      />
                    </_Field>
                    <_Field label="To">
                      <Input
                        type="datetime-local"
                        value={form.toTimestamp}
                        onChange={(event) =>
                          setFormValue("toTimestamp", event.target.value)
                        }
                      />
                    </_Field>
                  </div>
                </div>
                <div className="border-border/70 max-h-80 min-h-60 overflow-auto rounded-md border bg-[#141414]">
                  {remoteTraces.length === 0 ? (
                    <div className="flex h-60 flex-col items-center justify-center px-6 text-center">
                      <SearchIcon className="text-muted-foreground/70 mb-2 size-5" />
                      <div className="text-sm font-medium">
                        No remote traces loaded
                      </div>
                      <div className="text-muted-foreground mt-1 text-xs">
                        Run a search, then select traces to sync.
                      </div>
                    </div>
                  ) : (
                    remoteTraces.map((trace) => (
                      <RemoteTraceRow
                        key={trace.id}
                        trace={trace}
                        selected={selected.has(trace.id)}
                        onToggle={toggle}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
          <DialogFooter className="border-t px-4 py-3">
            <Button
              variant="ghost"
              disabled={syncing}
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button
              disabled={syncing || selectedIds.length === 0}
              onClick={syncSelected}
            >
              {syncing ? (
                <Spinner className="size-3.5" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              {selectedIds.length > 0
                ? `Sync ${selectedIds.length} Selected`
                : "Sync Selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function _projectSourceSummary(project: TraceProject): string {
  if (project.source.mode === "connected") {
    return project.source.langfuseProjectName
      ? `Connected · ${project.source.langfuseProjectName}`
      : "Connected Langfuse";
  }
  return project.source.langfuseProjectName
    ? `Manual import · ${project.source.langfuseProjectName}`
    : "Manual import";
}

function _traceSearchFiltersFromForm(
  form: TraceSearchFormState
): TraceLangfuseSearchInput {
  return {
    ...(_trimmed(form.traceId) ? { id: _trimmed(form.traceId) } : {}),
    ...(_trimmed(form.query) ? { query: _trimmed(form.query) } : {}),
    ...(_trimmed(form.name) ? { name: _trimmed(form.name) } : {}),
    ...(_trimmed(form.userId) ? { userId: _trimmed(form.userId) } : {}),
    ...(_trimmed(form.sessionId)
      ? { sessionId: _trimmed(form.sessionId) }
      : {}),
    ...(_csv(form.tags).length > 0 ? { tags: _csv(form.tags) } : {}),
    ...(_trimmed(form.version) ? { version: _trimmed(form.version) } : {}),
    ...(_trimmed(form.release) ? { release: _trimmed(form.release) } : {}),
    ...(_csv(form.environment).length > 0
      ? { environment: _csv(form.environment) }
      : {}),
    ...(_datetimeLocalToIso(form.fromTimestamp)
      ? { fromTimestamp: _datetimeLocalToIso(form.fromTimestamp) }
      : {}),
    ...(_datetimeLocalToIso(form.toTimestamp)
      ? { toTimestamp: _datetimeLocalToIso(form.toTimestamp) }
      : {}),
    orderBy: form.orderBy,
    limit: Number(form.limit),
  };
}

function _trimmed(value: string): string | undefined {
  return value.trim() || undefined;
}

function _csv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function _datetimeLocalToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function _RemoteTraceRow({
  trace,
  selected,
  onToggle,
}: {
  trace: TraceRemoteTraceSummary;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const meta = _remoteTraceMeta(trace);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      className={cn(
        "hover:bg-muted/70 flex w-full min-w-0 items-start gap-3 border-b px-3 py-2.5 text-left last:border-b-0",
        selected && "bg-muted"
      )}
      onClick={() => onToggle(trace.id)}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border",
          selected ? "border-primary bg-primary text-primary-foreground" : ""
        )}
      >
        {selected ? <CheckIcon className="size-3" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {trace.name || trace.id}
        </span>
        <span className="text-muted-foreground mt-0.5 block truncate text-xs">
          {meta || trace.id}
        </span>
      </span>
    </button>
  );
}

const RemoteTraceRow = memo(_RemoteTraceRow);

function _remoteTraceMeta(trace: TraceRemoteTraceSummary): string {
  return [
    trace.timestamp ? _formatDateTime(trace.timestamp) : null,
    trace.userId,
    trace.sessionId,
    trace.environment,
    trace.release,
    trace.version,
    trace.tags && trace.tags.length > 0 ? trace.tags.join(", ") : null,
    trace.observationCount ? `${trace.observationCount} obs` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function _formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function _formatDateTime(value: string | number): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function _TraceRow({
  trace,
  onOpen,
}: {
  trace: TraceRecord;
  onOpen: (trace: TraceRecord) => void;
}) {
  const subtitle = [
    trace.startedAt ? _formatDateTime(trace.startedAt) : null,
    trace.model,
    `${trace.observationCount} obs`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      className="hover:bg-muted/70 focus-visible:ring-ring/50 flex w-full min-w-0 items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
      onClick={() => onOpen(trace)}
    >
      <span
        className={cn(
          "mt-1 size-1.5 shrink-0 rounded-full",
          trace.status === "error" ? "bg-destructive" : "bg-primary/70"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">
          {trace.title}
        </span>
        <span className="text-muted-foreground mt-0.5 block truncate text-[0.625rem]">
          {subtitle || trace.source.traceId}
        </span>
      </span>
      {trace.status === "error" && (
        <span className="bg-destructive/10 text-destructive shrink-0 rounded px-1.5 py-0.5 text-[0.5625rem]">
          Error
        </span>
      )}
    </button>
  );
}

const TraceRow = memo(_TraceRow);
