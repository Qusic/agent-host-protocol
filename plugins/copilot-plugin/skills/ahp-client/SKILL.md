---
description: >-
  Interact with an Agent Host Protocol (AHP) server via WebSocket.
  Use when asked to connect to, message, or control an AHP server.
  Handles connection lifecycle, state subscriptions, action dispatch,
  tool call permissions, and reconnection.
---

# Agent Host Protocol – Copilot Skill

You have access to an MCP server (`ahp-websocket`) that lets you connect to an
Agent Host Protocol server over WebSocket and exchange JSON-RPC 2.0 messages.

## Core Concepts

AHP is a **Redux-inspired state synchronisation protocol** built on JSON-RPC 2.0
over WebSocket. The server maintains an authoritative state tree; clients apply
actions optimistically and reconcile with the server's echoed actions.

- **Root state** (`agenthost:/root`) – lists available agents/models.
- **Session state** (`<provider>:/<uuid>`) – per-conversation state with turns,
  deltas, tool calls, and permissions.
- **Actions** – the sole mutation mechanism, wrapped in `ActionEnvelope`s with a
  `serverSeq`.
- **Subscriptions** – clients subscribe to URI-identified state resources to
  receive action streams.
- **Notifications** – ephemeral broadcasts (session added/removed) that are NOT
  part of the state tree and NOT replayed on reconnect.

## Available MCP tools

| Tool                | Purpose |
|---------------------|---------|
| `connect`           | Open (or re-open) a WebSocket to an AHP server URL |
| `send`              | Send a JSON-RPC message and get the response + any pending notifications |
| `get_notifications` | Drain the notification inbox (optionally wait N seconds first) |
| `status`            | Check connection state, pending request count, inbox depth |
| `next_id`           | Get a unique incrementing integer for JSON-RPC request `id` fields |

## Workflow

Follow this sequence for every AHP interaction. Do not skip steps.

### 1. Connect and initialize

```
connect(url: "ws://localhost:3000")
```

Then send an `initialize` **notification** (no `id` field):

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientId": "<unique-client-id>",
    "initialSubscriptions": ["agenthost:/root"]
  }
}
```

Then call `get_notifications(wait: 2)` to collect the `serverHello` response,
which includes snapshots for any initial subscriptions.

### 2. Subscribe to state

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "subscribe",
  "params": { "resource": "agenthost:/root" }
}
```

The response contains the current state snapshot.
After subscribing, subsequent mutations arrive as `action` notifications.

### 3. Create a session and subscribe

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "createSession",
  "params": {
    "session": "<provider>:/<uuid>",
    "provider": "<provider>",
    "model": "<model-id>"
  }
}
```

Then subscribe to the session URI. **Wait for a `session/ready` action before
sending messages.** If you see `session/creationFailed`, the session cannot be used.

### 4. Send a message (start a turn)

Dispatch a `session/turnStarted` action as a **notification** (fire-and-forget):

```json
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "clientSeq": 1,
    "action": {
      "type": "session/turnStarted",
      "session": "<provider>:/<uuid>",
      "turnId": "<unique-turn-id>",
      "userMessage": { "text": "Hello, world!" }
    }
  }
}
```

Then poll `get_notifications(wait: 2)` to collect streaming actions until
you see `session/turnComplete`.

### 5. Handle tool calls and permissions

If the agent calls a tool, watch for:
- `session/toolCallStart` – tool invocation started; may need confirmation
- `session/toolCallReady` – parameters complete, awaiting approval

Approve or deny with:

```json
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "clientSeq": 2,
    "action": {
      "type": "session/toolCallConfirmed",
      "session": "<provider>:/<uuid>",
      "turnId": "<turn-id>",
      "toolCallId": "<tool-call-id>",
      "approved": true
    }
  }
}
```

### 6. Reconnect on disconnect

If the connection drops, call `connect` again and send `reconnect` instead of
`initialize`:

```json
{
  "jsonrpc": "2.0",
  "method": "reconnect",
  "params": {
    "clientId": "<same-client-id>",
    "lastSeenServerSeq": 42,
    "subscriptions": ["agenthost:/root", "<provider>:/<uuid>"]
  }
}
```

## Action Dispatch Decision Table

Use this to select the correct action for each scenario.

| Scenario | Action | Notes |
|----------|--------|-------|
| Send a message | `session/turnStarted` | Always use action dispatch, never an RPC |
| Cancel in-progress turn | `session/turnCancelled` | Idempotent; may race with completion |
| Approve tool call | `session/toolCallConfirmed` | Set `approved: true` |
| Deny tool call | `session/toolCallConfirmed` | Set `approved: false` |
| Approve tool result | `session/toolCallResultConfirmed` | After tool execution completes |
| Switch model | `session/modelChanged` | Affects subsequent turns only |
| Toggle a plugin | `session/customizationToggled` | By URI |
| Inject a steering hint | `session/pendingMessageSet` | `kind: 'steering'` — into current turn |
| Queue a follow-up | `session/pendingMessageSet` | `kind: 'queued'` — auto-starts when idle |

**For queries, use RPC commands:**

| Command             | Purpose |
|---------------------|---------|
| `listSessions`      | List all session summaries |
| `disposeSession`    | Tear down a session |
| `fetchContent`      | Fetch large content by URI reference |
| `fetchTurns`        | Fetch historical turns for a session |

## Preferences

| Prefer | Over | Why |
|--------|------|-----|
| Dispatching a state action | Making an imperative RPC | Actions flow through reducers, enable write-ahead reconciliation, and are visible to all clients |
| Polling `get_notifications` with a wait | Busy-looping with no wait | Reduces load; the server streams actions as they occur |
| Using `session/turnStarted` | Inventing a custom "send message" RPC | `turnStarted` is the protocol-standard way to initiate a turn |
| Waiting for `session/ready` | Sending messages immediately after `createSession` | The session backend needs time to initialize |
| Using `session/toolCallConfirmed` | Calling a tool approval RPC | Confirmation is a state action, not a command |

## Anti-Patterns

### ❌ Sending messages before `session/ready`

The session backend initializes asynchronously. Dispatching `session/turnStarted`
before receiving `session/ready` will be rejected.

### ❌ Using `send` for state mutations instead of `dispatchAction`

All state mutations must go through `dispatchAction` as fire-and-forget
notifications. Never invent custom RPC methods for things that should be actions.

### ❌ Ignoring `rejectionReason` on echoed actions

When the server echoes back your action with a `rejectionReason`, revert the
optimistic state change. Common rejections: `"no active turn to cancel"`,
`"unknown tool call ID"`.

### ❌ Forgetting to increment `clientSeq`

Each dispatched action needs a unique, monotonically increasing `clientSeq`.
Reusing sequence numbers breaks write-ahead reconciliation.

### ❌ Subscribing without checking existing subscriptions

Before subscribing to a session URI, verify you aren't already subscribed.
Duplicate subscriptions cause duplicate action delivery.

## Full documentation

For complete protocol details, refer to the docs in this repository:

- **Guide**: `docs/guide/` – conceptual overviews and walkthroughs
  - `getting-started.md` – end-to-end example
  - `state-model.md` – full state tree shape
  - `actions.md` – how actions work, action dispatch decision table
  - `reconciliation.md` – write-ahead reconciliation algorithm
  - `design.md` – design preferences and anti-patterns
  - `customizations.md` – Open Plugins integration
- **Specification**: `docs/specification/` – normative protocol spec
  - `transport.md` – transport requirements
  - `lifecycle.md` – connection, session, and reconnection lifecycle
  - `subscriptions.md` – subscription mechanics
  - `versioning.md` – version negotiation and protocol evolution workflow
- **Reference**: `docs/reference/` – complete type references
  - `messages.md` – all state types
  - `actions.md` – all action types with fields
  - `commands.md` – all JSON-RPC commands
  - `notifications.md` – all notification types
  - `error-codes.md` – error code reference

Read these files when you need exact field names, type shapes, or edge-case
behaviour.
