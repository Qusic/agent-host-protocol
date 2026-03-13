# Commands

Commands are imperative JSON-RPC requests for operations that don't map to a single state action (session creation, data fetching, etc.). They return a result or a JSON-RPC error.

## `createSession`

Creates a new session with the specified agent provider.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `session` | `URI` | Yes | Session URI (client-chosen, e.g. `copilot:/<uuid>`) |
| `provider` | `string` | No | Agent provider ID |
| `model` | `string` | No | Model ID to use |

**Result:** `null` on success.

**Example:**

```jsonc
// Client → Server
{ "jsonrpc": "2.0", "id": 2, "method": "createSession",
  "params": { "session": "copilot:/<uuid>", "provider": "copilot", "model": "gpt-4o" } }

// Server → Client (success)
{ "jsonrpc": "2.0", "id": 2, "result": null }

// Server → Client (failure)
{ "jsonrpc": "2.0", "id": 2, "error": { "code": -32603, "message": "No agent for provider" } }
```

After creation, the client should subscribe to the session URI to receive state updates. The server also broadcasts a `notify/sessionAdded` notification to all clients.

---

## `disposeSession`

Disposes a session and cleans up server-side resources.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `session` | `URI` | Yes | Session URI to dispose |

**Result:** `null` on success.

The server broadcasts a `notify/sessionRemoved` notification to all clients.

---

## `listSessions`

Returns a list of session summaries. Used to populate session lists and sidebars.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `filter` | `object` | No | Optional filter criteria |

**Result:** `ISessionSummary[]`

The session list is **not** part of the state tree because it can be arbitrarily large. Clients fetch it imperatively and maintain a local cache updated by `notify/sessionAdded` and `notify/sessionRemoved` notifications.

---

## `fetchContent`

Fetches large content referenced by a `ContentRef` in the state tree.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `uri` | `string` | Yes | Content URI from a `ContentRef` |

**Result:** The content bytes.

Content references keep the state tree small by storing large data (images, long tool outputs) by reference rather than inline.

---

## `fetchTurns`

Fetches historical turns for a session. Used for lazy loading of conversation history.

| Property | Value |
|---|---|
| Direction | Client → Server |
| Type | Request |

**Parameters:**

| Field | Type | Required | Description |
|---|---|---|---|
| `session` | `URI` | Yes | Session URI |
| `range` | `object` | No | Range of turns to fetch |

**Result:** `ITurn[]`

---

## Client-Dispatched Actions

In addition to commands, clients interact with the server by **dispatching actions** as fire-and-forget notifications:

```jsonc
// Client → Server
{
  "jsonrpc": "2.0",
  "method": "dispatchAction",
  "params": {
    "clientSeq": 1,
    "action": { "type": "session/turnStarted", "session": "copilot:/<uuid>", ... }
  }
}
```

These are **write-ahead**: the client applies them optimistically to local state. See [Actions](/guide/actions) for the full list of client-dispatchable actions.

| Action | Server-side effect |
|---|---|
| `session/turnStarted` | Begins agent processing for the new turn |
| `session/permissionResolved` | Unblocks the pending tool execution |
| `session/turnCancelled` | Aborts the in-progress turn |
| `session/modelChanged` | Changes the model for subsequent turns |
