# Lifecycle

The lifecycle defines how AHP connections are established, sessions are created and managed, and shutdown occurs.

## Connection Handshake

The client initiates the connection with an `initialize` notification. The server responds with a `serverHello` notification:

```
1. Client → Server:  initialize(protocolVersion, clientId, initialSubscriptions?)
2. Server → Client:  serverHello(protocolVersion, serverSeq, snapshots[])
```

### Initialize (Client → Server)

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientId": "client-abc",
    "initialSubscriptions": ["agenthost:/root"]
  }
}
```

`initialSubscriptions` allows the client to subscribe to root state (and any previously-open sessions) in the same round-trip as the handshake.

### ServerHello (Server → Client)

```json
{
  "jsonrpc": "2.0",
  "method": "serverHello",
  "params": {
    "protocolVersion": 1,
    "serverSeq": 42,
    "snapshots": [
      {
        "resource": "agenthost:/root",
        "state": { "agents": [...] },
        "fromSeq": 42
      }
    ]
  }
}
```

The `protocolVersion` in the response tells the client what version the server speaks. The client derives `ProtocolCapabilities` from this and gates feature usage accordingly.

## Session Creation

```
1. Client picks a session URI (e.g. copilot:/<new-uuid>)
2. Client sends createSession(uri, config) command
3. Client sends subscribe(uri) — can be batched with the command
4. Server creates session with lifecycle: 'creating', sends snapshot
5. Server asynchronously initializes the agent backend
6. On success: server dispatches session/ready action
7. On failure: server dispatches session/creationFailed action
8. Server broadcasts notify/sessionAdded to all clients
```

The session URI scheme is the provider name and the path is the session ID: `copilot:/<uuid>`.

## Active Session

Once a session reaches `lifecycle: 'ready'`, the session is active:

- The client MAY dispatch `session/turnStarted` to begin a turn.
- The server streams back `session/delta`, `session/toolStart`, `session/permissionRequest`, and other actions.
- The client MAY dispatch `session/permissionResolved` or `session/turnCancelled`.
- The server dispatches `session/turnComplete` or `session/error` when the turn ends.

All actions MUST be scoped to the session URI and reference a valid turn ID when applicable.

## Session Disposal

```jsonc
// Client → Server (request)
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "disposeSession",
  "params": { "session": "copilot:/<uuid>" }
}
```

The server disposes the session and broadcasts a `notify/sessionRemoved` notification to all clients.

## Reconnection

If the transport connection drops, the client reconnects and sends:

```json
{
  "jsonrpc": "2.0",
  "method": "reconnect",
  "params": {
    "clientId": "client-abc",
    "lastSeenServerSeq": 42,
    "subscriptions": ["agenthost:/root", "copilot:/<uuid>"]
  }
}
```

The server replays actions since `lastSeenServerSeq` from a bounded replay buffer. If the gap exceeds the buffer, the server sends fresh snapshots via a `reconnectResponse` notification.

Notifications are **not** replayed — the client SHOULD re-fetch the session list via `listSessions()`.

## Unexpected Disconnection

If the server process terminates unexpectedly:

- The host environment SHOULD treat the server as terminated.
- The host MAY attempt to restart the server (e.g. crash recovery with automatic restart).
- In-progress turns SHOULD be considered failed.
- On restart, clients reconnect using the reconnection flow above.
