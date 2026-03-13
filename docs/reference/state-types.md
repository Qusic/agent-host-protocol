<!-- Generated from types/*.ts — do not edit -->


# State Types

Complete reference for all state types in the Agent Host Protocol.

## Root State

### `IRootState`

Global state shared with every client subscribed to `agenthost:/root`.

| Field | Type | Description |
|---|---|---|
| `agents` | [IAgentInfo](#iagentinfo)[] | Available agent backends and their models |

### `IAgentInfo`

| Field | Type | Description |
|---|---|---|
| `provider` | `string` | Agent provider ID (e.g. `'copilot'`) |
| `displayName` | `string` | Human-readable name |
| `description` | `string` | Description string |
| `models` | [ISessionModelInfo](#isessionmodelinfo)[] | Available models for this agent |

### `ISessionModelInfo`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Model identifier |
| `provider` | `string` | Yes | Provider this model belongs to |
| `name` | `string` | Yes | Human-readable model name |
| `maxContextWindow` | `number` | No | Maximum context window size |
| `supportsVision` | `boolean` | No | Whether the model supports vision |
| `policyState` | `'enabled' \| 'disabled' \| 'unconfigured'` | No | Policy configuration state |

## Session State

### `ISessionState`

Full state for a single session, loaded when a client subscribes to the session's URI.

| Field | Type | Required | Description |
|---|---|---|---|
| `summary` | [ISessionSummary](#isessionsummary) | Yes | Lightweight session metadata |
| `lifecycle` | `'creating' \| 'ready' \| 'creationFailed'` | Yes | Session initialization state |
| `creationError` | [IErrorInfo](#ierrorinfo) | No | Error details if creation failed |
| `turns` | [ITurn](#iturn)[] | Yes | Completed turns |
| `activeTurn` | [IActiveTurn](#iactiveturn) | No | Currently in-progress turn |

### `ISessionSummary`

| Field | Type | Required | Description |
|---|---|---|---|
| `resource` | [URI](#uri) | Yes | Session URI |
| `provider` | `string` | Yes | Agent provider ID |
| `title` | `string` | Yes | Session title |
| `status` | `'idle' \| 'in-progress' \| 'error'` | Yes | Current session status |
| `createdAt` | `number` | Yes | Creation timestamp |
| `modifiedAt` | `number` | Yes | Last modification timestamp |
| `model` | `string` | No | Currently selected model |

## Turn Types

### `ITurn`

A completed request/response cycle.

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Turn identifier |
| `userMessage` | [IUserMessage](#iusermessage) | Yes | The user's input |
| `responseText` | `string` | Yes | Final response text (captured from streaming) |
| `responseParts` | [IResponsePart](#iresponsepart)[] | Yes | Structured response content |
| `toolCalls` | [ICompletedToolCall](#icompletedtoolcall)[] | Yes | Completed tool invocations |
| `usage` | [IUsageInfo](#iusageinfo) \| undefined | Yes | Token usage info |
| `state` | `'complete' \| 'cancelled' \| 'error'` | Yes | How the turn ended |
| `error` | [IErrorInfo](#ierrorinfo) | No | Error details if state is `'error'` |

### `IActiveTurn`

An in-progress turn — the assistant is actively streaming.

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Turn identifier |
| `userMessage` | [IUserMessage](#iusermessage) | The user's input |
| `streamingText` | `string` | Accumulated streaming response text |
| `responseParts` | [IResponsePart](#iresponsepart)[] | Structured response content so far |
| `toolCalls` | Record<string, [IToolCallState](#itoolcallstate)> | Active tool invocations keyed by tool call ID |
| `pendingPermissions` | Record<string, [IPermissionRequest](#ipermissionrequest)> | Pending permission requests keyed by request ID |
| `reasoning` | `string` | Accumulated reasoning/thinking text |
| `usage` | [IUsageInfo](#iusageinfo) \| undefined | Token usage info |

### `IUserMessage`

| Field | Type | Required | Description |
|---|---|---|---|
| `text` | `string` | Yes | Message text |
| `attachments` | [IMessageAttachment](#imessageattachment)[] | No | File/selection attachments |

### `IMessageAttachment`

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `'file' \| 'directory' \| 'selection'` | Yes | Attachment type |
| `path` | `string` | Yes | File/directory path |
| `displayName` | `string` | No | Display name |

## Response Parts

### `IMarkdownResponsePart`

| Field | Type | Description |
|---|---|---|
| `kind` | `'markdown'` | Discriminant |
| `content` | `string` | Markdown content |

### `IContentRef`

A reference to large content stored outside the state tree.

| Field | Type | Required | Description |
|---|---|---|---|
| `kind` | `'contentRef'` | Yes | Discriminant |
| `uri` | `string` | Yes | Content URI |
| `sizeHint` | `number` | No | Approximate size in bytes |
| `mimeType` | `string` | No | Content MIME type |

### `IResponsePart`

[IMarkdownResponsePart](#imarkdownresponsepart) | [IContentRef](#icontentref)


## Tool Call Types

### `IToolCallState`

Full lifecycle state of a tool invocation within an active turn.

::: tip FUTURE WORK
Fields like `toolName` carry agent-specific identifiers on the wire despite the
agent-agnostic design principle. These exist for debugging and logging purposes.
A future version may move these to a separate diagnostic channel or namespace them
more clearly.
:::

| Field | Type | Required | Description |
|---|---|---|---|
| `toolCallId` | `string` | Yes | Unique tool call identifier |
| `toolName` | `string` | Yes | Internal tool name |
| `displayName` | `string` | Yes | Human-readable tool name |
| `invocationMessage` | `string` | Yes | Message shown while running |
| `toolInput` | `string` | No | Raw tool input |
| `toolKind` | `'terminal'` | No | Rendering hint |
| `language` | `string` | No | Language for syntax highlighting |
| `toolArguments` | `string` | No | Serialized tool arguments |
| `status` | [ToolCallStatus](#toolcallstatus) | Yes | Current status |
| `parameters` | `unknown` | No | Parsed tool parameters |
| `confirmed` | [ConfirmationState](#confirmationstate) | No | How the tool was confirmed |
| `pastTenseMessage` | `string` | No | Message shown after completion |
| `toolOutput` | `string` | No | Tool output text |
| `error` | `{ message: string; code?: string }` | No | Error details |
| `cancellationReason` | `'denied' \| 'skipped'` | No | Why the tool was cancelled |

### `ToolCallStatus`

`'running' | 'pending-permission' | 'completed' | 'failed' | 'cancelled'`


### `ConfirmationState`

`'not-needed' | 'user-action' | 'setting' | 'denied' | 'skipped'`


### `ICompletedToolCall`

| Field | Type | Required | Description |
|---|---|---|---|
| `toolCallId` | `string` | Yes | Unique tool call identifier |
| `toolName` | `string` | Yes | Internal tool name |
| `displayName` | `string` | Yes | Human-readable tool name |
| `invocationMessage` | `string` | Yes | Message shown during invocation |
| `success` | `boolean` | Yes | Whether the tool succeeded |
| `pastTenseMessage` | `string` | Yes | Message shown after completion |
| `toolInput` | `string` | No | Raw tool input |
| `toolKind` | `'terminal'` | No | Rendering hint |
| `language` | `string` | No | Language for syntax highlighting |
| `toolOutput` | `string` | No | Tool output text |
| `error` | `{ message: string; code?: string }` | No | Error details |

## Permission Types

### `IPermissionRequest`

| Field | Type | Required | Description |
|---|---|---|---|
| `requestId` | `string` | Yes | Unique request identifier |
| `permissionKind` | `'shell' \| 'write' \| 'mcp' \| 'read' \| 'url'` | Yes | Type of permission |
| `toolCallId` | `string` | No | Associated tool call |
| `path` | `string` | No | File/directory path |
| `fullCommandText` | `string` | No | Full command to execute |
| `intention` | `string` | No | What the tool intends to do |
| `serverName` | `string` | No | MCP server name |
| `toolName` | `string` | No | Tool requesting permission |
| `rawRequest` | `string` | No | Raw request data |

## Common Types

### `IUsageInfo`

| Field | Type | Required | Description |
|---|---|---|---|
| `inputTokens` | `number` | No | Input tokens consumed |
| `outputTokens` | `number` | No | Output tokens generated |
| `model` | `string` | No | Model used |
| `cacheReadTokens` | `number` | No | Tokens read from cache |

### `IErrorInfo`

| Field | Type | Required | Description |
|---|---|---|---|
| `errorType` | `string` | Yes | Error type identifier |
| `message` | `string` | Yes | Human-readable error message |
| `stack` | `string` | No | Stack trace |

### `ISnapshot`

A point-in-time snapshot of a subscribed resource's state, returned by
`initialize`, `reconnect`, and `subscribe`.

| Field | Type | Description |
|---|---|---|
| `resource` | [URI](#uri) | The subscribed resource URI (e.g. `agenthost:/root` or `copilot:/&lt;uuid&gt;`) |
| `state` | [IRootState](#irootstate) \| [ISessionState](#isessionstate) | The current state of the resource |
| `fromSeq` | `number` | The `serverSeq` at which this snapshot was taken. Subsequent actions will have `serverSeq &gt; fromSeq`. |
