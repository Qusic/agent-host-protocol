import AgentHostProtocol
import Foundation

// MARK: - AHPConnection

/// WebSocket-based JSON-RPC transport for communicating with an Agent Host server.
///
/// Handles the initialize/reconnect handshake, request/response correlation,
/// and dispatches incoming server actions and notifications to the store.
actor AHPConnection {

    // MARK: - Types

    /// Errors specific to the AHP connection.
    enum ConnectionError: Error, LocalizedError {
        case notConnected
        case requestFailed(code: Int, message: String)
        case decodingFailed(String)
        case timeout

        var errorDescription: String? {
            switch self {
            case .notConnected: "Not connected to server"
            case .requestFailed(let code, let msg): "Server error \(code): \(msg)"
            case .decodingFailed(let detail): "Decoding failed: \(detail)"
            case .timeout: "Request timed out"
            }
        }
    }

    enum ConnectionState: Sendable {
        case disconnected
        case connecting
        case connected
        case reconnecting
    }

    // MARK: - Properties

    private let clientId: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private var webSocket: URLSessionWebSocketTask?
    private var urlSession: URLSession?
    private var nextRequestId = 1
    private var pendingRequests: [Int: CheckedContinuation<Data, Error>] = [:]
    private var serverSeq = 0
    private var subscriptions: [String] = []
    private var receiveTask: Task<Void, Never>?

    private(set) var state: ConnectionState = .disconnected

    /// Callback invoked on the MainActor when a server action envelope arrives.
    var onAction: (@MainActor (ActionEnvelope) -> Void)?
    /// Callback invoked on the MainActor when a protocol notification arrives.
    var onNotification: (@MainActor (ProtocolNotification) -> Void)?
    /// Callback invoked on the MainActor when the connection state changes.
    var onStateChange: (@MainActor (ConnectionState) -> Void)?

    /// Generic JSON-RPC success response wrapper (must be top-level in the actor
    /// because Swift does not allow nested types inside generic functions).
    private struct RpcSuccessResponse<R: Codable>: Codable {
        let id: Int
        let result: R
    }

    // MARK: - Init

    init(clientId: String = "ahp-app-\(UUID().uuidString.prefix(8))") {
        self.clientId = clientId
    }

    // MARK: - Connect

    /// Opens a WebSocket to the given server URL, performs the AHP `initialize` handshake,
    /// and returns the resulting snapshots.
    @discardableResult
    func connect(to url: URL) async throws -> InitializeResult {
        await setState(.connecting)

        let session = URLSession(configuration: .default)
        let ws = session.webSocketTask(with: url)
        ws.resume()
        self.urlSession = session
        self.webSocket = ws
        startReceiving()

        // Perform initialize handshake
        let params = InitializeParams(
            protocolVersion: 1,
            clientId: clientId,
            initialSubscriptions: ["agenthost:/root"]
        )
        let result: InitializeResult = try await sendRequest(method: "initialize", params: params)
        serverSeq = result.serverSeq
        subscriptions = ["agenthost:/root"]

        await setState(.connected)
        return result
    }

    /// Cleanly disconnects from the server.
    func disconnect() {
        receiveTask?.cancel()
        receiveTask = nil
        webSocket?.cancel(with: .normalClosure, reason: nil)
        webSocket = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
        pendingRequests.removeAll()
        Task { await setState(.disconnected) }
    }

    // MARK: - Commands

    /// Subscribe to a resource URI and return the snapshot.
    func subscribe(resource: String) async throws -> Snapshot {
        let result: SubscribeResult = try await sendRequest(
            method: "subscribe",
            params: SubscribeParams(resource: resource)
        )
        if !subscriptions.contains(resource) {
            subscriptions.append(resource)
        }
        return result.snapshot
    }

    /// Unsubscribe from a resource URI (fire-and-forget notification).
    func unsubscribe(resource: String) async throws {
        subscriptions.removeAll { $0 == resource }
        let notification = AHPClientNotifications.unsubscribe(
            params: UnsubscribeParams(resource: resource)
        )
        try await sendNotification(notification)
    }

    /// Create a new session.
    func createSession(params: CreateSessionParams) async throws {
        let _: AnyCodable? = try await sendRequest(method: "createSession", params: params)
    }

    /// Dispose a session.
    func disposeSession(session: String) async throws {
        let _: AnyCodable? = try await sendRequest(
            method: "disposeSession",
            params: DisposeSessionParams(session: session)
        )
    }

    /// List sessions.
    func listSessions() async throws -> [SessionSummary] {
        let result: ListSessionsResult = try await sendRequest(
            method: "listSessions",
            params: ListSessionsParams()
        )
        return result.items
    }

    /// Fetch turns for a session.
    func fetchTurns(session: String, before: String? = nil, limit: Int? = nil) async throws -> FetchTurnsResult {
        try await sendRequest(
            method: "fetchTurns",
            params: FetchTurnsParams(session: session, before: before, limit: limit)
        )
    }

    /// Fetch binary/text content by URI.
    func fetchContent(uri: String, encoding: ContentEncoding? = nil) async throws -> FetchContentResult {
        try await sendRequest(
            method: "fetchContent",
            params: FetchContentParams(uri: uri, encoding: encoding)
        )
    }

    /// Dispatch a state action to the server.
    func dispatchAction(_ action: StateAction) async throws {
        let seq = nextSeq()
        let notification = AHPClientNotifications.dispatchAction(
            params: DispatchActionParams(clientSeq: seq, action: action)
        )
        try await sendNotification(notification)
    }

    // MARK: - Private: JSON-RPC

    private func nextSeq() -> Int {
        let id = nextRequestId
        nextRequestId += 1
        return id
    }

    private func sendRequest<P: Codable & Sendable, R: Codable & Sendable>(
        method: String,
        params: P
    ) async throws -> R {
        guard let ws = webSocket else { throw ConnectionError.notConnected }

        let id = nextSeq()
        let request = JsonRpcRequest(id: id, method: method, params: params)
        let data = try encoder.encode(request)
        let message = URLSessionWebSocketTask.Message.data(data)

        // Register a continuation for this request ID
        let responseData: Data = try await withCheckedThrowingContinuation { continuation in
            pendingRequests[id] = continuation
            ws.send(message) { [weak self] error in
                if let error {
                    Task { [weak self] in
                        await self?.failRequest(id: id, error: error)
                    }
                }
            }
        }

        // Try to decode success response
        if let success = try? decoder.decode(RpcSuccessResponse<R>.self, from: responseData) {
            return success.result
        }

        // Try error response
        let errorResp = try? decoder.decode(JsonRpcErrorResponse.self, from: responseData)
        if let err = errorResp?.error {
            throw ConnectionError.requestFailed(code: err.code, message: err.message)
        }

        throw ConnectionError.decodingFailed("Could not decode response for \(method)")
    }

    private func sendNotification<P: Codable & Sendable>(_ notification: JsonRpcNotification<P>) async throws {
        guard let ws = webSocket else { throw ConnectionError.notConnected }
        let data = try encoder.encode(notification)
        try await ws.send(.data(data))
    }

    private func failRequest(id: Int, error: Error) {
        pendingRequests.removeValue(forKey: id)?.resume(throwing: error)
    }

    // MARK: - Private: Receive Loop

    private func startReceiving() {
        receiveTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    guard let ws = await self.webSocket else { break }
                    let message = try await ws.receive()
                    await self.handleMessage(message)
                } catch {
                    break
                }
            }
        }
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        let data: Data
        switch message {
        case .data(let d):
            data = d
        case .string(let s):
            data = Data(s.utf8)
        @unknown default:
            return
        }

        // Determine message type by checking for "id", "method" fields
        struct MessageProbe: Codable {
            let id: Int?
            let method: String?
        }
        guard let probe = try? decoder.decode(MessageProbe.self, from: data) else { return }

        if let id = probe.id, probe.method == nil {
            // This is a response to a pending request
            if let continuation = pendingRequests.removeValue(forKey: id) {
                continuation.resume(returning: data)
            }
        } else if let method = probe.method {
            switch method {
            case "action":
                // Server action broadcast
                if let envelope = try? decoder.decode(
                    JsonRpcNotification<ActionEnvelope>.self, from: data
                ) {
                    let params = envelope.params
                    serverSeq = params.serverSeq
                    if let callback = onAction {
                        Task { @MainActor in callback(params) }
                    }
                }
            case "notification":
                // Protocol notification
                if let note = try? decoder.decode(
                    JsonRpcNotification<NotificationMethodParams>.self, from: data
                ) {
                    if let callback = onNotification {
                        let notification = note.params.notification
                        Task { @MainActor in callback(notification) }
                    }
                }
            default:
                break
            }
        }
    }

    // MARK: - Private: State

    private func setState(_ newState: ConnectionState) async {
        state = newState
        if let callback = onStateChange {
            await MainActor.run { callback(newState) }
        }
    }
}
