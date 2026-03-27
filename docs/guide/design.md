# Design Decisions

Core design principles and decisions for the Agent Host Protocol.

## Agent-Agnostic Protocol

**The protocol between the server and clients must remain agent-agnostic.** This is a hard rule.

There are two protocol layers:

1. **`IAgent` interface** — The internal interface that each agent backend implements. It fires raw progress events. This layer is agent-specific.

2. **Sessions state protocol** — The client-facing protocol. The server maps raw events into state actions via an event mapper. **This layer is agent-agnostic.**

All agent-specific logic — translating tool names like `bash`/`view`/`grep` into display strings, extracting command lines from tool parameters, determining rendering hints like `toolKind: 'terminal'` — lives in the server-side agent implementation. These display-ready fields are carried on the state actions that clients receive.

Clients never see agent-specific tool names. They consume `ToolCallState` and `CompletedToolCall` from the session state tree, which carry generic display-ready fields (`displayName`, `invocationMessage`, `toolKind`, etc.).

## Provider-Agnostic Rendering

Client-side rendering components are **completely generic**. They receive all provider-specific details via configuration. A single contribution point discovers agents via `listAgents()` and dynamically registers each one. Adding a new provider means adding a new `IAgent` implementation in the server process. No changes needed to client-side code.

## State-Based Rendering

Clients subscribe to session state via `SessionClientState` (write-ahead reconciliation) and convert immutable state changes to UI progress events. The adapter inspects only generic state fields:

- **Shell commands** (`toolKind: 'terminal'`): Rendered with syntax-highlighted code blocks and output display.
- **Everything else**: Rendered using `invocationMessage` (while running) and `pastTenseMessage` (when complete).

The adapter never checks tool names — it operates purely on generic state fields.

## Model Ownership

The agent backend (e.g. Copilot SDK) makes its own LM requests using its own credentials. The host does not make direct LM calls for agent sessions.

Each agent's models are published to root state via the `root/agentsChanged` action. Clients expose these in model pickers. The selected model ID is passed to `createSession({ model })`. Agent-host models aren't usable for direct LM calls — they exist only for the agent loop.

## Multi-Client State Synchronization

The protocol uses a Redux-like state model where all mutations flow through a discriminated union of actions processed by pure reducer functions. This supports multiple connected clients seeing a synchronized view:

- **Server-authoritative state** — The server holds the canonical state tree. Clients receive snapshots and incremental actions.
- **Write-ahead with reconciliation** — Clients optimistically apply their own actions locally and reconcile when the server echoes them back.
- **Lazy loading** — Clients start with lightweight session metadata and subscribe to full session state on demand. Large content uses `ContentRef` placeholders fetched separately.
- **Forward-compatible versioning** — A single protocol version number maps to a `ProtocolCapabilities` object. Newer clients check capabilities before using features unavailable on older servers.

## Design Preferences

These "prefer X over Y" rules capture recurring design decisions. They are defaults, not absolutes — override with justification.

| Prefer | Over | Rationale |
|--------|------|-----------|
| Dispatching a state action | Making an imperative RPC call | Actions flow through reducers, enable write-ahead, and are visible to all subscribed clients. RPCs are point-to-point. Use RPCs only for queries (`fetchContent`, `listSessions`) or lifecycle commands (`createSession`). |
| Discriminated unions | Boolean flags for mutually exclusive states | Unions make invalid states inexpressible. `ToolCallStatus` is the model — never `{ isPending: boolean, isRunning: boolean }`. |
| `{ items: T[] }` wrapper | Bare `T[]` return | Wrapping in an object allows adding pagination, metadata, or totals without breaking the shape. |
| Optional fields on existing types | New action types or version bumps | Optional additions are backward-compatible with no version negotiation. Reserve new actions for genuinely new semantics. |
| `ContentRef` (lazy reference) | Inline large content in state | State stays lightweight; clients fetch on demand. Images, long tool output, and file contents should always use `ContentRef`. |
| Provider-agnostic display fields | Agent-specific identifiers in state | Clients never see raw tool names. The server maps them to `displayName`, `invocationMessage`, `toolKind`, etc. |
| Explicit `_meta` for provider hints | Overloading typed fields with provider-specific meaning | `_meta` is the escape hatch for provider-specific data that clients may ignore. Don't repurpose typed fields. |

## Anti-Patterns

Patterns that lead to protocol misuse, client bugs, or forward-compatibility breakage.

### ❌ Imperative RPC for state mutations

```jsonc
// WRONG — bypasses reducers and write-ahead
{ "method": "sendMessage", "params": { "text": "Hello" } }

// RIGHT — action flows through reducer, is optimistically applied, and reconciled
{ "method": "dispatchAction", "params": {
  "clientSeq": 1,
  "action": { "type": "session/turnStarted", ... }
}}
```

### ❌ Boolean flags for mutually exclusive states

```typescript
// WRONG — can express { isPending: true, isComplete: true }
interface IToolState {
  isPending: boolean;
  isRunning: boolean;
  isComplete: boolean;
}

// RIGHT — only valid states are expressible
type ToolCallStatus = 'streaming' | 'pendingConfirmation' | 'running' | 'completed' | 'cancelled';
```

### ❌ Inline large content in state

```typescript
// WRONG — bloats state, breaks lazy loading
interface IResponsePart {
  fullFileContent: string; // 50 KB of code
}

// RIGHT — lightweight reference, client fetches on demand
interface IResponsePart {
  contentRef: IContentRef; // { uri, sizeHint?, contentType? }
}
```

### ❌ Reaching for `_meta` when a typed field should exist

If multiple providers need the same field, it belongs in the typed interface — not buried in `_meta` where clients can't rely on it.

### ❌ Dispatching server-only actions from clients

Client code should use `isClientDispatchable()` to guard dispatch calls. Sending a server-only action (e.g. `session/delta`) from a client is silently rejected.

### ❌ Adding required fields to existing types

Required field additions break `Frozen extends Current` assignability checks and force a version bump. Always add fields as optional unless you're intentionally bumping the protocol version.

## Next Steps

- [Architecture](/guide/architecture) — Process model and communication layers.
- [Versioning](/specification/versioning) — How protocol versions and capabilities work.
