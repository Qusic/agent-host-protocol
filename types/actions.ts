/**
 * Action Types — Source of truth for all AHP action type definitions.
 *
 * @module actions
 * @description Complete reference for all action types in the Agent Host Protocol.
 * Actions are the sole mutation mechanism for subscribable state.
 */

import type {
  URI,
  IAgentInfo,
  IErrorInfo,
  IUserMessage,
  IResponsePart,
  IToolCallState,
  IUsageInfo,
  IPermissionRequest,
} from './state.js';

// ─── Action Envelope ─────────────────────────────────────────────────────────

/**
 * Every action is wrapped in an `ActionEnvelope`.
 */
export interface IActionEnvelope {
  readonly action: IStateAction;
  readonly serverSeq: number;
  readonly origin: { clientId: string; clientSeq: number } | undefined;
  readonly rejectionReason?: string;
}

// ─── Root Actions ────────────────────────────────────────────────────────────

/**
 * Fired when available agent backends or their models change.
 *
 * @category Root Actions
 * @version 1
 */
export interface IRootAgentsChangedAction {
  type: 'root/agentsChanged';
  /** Updated agent list */
  agents: IAgentInfo[];
}

// ─── Session Actions ─────────────────────────────────────────────────────────

/**
 * Session backend initialized successfully.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionReadyAction {
  type: 'session/ready';
  /** Session URI */
  session: URI;
}

/**
 * Session backend failed to initialize.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionCreationFailedAction {
  type: 'session/creationFailed';
  /** Session URI */
  session: URI;
  /** Error details */
  error: IErrorInfo;
}

/**
 * User sent a message; server starts agent processing.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface ISessionTurnStartedAction {
  type: 'session/turnStarted';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** User's message */
  userMessage: IUserMessage;
}

/**
 * Streaming text chunk from the assistant.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionDeltaAction {
  type: 'session/delta';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Text chunk */
  content: string;
}

/**
 * Structured content appended to the response.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionResponsePartAction {
  type: 'session/responsePart';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Response part (markdown or content ref) */
  part: IResponsePart;
}

/**
 * Tool execution began.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionToolStartAction {
  type: 'session/toolStart';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Full tool call state */
  toolCall: IToolCallState;
}

/**
 * Tool execution finished.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionToolCompleteAction {
  type: 'session/toolComplete';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Tool call to complete */
  toolCallId: string;
  /** Completion result */
  result: IToolCompleteResult;
}

/**
 * Completion result for a tool call.
 */
export interface IToolCompleteResult {
  /** Whether the tool succeeded */
  success: boolean;
  /** Past-tense description */
  pastTenseMessage: string;
  /** Tool output text */
  toolOutput?: string;
  /** Error details */
  error?: { message: string; code?: string };
}

/**
 * Permission needed from the user to proceed.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionPermissionRequestAction {
  type: 'session/permissionRequest';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Permission request details */
  request: IPermissionRequest;
}

/**
 * Permission granted or denied.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface ISessionPermissionResolvedAction {
  type: 'session/permissionResolved';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Permission request ID */
  requestId: string;
  /** Whether permission was granted */
  approved: boolean;
}

/**
 * Turn finished — the assistant is idle.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionTurnCompleteAction {
  type: 'session/turnComplete';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
}

/**
 * Turn was aborted; server stops processing.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface ISessionTurnCancelledAction {
  type: 'session/turnCancelled';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
}

/**
 * Error during turn processing.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionErrorAction {
  type: 'session/error';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Error details */
  error: IErrorInfo;
}

/**
 * Session title updated (typically auto-generated from conversation).
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionTitleChangedAction {
  type: 'session/titleChanged';
  /** Session URI */
  session: URI;
  /** New title */
  title: string;
}

/**
 * Token usage report for a turn.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionUsageAction {
  type: 'session/usage';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Token usage data */
  usage: IUsageInfo;
}

/**
 * Reasoning/thinking text from the model.
 *
 * @category Session Actions
 * @version 1
 */
export interface ISessionReasoningAction {
  type: 'session/reasoning';
  /** Session URI */
  session: URI;
  /** Turn identifier */
  turnId: string;
  /** Reasoning text chunk */
  content: string;
}

/**
 * Model changed for this session.
 *
 * @category Session Actions
 * @version 1
 * @clientDispatchable
 */
export interface ISessionModelChangedAction {
  type: 'session/modelChanged';
  /** Session URI */
  session: URI;
  /** New model ID */
  model: string;
}

// ─── Discriminated Union ─────────────────────────────────────────────────────

/**
 * Discriminated union of all state actions.
 */
export type IStateAction =
  | IRootAgentsChangedAction
  | ISessionReadyAction
  | ISessionCreationFailedAction
  | ISessionTurnStartedAction
  | ISessionDeltaAction
  | ISessionResponsePartAction
  | ISessionToolStartAction
  | ISessionToolCompleteAction
  | ISessionPermissionRequestAction
  | ISessionPermissionResolvedAction
  | ISessionTurnCompleteAction
  | ISessionTurnCancelledAction
  | ISessionErrorAction
  | ISessionTitleChangedAction
  | ISessionUsageAction
  | ISessionReasoningAction
  | ISessionModelChangedAction;
