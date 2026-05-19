# Transport

AHP is **transport-agnostic**. The protocol does not formally specify a transport — any mechanism that provides a reliable, ordered, bidirectional message stream can carry AHP messages.

The transport is chosen **before** the AHP protocol begins; it is not negotiated within the protocol itself. Client and server agree on a transport out-of-band, and the server is responsible for accepting connections on that transport.

## Requirements

A compliant transport MUST:

1. Deliver messages **in order**.
2. Deliver messages **reliably** (no silent drops).
3. Support **bidirectional** communication.
4. Deliver **complete** messages (no partial delivery).

Any mechanism that meets these requirements is acceptable — WebSocket, TCP with a framing layer, an in-process message channel, or anything else.

## Common Transports

While AHP does not mandate a transport, **WebSocket** is the most common choice for remote and cross-process connections, and is what the VS Code implementation uses.

When WebSocket is used:

- The server acts as the WebSocket server.
- Messages are sent as WebSocket **text** frames.
- Each text frame contains exactly one complete JSON-RPC message.

## Keep-Alive

AHP does not define a protocol-level heartbeat. Implementations SHOULD rely on transport-level liveness mechanisms where available (for example, WebSocket ping/pong frames) to detect dead connections. The ping interval and timeout are implementation-specific.

## Authentication

Authentication is a transport-layer concern and is outside the scope of the AHP wire protocol. Implementations SHOULD authenticate during the transport handshake — for example, for WebSocket via query parameters, headers, or the HTTP upgrade request — before the AHP `initialize` request is sent.
