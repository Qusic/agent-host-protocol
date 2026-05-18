/**
 * Version 2 Type Snapshot — Frozen wire-format types for protocol version 2.
 *
 * This file captures the shape of every state type and action type at the time
 * version 2 was released. It MUST NOT be modified after the version 2 is frozen.
 * When `PROTOCOL_VERSION` is bumped, a new `v3.ts` is created and this file
 * becomes permanently immutable.
 *
 * @module version/v2
 */

import type {
  RootState,
  RootConfigState,
  AgentInfo,
  SessionModelInfo,
  ModelSelection,
  ProtectedResourceMetadata,
  StringOrMarkdown,
  SessionState,
  SessionSummary,
  SessionConfigState,
  ConfigPropertySchema,
  ConfigSchema,
  ProjectInfo,
  SessionActiveClient,
  Turn,
  ActiveTurn,
  UserMessage,
  MessageAttachment,
  MessageAttachmentBase,
  TextPosition,
  TextRange,
  TextSelection,
  SimpleMessageAttachment,
  MessageEmbeddedResourceAttachment,
  MessageResourceAttachment,
  MarkdownResponsePart,
  ContentRef,
  ToolCallResponsePart,
  ReasoningResponsePart,
  SystemNotificationResponsePart,
  ToolCallResult,
  ToolCallStreamingState,
  ToolCallPendingConfirmationState,
  ToolCallRunningState,
  ToolCallPendingResultConfirmationState,
  ToolCallCompletedState,
  ToolCallCancelledState,
  ToolCallState,
  ToolDefinition,
  ToolAnnotations,
  ToolResultTextContent,
  ToolResultEmbeddedResourceContent,
  ToolResultResourceContent,
  FileEdit,
  ToolResultFileEditContent,
  ToolResultTerminalContent,
  ToolResultSubagentContent,
  UsageInfo,
  ErrorInfo,
  Snapshot,
  PendingMessage,
  Icon,
  CustomizationRef,
  SessionCustomization,
  TerminalInfo,
  TerminalClientClaim,
  TerminalSessionClaim,
  TerminalClaim,
  TerminalState,
  TerminalContentPart,
  TerminalUnclassifiedPart,
  TerminalCommandPart,
  ChangesetSummary,
  ChangesetState,
  ChangesetFile,
  ChangesetOperation,
  ChangesetStatus,
  ChangesetOperationScope,
  SessionInputAnswer,
  SessionInputAnswerValue,
  SessionInputTextAnswerValue,
  SessionInputNumberAnswerValue,
  SessionInputBooleanAnswerValue,
  SessionInputSelectedAnswerValue,
  SessionInputSelectedManyAnswerValue,
  SessionInputAnswered,
  SessionInputSkipped,
  SessionInputOption,
  SessionInputQuestion,
  SessionInputTextQuestion,
  SessionInputNumberQuestion,
  SessionInputBooleanQuestion,
  SessionInputSingleSelectQuestion,
  SessionInputMultiSelectQuestion,
  SessionInputRequest,
  ConfirmationOption,
  ConfirmationOptionKind,
} from '../state.js';

import type {
  StateAction,
  ActionEnvelope,
  ActionOrigin,
  RootActiveSessionsChangedAction,
  SessionToolCallApprovedAction,
  SessionToolCallDeniedAction,
  SessionServerToolsChangedAction,
  SessionActiveClientChangedAction,
  SessionActiveClientToolsChangedAction,
  SessionPendingMessageSetAction,
  SessionPendingMessageRemovedAction,
  SessionQueuedMessagesReorderedAction,
  SessionCustomizationsChangedAction,
  SessionCustomizationToggledAction,
  SessionCustomizationUpdatedAction,
  SessionTruncatedAction,
  SessionIsReadChangedAction,
  SessionIsArchivedChangedAction,
  SessionActivityChangedAction,
  SessionConfigChangedAction,
  ChangesetStatusChangedAction,
  ChangesetFileSetAction,
  ChangesetFileRemovedAction,
  ChangesetOperationsChangedAction,
  ChangesetClearedAction,
  RootTerminalsChangedAction,
  RootConfigChangedAction,
  SessionToolCallContentChangedAction,
  TerminalDataAction,
  TerminalInputAction,
  TerminalResizedAction,
  TerminalClaimedAction,
  TerminalTitleChangedAction,
  TerminalCwdChangedAction,
  TerminalExitedAction,
  TerminalClearedAction,
  TerminalCommandDetectionAvailableAction,
  TerminalCommandExecutedAction,
  TerminalCommandFinishedAction,
  SessionInputAnswerChangedAction,
  SessionInputCompletedAction,
  SessionInputRequestedAction,
} from '../actions.js';

import type {
  ProtocolNotification,
  AuthRequiredNotification,
  SessionSummaryChangedNotification,
} from '../notifications.js';

import type {
  ListSessionsResult,
  AuthenticateParams,
  AuthenticateResult,
  ResourceWriteParams,
  ResourceWriteResult,
  SessionForkSource,
  ResourceReadParams,
  ResourceReadResult,
  ResourceListParams,
  ResourceListResult,
  ResourceCopyParams,
  ResourceCopyResult,
  ResourceDeleteParams,
  ResourceDeleteResult,
  ResourceMoveParams,
  ResourceMoveResult,
  ResourceRequestParams,
  ResourceRequestResult,
  CreateTerminalParams,
  CreateSessionParams,
  DisposeTerminalParams,
  ResolveSessionConfigParams,
  ResolveSessionConfigResult,
  SessionConfigPropertySchema,
  SessionConfigSchema,
  SessionConfigCompletionsParams,
  SessionConfigCompletionsResult,
  SessionConfigValueItem,
  CompletionsParams,
  CompletionItem,
  CompletionsResult,
  InvokeChangesetOperationParams,
  InvokeChangesetOperationResult,
  ChangesetOperationTarget,
  ChangesetOperationFollowUp,
  InitializeParams,
  InitializeResult,
  ReconnectParams,
  ReconnectResult,
  ReconnectReplayResult,
  ReconnectSnapshotResult,
} from '../commands.js';

import type {
  CommandMap,
  ServerCommandMap,
  ClientNotificationMap,
  ServerNotificationMap,
  NotificationMethodParams,
} from '../messages.js';

import type {
  AhpError,
  AhpErrorDetailsMap,
  AuthRequiredErrorData,
  PermissionDeniedErrorData,
  UnsupportedProtocolVersionErrorData,
} from '../errors.js';

// ─── Bidirectional Assignability Check ───────────────────────────────────────

/**
 * Ensures bidirectional assignability between frozen (v2) and current (living)
 * types. The only allowed evolution is adding optional fields:
 *
 * - `Current extends Frozen` → can't remove fields or change field types
 * - `Frozen extends Current` → can't add required fields
 */
type AssertCompatible<Frozen, _Current extends Frozen> =
  Frozen extends _Current ? true : never;

// ─── V2 Frozen State Types ───────────────────────────────────────────────────

// These type aliases pin the current living types as the v2 frozen shapes.
// If a future change to the living types breaks compatibility, the compiler
// will surface it here.

type V2_RootState = RootState;
type V2_RootConfigState = RootConfigState;
type V2_StringOrMarkdown = StringOrMarkdown;
type V2_AgentInfo = AgentInfo;
type V2_ProtectedResourceMetadata = ProtectedResourceMetadata;
type V2_SessionModelInfo = SessionModelInfo;
type V2_ModelSelection = ModelSelection;
type V2_SessionState = SessionState;
type V2_SessionSummary = SessionSummary;
type V2_SessionConfigState = SessionConfigState;
type V2_ProjectInfo = ProjectInfo;
type V2_SessionActiveClient = SessionActiveClient;
type V2_Turn = Turn;
type V2_ActiveTurn = ActiveTurn;
type V2_UserMessage = UserMessage;
type V2_MessageAttachment = MessageAttachment;
type V2_MessageAttachmentBase = MessageAttachmentBase;
type V2_TextPosition = TextPosition;
type V2_TextRange = TextRange;
type V2_TextSelection = TextSelection;
type V2_SimpleMessageAttachment = SimpleMessageAttachment;
type V2_MessageEmbeddedResourceAttachment = MessageEmbeddedResourceAttachment;
type V2_MessageResourceAttachment = MessageResourceAttachment;
type V2_MarkdownResponsePart = MarkdownResponsePart;
type V2_ContentRef = ContentRef;
type V2_ToolCallResponsePart = ToolCallResponsePart;
type V2_ReasoningResponsePart = ReasoningResponsePart;
type V2_SystemNotificationResponsePart = SystemNotificationResponsePart;
type V2_ToolCallResult = ToolCallResult;
type V2_ToolCallStreamingState = ToolCallStreamingState;
type V2_ToolCallPendingConfirmationState = ToolCallPendingConfirmationState;
type V2_ToolCallRunningState = ToolCallRunningState;
type V2_ToolCallPendingResultConfirmationState = ToolCallPendingResultConfirmationState;
type V2_ToolCallCompletedState = ToolCallCompletedState;
type V2_ToolCallCancelledState = ToolCallCancelledState;
type V2_ToolCallState = ToolCallState;
type V2_ToolDefinition = ToolDefinition;
type V2_ToolAnnotations = ToolAnnotations;
type V2_ToolResultTextContent = ToolResultTextContent;
type V2_ToolResultEmbeddedResourceContent = ToolResultEmbeddedResourceContent;
type V2_ToolResultResourceContent = ToolResultResourceContent;
type V2_FileEdit = FileEdit;
type V2_ToolResultFileEditContent = ToolResultFileEditContent;
type V2_ToolResultTerminalContent = ToolResultTerminalContent;
type V2_ToolResultSubagentContent = ToolResultSubagentContent;
type V2_UsageInfo = UsageInfo;
type V2_ErrorInfo = ErrorInfo;
type V2_Snapshot = Snapshot;
type V2_PendingMessage = PendingMessage;
type V2_SessionInputAnswer = SessionInputAnswer;
type V2_SessionInputAnswerValue = SessionInputAnswerValue;
type V2_SessionInputTextAnswerValue = SessionInputTextAnswerValue;
type V2_SessionInputNumberAnswerValue = SessionInputNumberAnswerValue;
type V2_SessionInputBooleanAnswerValue = SessionInputBooleanAnswerValue;
type V2_SessionInputSelectedAnswerValue = SessionInputSelectedAnswerValue;
type V2_SessionInputSelectedManyAnswerValue = SessionInputSelectedManyAnswerValue;
type V2_SessionInputAnswered = SessionInputAnswered;
type V2_SessionInputSkipped = SessionInputSkipped;
type V2_SessionInputOption = SessionInputOption;
type V2_SessionInputQuestion = SessionInputQuestion;
type V2_SessionInputTextQuestion = SessionInputTextQuestion;
type V2_SessionInputNumberQuestion = SessionInputNumberQuestion;
type V2_SessionInputBooleanQuestion = SessionInputBooleanQuestion;
type V2_SessionInputSingleSelectQuestion = SessionInputSingleSelectQuestion;
type V2_SessionInputMultiSelectQuestion = SessionInputMultiSelectQuestion;
type V2_SessionInputRequest = SessionInputRequest;
type V2_ConfirmationOption = ConfirmationOption;
type V2_ConfirmationOptionKind = ConfirmationOptionKind;
type V2_Icon = Icon;
type V2_CustomizationRef = CustomizationRef;
type V2_SessionCustomization = SessionCustomization;
type V2_StateAction = StateAction;
type V2_ActionEnvelope = ActionEnvelope;
type V2_ActionOrigin = ActionOrigin;
type V2_RootActiveSessionsChangedAction = RootActiveSessionsChangedAction;
type V2_SessionToolCallApprovedAction = SessionToolCallApprovedAction;
type V2_SessionToolCallDeniedAction = SessionToolCallDeniedAction;
type V2_SessionServerToolsChangedAction = SessionServerToolsChangedAction;
type V2_SessionActiveClientChangedAction = SessionActiveClientChangedAction;
type V2_SessionActiveClientToolsChangedAction = SessionActiveClientToolsChangedAction;
type V2_SessionPendingMessageSetAction = SessionPendingMessageSetAction;
type V2_SessionPendingMessageRemovedAction = SessionPendingMessageRemovedAction;
type V2_SessionQueuedMessagesReorderedAction = SessionQueuedMessagesReorderedAction;
type V2_SessionCustomizationsChangedAction = SessionCustomizationsChangedAction;
type V2_SessionCustomizationToggledAction = SessionCustomizationToggledAction;
type V2_SessionCustomizationUpdatedAction = SessionCustomizationUpdatedAction;
type V2_SessionTruncatedAction = SessionTruncatedAction;
type V2_SessionIsReadChangedAction = SessionIsReadChangedAction;
type V2_SessionIsArchivedChangedAction = SessionIsArchivedChangedAction;
type V2_SessionActivityChangedAction = SessionActivityChangedAction;
type V2_SessionConfigChangedAction = SessionConfigChangedAction;
type V2_SessionToolCallContentChangedAction = SessionToolCallContentChangedAction;
type V2_SessionInputRequestedAction = SessionInputRequestedAction;
type V2_SessionInputAnswerChangedAction = SessionInputAnswerChangedAction;
type V2_SessionInputCompletedAction = SessionInputCompletedAction;
type V2_RootTerminalsChangedAction = RootTerminalsChangedAction;
type V2_RootConfigChangedAction = RootConfigChangedAction;
type V2_TerminalDataAction = TerminalDataAction;
type V2_TerminalInputAction = TerminalInputAction;
type V2_TerminalResizedAction = TerminalResizedAction;
type V2_TerminalClaimedAction = TerminalClaimedAction;
type V2_TerminalTitleChangedAction = TerminalTitleChangedAction;
type V2_TerminalCwdChangedAction = TerminalCwdChangedAction;
type V2_TerminalExitedAction = TerminalExitedAction;
type V2_TerminalClearedAction = TerminalClearedAction;
type V2_TerminalCommandDetectionAvailableAction = TerminalCommandDetectionAvailableAction;
type V2_TerminalCommandExecutedAction = TerminalCommandExecutedAction;
type V2_TerminalCommandFinishedAction = TerminalCommandFinishedAction;
type V2_TerminalInfo = TerminalInfo;
type V2_TerminalClientClaim = TerminalClientClaim;
type V2_TerminalSessionClaim = TerminalSessionClaim;
type V2_TerminalClaim = TerminalClaim;
type V2_TerminalState = TerminalState;
type V2_TerminalContentPart = TerminalContentPart;
type V2_TerminalUnclassifiedPart = TerminalUnclassifiedPart;
type V2_TerminalCommandPart = TerminalCommandPart;
type V2_CreateTerminalParams = CreateTerminalParams;
type V2_CreateSessionParams = CreateSessionParams;
type V2_DisposeTerminalParams = DisposeTerminalParams;
type V2_SessionForkSource = SessionForkSource;
type V2_ProtocolNotification = ProtocolNotification;
type V2_AuthRequiredNotification = AuthRequiredNotification;
type V2_SessionSummaryChangedNotification = SessionSummaryChangedNotification;
type V2_ListSessionsResult = ListSessionsResult;
type V2_AuthenticateParams = AuthenticateParams;
type V2_AuthenticateResult = AuthenticateResult;
type V2_ResourceWriteParams = ResourceWriteParams;
type V2_ResourceWriteResult = ResourceWriteResult;
type V2_ResourceReadParams = ResourceReadParams;
type V2_ResourceReadResult = ResourceReadResult;
type V2_ResourceListParams = ResourceListParams;
type V2_ResourceListResult = ResourceListResult;
type V2_ResourceCopyParams = ResourceCopyParams;
type V2_ResourceCopyResult = ResourceCopyResult;
type V2_ResourceDeleteParams = ResourceDeleteParams;
type V2_ResourceDeleteResult = ResourceDeleteResult;
type V2_ResourceMoveParams = ResourceMoveParams;
type V2_ResourceMoveResult = ResourceMoveResult;
type V2_ResourceRequestParams = ResourceRequestParams;
type V2_ResourceRequestResult = ResourceRequestResult;
type V2_ResolveSessionConfigParams = ResolveSessionConfigParams;
type V2_ResolveSessionConfigResult = ResolveSessionConfigResult;
type V2_ConfigPropertySchema = ConfigPropertySchema;
type V2_ConfigSchema = ConfigSchema;
type V2_SessionConfigPropertySchema = SessionConfigPropertySchema;
type V2_SessionConfigSchema = SessionConfigSchema;
type V2_SessionConfigCompletionsParams = SessionConfigCompletionsParams;
type V2_SessionConfigCompletionsResult = SessionConfigCompletionsResult;
type V2_SessionConfigValueItem = SessionConfigValueItem;
type V2_CompletionsParams = CompletionsParams;
type V2_CompletionItem = CompletionItem;
type V2_CompletionsResult = CompletionsResult;
type V2_InitializeParams = InitializeParams;
type V2_InitializeResult = InitializeResult;
type V2_ReconnectParams = ReconnectParams;
type V2_ReconnectResult = ReconnectResult;
type V2_ReconnectReplayResult = ReconnectReplayResult;
type V2_ReconnectSnapshotResult = ReconnectSnapshotResult;
type V2_CommandMap = CommandMap;
type V2_ServerCommandMap = ServerCommandMap;
type V2_ClientNotificationMap = ClientNotificationMap;
type V2_ServerNotificationMap = ServerNotificationMap;
type V2_NotificationMethodParams = NotificationMethodParams;
type V2_AhpError = AhpError;
type V2_AhpErrorDetailsMap = AhpErrorDetailsMap;
type V2_AuthRequiredErrorData = AuthRequiredErrorData;
type V2_PermissionDeniedErrorData = PermissionDeniedErrorData;
type V2_UnsupportedProtocolVersionErrorData = UnsupportedProtocolVersionErrorData;
type V2_ChangesetSummary = ChangesetSummary;
type V2_ChangesetState = ChangesetState;
type V2_ChangesetFile = ChangesetFile;
type V2_ChangesetOperation = ChangesetOperation;
type V2_ChangesetStatus = ChangesetStatus;
type V2_ChangesetOperationScope = ChangesetOperationScope;
type V2_ChangesetStatusChangedAction = ChangesetStatusChangedAction;
type V2_ChangesetFileSetAction = ChangesetFileSetAction;
type V2_ChangesetFileRemovedAction = ChangesetFileRemovedAction;
type V2_ChangesetOperationsChangedAction = ChangesetOperationsChangedAction;
type V2_ChangesetClearedAction = ChangesetClearedAction;
type V2_InvokeChangesetOperationParams = InvokeChangesetOperationParams;
type V2_InvokeChangesetOperationResult = InvokeChangesetOperationResult;
type V2_ChangesetOperationTarget = ChangesetOperationTarget;
type V2_ChangesetOperationFollowUp = ChangesetOperationFollowUp;

// ─── Compatibility Assertions ────────────────────────────────────────────────

// These will fail at compile time if the living types diverge from v2 in a
// backward-incompatible way.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootState = AssertCompatible<V2_RootState, RootState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootConfigState = AssertCompatible<V2_RootConfigState, RootConfigState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckStringOrMarkdown = AssertCompatible<V2_StringOrMarkdown, StringOrMarkdown>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAgentInfo = AssertCompatible<V2_AgentInfo, AgentInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionModelInfo = AssertCompatible<V2_SessionModelInfo, SessionModelInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckModelSelection = AssertCompatible<V2_ModelSelection, ModelSelection>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionState = AssertCompatible<V2_SessionState, SessionState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionSummary = AssertCompatible<V2_SessionSummary, SessionSummary>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigState = AssertCompatible<V2_SessionConfigState, SessionConfigState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProjectInfo = AssertCompatible<V2_ProjectInfo, ProjectInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTurn = AssertCompatible<V2_Turn, Turn>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveTurn = AssertCompatible<V2_ActiveTurn, ActiveTurn>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUserMessage = AssertCompatible<V2_UserMessage, UserMessage>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageAttachment = AssertCompatible<V2_MessageAttachment, MessageAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageAttachmentBase = AssertCompatible<V2_MessageAttachmentBase, MessageAttachmentBase>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTextPosition = AssertCompatible<V2_TextPosition, TextPosition>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTextRange = AssertCompatible<V2_TextRange, TextRange>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTextSelection = AssertCompatible<V2_TextSelection, TextSelection>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSimpleMessageAttachment = AssertCompatible<V2_SimpleMessageAttachment, SimpleMessageAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageEmbeddedResourceAttachment = AssertCompatible<V2_MessageEmbeddedResourceAttachment, MessageEmbeddedResourceAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMessageResourceAttachment = AssertCompatible<V2_MessageResourceAttachment, MessageResourceAttachment>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckMarkdownResponsePart = AssertCompatible<V2_MarkdownResponsePart, MarkdownResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckContentRef = AssertCompatible<V2_ContentRef, ContentRef>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallResponsePart = AssertCompatible<V2_ToolCallResponsePart, ToolCallResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReasoningResponsePart = AssertCompatible<V2_ReasoningResponsePart, ReasoningResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSystemNotificationResponsePart = AssertCompatible<V2_SystemNotificationResponsePart, SystemNotificationResponsePart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallResult = AssertCompatible<V2_ToolCallResult, ToolCallResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallStreamingState = AssertCompatible<V2_ToolCallStreamingState, ToolCallStreamingState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallPendingConfirmationState = AssertCompatible<V2_ToolCallPendingConfirmationState, ToolCallPendingConfirmationState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallRunningState = AssertCompatible<V2_ToolCallRunningState, ToolCallRunningState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallPendingResultConfirmationState = AssertCompatible<V2_ToolCallPendingResultConfirmationState, ToolCallPendingResultConfirmationState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallCompletedState = AssertCompatible<V2_ToolCallCompletedState, ToolCallCompletedState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallCancelledState = AssertCompatible<V2_ToolCallCancelledState, ToolCallCancelledState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallState = AssertCompatible<V2_ToolCallState, ToolCallState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUsageInfo = AssertCompatible<V2_UsageInfo, UsageInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckErrorInfo = AssertCompatible<V2_ErrorInfo, ErrorInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSnapshot = AssertCompatible<V2_Snapshot, Snapshot>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckStateAction = AssertCompatible<V2_StateAction, StateAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActionEnvelope = AssertCompatible<V2_ActionEnvelope, ActionEnvelope>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActionOrigin = AssertCompatible<V2_ActionOrigin, ActionOrigin>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveSessionsChangedAction = AssertCompatible<V2_RootActiveSessionsChangedAction, RootActiveSessionsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallApprovedAction = AssertCompatible<V2_SessionToolCallApprovedAction, SessionToolCallApprovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallDeniedAction = AssertCompatible<V2_SessionToolCallDeniedAction, SessionToolCallDeniedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionActiveClient = AssertCompatible<V2_SessionActiveClient, SessionActiveClient>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolDefinition = AssertCompatible<V2_ToolDefinition, ToolDefinition>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolAnnotations = AssertCompatible<V2_ToolAnnotations, ToolAnnotations>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultTextContent = AssertCompatible<V2_ToolResultTextContent, ToolResultTextContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultEmbeddedResourceContent = AssertCompatible<V2_ToolResultEmbeddedResourceContent, ToolResultEmbeddedResourceContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultResourceContent = AssertCompatible<V2_ToolResultResourceContent, ToolResultResourceContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckFileEdit = AssertCompatible<V2_FileEdit, FileEdit>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultFileEditContent = AssertCompatible<V2_ToolResultFileEditContent, ToolResultFileEditContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultTerminalContent = AssertCompatible<V2_ToolResultTerminalContent, ToolResultTerminalContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolResultSubagentContent = AssertCompatible<V2_ToolResultSubagentContent, ToolResultSubagentContent>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerToolsChangedAction = AssertCompatible<V2_SessionServerToolsChangedAction, SessionServerToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientChangedAction = AssertCompatible<V2_SessionActiveClientChangedAction, SessionActiveClientChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActiveClientToolsChangedAction = AssertCompatible<V2_SessionActiveClientToolsChangedAction, SessionActiveClientToolsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessage = AssertCompatible<V2_PendingMessage, PendingMessage>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswer = AssertCompatible<V2_SessionInputAnswer, SessionInputAnswer>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswerValue = AssertCompatible<V2_SessionInputAnswerValue, SessionInputAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputTextAnswerValue = AssertCompatible<V2_SessionInputTextAnswerValue, SessionInputTextAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputNumberAnswerValue = AssertCompatible<V2_SessionInputNumberAnswerValue, SessionInputNumberAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputBooleanAnswerValue = AssertCompatible<V2_SessionInputBooleanAnswerValue, SessionInputBooleanAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSelectedAnswerValue = AssertCompatible<V2_SessionInputSelectedAnswerValue, SessionInputSelectedAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSelectedManyAnswerValue = AssertCompatible<V2_SessionInputSelectedManyAnswerValue, SessionInputSelectedManyAnswerValue>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswered = AssertCompatible<V2_SessionInputAnswered, SessionInputAnswered>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSkipped = AssertCompatible<V2_SessionInputSkipped, SessionInputSkipped>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputOption = AssertCompatible<V2_SessionInputOption, SessionInputOption>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputQuestion = AssertCompatible<V2_SessionInputQuestion, SessionInputQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputTextQuestion = AssertCompatible<V2_SessionInputTextQuestion, SessionInputTextQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputNumberQuestion = AssertCompatible<V2_SessionInputNumberQuestion, SessionInputNumberQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputBooleanQuestion = AssertCompatible<V2_SessionInputBooleanQuestion, SessionInputBooleanQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputSingleSelectQuestion = AssertCompatible<V2_SessionInputSingleSelectQuestion, SessionInputSingleSelectQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputMultiSelectQuestion = AssertCompatible<V2_SessionInputMultiSelectQuestion, SessionInputMultiSelectQuestion>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputRequest = AssertCompatible<V2_SessionInputRequest, SessionInputRequest>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessageSetAction = AssertCompatible<V2_SessionPendingMessageSetAction, SessionPendingMessageSetAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPendingMessageRemovedAction = AssertCompatible<V2_SessionPendingMessageRemovedAction, SessionPendingMessageRemovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckQueuedMessagesReorderedAction = AssertCompatible<V2_SessionQueuedMessagesReorderedAction, SessionQueuedMessagesReorderedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputRequestedAction = AssertCompatible<V2_SessionInputRequestedAction, SessionInputRequestedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputAnswerChangedAction = AssertCompatible<V2_SessionInputAnswerChangedAction, SessionInputAnswerChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionInputCompletedAction = AssertCompatible<V2_SessionInputCompletedAction, SessionInputCompletedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIcon = AssertCompatible<V2_Icon, Icon>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationRef = AssertCompatible<V2_CustomizationRef, CustomizationRef>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionCustomization = AssertCompatible<V2_SessionCustomization, SessionCustomization>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationsChangedAction = AssertCompatible<V2_SessionCustomizationsChangedAction, SessionCustomizationsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationToggledAction = AssertCompatible<V2_SessionCustomizationToggledAction, SessionCustomizationToggledAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCustomizationUpdatedAction = AssertCompatible<V2_SessionCustomizationUpdatedAction, SessionCustomizationUpdatedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTruncatedAction = AssertCompatible<V2_SessionTruncatedAction, SessionTruncatedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIsReadChangedAction = AssertCompatible<V2_SessionIsReadChangedAction, SessionIsReadChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckIsArchivedChangedAction = AssertCompatible<V2_SessionIsArchivedChangedAction, SessionIsArchivedChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckActivityChangedAction = AssertCompatible<V2_SessionActivityChangedAction, SessionActivityChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigChangedAction = AssertCompatible<V2_SessionConfigChangedAction, SessionConfigChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetSummary = AssertCompatible<V2_ChangesetSummary, ChangesetSummary>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetState = AssertCompatible<V2_ChangesetState, ChangesetState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetFile = AssertCompatible<V2_ChangesetFile, ChangesetFile>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetOperation = AssertCompatible<V2_ChangesetOperation, ChangesetOperation>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetStatus = AssertCompatible<V2_ChangesetStatus, ChangesetStatus>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetOperationScope = AssertCompatible<V2_ChangesetOperationScope, ChangesetOperationScope>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetStatusChangedAction = AssertCompatible<V2_ChangesetStatusChangedAction, ChangesetStatusChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetFileSetAction = AssertCompatible<V2_ChangesetFileSetAction, ChangesetFileSetAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetFileRemovedAction = AssertCompatible<V2_ChangesetFileRemovedAction, ChangesetFileRemovedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetOperationsChangedAction = AssertCompatible<V2_ChangesetOperationsChangedAction, ChangesetOperationsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetClearedAction = AssertCompatible<V2_ChangesetClearedAction, ChangesetClearedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckInvokeChangesetOperationParams = AssertCompatible<V2_InvokeChangesetOperationParams, InvokeChangesetOperationParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckInvokeChangesetOperationResult = AssertCompatible<V2_InvokeChangesetOperationResult, InvokeChangesetOperationResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetOperationTarget = AssertCompatible<V2_ChangesetOperationTarget, ChangesetOperationTarget>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckChangesetOperationFollowUp = AssertCompatible<V2_ChangesetOperationFollowUp, ChangesetOperationFollowUp>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckToolCallContentChangedAction = AssertCompatible<V2_SessionToolCallContentChangedAction, SessionToolCallContentChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionForkSource = AssertCompatible<V2_SessionForkSource, SessionForkSource>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtocolNotification = AssertCompatible<V2_ProtocolNotification, ProtocolNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionSummaryChangedNotification = AssertCompatible<V2_SessionSummaryChangedNotification, SessionSummaryChangedNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckListSessionsResult = AssertCompatible<V2_ListSessionsResult, ListSessionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateParams = AssertCompatible<V2_AuthenticateParams, AuthenticateParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthenticateResult = AssertCompatible<V2_AuthenticateResult, AuthenticateResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceWriteParams = AssertCompatible<V2_ResourceWriteParams, ResourceWriteParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceWriteResult = AssertCompatible<V2_ResourceWriteResult, ResourceWriteResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceReadParams = AssertCompatible<V2_ResourceReadParams, ResourceReadParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceReadResult = AssertCompatible<V2_ResourceReadResult, ResourceReadResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceListParams = AssertCompatible<V2_ResourceListParams, ResourceListParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceListResult = AssertCompatible<V2_ResourceListResult, ResourceListResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceCopyParams = AssertCompatible<V2_ResourceCopyParams, ResourceCopyParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceCopyResult = AssertCompatible<V2_ResourceCopyResult, ResourceCopyResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceDeleteParams = AssertCompatible<V2_ResourceDeleteParams, ResourceDeleteParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceDeleteResult = AssertCompatible<V2_ResourceDeleteResult, ResourceDeleteResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceMoveParams = AssertCompatible<V2_ResourceMoveParams, ResourceMoveParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceMoveResult = AssertCompatible<V2_ResourceMoveResult, ResourceMoveResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceRequestParams = AssertCompatible<V2_ResourceRequestParams, ResourceRequestParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResourceRequestResult = AssertCompatible<V2_ResourceRequestResult, ResourceRequestResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckProtectedResourceMetadata = AssertCompatible<V2_ProtectedResourceMetadata, ProtectedResourceMetadata>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthRequiredNotification = AssertCompatible<V2_AuthRequiredNotification, AuthRequiredNotification>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCommandMap = AssertCompatible<V2_CommandMap, CommandMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerCommandMap = AssertCompatible<V2_ServerCommandMap, ServerCommandMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckClientNotificationMap = AssertCompatible<V2_ClientNotificationMap, ClientNotificationMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckServerNotificationMap = AssertCompatible<V2_ServerNotificationMap, ServerNotificationMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckNotificationMethodParams = AssertCompatible<V2_NotificationMethodParams, NotificationMethodParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAhpError = AssertCompatible<V2_AhpError, AhpError>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAhpErrorDetailsMap = AssertCompatible<V2_AhpErrorDetailsMap, AhpErrorDetailsMap>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckAuthRequiredErrorData = AssertCompatible<V2_AuthRequiredErrorData, AuthRequiredErrorData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckPermissionDeniedErrorData = AssertCompatible<V2_PermissionDeniedErrorData, PermissionDeniedErrorData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckUnsupportedProtocolVersionErrorData = AssertCompatible<V2_UnsupportedProtocolVersionErrorData, UnsupportedProtocolVersionErrorData>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalsChangedAction = AssertCompatible<V2_RootTerminalsChangedAction, RootTerminalsChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckRootConfigChangedAction = AssertCompatible<V2_RootConfigChangedAction, RootConfigChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalDataAction = AssertCompatible<V2_TerminalDataAction, TerminalDataAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalInputAction = AssertCompatible<V2_TerminalInputAction, TerminalInputAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalResizedAction = AssertCompatible<V2_TerminalResizedAction, TerminalResizedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClaimedAction = AssertCompatible<V2_TerminalClaimedAction, TerminalClaimedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalTitleChangedAction = AssertCompatible<V2_TerminalTitleChangedAction, TerminalTitleChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCwdChangedAction = AssertCompatible<V2_TerminalCwdChangedAction, TerminalCwdChangedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalExitedAction = AssertCompatible<V2_TerminalExitedAction, TerminalExitedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClearedAction = AssertCompatible<V2_TerminalClearedAction, TerminalClearedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandDetectionAvailableAction = AssertCompatible<V2_TerminalCommandDetectionAvailableAction, TerminalCommandDetectionAvailableAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandExecutedAction = AssertCompatible<V2_TerminalCommandExecutedAction, TerminalCommandExecutedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandFinishedAction = AssertCompatible<V2_TerminalCommandFinishedAction, TerminalCommandFinishedAction>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalInfo = AssertCompatible<V2_TerminalInfo, TerminalInfo>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClientClaim = AssertCompatible<V2_TerminalClientClaim, TerminalClientClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalSessionClaim = AssertCompatible<V2_TerminalSessionClaim, TerminalSessionClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalClaim = AssertCompatible<V2_TerminalClaim, TerminalClaim>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalState = AssertCompatible<V2_TerminalState, TerminalState>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalContentPart = AssertCompatible<V2_TerminalContentPart, TerminalContentPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalUnclassifiedPart = AssertCompatible<V2_TerminalUnclassifiedPart, TerminalUnclassifiedPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckTerminalCommandPart = AssertCompatible<V2_TerminalCommandPart, TerminalCommandPart>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCreateTerminalParams = AssertCompatible<V2_CreateTerminalParams, CreateTerminalParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCreateSessionParams = AssertCompatible<V2_CreateSessionParams, CreateSessionParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckDisposeTerminalParams = AssertCompatible<V2_DisposeTerminalParams, DisposeTerminalParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResolveSessionConfigParams = AssertCompatible<V2_ResolveSessionConfigParams, ResolveSessionConfigParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckResolveSessionConfigResult = AssertCompatible<V2_ResolveSessionConfigResult, ResolveSessionConfigResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigPropertySchema = AssertCompatible<V2_ConfigPropertySchema, ConfigPropertySchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfigSchema = AssertCompatible<V2_ConfigSchema, ConfigSchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigPropertySchema = AssertCompatible<V2_SessionConfigPropertySchema, SessionConfigPropertySchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigSchema = AssertCompatible<V2_SessionConfigSchema, SessionConfigSchema>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigCompletionsParams = AssertCompatible<V2_SessionConfigCompletionsParams, SessionConfigCompletionsParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigCompletionsResult = AssertCompatible<V2_SessionConfigCompletionsResult, SessionConfigCompletionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckSessionConfigValueItem = AssertCompatible<V2_SessionConfigValueItem, SessionConfigValueItem>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCompletionsParams = AssertCompatible<V2_CompletionsParams, CompletionsParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCompletionItem = AssertCompatible<V2_CompletionItem, CompletionItem>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckCompletionsResult = AssertCompatible<V2_CompletionsResult, CompletionsResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfirmationOption = AssertCompatible<V2_ConfirmationOption, ConfirmationOption>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckConfirmationOptionKind = AssertCompatible<V2_ConfirmationOptionKind, ConfirmationOptionKind>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckInitializeParams = AssertCompatible<V2_InitializeParams, InitializeParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckInitializeResult = AssertCompatible<V2_InitializeResult, InitializeResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectParams = AssertCompatible<V2_ReconnectParams, ReconnectParams>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectResult = AssertCompatible<V2_ReconnectResult, ReconnectResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectReplayResult = AssertCompatible<V2_ReconnectReplayResult, ReconnectReplayResult>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _CheckReconnectSnapshotResult = AssertCompatible<V2_ReconnectSnapshotResult, ReconnectSnapshotResult>;
