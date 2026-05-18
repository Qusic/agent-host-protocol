// MultiHostStateMirror — host-aware reducer façade for multi-host
// consumers.
//
// Wraps the existing pure reducers (`rootReducer`, `sessionReducer`) the
// same way `AHPStateMirror` does, but keys state by `(hostId, uri)` so
// URIs that collide across hosts (which is the normal case) don't
// clobber each other. Drop-in for any multi-host consumer; can be fed
// directly from `MultiHostClient.events(host:uri:)` or from a
// `HostSubscriptionEvent` stream.

import Foundation
import AgentHostProtocol

/// Compound key tagging a resource URI with the host that produced it.
///
/// Session and terminal URIs aren't globally unique across hosts —
/// `copilot:/s1` on Host A and `copilot:/s1` on Host B are different
/// resources. Use this struct as the key in any multi-host state map.
public struct HostedResourceKey: Hashable, Sendable {
    public let hostId: HostId
    public let uri: String

    public init(hostId: HostId, uri: String) {
        self.hostId = hostId
        self.uri = uri
    }
}

/// In-memory mirror of root/session/terminal state, fed by
/// `ActionEnvelope` and `Snapshot` values tagged with their host of
/// origin.
///
/// Single-host consumers should keep using `AHPStateMirror`; this type
/// adds the host dimension necessary for multi-host UIs. Apply
/// `HostSubscriptionEvent`s directly via `apply(event:)`, or feed
/// individual envelopes/snapshots via `apply(host:envelope:)` /
/// `applySnapshot(host:snapshot:)`.
///
/// **Feed from the reliable per-resource stream.** Pump events into
/// this mirror from `MultiHostClient.events(host:uri:)` (which is
/// unbounded, delivers replayed envelopes, and survives reconnects) —
/// **not** from `MultiHostClient.events()` (which is lossy by design).
/// Dropping action envelopes desyncs the mirror irreversibly.
public actor MultiHostStateMirror {
    public private(set) var rootStates: [HostId: RootState] = [:]
    public private(set) var sessions: [HostedResourceKey: SessionState] = [:]
    public private(set) var terminals: [HostedResourceKey: TerminalState] = [:]

    public init() {}

    /// Convenience: apply a `HostSubscriptionEvent` produced by
    /// `MultiHostClient.events()`. Action envelopes are routed through
    /// the reducer; protocol notifications are dropped (they don't
    /// affect reducer state).
    public func apply(event: HostSubscriptionEvent) {
        if case .action(let envelope) = event.event {
            apply(host: event.hostId, envelope: envelope)
        }
    }

    /// Apply a single action envelope, scoped to `host`. Routing by
    /// `action.session` / `action.terminal` (root state if neither is
    /// present).
    public func apply(host: HostId, envelope: ActionEnvelope) {
        let action = envelope.action
        if let sessionURI = sessionURI(for: action) {
            let key = HostedResourceKey(hostId: host, uri: sessionURI)
            // If we have no session state for this `(host, uri)` yet,
            // the reducer can't initialise one — only
            // `applySnapshot(host:snapshot:)` can do that.
            if var session = sessions[key] {
                session = sessionReducer(state: session, action: action)
                sessions[key] = session
            }
            return
        }
        if terminalURI(for: action) != nil {
            // Terminals don't have a hand-written reducer in the Swift
            // package today; just leave the slot as the latest snapshot.
            return
        }
        let current = rootStates[host, default: RootState(agents: [])]
        rootStates[host] = rootReducer(state: current, action: action)
    }

    /// Seed the mirror from a `Snapshot` scoped to `host` — root,
    /// session, or terminal as the snapshot's `state` discriminator
    /// dictates.
    public func applySnapshot(host: HostId, snapshot: Snapshot) {
        let key = HostedResourceKey(hostId: host, uri: snapshot.resource)
        switch snapshot.state {
        case .root(let state):
            rootStates[host] = state
        case .session(let state):
            sessions[key] = state
        case .terminal(let state):
            terminals[key] = state
        }
    }

    /// Reset every slot for `host` — drops the root state, all sessions
    /// keyed under that host, and all terminals keyed under that host.
    public func reset(host: HostId) {
        rootStates.removeValue(forKey: host)
        sessions = sessions.filter { $0.key.hostId != host }
        terminals = terminals.filter { $0.key.hostId != host }
    }

    /// Reset every host's state.
    public func reset() {
        rootStates.removeAll()
        sessions.removeAll()
        terminals.removeAll()
    }

    // MARK: - Helpers

    private func sessionURI(for action: StateAction) -> String? {
        guard let data = try? JSONEncoder().encode(action),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return object["session"] as? String
    }

    private func terminalURI(for action: StateAction) -> String? {
        guard let data = try? JSONEncoder().encode(action),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return object["terminal"] as? String
    }
}
