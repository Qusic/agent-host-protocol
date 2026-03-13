/**
 * State Types — Source of truth for all AHP state type definitions.
 *
 * @module state
 * @description Complete reference for all state types in the Agent Host Protocol.
 */

// ─── Type Aliases ────────────────────────────────────────────────────────────

/** A URI string (e.g. `agenthost:/root` or `copilot:/<uuid>`). */
export type URI = string;

// ─── Root State ──────────────────────────────────────────────────────────────

/**
 * Global state shared with every client subscribed to `agenthost:/root`.
 *
 * @category Root State
 */
export interface IRootState {
  /** Available agent backends and their models */
  agents: IAgentInfo[];
}

/**
 * @category Root State
 */
export interface IAgentInfo {
  /** Agent provider ID (e.g. `'copilot'`) */
  provider: string;
  /** Human-readable name */
  displayName: string;
  /** Description string */
  description: string;
  /** Available models for this agent */
  models: ISessionModelInfo[];
}

/**
 * @category Root State
 */
export interface ISessionModelInfo {
  /** Model identifier */
  id: string;
  /** Provider this model belongs to */
  provider: string;
  /** Human-readable model name */
  name: string;
  /** Maximum context window size */
  maxContextWindow?: number;
  /** Whether the model supports vision */
  supportsVision?: boolean;
  /** Policy configuration state */
  policyState?: 'enabled' | 'disabled' | 'unconfigured';
}

// ─── Session State ───────────────────────────────────────────────────────────

/**
 * Full state for a single session, loaded when a client subscribes to the session's URI.
 *
 * @category Session State
 */
export interface ISessionState {
  /** Lightweight session metadata */
  summary: ISessionSummary;
  /** Session initialization state */
  lifecycle: 'creating' | 'ready' | 'creationFailed';
  /** Error details if creation failed */
  creationError?: IErrorInfo;
  /** Completed turns */
  turns: ITurn[];
  /** Currently in-progress turn */
  activeTurn?: IActiveTurn;
}

/**
 * @category Session State
 */
export interface ISessionSummary {
  /** Session URI */
  resource: URI;
  /** Agent provider ID */
  provider: string;
  /** Session title */
  title: string;
  /** Current session status */
  status: 'idle' | 'in-progress' | 'error';
  /** Creation timestamp */
  createdAt: number;
  /** Last modification timestamp */
  modifiedAt: number;
  /** Currently selected model */
  model?: string;
}

// ─── Turn Types ──────────────────────────────────────────────────────────────

/**
 * A completed request/response cycle.
 *
 * @category Turn Types
 */
export interface ITurn {
  /** Turn identifier */
  id: string;
  /** The user's input */
  userMessage: IUserMessage;
  /** Final response text (captured from streaming) */
  responseText: string;
  /** Structured response content */
  responseParts: IResponsePart[];
  /** Completed tool invocations */
  toolCalls: ICompletedToolCall[];
  /** Token usage info */
  usage: IUsageInfo | undefined;
  /** How the turn ended */
  state: 'complete' | 'cancelled' | 'error';
  /** Error details if state is `'error'` */
  error?: IErrorInfo;
}

/**
 * An in-progress turn — the assistant is actively streaming.
 *
 * @category Turn Types
 */
export interface IActiveTurn {
  /** Turn identifier */
  id: string;
  /** The user's input */
  userMessage: IUserMessage;
  /** Accumulated streaming response text */
  streamingText: string;
  /** Structured response content so far */
  responseParts: IResponsePart[];
  /** Active tool invocations keyed by tool call ID */
  toolCalls: Record<string, IToolCallState>;
  /** Pending permission requests keyed by request ID */
  pendingPermissions: Record<string, IPermissionRequest>;
  /** Accumulated reasoning/thinking text */
  reasoning: string;
  /** Token usage info */
  usage: IUsageInfo | undefined;
}

/**
 * @category Turn Types
 */
export interface IUserMessage {
  /** Message text */
  text: string;
  /** File/selection attachments */
  attachments?: IMessageAttachment[];
}

/**
 * @category Turn Types
 */
export interface IMessageAttachment {
  /** Attachment type */
  type: 'file' | 'directory' | 'selection';
  /** File/directory path */
  path: string;
  /** Display name */
  displayName?: string;
}

// ─── Response Parts ──────────────────────────────────────────────────────────

/**
 * @category Response Parts
 */
export interface IMarkdownResponsePart {
  /** Discriminant */
  kind: 'markdown';
  /** Markdown content */
  content: string;
}

/**
 * A reference to large content stored outside the state tree.
 *
 * @category Response Parts
 */
export interface IContentRef {
  /** Discriminant */
  kind: 'contentRef';
  /** Content URI */
  uri: string;
  /** Approximate size in bytes */
  sizeHint?: number;
  /** Content MIME type */
  mimeType?: string;
}

/**
 * @category Response Parts
 */
export type IResponsePart = IMarkdownResponsePart | IContentRef;

// ─── Tool Call Types ─────────────────────────────────────────────────────────

/** @category Tool Call Types */
export type ToolCallStatus = 'running' | 'pending-permission' | 'completed' | 'failed' | 'cancelled';

/** @category Tool Call Types */
export type ConfirmationState = 'not-needed' | 'user-action' | 'setting' | 'denied' | 'skipped';

/**
 * Full lifecycle state of a tool invocation within an active turn.
 *
 * @category Tool Call Types
 * @remarks
 * Fields like `toolName` carry agent-specific identifiers on the wire despite the
 * agent-agnostic design principle. These exist for debugging and logging purposes.
 * A future version may move these to a separate diagnostic channel or namespace them
 * more clearly.
 */
export interface IToolCallState {
  /** Unique tool call identifier */
  toolCallId: string;
  /** Internal tool name */
  toolName: string;
  /** Human-readable tool name */
  displayName: string;
  /** Message shown while running */
  invocationMessage: string;
  /** Raw tool input */
  toolInput?: string;
  /** Rendering hint */
  toolKind?: 'terminal';
  /** Language for syntax highlighting */
  language?: string;
  /** Serialized tool arguments */
  toolArguments?: string;
  /** Current status */
  status: ToolCallStatus;
  /** Parsed tool parameters */
  parameters?: unknown;
  /** How the tool was confirmed */
  confirmed?: ConfirmationState;
  /** Message shown after completion */
  pastTenseMessage?: string;
  /** Tool output text */
  toolOutput?: string;
  /** Error details */
  error?: { message: string; code?: string };
  /** Why the tool was cancelled */
  cancellationReason?: 'denied' | 'skipped';
}

/**
 * @category Tool Call Types
 */
export interface ICompletedToolCall {
  /** Unique tool call identifier */
  toolCallId: string;
  /** Internal tool name */
  toolName: string;
  /** Human-readable tool name */
  displayName: string;
  /** Message shown during invocation */
  invocationMessage: string;
  /** Whether the tool succeeded */
  success: boolean;
  /** Message shown after completion */
  pastTenseMessage: string;
  /** Raw tool input */
  toolInput?: string;
  /** Rendering hint */
  toolKind?: 'terminal';
  /** Language for syntax highlighting */
  language?: string;
  /** Tool output text */
  toolOutput?: string;
  /** Error details */
  error?: { message: string; code?: string };
}

// ─── Permission Types ────────────────────────────────────────────────────────

/**
 * @category Permission Types
 * @remarks
 * Fields like `serverName`, `toolName`, and `rawRequest` carry agent-specific
 * identifiers on the wire despite the agent-agnostic design principle. These exist
 * for debugging and logging purposes.
 */
export interface IPermissionRequest {
  /** Unique request identifier */
  requestId: string;
  /** Type of permission */
  permissionKind: 'shell' | 'write' | 'mcp' | 'read' | 'url';
  /** Associated tool call */
  toolCallId?: string;
  /** File/directory path */
  path?: string;
  /** Full command to execute */
  fullCommandText?: string;
  /** What the tool intends to do */
  intention?: string;
  /** MCP server name */
  serverName?: string;
  /** Tool requesting permission */
  toolName?: string;
  /** Raw request data */
  rawRequest?: string;
}

// ─── Common Types ────────────────────────────────────────────────────────────

/**
 * @category Common Types
 */
export interface IUsageInfo {
  /** Input tokens consumed */
  inputTokens?: number;
  /** Output tokens generated */
  outputTokens?: number;
  /** Model used */
  model?: string;
  /** Tokens read from cache */
  cacheReadTokens?: number;
}

/**
 * @category Common Types
 */
export interface IErrorInfo {
  /** Error type identifier */
  errorType: string;
  /** Human-readable error message */
  message: string;
  /** Stack trace */
  stack?: string;
}

/**
 * A point-in-time snapshot of a subscribed resource's state, returned by
 * `initialize`, `reconnect`, and `subscribe`.
 *
 * @category Common Types
 */
export interface ISnapshot {
  /** The subscribed resource URI (e.g. `agenthost:/root` or `copilot:/<uuid>`) */
  resource: URI;
  /** The current state of the resource */
  state: IRootState | ISessionState;
  /** The `serverSeq` at which this snapshot was taken. Subsequent actions will have `serverSeq > fromSeq`. */
  fromSeq: number;
}
