export interface RunValidationIssue {
  readonly code: "lastAssistantMessage";
  readonly level: "error" | "warning";
  readonly message: string;
  readonly messageId: string;
  readonly resolution?: {
    readonly type: "appendUserMessage";
  };
}
