// MultiHostTestHelpers — shared infrastructure for `MultiHostClientTests`.
//
// Mirrors the Rust integration-test scaffolding (`crates/ahp/tests/hosts.rs`):
// a small "fake host" actor that drives the server side of an
// `InMemoryTransport.pair()` and responds to `initialize`/`reconnect`/
// `listSessions`/`subscribe`. Optionally pushes a `notify/sessionAdded`
// after `initialize` to exercise the post-handshake notification path.

import Foundation
import AgentHostProtocol
@testable import AgentHostProtocolClient

/// Minimal mutable state for `FakeHost`. Conceptually equivalent to Rust's
/// `FakeHostState`.
struct FakeHostState: Sendable {
    var agents: [AgentInfo] = []
    var sessions: [SessionSummary] = []
    var serverSeq: Int = 0
}

/// Server-side responder for one in-memory transport pair. Constructed via
/// `FakeHost.start(transport:state:injectAfterInit:)`. Drives the loop in a
/// detached `Task`; cancelled implicitly when the client closes the
/// transport (`recv` throws).
struct FakeHost {
    /// Spin up a fake host driving `transport` (the *server* side of an
    /// `InMemoryTransport.pair()`). When `injectAfterInit` is non-nil, the
    /// fake pushes a `notify/sessionAdded` for that summary shortly after
    /// answering `initialize` (or `reconnect`).
    static func start(
        transport: InMemoryTransport,
        state: FakeHostState,
        injectAfterInit: SessionSummary? = nil
    ) -> Task<Void, Never> {
        Task {
            await drive(transport: transport, state: state, injectAfterInit: injectAfterInit)
        }
    }

    private static func drive(
        transport: InMemoryTransport,
        state: FakeHostState,
        injectAfterInit: SessionSummary?
    ) async {
        let encoder = JSONEncoder()
        while !Task.isCancelled {
            let frame: TransportMessage?
            do {
                frame = try await transport.recv()
            } catch {
                return
            }
            guard let frame else { return }
            guard case .text(let text) = frame,
                  let data = text.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { continue }

            let id = object["id"] as? Int
            let method = object["method"] as? String

            if let id, let method {
                let result = handleRequest(method: method, params: object["params"], state: state)
                let resp: [String: Any] = [
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": result,
                ]
                guard let respData = try? JSONSerialization.data(withJSONObject: resp),
                      let respText = String(data: respData, encoding: .utf8)
                else { continue }
                try? await transport.send(.text(respText))

                if let summary = injectAfterInit, method == "initialize" || method == "reconnect" {
                    // Tiny delay so the client's `listSessions` request has
                    // landed before the notification arrives.
                    try? await Task.sleep(for: .milliseconds(20))
                    let summaryAny: Any
                    if let bytes = try? encoder.encode(summary),
                       let obj = try? JSONSerialization.jsonObject(with: bytes) {
                        summaryAny = obj
                    } else {
                        continue
                    }
                    let notif: [String: Any] = [
                        "jsonrpc": "2.0",
                        "method": "notification",
                        "params": [
                            "notification": [
                                "type": "notify/sessionAdded",
                                "summary": summaryAny,
                            ] as [String: Any],
                        ] as [String: Any],
                    ]
                    if let notifData = try? JSONSerialization.data(withJSONObject: notif),
                       let notifText = String(data: notifData, encoding: .utf8) {
                        try? await transport.send(.text(notifText))
                    }
                }
            }
        }
    }

    private static func handleRequest(
        method: String,
        params: Any?,
        state: FakeHostState
    ) -> Any {
        switch method {
        case "initialize":
            let agentsAny = sessionSummariesToJSON(state.agents)
            let snapshot: [String: Any] = [
                "resource": RootResourceURI,
                "state": [
                    "agents": agentsAny,
                    "activeSessions": state.sessions.count,
                ] as [String: Any],
                "fromSeq": state.serverSeq,
            ]
            return [
                "protocolVersion": "0.1.0",
                "serverSeq": state.serverSeq,
                "snapshots": [snapshot],
            ]
        case "reconnect":
            return [
                "type": "replay",
                "actions": [],
                "missing": [],
            ] as [String: Any]
        case "listSessions":
            let items = sessionSummariesToJSON(state.sessions)
            return ["items": items]
        case "subscribe":
            let resource = (params as? [String: Any])?["resource"] as? String ?? RootResourceURI
            let snap: [String: Any] = [
                "resource": resource,
                "state": [
                    "agents": sessionSummariesToJSON(state.agents)
                ] as [String: Any],
                "fromSeq": state.serverSeq,
            ]
            return ["snapshot": snap]
        default:
            return [:] as [String: Any]
        }
    }
}

private func sessionSummariesToJSON<T: Encodable>(_ values: [T]) -> [Any] {
    let encoder = JSONEncoder()
    return values.compactMap { value -> Any? in
        guard let data = try? encoder.encode(value),
              let object = try? JSONSerialization.jsonObject(with: data)
        else { return nil }
        return object
    }
}

/// Build a transport factory that, on every call, opens a fresh
/// `InMemoryTransport.pair()` and starts a `FakeHost` driving the server
/// side. Optionally injects a `notify/sessionAdded` after init.
func makeFakeHostFactory(
    state: FakeHostState,
    injectAfterInit: SessionSummary? = nil,
    onConnect: (@Sendable () -> Void)? = nil
) -> HostTransportFactory {
    { _ in
        let (clientSide, serverSide) = InMemoryTransport.pair()
        onConnect?()
        _ = FakeHost.start(
            transport: serverSide,
            state: state,
            injectAfterInit: injectAfterInit
        )
        return clientSide
    }
}

/// Build a `SessionSummary` with the minimal required fields, defaulting
/// optional fields to `nil` so tests stay terse.
func makeSummary(
    _ uri: String,
    _ title: String,
    modifiedAt: Int = 0,
    createdAt: Int = 0
) -> SessionSummary {
    SessionSummary(
        resource: uri,
        provider: "copilot",
        title: title,
        status: .idle,
        createdAt: createdAt,
        modifiedAt: modifiedAt
    )
}

/// Build an `AgentInfo` with the minimal required fields.
func makeAgent(
    provider: String = "copilot",
    displayName: String = "Copilot"
) -> AgentInfo {
    AgentInfo(
        provider: provider,
        displayName: displayName,
        description: "demo",
        models: []
    )
}

// MARK: - Reconnect scenario helpers

/// Script describing what a `ReconnectFakeHost` should do across a series of
/// connect attempts. The supervisor opens a fresh transport on every retry,
/// so the same factory is invoked once per attempt; the script enumerates
/// the per-attempt behaviour in order.
struct ReconnectScript: Sendable {
    /// Server response for each connect attempt's `initialize`/`reconnect`
    /// request, in attempt order. Once exhausted, subsequent attempts fall
    /// through to `defaultInitResponse`.
    let perAttemptHandshake: [HandshakeResponse]
    /// Fallback handshake response used after `perAttemptHandshake` is
    /// exhausted. Defaults to a stock `initialize` reply.
    let defaultInitResponse: HandshakeResponse
    /// Whether to close the transport immediately after answering the
    /// handshake on each attempt. `nil` (the default in any slot) means
    /// keep the connection open and continue serving requests.
    let dropAfterHandshake: [Bool]

    init(
        perAttemptHandshake: [HandshakeResponse],
        defaultInitResponse: HandshakeResponse = .initOk(serverSeq: 0),
        dropAfterHandshake: [Bool] = []
    ) {
        self.perAttemptHandshake = perAttemptHandshake
        self.defaultInitResponse = defaultInitResponse
        self.dropAfterHandshake = dropAfterHandshake
    }
}

/// What the fake host should return as the `result` for a single handshake
/// request. Selects between `initialize` and `reconnect`-shaped payloads.
enum HandshakeResponse: Sendable {
    /// Reply to `initialize` with the given `serverSeq` and an optional
    /// root-state snapshot.
    case initOk(serverSeq: Int, agents: [AgentInfo] = [], activeSessions: Int = 0)
    /// Reply to `reconnect` with a `replay`-arm result carrying the given
    /// actions and missing URIs.
    case reconnectReplay(actions: [ActionEnvelope], missing: [String] = [])
    /// Reply to `reconnect` with a `snapshot`-arm result carrying the given
    /// snapshots.
    case reconnectSnapshot(snapshots: [Snapshot])
    /// Reply to `reconnect` with a JSON-RPC error so the supervisor falls
    /// back to `initialize` on the same connection.
    case reconnectError(code: Int, message: String)
}

/// Scripted fake host: handles a sequence of connect attempts with
/// per-attempt handshake responses pulled from `ReconnectScript`. Each
/// invocation of the transport factory consumes one attempt slot.
final class ScriptedFakeHost: @unchecked Sendable {
    let script: ReconnectScript
    private let lock = NSLock()
    private var attemptIndex: Int = 0
    /// Optional list of session summaries to return from `listSessions`.
    let sessions: [SessionSummary]

    init(script: ReconnectScript, sessions: [SessionSummary] = []) {
        self.script = script
        self.sessions = sessions
    }

    /// Bump the attempt counter and return the index of the just-started
    /// attempt (0-based).
    func nextAttemptIndex() -> Int {
        lock.lock(); defer { lock.unlock() }
        let i = attemptIndex
        attemptIndex += 1
        return i
    }

    /// Build a transport factory backed by this scripted host. Every call
    /// opens a fresh `InMemoryTransport.pair()` and drives the server side.
    func factory() -> HostTransportFactory {
        return { [self] _ in
            let (clientSide, serverSide) = InMemoryTransport.pair()
            let attempt = self.nextAttemptIndex()
            let handshake = self.script.perAttemptHandshake.indices.contains(attempt)
                ? self.script.perAttemptHandshake[attempt]
                : self.script.defaultInitResponse
            let drop = self.script.dropAfterHandshake.indices.contains(attempt)
                ? self.script.dropAfterHandshake[attempt]
                : false
            Task {
                await Self.drive(
                    transport: serverSide,
                    handshake: handshake,
                    sessions: self.sessions,
                    dropAfterHandshake: drop
                )
            }
            return clientSide
        }
    }

    private static func drive(
        transport: InMemoryTransport,
        handshake: HandshakeResponse,
        sessions: [SessionSummary],
        dropAfterHandshake: Bool
    ) async {
        while !Task.isCancelled {
            let frame: TransportMessage?
            do {
                frame = try await transport.recv()
            } catch {
                return
            }
            guard let frame else { return }
            guard case .text(let text) = frame,
                  let data = text.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { continue }
            guard let id = object["id"] as? Int,
                  let method = object["method"] as? String
            else { continue }

            // Build the response payload. Errors are sent under the `error`
            // key; everything else under `result`.
            var responseDict: [String: Any] = [
                "jsonrpc": "2.0",
                "id": id,
            ]

            switch method {
            case "initialize":
                switch handshake {
                case .initOk(let seq, let agents, let active):
                    responseDict["result"] = makeInitResult(
                        serverSeq: seq, agents: agents, activeSessions: active
                    )
                default:
                    // Fallback: still answer initialize with stock data
                    // even if the script slot was reconnect-shaped — the
                    // supervisor only takes the reconnect branch when it
                    // already has prior state.
                    responseDict["result"] = makeInitResult(
                        serverSeq: 0, agents: [], activeSessions: 0
                    )
                }
            case "reconnect":
                switch handshake {
                case .reconnectReplay(let actions, let missing):
                    responseDict["result"] = makeReplayResult(actions: actions, missing: missing)
                case .reconnectSnapshot(let snapshots):
                    responseDict["result"] = makeSnapshotResult(snapshots: snapshots)
                case .reconnectError(let code, let msg):
                    responseDict["error"] = [
                        "code": code,
                        "message": msg,
                    ] as [String: Any]
                case .initOk:
                    // Default empty replay if the slot was init-shaped.
                    responseDict["result"] = [
                        "type": "replay",
                        "actions": [],
                        "missing": [],
                    ] as [String: Any]
                }
            case "listSessions":
                responseDict["result"] = ["items": encodeArray(sessions)]
            case "subscribe":
                let resource = (object["params"] as? [String: Any])?["resource"] as? String ?? RootResourceURI
                responseDict["result"] = [
                    "snapshot": [
                        "resource": resource,
                        "state": ["agents": []] as [String: Any],
                        "fromSeq": 0,
                    ] as [String: Any],
                ] as [String: Any]
            default:
                responseDict["result"] = [:] as [String: Any]
            }

            if let respData = try? JSONSerialization.data(withJSONObject: responseDict),
               let respText = String(data: respData, encoding: .utf8) {
                try? await transport.send(.text(respText))
            }

            // If the script asks for it, drop the transport right after
            // the handshake to force the supervisor into a reconnect.
            if dropAfterHandshake && (method == "initialize" || method == "reconnect") {
                try? await transport.close()
                return
            }
        }
    }

    private static func makeInitResult(
        serverSeq: Int,
        agents: [AgentInfo],
        activeSessions: Int
    ) -> [String: Any] {
        let snapshot: [String: Any] = [
            "resource": RootResourceURI,
            "state": [
                "agents": encodeArray(agents),
                "activeSessions": activeSessions,
            ] as [String: Any],
            "fromSeq": serverSeq,
        ]
        return [
            "protocolVersion": "0.1.0",
            "serverSeq": serverSeq,
            "snapshots": [snapshot],
        ]
    }

    private static func makeReplayResult(
        actions: [ActionEnvelope],
        missing: [String]
    ) -> [String: Any] {
        return [
            "type": "replay",
            "actions": encodeArray(actions),
            "missing": missing,
        ]
    }

    private static func makeSnapshotResult(snapshots: [Snapshot]) -> [String: Any] {
        return [
            "type": "snapshot",
            "snapshots": encodeArray(snapshots),
        ]
    }

    private static func encodeArray<T: Encodable>(_ values: [T]) -> [Any] {
        let encoder = JSONEncoder()
        return values.compactMap { value -> Any? in
            guard let bytes = try? encoder.encode(value),
                  let obj = try? JSONSerialization.jsonObject(with: bytes)
            else { return nil }
            return obj
        }
    }
}

/// Poll `condition` every 10 ms until it returns true or the timeout
/// elapses. Crashes (intentionally) on timeout.
func waitUntil(
    timeout: Duration = .seconds(2),
    _ condition: @Sendable () async -> Bool,
    file: StaticString = #file,
    line: UInt = #line
) async {
    let deadline = ContinuousClock.now + timeout
    while ContinuousClock.now < deadline {
        if await condition() { return }
        try? await Task.sleep(for: .milliseconds(10))
    }
    fatalError("waitUntil timed out", file: file, line: line)
}

/// Wait for a host's `HostState` to satisfy `predicate`.
func waitForHostState(
    _ multi: MultiHostClient,
    id: HostId,
    timeout: Duration = .seconds(2),
    _ predicate: @escaping @Sendable (HostState) -> Bool,
    file: StaticString = #file,
    line: UInt = #line
) async {
    await waitUntil(timeout: timeout, {
        guard let snap = await multi.host(id) else { return false }
        return predicate(snap.state)
    }, file: file, line: line)
}
