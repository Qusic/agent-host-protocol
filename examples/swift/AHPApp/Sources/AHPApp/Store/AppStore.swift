import AgentHostProtocol
import Foundation
import Observation
import SwiftUI

// MARK: - AppStore

/// Central state container for the AHP client app.
///
/// Holds the root state (agents/models), per-session state, and the active connection.
/// All state mutations flow through the protocol's pure reducers, ensuring consistency
/// with the server.
@Observable
@MainActor
final class AppStore {

    // MARK: - Published State

    /// Root state: available agents and active session count.
    var rootState = RootState(agents: [])

    /// Per-session state keyed by session URI.
    var sessions: [String: SessionState] = [:]

    /// Currently selected session URI.
    var selectedSessionURI: String?

    /// Connection status.
    var connectionState: AHPConnection.ConnectionState = .disconnected

    /// Last error message for display.
    var errorMessage: String?

    /// Server URL string (editable in settings).
    var serverURL: String = "ws://localhost:3000"

    // MARK: - Computed Properties

    /// The currently selected session state, if any.
    var currentSession: SessionState? {
        guard let uri = selectedSessionURI else { return nil }
        return sessions[uri]
    }

    /// All session summaries, sorted by most recent.
    var sessionSummaries: [SessionSummary] {
        sessions.values
            .map(\.summary)
            .sorted { $0.modifiedAt > $1.modifiedAt }
    }

    /// Available agents from root state.
    var agents: [AgentInfo] {
        rootState.agents
    }

    /// All models across all agents.
    var allModels: [SessionModelInfo] {
        agents.flatMap(\.models)
    }

    // MARK: - Private

    private let connection: AHPConnection
    private var sessionReducer_ = AHPSessionReducer()

    // MARK: - Init

    init() {
        let conn = AHPConnection()
        self.connection = conn

        // Wire up callbacks — these are invoked on the MainActor because the
        // connection dispatches them there.
        Task {
            await conn.setOnAction { [weak self] envelope in
                self?.handleAction(envelope)
            }
            await conn.setOnNotification { [weak self] notification in
                self?.handleNotification(notification)
            }
            await conn.setOnStateChange { [weak self] state in
                self?.connectionState = state
            }
        }
    }

    // MARK: - Connection

    /// Connect to the AHP server.
    func connect() async {
        guard let url = URL(string: serverURL) else {
            errorMessage = "Invalid server URL"
            return
        }
        do {
            errorMessage = nil
            let result = try await connection.connect(to: url)

            // Process initial snapshots
            for snapshot in result.snapshots {
                applySnapshot(snapshot)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Disconnect from the server.
    func disconnect() async {
        await connection.disconnect()
        sessions.removeAll()
        selectedSessionURI = nil
        rootState = RootState(agents: [])
    }

    // MARK: - Session Management

    /// Create a new session with the given agent provider and model.
    func createSession(provider: String, model: String? = nil) async {
        let sessionId = UUID().uuidString
        let uri = "\(provider):/\(sessionId)"
        do {
            try await connection.createSession(params: CreateSessionParams(
                session: uri,
                provider: provider,
                model: model
            ))

            // Subscribe to the new session
            let snapshot = try await connection.subscribe(resource: uri)
            applySnapshot(snapshot)
            selectedSessionURI = uri
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Dispose the given session.
    func disposeSession(uri: String) async {
        do {
            try await connection.disposeSession(session: uri)
            try await connection.unsubscribe(resource: uri)
            sessions.removeValue(forKey: uri)
            if selectedSessionURI == uri {
                selectedSessionURI = sessionSummaries.first?.resource
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Select a session by its URI.
    func selectSession(uri: String) async {
        // If we don't have it, subscribe
        if sessions[uri] == nil {
            do {
                let snapshot = try await connection.subscribe(resource: uri)
                applySnapshot(snapshot)
            } catch {
                errorMessage = error.localizedDescription
                return
            }
        }
        selectedSessionURI = uri
    }

    // MARK: - Conversation

    /// Send a user message to the current session, starting a new turn.
    func sendMessage(_ text: String, attachments: [MessageAttachment]? = nil) async {
        guard let uri = selectedSessionURI else { return }
        let turnId = UUID().uuidString
        let action = StateAction.sessionTurnStarted(SessionTurnStartedAction(
            type: .sessionTurnStarted,
            session: uri,
            turnId: turnId,
            userMessage: UserMessage(text: text, attachments: attachments)
        ))

        // Optimistically apply the action locally
        applySessionAction(action, sessionURI: uri)

        // Dispatch to server
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Cancel the active turn in the current session.
    func cancelTurn() async {
        guard let uri = selectedSessionURI,
              let turn = sessions[uri]?.activeTurn else { return }
        let action = StateAction.sessionTurnCancelled(SessionTurnCancelledAction(
            type: .sessionTurnCancelled,
            session: uri,
            turnId: turn.id
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Approve a tool call.
    func approveToolCall(toolCallId: String, turnId: String) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallConfirmed(SessionToolCallConfirmedAction(
            session: uri,
            turnId: turnId,
            toolCallId: toolCallId,
            approved: true,
            confirmed: .userAction
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Deny a tool call.
    func denyToolCall(toolCallId: String, turnId: String, reason: String? = nil) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallConfirmed(SessionToolCallConfirmedAction(
            session: uri,
            turnId: turnId,
            toolCallId: toolCallId,
            approved: false,
            reason: .denied,
            reasonMessage: reason.map { .string($0) }
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Approve a tool call result.
    func approveToolCallResult(toolCallId: String, turnId: String) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionToolCallResultConfirmed(SessionToolCallResultConfirmedAction(
            session: uri,
            turnId: turnId,
            toolCallId: toolCallId,
            type: .sessionToolCallResultConfirmed,
            approved: true
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Change the model for the current session.
    func changeModel(_ modelId: String) async {
        guard let uri = selectedSessionURI else { return }
        let action = StateAction.sessionModelChanged(SessionModelChangedAction(
            type: .sessionModelChanged,
            session: uri,
            model: modelId
        ))
        applySessionAction(action, sessionURI: uri)
        do {
            try await connection.dispatchAction(action)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Private: State Management

    private func applySnapshot(_ snapshot: Snapshot) {
        switch snapshot.state {
        case .root(let state):
            rootState = state
        case .session(let state):
            sessions[snapshot.resource] = state
        }
    }

    private func handleAction(_ envelope: ActionEnvelope) {
        let action = envelope.action

        // Apply to root state
        rootState = rootReducer(state: rootState, action: action)

        // Figure out which session this action targets
        let sessionURI = extractSessionURI(from: action)
        if let uri = sessionURI {
            applySessionAction(action, sessionURI: uri)
        }
    }

    private func applySessionAction(_ action: StateAction, sessionURI: String) {
        guard var state = sessions[sessionURI] else { return }
        sessionReducer_.reduce(into: &state, action: action)
        sessions[sessionURI] = state
    }

    private func handleNotification(_ notification: ProtocolNotification) {
        switch notification {
        case .sessionAdded(let note):
            // A new session was created (potentially by another client)
            let uri = note.summary.resource
            if sessions[uri] == nil {
                // Auto-subscribe to new sessions
                Task {
                    await selectSession(uri: uri)
                }
            }
        case .sessionRemoved(let note):
            sessions.removeValue(forKey: note.session)
            if selectedSessionURI == note.session {
                selectedSessionURI = sessionSummaries.first?.resource
            }
        case .authRequired:
            errorMessage = "Authentication required"
        }
    }

    /// Extract the session URI from an action, if applicable.
    private func extractSessionURI(from action: StateAction) -> String? {
        switch action {
        case .rootAgentsChanged, .rootActiveSessionsChanged:
            return nil
        case .sessionReady(let a): return a.session
        case .sessionCreationFailed(let a): return a.session
        case .sessionTurnStarted(let a): return a.session
        case .sessionDelta(let a): return a.session
        case .sessionResponsePart(let a): return a.session
        case .sessionToolCallStart(let a): return a.session
        case .sessionToolCallDelta(let a): return a.session
        case .sessionToolCallReady(let a): return a.session
        case .sessionToolCallConfirmed(let a): return a.session
        case .sessionToolCallComplete(let a): return a.session
        case .sessionToolCallResultConfirmed(let a): return a.session
        case .sessionTurnComplete(let a): return a.session
        case .sessionTurnCancelled(let a): return a.session
        case .sessionError(let a): return a.session
        case .sessionTitleChanged(let a): return a.session
        case .sessionUsage(let a): return a.session
        case .sessionReasoning(let a): return a.session
        case .sessionModelChanged(let a): return a.session
        case .sessionServerToolsChanged(let a): return a.session
        case .sessionActiveClientChanged(let a): return a.session
        case .sessionActiveClientToolsChanged(let a): return a.session
        case .sessionPendingMessageSet(let a): return a.session
        case .sessionPendingMessageRemoved(let a): return a.session
        case .sessionQueuedMessagesReordered(let a): return a.session
        case .sessionCustomizationsChanged(let a): return a.session
        case .sessionCustomizationToggled(let a): return a.session
        }
    }
}

// MARK: - AHPConnection callback setters (actor-isolated)

private extension AHPConnection {
    func setOnAction(_ callback: @escaping @MainActor (ActionEnvelope) -> Void) {
        onAction = callback
    }
    func setOnNotification(_ callback: @escaping @MainActor (ProtocolNotification) -> Void) {
        onNotification = callback
    }
    func setOnStateChange(_ callback: @escaping @MainActor (AHPConnection.ConnectionState) -> Void) {
        onStateChange = callback
    }
}
