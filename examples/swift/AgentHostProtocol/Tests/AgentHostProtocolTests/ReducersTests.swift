// ReducersTests.swift — Swift XCTest suite for AHP reducers.
// Mirrors types/reducers.test.ts to validate behavioral parity.

import XCTest
@testable import AgentHostProtocol

final class ReducersTests: XCTestCase {

    // MARK: - Constants

    private let S = "copilot:/test-session"
    private let T = "turn-1"
    private let TC = "tc-1"

    // MARK: - Test Fixtures

    private func makeRootState(agents: [AgentInfo] = []) -> RootState {
        RootState(agents: agents)
    }

    private func makeSessionState(
        lifecycle: SessionLifecycle = .creating,
        status: SessionStatus = .idle,
        steeringMessage: PendingMessage? = nil,
        queuedMessages: [PendingMessage]? = nil,
        activeClient: SessionActiveClient? = nil,
        customizations: [SessionCustomization]? = nil
    ) -> SessionState {
        SessionState(
            summary: SessionSummary(
                resource: S,
                provider: "copilot",
                title: "Test Session",
                status: status,
                createdAt: 1000,
                modifiedAt: 1000
            ),
            lifecycle: lifecycle,
            activeClient: activeClient,
            turns: [],
            steeringMessage: steeringMessage,
            queuedMessages: queuedMessages,
            customizations: customizations
        )
    }

    private func makeSessionStateWithActiveTurn(
        steeringMessage: PendingMessage? = nil,
        queuedMessages: [PendingMessage]? = nil,
        activeClient: SessionActiveClient? = nil,
        customizations: [SessionCustomization]? = nil
    ) -> SessionState {
        SessionState(
            summary: SessionSummary(
                resource: S,
                provider: "copilot",
                title: "Test Session",
                status: .inProgress,
                createdAt: 1000,
                modifiedAt: 2000
            ),
            lifecycle: .ready,
            activeClient: activeClient,
            turns: [],
            activeTurn: ActiveTurn(
                id: T,
                userMessage: UserMessage(text: "Hello"),
                responseParts: [],
                usage: nil
            ),
            steeringMessage: steeringMessage,
            queuedMessages: queuedMessages,
            customizations: customizations
        )
    }

    /// Starts a tool call in streaming state.
    private func startToolCall(_ state: SessionState, toolCallId: String? = nil) -> SessionState {
        let tcId = toolCallId ?? TC
        return sessionReducer(
            state: state,
            action: .sessionToolCallStart(SessionToolCallStartAction(
                session: S, turnId: T, toolCallId: tcId,
                type: .sessionToolCallStart,
                toolName: "bash", displayName: "Run Command"
            ))
        )
    }

    /// Advances a streaming tool call to running (auto-confirmed).
    private func readyToolCallAutoConfirm(_ state: SessionState, toolCallId: String? = nil) -> SessionState {
        let tcId = toolCallId ?? TC
        return sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: tcId,
                type: .sessionToolCallReady,
                invocationMessage: .string("Run"),
                confirmed: .notNeeded
            ))
        )
    }

    /// Gets tool call parts from response parts.
    private func getToolCallParts(_ state: SessionState) -> [ToolCallResponsePart] {
        guard let parts = state.activeTurn?.responseParts else { return [] }
        return parts.compactMap { part in
            if case .toolCall(let tcPart) = part { return tcPart }
            return nil
        }
    }

    /// Gets a tool call part by toolCallId.
    private func getToolCallPart(_ state: SessionState, toolCallId: String? = nil) -> ToolCallResponsePart? {
        let tcId = toolCallId ?? TC
        return getToolCallParts(state).first { part in
            toolCallIdOf(part.toolCall) == tcId
        }
    }

    /// Extracts the toolCallId from any ToolCallState variant.
    private func toolCallIdOf(_ tc: ToolCallState) -> String {
        switch tc {
        case .streaming(let s): return s.toolCallId
        case .pendingConfirmation(let s): return s.toolCallId
        case .running(let s): return s.toolCallId
        case .pendingResultConfirmation(let s): return s.toolCallId
        case .completed(let s): return s.toolCallId
        case .cancelled(let s): return s.toolCallId
        }
    }

    /// Gets the status from any ToolCallState variant.
    private func statusOf(_ tc: ToolCallState) -> ToolCallStatus {
        switch tc {
        case .streaming(let s): return s.status
        case .pendingConfirmation(let s): return s.status
        case .running(let s): return s.status
        case .pendingResultConfirmation(let s): return s.status
        case .completed(let s): return s.status
        case .cancelled(let s): return s.status
        }
    }

    /// Gets markdown text from response parts.
    private func getMarkdownText(_ state: SessionState) -> String {
        guard let parts = state.activeTurn?.responseParts else { return "" }
        return parts.compactMap { part in
            if case .markdown(let md) = part { return md.content }
            return nil
        }.joined()
    }

    /// Creates a markdown response part and returns updated state.
    private func createMarkdownPart(_ state: SessionState, partId: String, turnId: String? = nil) -> SessionState {
        let tid = turnId ?? T
        return sessionReducer(
            state: state,
            action: .sessionResponsePart(SessionResponsePartAction(
                type: .sessionResponsePart, session: S, turnId: tid,
                part: .markdown(MarkdownResponsePart(kind: .markdown, id: partId, content: ""))
            ))
        )
    }

    /// Creates a reasoning response part and returns updated state.
    private func createReasoningPart(_ state: SessionState, partId: String, turnId: String? = nil) -> SessionState {
        let tid = turnId ?? T
        return sessionReducer(
            state: state,
            action: .sessionResponsePart(SessionResponsePartAction(
                type: .sessionResponsePart, session: S, turnId: tid,
                part: .reasoning(ReasoningResponsePart(kind: .reasoning, id: partId, content: ""))
            ))
        )
    }

    /// Gets tool call parts from a completed turn's response parts.
    private func getTurnToolCallParts(_ turn: Turn) -> [ToolCallResponsePart] {
        turn.responseParts.compactMap { part in
            if case .toolCall(let tcPart) = part { return tcPart }
            return nil
        }
    }

    // MARK: - Root Reducer Tests

    func testRootAgentsChanged() {
        let state = makeRootState()
        let agents = [AgentInfo(provider: "copilot", displayName: "Copilot", description: "AI", models: [])]
        let next = rootReducer(
            state: state,
            action: .rootAgentsChanged(RootAgentsChangedAction(type: .rootAgentsChanged, agents: agents))
        )
        XCTAssertEqual(next.agents.count, 1)
        XCTAssertEqual(next.agents[0].provider, "copilot")
    }

    func testRootActiveSessionsChanged() {
        let state = makeRootState()
        let next = rootReducer(
            state: state,
            action: .rootActiveSessionsChanged(RootActiveSessionsChangedAction(type: .rootActiveSessionsChanged, activeSessions: 5))
        )
        XCTAssertEqual(next.activeSessions, 5)
    }

    func testRootReducerDoesNotMutateOriginalState() {
        let state = makeRootState(agents: [])
        let agents = [AgentInfo(provider: "x", displayName: "X", description: "x", models: [])]
        let _ = rootReducer(
            state: state,
            action: .rootAgentsChanged(RootAgentsChangedAction(type: .rootAgentsChanged, agents: agents))
        )
        XCTAssertEqual(state.agents.count, 0)
    }

    // MARK: - Session Reducer: Lifecycle Tests

    func testSessionReady() {
        let state = makeSessionState()
        let next = sessionReducer(
            state: state,
            action: .sessionReady(SessionReadyAction(type: .sessionReady, session: S))
        )
        XCTAssertEqual(next.lifecycle, .ready)
        XCTAssertEqual(next.summary.status, .idle)
    }

    func testSessionCreationFailed() {
        let state = makeSessionState()
        let error = ErrorInfo(errorType: "init", message: "Failed to start")
        let next = sessionReducer(
            state: state,
            action: .sessionCreationFailed(SessionCreationFailedAction(type: .sessionCreationFailed, session: S, error: error))
        )
        XCTAssertEqual(next.lifecycle, .creationFailed)
        XCTAssertEqual(next.creationError?.errorType, "init")
        XCTAssertEqual(next.creationError?.message, "Failed to start")
    }

    // MARK: - Session Reducer: Turn Lifecycle Tests

    func testTurnStarted() {
        let state = makeSessionState(lifecycle: .ready)
        let next = sessionReducer(
            state: state,
            action: .sessionTurnStarted(SessionTurnStartedAction(
                type: .sessionTurnStarted, session: S, turnId: T,
                userMessage: UserMessage(text: "Hello")
            ))
        )
        XCTAssertEqual(next.summary.status, .inProgress)
        XCTAssertNotNil(next.activeTurn)
        XCTAssertEqual(next.activeTurn?.id, T)
        XCTAssertEqual(next.activeTurn?.userMessage.text, "Hello")
        XCTAssertEqual(next.activeTurn?.responseParts.count, 0)
    }

    func testTurnStartedWithQueuedMessageIdRemovesFromQueue() {
        let state = makeSessionState(
            lifecycle: .ready,
            queuedMessages: [
                PendingMessage(id: "q-1", userMessage: UserMessage(text: "First")),
                PendingMessage(id: "q-2", userMessage: UserMessage(text: "Second")),
            ]
        )
        let next = sessionReducer(
            state: state,
            action: .sessionTurnStarted(SessionTurnStartedAction(
                type: .sessionTurnStarted, session: S, turnId: T,
                userMessage: UserMessage(text: "First"),
                queuedMessageId: "q-1"
            ))
        )
        XCTAssertEqual(next.queuedMessages?.count, 1)
        XCTAssertEqual(next.queuedMessages?[0].id, "q-2")
    }

    func testTurnStartedRemovesLastQueuedMessageSetsNil() {
        let state = makeSessionState(
            lifecycle: .ready,
            queuedMessages: [PendingMessage(id: "q-1", userMessage: UserMessage(text: "Only"))]
        )
        let next = sessionReducer(
            state: state,
            action: .sessionTurnStarted(SessionTurnStartedAction(
                type: .sessionTurnStarted, session: S, turnId: T,
                userMessage: UserMessage(text: "Only"),
                queuedMessageId: "q-1"
            ))
        )
        XCTAssertNil(next.queuedMessages)
    }

    func testTurnStartedRemovesMatchingSteeringMessage() {
        let state = makeSessionState(
            lifecycle: .ready,
            steeringMessage: PendingMessage(id: "s-1", userMessage: UserMessage(text: "Steer"))
        )
        let next = sessionReducer(
            state: state,
            action: .sessionTurnStarted(SessionTurnStartedAction(
                type: .sessionTurnStarted, session: S, turnId: T,
                userMessage: UserMessage(text: "Steer"),
                queuedMessageId: "s-1"
            ))
        )
        XCTAssertNil(next.steeringMessage)
    }

    func testTurnStartedWithoutQueuedMessageIdDoesNotTouchPending() {
        let state = makeSessionState(
            lifecycle: .ready,
            steeringMessage: PendingMessage(id: "s-1", userMessage: UserMessage(text: "Steer")),
            queuedMessages: [PendingMessage(id: "q-1", userMessage: UserMessage(text: "Queued"))]
        )
        let next = sessionReducer(
            state: state,
            action: .sessionTurnStarted(SessionTurnStartedAction(
                type: .sessionTurnStarted, session: S, turnId: T,
                userMessage: UserMessage(text: "Hello")
            ))
        )
        XCTAssertEqual(next.steeringMessage?.id, "s-1")
        XCTAssertEqual(next.queuedMessages?.count, 1)
    }

    func testSessionDelta() {
        var state = createMarkdownPart(makeSessionStateWithActiveTurn(), partId: "md-1")
        state = sessionReducer(
            state: state,
            action: .sessionDelta(SessionDeltaAction(type: .sessionDelta, session: S, turnId: T, partId: "md-1", content: "Hello "))
        )
        state = sessionReducer(
            state: state,
            action: .sessionDelta(SessionDeltaAction(type: .sessionDelta, session: S, turnId: T, partId: "md-1", content: "world"))
        )
        XCTAssertEqual(getMarkdownText(state), "Hello world")
    }

    func testSessionDeltaIgnoresWrongTurnId() {
        let state = createMarkdownPart(makeSessionStateWithActiveTurn(), partId: "md-1")
        let next = sessionReducer(
            state: state,
            action: .sessionDelta(SessionDeltaAction(type: .sessionDelta, session: S, turnId: "wrong-turn", partId: "md-1", content: "orphan"))
        )
        XCTAssertEqual(getMarkdownText(next), "")
    }

    func testSessionDeltaIgnoresWithoutActiveTurn() {
        let state = makeSessionState()
        let next = sessionReducer(
            state: state,
            action: .sessionDelta(SessionDeltaAction(type: .sessionDelta, session: S, turnId: T, partId: "md-1", content: "orphan"))
        )
        XCTAssertNil(next.activeTurn)
    }

    func testSessionResponsePart() {
        let state = makeSessionStateWithActiveTurn()
        let next = sessionReducer(
            state: state,
            action: .sessionResponsePart(SessionResponsePartAction(
                type: .sessionResponsePart, session: S, turnId: T,
                part: .markdown(MarkdownResponsePart(kind: .markdown, id: "md-1", content: "# Title"))
            ))
        )
        XCTAssertEqual(next.activeTurn?.responseParts.count, 1)
    }

    func testTurnCompleteFinalizesTournComplete() {
        var s = createMarkdownPart(makeSessionStateWithActiveTurn(), partId: "md-1")
        s = sessionReducer(
            state: s,
            action: .sessionDelta(SessionDeltaAction(type: .sessionDelta, session: S, turnId: T, partId: "md-1", content: "Response text"))
        )
        s = sessionReducer(
            state: s,
            action: .sessionTurnComplete(SessionTurnCompleteAction(type: .sessionTurnComplete, session: S, turnId: T))
        )
        XCTAssertNil(s.activeTurn)
        XCTAssertEqual(s.turns.count, 1)
        XCTAssertEqual(s.turns[0].id, T)
        XCTAssertEqual(s.turns[0].state, .complete)
        XCTAssertEqual(s.summary.status, .idle)

        // Check markdown content
        let mdParts = s.turns[0].responseParts.compactMap { part -> String? in
            if case .markdown(let md) = part { return md.content }
            return nil
        }
        XCTAssertEqual(mdParts.count, 1)
        XCTAssertEqual(mdParts[0], "Response text")
    }

    func testTurnCancelled() {
        let state = makeSessionStateWithActiveTurn()
        let next = sessionReducer(
            state: state,
            action: .sessionTurnCancelled(SessionTurnCancelledAction(type: .sessionTurnCancelled, session: S, turnId: T))
        )
        XCTAssertNil(next.activeTurn)
        XCTAssertEqual(next.turns.count, 1)
        XCTAssertEqual(next.turns[0].state, .cancelled)
        XCTAssertEqual(next.summary.status, .idle)
    }

    func testSessionError() {
        let state = makeSessionStateWithActiveTurn()
        let error = ErrorInfo(errorType: "runtime", message: "Something broke")
        let next = sessionReducer(
            state: state,
            action: .sessionError(SessionErrorAction(type: .sessionError, session: S, turnId: T, error: error))
        )
        XCTAssertNil(next.activeTurn)
        XCTAssertEqual(next.turns.count, 1)
        XCTAssertEqual(next.turns[0].state, .error)
        XCTAssertEqual(next.turns[0].error?.errorType, "runtime")
        XCTAssertEqual(next.summary.status, .error)
    }

    func testForceCancelsInProgressToolCallsOnTurnCompletion() {
        let state = startToolCall(makeSessionStateWithActiveTurn())
        let next = sessionReducer(
            state: state,
            action: .sessionTurnComplete(SessionTurnCompleteAction(type: .sessionTurnComplete, session: S, turnId: T))
        )
        let tcParts = getTurnToolCallParts(next.turns[0])
        XCTAssertEqual(tcParts.count, 1)
        if case .cancelled(let cancelled) = tcParts[0].toolCall {
            XCTAssertEqual(cancelled.reason, .skipped)
        } else {
            XCTFail("Expected cancelled tool call")
        }
    }

    func testIgnoresTurnCompletionWithWrongTurnId() {
        let state = makeSessionStateWithActiveTurn()
        let next = sessionReducer(
            state: state,
            action: .sessionTurnComplete(SessionTurnCompleteAction(type: .sessionTurnComplete, session: S, turnId: "wrong-turn"))
        )
        XCTAssertNotNil(next.activeTurn)
    }

    // MARK: - Session Reducer: Tool Call State Machine Tests

    func testFullToolCallLifecycle() {
        var state = startToolCall(makeSessionStateWithActiveTurn())
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .streaming)

        // Delta
        state = sessionReducer(
            state: state,
            action: .sessionToolCallDelta(SessionToolCallDeltaAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallDelta,
                content: "ls -la",
                invocationMessage: .string("Listing files")
            ))
        )
        if case .streaming(let streaming) = getToolCallPart(state)!.toolCall {
            XCTAssertEqual(streaming.partialInput, "ls -la")
            XCTAssertEqual(streaming.invocationMessage, .string("Listing files"))
        } else {
            XCTFail("Expected streaming state")
        }

        // Ready (no auto-confirm → pending confirmation)
        state = sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallReady,
                invocationMessage: .string("Run: ls -la"),
                toolInput: "ls -la"
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .pendingConfirmation)

        // Confirmed (approved)
        state = sessionReducer(
            state: state,
            action: .sessionToolCallConfirmed(SessionToolCallConfirmedAction(
                session: S, turnId: T, toolCallId: TC,
                approved: true, confirmed: .userAction
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .running)

        // Complete
        state = sessionReducer(
            state: state,
            action: .sessionToolCallComplete(SessionToolCallCompleteAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallComplete,
                result: ToolCallResult(success: true, pastTenseMessage: .string("Ran command"))
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .completed)
    }

    func testToolCallReadyAutoConfirm() {
        let state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()))
        let tc = getToolCallPart(state)!.toolCall
        XCTAssertEqual(statusOf(tc), .running)
        if case .running(let r) = tc {
            XCTAssertEqual(r.confirmed, .notNeeded)
        }
    }

    func testToolCallDenied() {
        var state = startToolCall(makeSessionStateWithActiveTurn())
        state = sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallReady,
                invocationMessage: .string("Run: rm -rf /")
            ))
        )
        state = sessionReducer(
            state: state,
            action: .sessionToolCallConfirmed(SessionToolCallConfirmedAction(
                session: S, turnId: T, toolCallId: TC,
                approved: false, reason: .denied
            ))
        )
        let tc = getToolCallPart(state)!.toolCall
        XCTAssertEqual(statusOf(tc), .cancelled)
        if case .cancelled(let c) = tc {
            XCTAssertEqual(c.reason, .denied)
        }
    }

    func testToolCallCompleteWithResultConfirmation() {
        var state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()))
        state = sessionReducer(
            state: state,
            action: .sessionToolCallComplete(SessionToolCallCompleteAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallComplete,
                result: ToolCallResult(success: true, pastTenseMessage: .string("Done")),
                requiresResultConfirmation: true
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .pendingResultConfirmation)

        state = sessionReducer(
            state: state,
            action: .sessionToolCallResultConfirmed(SessionToolCallResultConfirmedAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallResultConfirmed, approved: true
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .completed)
    }

    func testToolCallResultDenied() {
        var state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()))
        state = sessionReducer(
            state: state,
            action: .sessionToolCallComplete(SessionToolCallCompleteAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallComplete,
                result: ToolCallResult(success: true, pastTenseMessage: .string("Done")),
                requiresResultConfirmation: true
            ))
        )
        state = sessionReducer(
            state: state,
            action: .sessionToolCallResultConfirmed(SessionToolCallResultConfirmedAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallResultConfirmed, approved: false
            ))
        )
        let tc = getToolCallPart(state)!.toolCall
        XCTAssertEqual(statusOf(tc), .cancelled)
        if case .cancelled(let c) = tc {
            XCTAssertEqual(c.reason, .resultDenied)
        }
    }

    func testToolCallCompleteFromPendingConfirmation() {
        var state = startToolCall(makeSessionStateWithActiveTurn())
        state = sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallReady,
                invocationMessage: .string("Run")
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .pendingConfirmation)

        state = sessionReducer(
            state: state,
            action: .sessionToolCallComplete(SessionToolCallCompleteAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallComplete,
                result: ToolCallResult(success: true, pastTenseMessage: .string("Done"))
            ))
        )
        let tc = getToolCallPart(state)!.toolCall
        XCTAssertEqual(statusOf(tc), .completed)
        if case .completed(let c) = tc {
            XCTAssertEqual(c.confirmed, .notNeeded)
        }
    }

    func testIgnoresToolCallActionsForUnknownId() {
        let state = makeSessionStateWithActiveTurn()
        let next = sessionReducer(
            state: state,
            action: .sessionToolCallDelta(SessionToolCallDeltaAction(
                session: S, turnId: T, toolCallId: "nonexistent",
                type: .sessionToolCallDelta, content: "data"
            ))
        )
        XCTAssertEqual(next.activeTurn?.responseParts.count, 0)
    }

    // MARK: - Running Tool Re-confirmation Tests

    func testToolCallReadyTransitionsRunningToPendingConfirmation() {
        var state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()))
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .running)

        state = sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: TC,
                meta: ["permissionKind": AnyCodable("shell"), "fullCommandText": AnyCodable("rm -rf /tmp/test")],
                type: .sessionToolCallReady,
                invocationMessage: .string("Run: rm -rf /tmp/test")
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .pendingConfirmation)

        if case .pendingConfirmation(let pc) = getToolCallPart(state)!.toolCall {
            XCTAssertEqual(pc.invocationMessage, .string("Run: rm -rf /tmp/test"))
        }
    }

    func testToolCallReconfirmationApproved() {
        var state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()))
        state = sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallReady,
                invocationMessage: .string("Permission needed")
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .pendingConfirmation)

        state = sessionReducer(
            state: state,
            action: .sessionToolCallConfirmed(SessionToolCallConfirmedAction(
                session: S, turnId: T, toolCallId: TC,
                approved: true, confirmed: .userAction
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .running)
    }

    func testToolCallReconfirmationDenied() {
        var state = readyToolCallAutoConfirm(startToolCall(makeSessionStateWithActiveTurn()))
        state = sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallReady,
                invocationMessage: .string("Permission needed")
            ))
        )
        state = sessionReducer(
            state: state,
            action: .sessionToolCallConfirmed(SessionToolCallConfirmedAction(
                session: S, turnId: T, toolCallId: TC,
                approved: false, reason: .denied
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .cancelled)
    }

    func testToolCallReadyIgnoresNonStreamingNonRunning() {
        var state = startToolCall(makeSessionStateWithActiveTurn())
        // Move to pending-confirmation
        state = sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallReady,
                invocationMessage: .string("Run")
            ))
        )
        XCTAssertEqual(statusOf(getToolCallPart(state)!.toolCall), .pendingConfirmation)

        // Sending toolCallReady again while pending-confirmation should be ignored
        let next = sessionReducer(
            state: state,
            action: .sessionToolCallReady(SessionToolCallReadyAction(
                session: S, turnId: T, toolCallId: TC,
                type: .sessionToolCallReady,
                invocationMessage: .string("Run again")
            ))
        )
        // Verify it was not changed (still pending-confirmation with the original message)
        if case .pendingConfirmation(let pc) = getToolCallPart(next)!.toolCall {
            XCTAssertEqual(pc.invocationMessage, .string("Run"))
        } else {
            XCTFail("Expected pending confirmation")
        }
    }

    // MARK: - Session Reducer: Metadata Tests

    func testTitleChanged() {
        let state = makeSessionState()
        let next = sessionReducer(
            state: state,
            action: .sessionTitleChanged(SessionTitleChangedAction(type: .sessionTitleChanged, session: S, title: "New Title"))
        )
        XCTAssertEqual(next.summary.title, "New Title")
        XCTAssertGreaterThan(next.summary.modifiedAt, state.summary.modifiedAt)
    }

    func testUsage() {
        let state = makeSessionStateWithActiveTurn()
        let usage = UsageInfo(inputTokens: 100, outputTokens: 50)
        let next = sessionReducer(
            state: state,
            action: .sessionUsage(SessionUsageAction(type: .sessionUsage, session: S, turnId: T, usage: usage))
        )
        XCTAssertEqual(next.activeTurn?.usage?.inputTokens, 100)
        XCTAssertEqual(next.activeTurn?.usage?.outputTokens, 50)
    }

    func testReasoning() {
        var state = createReasoningPart(makeSessionStateWithActiveTurn(), partId: "r-1")
        state = sessionReducer(
            state: state,
            action: .sessionReasoning(SessionReasoningAction(type: .sessionReasoning, session: S, turnId: T, partId: "r-1", content: "Thinking about "))
        )
        state = sessionReducer(
            state: state,
            action: .sessionReasoning(SessionReasoningAction(type: .sessionReasoning, session: S, turnId: T, partId: "r-1", content: "the answer"))
        )
        let reasoningParts = state.activeTurn!.responseParts.compactMap { part -> String? in
            if case .reasoning(let r) = part { return r.content }
            return nil
        }
        XCTAssertEqual(reasoningParts.count, 1)
        XCTAssertEqual(reasoningParts[0], "Thinking about the answer")
    }

    func testModelChanged() {
        let state = makeSessionState()
        let next = sessionReducer(
            state: state,
            action: .sessionModelChanged(SessionModelChangedAction(type: .sessionModelChanged, session: S, model: "gpt-4"))
        )
        XCTAssertEqual(next.summary.model, "gpt-4")
        XCTAssertGreaterThan(next.summary.modifiedAt, state.summary.modifiedAt)
    }

    func testServerToolsChanged() {
        let state = makeSessionState()
        let tools = [ToolDefinition(name: "bash", description: "Run shell commands")]
        let next = sessionReducer(
            state: state,
            action: .sessionServerToolsChanged(SessionServerToolsChangedAction(type: .sessionServerToolsChanged, session: S, tools: tools))
        )
        XCTAssertEqual(next.serverTools?.count, 1)
        XCTAssertEqual(next.serverTools?[0].name, "bash")
    }

    func testActiveClientChanged() {
        let state = makeSessionState()
        let client = SessionActiveClient(clientId: "vscode-1", displayName: "VS Code", tools: [])
        let next = sessionReducer(
            state: state,
            action: .sessionActiveClientChanged(SessionActiveClientChangedAction(type: .sessionActiveClientChanged, session: S, activeClient: client))
        )
        XCTAssertEqual(next.activeClient?.clientId, "vscode-1")
    }

    func testActiveClientUnset() {
        let state = makeSessionState(activeClient: SessionActiveClient(clientId: "vscode-1", tools: []))
        let next = sessionReducer(
            state: state,
            action: .sessionActiveClientChanged(SessionActiveClientChangedAction(type: .sessionActiveClientChanged, session: S, activeClient: nil))
        )
        XCTAssertNil(next.activeClient)
    }

    func testActiveClientToolsChanged() {
        let state = makeSessionState(activeClient: SessionActiveClient(clientId: "vscode-1", tools: []))
        let tools = [ToolDefinition(name: "openFile", description: "Open a file")]
        let next = sessionReducer(
            state: state,
            action: .sessionActiveClientToolsChanged(SessionActiveClientToolsChangedAction(type: .sessionActiveClientToolsChanged, session: S, tools: tools))
        )
        XCTAssertEqual(next.activeClient?.tools.count, 1)
        XCTAssertEqual(next.activeClient?.tools[0].name, "openFile")
    }

    func testActiveClientToolsChangedIgnoresWithoutClient() {
        let state = makeSessionState()
        let next = sessionReducer(
            state: state,
            action: .sessionActiveClientToolsChanged(SessionActiveClientToolsChangedAction(type: .sessionActiveClientToolsChanged, session: S, tools: [ToolDefinition(name: "openFile")]))
        )
        XCTAssertNil(next.activeClient)
    }

    // MARK: - Dispatch Validation Tests

    func testClientDispatchableReturnsTrue() {
        let action: StateAction = .sessionTurnStarted(SessionTurnStartedAction(
            type: .sessionTurnStarted, session: S, turnId: T, userMessage: UserMessage(text: "Hello")
        ))
        XCTAssertTrue(isClientDispatchable(action))
    }

    func testClientDispatchableReturnsFalse() {
        let action: StateAction = .sessionReady(SessionReadyAction(type: .sessionReady, session: S))
        XCTAssertFalse(isClientDispatchable(action))
    }

    // MARK: - Full Turn Flow Integration Test

    func testFullTurnFlow() {
        var state = makeSessionState(lifecycle: .ready)

        // Turn started
        state = sessionReducer(state: state, action: .sessionTurnStarted(SessionTurnStartedAction(
            type: .sessionTurnStarted, session: "s", turnId: "t1", userMessage: UserMessage(text: "Fix the bug")
        )))

        // Create markdown part, then stream delta
        state = sessionReducer(state: state, action: .sessionResponsePart(SessionResponsePartAction(
            type: .sessionResponsePart, session: "s", turnId: "t1",
            part: .markdown(MarkdownResponsePart(kind: .markdown, id: "md-1", content: ""))
        )))
        state = sessionReducer(state: state, action: .sessionDelta(SessionDeltaAction(
            type: .sessionDelta, session: "s", turnId: "t1", partId: "md-1", content: "I will "
        )))
        state = sessionReducer(state: state, action: .sessionDelta(SessionDeltaAction(
            type: .sessionDelta, session: "s", turnId: "t1", partId: "md-1", content: "fix it."
        )))

        // Tool call 1: auto-confirmed
        state = sessionReducer(state: state, action: .sessionToolCallStart(SessionToolCallStartAction(
            session: "s", turnId: "t1", toolCallId: "tc1",
            type: .sessionToolCallStart, toolName: "edit", displayName: "Edit File"
        )))
        state = sessionReducer(state: state, action: .sessionToolCallReady(SessionToolCallReadyAction(
            session: "s", turnId: "t1", toolCallId: "tc1",
            type: .sessionToolCallReady,
            invocationMessage: .string("Edit main.ts"), confirmed: .notNeeded
        )))
        state = sessionReducer(state: state, action: .sessionToolCallComplete(SessionToolCallCompleteAction(
            session: "s", turnId: "t1", toolCallId: "tc1",
            type: .sessionToolCallComplete,
            result: ToolCallResult(success: true, pastTenseMessage: .string("Edited main.ts"))
        )))

        // Tool call 2: with re-confirmation
        state = sessionReducer(state: state, action: .sessionToolCallStart(SessionToolCallStartAction(
            session: "s", turnId: "t1", toolCallId: "tc2",
            type: .sessionToolCallStart, toolName: "write", displayName: "Write File"
        )))
        state = sessionReducer(state: state, action: .sessionToolCallReady(SessionToolCallReadyAction(
            session: "s", turnId: "t1", toolCallId: "tc2",
            type: .sessionToolCallReady,
            invocationMessage: .string("Write /tmp/out"), confirmed: .notNeeded
        )))
        // Re-confirmation
        state = sessionReducer(state: state, action: .sessionToolCallReady(SessionToolCallReadyAction(
            session: "s", turnId: "t1", toolCallId: "tc2",
            meta: ["permissionKind": AnyCodable("write"), "path": AnyCodable("/tmp/out")],
            type: .sessionToolCallReady,
            invocationMessage: .string("Write to /tmp/out")
        )))
        state = sessionReducer(state: state, action: .sessionToolCallConfirmed(SessionToolCallConfirmedAction(
            session: "s", turnId: "t1", toolCallId: "tc2",
            approved: true, confirmed: .userAction
        )))
        state = sessionReducer(state: state, action: .sessionToolCallComplete(SessionToolCallCompleteAction(
            session: "s", turnId: "t1", toolCallId: "tc2",
            type: .sessionToolCallComplete,
            result: ToolCallResult(success: true, pastTenseMessage: .string("Wrote file"))
        )))

        // Usage + reasoning
        state = sessionReducer(state: state, action: .sessionUsage(SessionUsageAction(
            type: .sessionUsage, session: "s", turnId: "t1",
            usage: UsageInfo(inputTokens: 200, outputTokens: 100)
        )))
        state = sessionReducer(state: state, action: .sessionResponsePart(SessionResponsePartAction(
            type: .sessionResponsePart, session: "s", turnId: "t1",
            part: .reasoning(ReasoningResponsePart(kind: .reasoning, id: "r-1", content: ""))
        )))
        state = sessionReducer(state: state, action: .sessionReasoning(SessionReasoningAction(
            type: .sessionReasoning, session: "s", turnId: "t1", partId: "r-1", content: "The bug was in line 42"
        )))

        // Another markdown
        state = sessionReducer(state: state, action: .sessionResponsePart(SessionResponsePartAction(
            type: .sessionResponsePart, session: "s", turnId: "t1",
            part: .markdown(MarkdownResponsePart(kind: .markdown, id: "md-2", content: "## Fix applied"))
        )))

        // Turn complete
        state = sessionReducer(state: state, action: .sessionTurnComplete(SessionTurnCompleteAction(
            type: .sessionTurnComplete, session: "s", turnId: "t1"
        )))

        // Verify final state
        XCTAssertNil(state.activeTurn)
        XCTAssertEqual(state.turns.count, 1)
        let turn = state.turns[0]
        XCTAssertEqual(turn.id, "t1")
        XCTAssertEqual(turn.state, .complete)

        let mdParts = turn.responseParts.compactMap { p -> String? in
            if case .markdown(let md) = p { return md.content }
            return nil
        }
        XCTAssertEqual(mdParts.count, 2)
        XCTAssertEqual(mdParts[0], "I will fix it.")

        let tcParts = getTurnToolCallParts(turn)
        XCTAssertEqual(tcParts.count, 2)
        XCTAssertEqual(statusOf(tcParts[0].toolCall), .completed)
        XCTAssertEqual(statusOf(tcParts[1].toolCall), .completed)

        let rParts = turn.responseParts.compactMap { p -> String? in
            if case .reasoning(let r) = p { return r.content }
            return nil
        }
        XCTAssertEqual(rParts.count, 1)
        XCTAssertEqual(rParts[0], "The bug was in line 42")

        XCTAssertEqual(turn.usage?.inputTokens, 200)
        XCTAssertEqual(turn.usage?.outputTokens, 100)
        XCTAssertEqual(state.summary.status, .idle)
    }

    // MARK: - Pending Message Tests

    func testSetSteeringMessage() {
        let state = makeSessionState()
        let result = sessionReducer(state: state, action: .sessionPendingMessageSet(SessionPendingMessageSetAction(
            type: .sessionPendingMessageSet, session: S, kind: .steering, id: "sm-1",
            userMessage: UserMessage(text: "Focus on tests")
        )))
        XCTAssertEqual(result.steeringMessage?.id, "sm-1")
        XCTAssertEqual(result.steeringMessage?.userMessage.text, "Focus on tests")
    }

    func testReplaceExistingSteeringMessage() {
        let state = makeSessionState(steeringMessage: PendingMessage(id: "sm-1", userMessage: UserMessage(text: "Old")))
        let result = sessionReducer(state: state, action: .sessionPendingMessageSet(SessionPendingMessageSetAction(
            type: .sessionPendingMessageSet, session: S, kind: .steering, id: "sm-2",
            userMessage: UserMessage(text: "New")
        )))
        XCTAssertEqual(result.steeringMessage?.id, "sm-2")
        XCTAssertEqual(result.steeringMessage?.userMessage.text, "New")
    }

    func testRemoveSteeringMessage() {
        let state = makeSessionState(steeringMessage: PendingMessage(id: "sm-1", userMessage: UserMessage(text: "Steer")))
        let result = sessionReducer(state: state, action: .sessionPendingMessageRemoved(SessionPendingMessageRemovedAction(
            type: .sessionPendingMessageRemoved, session: S, kind: .steering, id: "sm-1"
        )))
        XCTAssertNil(result.steeringMessage)
    }

    func testRemoveSteeringMessageNoOpForMismatchedId() {
        let state = makeSessionState(steeringMessage: PendingMessage(id: "sm-1", userMessage: UserMessage(text: "Hello")))
        let result = sessionReducer(state: state, action: .sessionPendingMessageRemoved(SessionPendingMessageRemovedAction(
            type: .sessionPendingMessageRemoved, session: S, kind: .steering, id: "sm-unknown"
        )))
        XCTAssertEqual(result.steeringMessage?.id, "sm-1")
    }

    func testSetNewQueuedMessage() {
        let state = makeSessionState()
        let result = sessionReducer(state: state, action: .sessionPendingMessageSet(SessionPendingMessageSetAction(
            type: .sessionPendingMessageSet, session: S, kind: .queued, id: "pm-1",
            userMessage: UserMessage(text: "Do something")
        )))
        XCTAssertEqual(result.queuedMessages?.count, 1)
        XCTAssertEqual(result.queuedMessages?[0].id, "pm-1")
    }

    func testAppendQueuedMessage() {
        let state = makeSessionState(queuedMessages: [PendingMessage(id: "pm-1", userMessage: UserMessage(text: "First"))])
        let result = sessionReducer(state: state, action: .sessionPendingMessageSet(SessionPendingMessageSetAction(
            type: .sessionPendingMessageSet, session: S, kind: .queued, id: "pm-2",
            userMessage: UserMessage(text: "Second")
        )))
        XCTAssertEqual(result.queuedMessages?.count, 2)
        XCTAssertEqual(result.queuedMessages?[1].id, "pm-2")
    }

    func testUpdateQueuedMessageInPlace() {
        let state = makeSessionState(queuedMessages: [
            PendingMessage(id: "pm-1", userMessage: UserMessage(text: "First")),
            PendingMessage(id: "pm-2", userMessage: UserMessage(text: "Second")),
        ])
        let result = sessionReducer(state: state, action: .sessionPendingMessageSet(SessionPendingMessageSetAction(
            type: .sessionPendingMessageSet, session: S, kind: .queued, id: "pm-1",
            userMessage: UserMessage(text: "Updated first")
        )))
        XCTAssertEqual(result.queuedMessages?.count, 2)
        XCTAssertEqual(result.queuedMessages?[0].userMessage.text, "Updated first")
        XCTAssertEqual(result.queuedMessages?[1].id, "pm-2")
    }

    func testRemoveQueuedMessage() {
        let state = makeSessionState(queuedMessages: [
            PendingMessage(id: "pm-1", userMessage: UserMessage(text: "First")),
            PendingMessage(id: "pm-2", userMessage: UserMessage(text: "Second")),
        ])
        let result = sessionReducer(state: state, action: .sessionPendingMessageRemoved(SessionPendingMessageRemovedAction(
            type: .sessionPendingMessageRemoved, session: S, kind: .queued, id: "pm-1"
        )))
        XCTAssertEqual(result.queuedMessages?.count, 1)
        XCTAssertEqual(result.queuedMessages?[0].id, "pm-2")
    }

    func testRemoveLastQueuedMessageSetsNil() {
        let state = makeSessionState(queuedMessages: [PendingMessage(id: "pm-1", userMessage: UserMessage(text: "Only one"))])
        let result = sessionReducer(state: state, action: .sessionPendingMessageRemoved(SessionPendingMessageRemovedAction(
            type: .sessionPendingMessageRemoved, session: S, kind: .queued, id: "pm-1"
        )))
        XCTAssertNil(result.queuedMessages)
    }

    func testRemoveQueuedMessageNoOpForUnknownId() {
        let state = makeSessionState(queuedMessages: [PendingMessage(id: "pm-1", userMessage: UserMessage(text: "Hello"))])
        let result = sessionReducer(state: state, action: .sessionPendingMessageRemoved(SessionPendingMessageRemovedAction(
            type: .sessionPendingMessageRemoved, session: S, kind: .queued, id: "pm-unknown"
        )))
        XCTAssertEqual(result.queuedMessages?.count, 1)
    }

    func testSteeringAndQueuedAreIndependent() {
        var state = makeSessionState()
        state = sessionReducer(state: state, action: .sessionPendingMessageSet(SessionPendingMessageSetAction(
            type: .sessionPendingMessageSet, session: S, kind: .steering, id: "s-1",
            userMessage: UserMessage(text: "Steer")
        )))
        state = sessionReducer(state: state, action: .sessionPendingMessageSet(SessionPendingMessageSetAction(
            type: .sessionPendingMessageSet, session: S, kind: .queued, id: "q-1",
            userMessage: UserMessage(text: "Queue")
        )))
        XCTAssertEqual(state.steeringMessage?.userMessage.text, "Steer")
        XCTAssertEqual(state.queuedMessages?.count, 1)
        XCTAssertEqual(state.queuedMessages?[0].userMessage.text, "Queue")
    }

    // MARK: - Queued Messages Reorder Tests

    func testReorderQueuedMessages() {
        let state = makeSessionState(queuedMessages: [
            PendingMessage(id: "a", userMessage: UserMessage(text: "A")),
            PendingMessage(id: "b", userMessage: UserMessage(text: "B")),
            PendingMessage(id: "c", userMessage: UserMessage(text: "C")),
        ])
        let result = sessionReducer(state: state, action: .sessionQueuedMessagesReordered(SessionQueuedMessagesReorderedAction(
            type: .sessionQueuedMessagesReordered, session: S, order: ["c", "a", "b"]
        )))
        XCTAssertEqual(result.queuedMessages?.count, 3)
        XCTAssertEqual(result.queuedMessages?[0].id, "c")
        XCTAssertEqual(result.queuedMessages?[1].id, "a")
        XCTAssertEqual(result.queuedMessages?[2].id, "b")
    }

    func testReorderKeepsUnmentionedAtEnd() {
        let state = makeSessionState(queuedMessages: [
            PendingMessage(id: "a", userMessage: UserMessage(text: "A")),
            PendingMessage(id: "b", userMessage: UserMessage(text: "B")),
            PendingMessage(id: "c", userMessage: UserMessage(text: "C")),
        ])
        let result = sessionReducer(state: state, action: .sessionQueuedMessagesReordered(SessionQueuedMessagesReorderedAction(
            type: .sessionQueuedMessagesReordered, session: S, order: ["c"]
        )))
        XCTAssertEqual(result.queuedMessages?.count, 3)
        XCTAssertEqual(result.queuedMessages?[0].id, "c")
        XCTAssertEqual(result.queuedMessages?[1].id, "a")
        XCTAssertEqual(result.queuedMessages?[2].id, "b")
    }

    func testReorderIgnoresUnknownIds() {
        let state = makeSessionState(queuedMessages: [
            PendingMessage(id: "a", userMessage: UserMessage(text: "A")),
            PendingMessage(id: "b", userMessage: UserMessage(text: "B")),
        ])
        let result = sessionReducer(state: state, action: .sessionQueuedMessagesReordered(SessionQueuedMessagesReorderedAction(
            type: .sessionQueuedMessagesReordered, session: S, order: ["unknown", "b", "a", "also-unknown"]
        )))
        XCTAssertEqual(result.queuedMessages?.count, 2)
        XCTAssertEqual(result.queuedMessages?[0].id, "b")
        XCTAssertEqual(result.queuedMessages?[1].id, "a")
    }

    func testReorderEmptyOrderPreservesOriginal() {
        let state = makeSessionState(queuedMessages: [PendingMessage(id: "a", userMessage: UserMessage(text: "A"))])
        let result = sessionReducer(state: state, action: .sessionQueuedMessagesReordered(SessionQueuedMessagesReorderedAction(
            type: .sessionQueuedMessagesReordered, session: S, order: []
        )))
        XCTAssertEqual(result.queuedMessages?.count, 1)
        XCTAssertEqual(result.queuedMessages?[0].id, "a")
    }

    func testReorderNoOpWhenNoQueuedMessages() {
        let state = makeSessionState()
        let result = sessionReducer(state: state, action: .sessionQueuedMessagesReordered(SessionQueuedMessagesReorderedAction(
            type: .sessionQueuedMessagesReordered, session: S, order: ["a", "b"]
        )))
        XCTAssertNil(result.queuedMessages)
    }

    // MARK: - Customization Tests

    func testCustomizationsChanged() {
        let state = makeSessionState()
        let cRef1 = CustomizationRef(uri: "https://plugins.example/a", displayName: "Plugin A")
        let cRef2 = CustomizationRef(uri: "https://plugins.example/b", displayName: "Plugin B")
        let customizations = [
            SessionCustomization(customization: cRef1, enabled: true),
            SessionCustomization(customization: cRef2, enabled: false),
        ]
        let result = sessionReducer(state: state, action: .sessionCustomizationsChanged(SessionCustomizationsChangedAction(
            type: .sessionCustomizationsChanged, session: S, customizations: customizations
        )))
        XCTAssertEqual(result.customizations?.count, 2)
        XCTAssertEqual(result.customizations?[0].enabled, true)
        XCTAssertEqual(result.customizations?[1].enabled, false)
    }

    func testCustomizationToggled() {
        let cRef1 = CustomizationRef(uri: "https://plugins.example/a", displayName: "Plugin A")
        let cRef2 = CustomizationRef(uri: "https://plugins.example/b", displayName: "Plugin B")
        let state = makeSessionState(customizations: [
            SessionCustomization(customization: cRef1, enabled: true),
            SessionCustomization(customization: cRef2, enabled: true),
        ])
        let result = sessionReducer(state: state, action: .sessionCustomizationToggled(SessionCustomizationToggledAction(
            type: .sessionCustomizationToggled, session: S, uri: cRef1.uri, enabled: false
        )))
        XCTAssertEqual(result.customizations?[0].enabled, false)
        XCTAssertEqual(result.customizations?[1].enabled, true)
    }

    func testCustomizationToggledNoOpForUnknownUri() {
        let cRef1 = CustomizationRef(uri: "https://plugins.example/a", displayName: "Plugin A")
        let state = makeSessionState(customizations: [SessionCustomization(customization: cRef1, enabled: true)])
        let result = sessionReducer(state: state, action: .sessionCustomizationToggled(SessionCustomizationToggledAction(
            type: .sessionCustomizationToggled, session: S, uri: "https://plugins.example/unknown", enabled: false
        )))
        XCTAssertEqual(result.customizations?[0].enabled, true)
    }

    func testCustomizationToggledNoOpWhenNil() {
        let state = makeSessionState()
        let result = sessionReducer(state: state, action: .sessionCustomizationToggled(SessionCustomizationToggledAction(
            type: .sessionCustomizationToggled, session: S, uri: "https://plugins.example/a", enabled: false
        )))
        XCTAssertNil(result.customizations)
    }
}
