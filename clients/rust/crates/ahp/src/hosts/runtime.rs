//! Per-host supervisor task.
//!
//! Owns the current [`Client`], the reconnect state machine, and the
//! per-host root-state mirror plus session-summary cache. Receives
//! commands over an mpsc channel from [`super::MultiHostClient`] and
//! forwards inbound events to the multi-host fan-in broadcasts.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::SystemTime;

use ahp_types::actions::{ActionEnvelope, StateAction};
use ahp_types::commands::{
    ListSessionsParams, ListSessionsResult, SubscribeParams, SubscribeResult,
};
use ahp_types::notifications::ProtocolNotification;
use ahp_types::state::{RootState, SessionSummary, SnapshotState};
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio::task::JoinHandle;

use crate::reducers::{apply_action_to_root, ReduceOutcome};
use crate::{Client, ClientError, ClientEvent, DispatchHandle, SubscriptionEvent};

use super::factory::ClientIdStore;
use super::types::{
    HostClientHandle, HostConfig, HostError, HostEvent, HostHandle, HostInternal, HostShared,
    HostState, HostSubscriptionEvent,
};

/// Commands the runtime accepts from the [`MultiHostClient`].
pub(super) enum HostCommand {
    Snapshot {
        reply: oneshot::Sender<HostHandle>,
    },
    GetClient {
        reply: oneshot::Sender<Option<HostClientHandle>>,
    },
    Reconnect {
        reply: oneshot::Sender<()>,
    },
    Subscribe {
        uri: String,
        reply: oneshot::Sender<Result<SubscribeResult, HostError>>,
    },
    Unsubscribe {
        uri: String,
        reply: oneshot::Sender<Result<(), HostError>>,
    },
    Dispatch {
        action: Box<StateAction>,
        reply: oneshot::Sender<Result<DispatchHandle, HostError>>,
    },
    Shutdown,
}

/// Inbox handle exposed to the multi-host facade.
pub(super) struct HostHandleTx {
    pub(super) cmd_tx: mpsc::Sender<HostCommand>,
    pub(super) shared: Arc<HostShared>,
    pub(super) join: JoinHandle<()>,
}

impl HostHandleTx {
    pub(super) async fn snapshot(&self) -> Option<HostHandle> {
        let (tx, rx) = oneshot::channel();
        self.cmd_tx
            .send(HostCommand::Snapshot { reply: tx })
            .await
            .ok()?;
        rx.await.ok()
    }

    pub(super) async fn shutdown(self) {
        let _ = self.cmd_tx.send(HostCommand::Shutdown).await;
        // Drop the sender first so the runtime sees `None` if Shutdown
        // wasn't delivered before the receive loop exited.
        drop(self.cmd_tx);
        let _ = self.join.await;
    }
}

/// Spawn a runtime for `config` and return its inbox.
pub(super) fn spawn(
    config: HostConfig,
    client_id_store: Arc<dyn ClientIdStore>,
    fan_out: broadcast::Sender<HostSubscriptionEvent>,
    host_events: broadcast::Sender<HostEvent>,
) -> HostHandleTx {
    let resolved_client_id = config
        .client_id
        .clone()
        .or_else(|| client_id_store.load(&config.id))
        .unwrap_or_else(|| {
            // Generate a deterministic-ish UUIDv4-style id.
            let bytes = uuid_v4_bytes();
            format!(
                "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
                u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
                u16::from_be_bytes([bytes[4], bytes[5]]),
                u16::from_be_bytes([bytes[6], bytes[7]]),
                u16::from_be_bytes([bytes[8], bytes[9]]),
                u64::from_be_bytes([
                    0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
                ]) & 0xffff_ffff_ffff,
            )
        });
    client_id_store.store(&config.id, &resolved_client_id);

    let initial = HostInternal {
        id: config.id.clone(),
        label: config.label.clone(),
        client_id: resolved_client_id.clone(),
        state: HostState::Disconnected,
        last_error: None,
        last_connected_at: None,
        protocol_version: None,
        server_seq: 0,
        default_directory: None,
        root_state: RootState {
            agents: vec![],
            active_sessions: None,
            terminals: None,
            config: None,
        },
        subscriptions: config.initial_subscriptions.clone(),
        completion_trigger_characters: vec![],
        session_summaries: BTreeMap::new(),
        generation: 0,
        current_client: None,
    };
    let shared = HostShared::new(initial);

    let (cmd_tx, cmd_rx) = mpsc::channel(32);
    let runtime = HostRuntime {
        config,
        client_id: resolved_client_id,
        cmd_rx,
        shared: shared.clone(),
        fan_out,
        host_events,
    };
    let join = tokio::spawn(runtime.run());

    HostHandleTx {
        cmd_tx,
        shared,
        join,
    }
}

struct HostRuntime {
    config: HostConfig,
    client_id: String,
    cmd_rx: mpsc::Receiver<HostCommand>,
    shared: Arc<HostShared>,
    fan_out: broadcast::Sender<HostSubscriptionEvent>,
    host_events: broadcast::Sender<HostEvent>,
}

enum InnerOutcome {
    /// The connection ended. Reconnect according to policy.
    Disconnected,
    /// A manual reconnect was requested. Reconnect immediately, ignoring
    /// the current backoff schedule.
    ManualReconnect,
    /// A shutdown command was received (or the inbox closed). Tear down.
    Shutdown,
}

impl HostRuntime {
    async fn run(mut self) {
        // Announce the host so consumers can wire up UI before the first connect.
        let _ = self.host_events.send(HostEvent::Added {
            host_id: self.config.id.clone(),
        });

        let mut attempt: u32 = 0;
        loop {
            // Connect attempt.
            attempt = attempt.saturating_add(1);
            if attempt == 1 {
                self.set_state(HostState::Connecting, None).await;
            } else {
                self.set_state(
                    HostState::Reconnecting {
                        attempt: attempt - 1,
                    },
                    None,
                )
                .await;
            }

            match self.connect_once().await {
                Ok(events) => {
                    if self.config.reconnect_policy.reset_on_success {
                        attempt = 0;
                    }
                    let outcome = self.run_connection(events).await;
                    self.tear_down_client().await;
                    match outcome {
                        InnerOutcome::Shutdown => break,
                        InnerOutcome::ManualReconnect => {
                            // Reset attempt counter for manual reconnect — the
                            // user explicitly asked us to try again now.
                            attempt = 0;
                            continue;
                        }
                        InnerOutcome::Disconnected => {
                            // Fall through to the policy check below.
                        }
                    }
                }
                Err(err) => {
                    let reason = err.to_string();
                    tracing::warn!(host_id = %self.config.id, attempt, error = %reason, "host connect failed");
                    {
                        let mut state = self.shared.lock().await;
                        state.last_error = Some(reason.clone());
                    }
                }
            }

            // Decide whether to retry.
            if self.config.reconnect_policy.attempts_exhausted(attempt) {
                let reason = self
                    .shared
                    .lock()
                    .await
                    .last_error
                    .clone()
                    .unwrap_or_else(|| "reconnect attempts exhausted".to_string());
                self.set_state(
                    HostState::Failed {
                        reason: reason.clone(),
                    },
                    Some(reason),
                )
                .await;
                // Stay alive so commands can still inspect state, request manual
                // reconnect, or shutdown the host.
                if !self.wait_for_manual_reconnect_or_shutdown().await {
                    break;
                }
                attempt = 0;
                continue;
            }

            let delay = self
                .config
                .reconnect_policy
                .delay_with_jitter(attempt, jitter_sample());
            if !self.sleep_or_command(delay).await {
                break;
            }
        }
    }

    async fn connect_once(&mut self) -> Result<crate::ClientEventStream, ClientError> {
        let transport = self
            .config
            .transport_factory
            .open_transport(self.config.id.clone())
            .await?;

        let client = Client::connect(transport, self.config.client_config.clone()).await?;

        // Attach the events receiver BEFORE the initialize handshake so
        // any notifications the server pushes between the handshake
        // response and the moment we enter `run_connection` are
        // captured rather than dropped.
        let events = client.events();

        // Decide between initialize and reconnect based on prior state.
        let (server_seq_after, init_result, did_reconnect) = {
            let snapshot = self.shared.lock().await;
            let can_reconnect = snapshot.server_seq > 0 && !snapshot.subscriptions.is_empty();
            let subscriptions = snapshot.subscriptions.clone();
            let server_seq = snapshot.server_seq;
            drop(snapshot);

            if can_reconnect {
                match client
                    .reconnect(self.client_id.clone(), server_seq, subscriptions.clone())
                    .await
                {
                    Ok(_result) => {
                        // Reconnect succeeds; keep the existing serverSeq for now —
                        // replayed actions and snapshots will catch us up. We
                        // optimistically use the server's reconciliation here.
                        (server_seq, None, true)
                    }
                    Err(ClientError::Rpc(_)) => {
                        // Server refused reconnect (likely too much state has
                        // elapsed); fall back to initialize.
                        let init = client
                            .initialize(
                                self.client_id.clone(),
                                vec![ahp_types::PROTOCOL_VERSION.to_string()],
                                subscriptions,
                            )
                            .await?;
                        let new_seq = init.server_seq;
                        (new_seq, Some(init), false)
                    }
                    Err(other) => return Err(other),
                }
            } else {
                let init = client
                    .initialize(
                        self.client_id.clone(),
                        vec![ahp_types::PROTOCOL_VERSION.to_string()],
                        subscriptions,
                    )
                    .await?;
                let new_seq = init.server_seq;
                (new_seq, Some(init), false)
            }
        };

        // Refresh session summaries from `listSessions` — cheap on first
        // connect, kept in sync by notifications afterward. Failures are
        // non-fatal: we just leave the cache as-is and log.
        let summaries: Result<ListSessionsResult, ClientError> = client
            .request("listSessions", ListSessionsParams::default())
            .await;

        // Bump generation and install the new client.
        let new_generation = {
            let mut state = self.shared.lock().await;
            state.generation = state.generation.saturating_add(1);
            state.current_client = Some(client.clone());
            state.last_connected_at = Some(SystemTime::now());
            state.last_error = None;
            state.server_seq = server_seq_after;
            if let Some(init) = init_result {
                if let Some(snapshot) = init
                    .snapshots
                    .iter()
                    .find(|s| s.resource == ahp_types::ROOT_RESOURCE_URI)
                {
                    if let SnapshotState::Root(root) = &snapshot.state {
                        state.root_state = root.as_ref().clone();
                    }
                }
                state.protocol_version = Some(init.protocol_version);
                state.default_directory = init.default_directory;
                state.completion_trigger_characters =
                    init.completion_trigger_characters.unwrap_or_default();
            }
            if let Ok(list) = summaries {
                state.session_summaries.clear();
                for summary in list.items {
                    state
                        .session_summaries
                        .insert(summary.resource.clone(), summary);
                }
            }
            state.generation
        };

        self.set_state(HostState::Connected, None).await;
        let _ = self.host_events.send(HostEvent::Connected {
            host_id: self.config.id.clone(),
            generation: new_generation,
        });

        let _ = did_reconnect; // currently used only for tracing
        tracing::info!(
            host_id = %self.config.id,
            generation = new_generation,
            reconnected = did_reconnect,
            "host connected"
        );
        Ok(events)
    }

    async fn run_connection(&mut self, mut events: crate::ClientEventStream) -> InnerOutcome {
        loop {
            tokio::select! {
                ev = events.recv() => match ev {
                    Some(event) => {
                        self.handle_event(event).await;
                    }
                    None => return InnerOutcome::Disconnected,
                },
                cmd = self.cmd_rx.recv() => match cmd {
                    None => return InnerOutcome::Shutdown,
                    Some(HostCommand::Shutdown) => return InnerOutcome::Shutdown,
                    Some(HostCommand::Reconnect { reply }) => {
                        let _ = reply.send(());
                        return InnerOutcome::ManualReconnect;
                    }
                    Some(HostCommand::Snapshot { reply }) => {
                        let snap = self.shared.lock().await.snapshot();
                        let _ = reply.send(snap);
                    }
                    Some(HostCommand::GetClient { reply }) => {
                        let handle = self.client_handle().await;
                        let _ = reply.send(handle);
                    }
                    Some(HostCommand::Subscribe { uri, reply }) => {
                        let result = self.handle_subscribe(uri).await;
                        let _ = reply.send(result);
                    }
                    Some(HostCommand::Unsubscribe { uri, reply }) => {
                        let result = self.handle_unsubscribe(uri).await;
                        let _ = reply.send(result);
                    }
                    Some(HostCommand::Dispatch { action, reply }) => {
                        let result = self.handle_dispatch(*action).await;
                        let _ = reply.send(result);
                    }
                },
            }
        }
    }

    async fn wait_for_manual_reconnect_or_shutdown(&mut self) -> bool {
        loop {
            match self.cmd_rx.recv().await {
                None | Some(HostCommand::Shutdown) => return false,
                Some(HostCommand::Reconnect { reply }) => {
                    let _ = reply.send(());
                    return true;
                }
                Some(HostCommand::Snapshot { reply }) => {
                    let snap = self.shared.lock().await.snapshot();
                    let _ = reply.send(snap);
                }
                Some(HostCommand::GetClient { reply }) => {
                    let _ = reply.send(None);
                }
                Some(HostCommand::Subscribe { uri, reply }) => {
                    // Defer to next connect; remember the URI so we resubscribe.
                    {
                        let mut state = self.shared.lock().await;
                        if !state.subscriptions.contains(&uri) {
                            state.subscriptions.push(uri.clone());
                        }
                    }
                    let _ = reply.send(Err(HostError::HostShutDown(self.config.id.clone())));
                }
                Some(HostCommand::Unsubscribe { uri, reply }) => {
                    {
                        let mut state = self.shared.lock().await;
                        state.subscriptions.retain(|u| u != &uri);
                    }
                    let _ = reply.send(Ok(()));
                }
                Some(HostCommand::Dispatch { reply, .. }) => {
                    let _ = reply.send(Err(HostError::HostShutDown(self.config.id.clone())));
                }
            }
        }
    }

    /// Sleep for `delay`, but exit early on inbound commands. Returns
    /// `true` to keep looping, `false` to shut down the runtime.
    async fn sleep_or_command(&mut self, delay: std::time::Duration) -> bool {
        if delay.is_zero() {
            return true;
        }
        let sleep = tokio::time::sleep(delay);
        tokio::pin!(sleep);
        loop {
            tokio::select! {
                _ = &mut sleep => return true,
                cmd = self.cmd_rx.recv() => match cmd {
                    None | Some(HostCommand::Shutdown) => return false,
                    Some(HostCommand::Reconnect { reply }) => {
                        let _ = reply.send(());
                        return true;
                    }
                    Some(HostCommand::Snapshot { reply }) => {
                        let snap = self.shared.lock().await.snapshot();
                        let _ = reply.send(snap);
                    }
                    Some(HostCommand::GetClient { reply }) => {
                        let _ = reply.send(None);
                    }
                    Some(HostCommand::Subscribe { uri, reply }) => {
                        {
                            let mut state = self.shared.lock().await;
                            if !state.subscriptions.contains(&uri) {
                                state.subscriptions.push(uri.clone());
                            }
                        }
                        let _ = reply.send(Err(HostError::HostShutDown(self.config.id.clone())));
                    }
                    Some(HostCommand::Unsubscribe { uri, reply }) => {
                        {
                            let mut state = self.shared.lock().await;
                            state.subscriptions.retain(|u| u != &uri);
                        }
                        let _ = reply.send(Ok(()));
                    }
                    Some(HostCommand::Dispatch { reply, .. }) => {
                        let _ = reply.send(Err(HostError::HostShutDown(self.config.id.clone())));
                    }
                },
            }
        }
    }

    async fn handle_event(&self, event: ClientEvent) {
        // Update internal state mirrors before fanning out so consumers
        // observing the next snapshot see the result of this event.
        match &event.event {
            SubscriptionEvent::Action(envelope) => {
                self.apply_action(envelope).await;
            }
            SubscriptionEvent::Notification(notification) => {
                self.apply_notification(notification).await;
            }
        }

        let host_event = HostSubscriptionEvent {
            host_id: self.config.id.clone(),
            resource: event.resource,
            event: event.event,
        };
        let _ = self.fan_out.send(host_event);
    }

    async fn apply_action(&self, envelope: &ActionEnvelope) {
        let mut state = self.shared.lock().await;
        let envelope_seq = super::types::server_seq_from_envelope(envelope);
        if envelope_seq > state.server_seq {
            state.server_seq = envelope_seq;
        }
        // Best-effort root state mirror update; for non-root actions this
        // is a no-op (the reducer reports OutOfScope).
        if matches!(
            apply_action_to_root(&mut state.root_state, &envelope.action),
            ReduceOutcome::OutOfScope
        ) {
            // Not a root action; leave root state untouched. Per-session
            // and per-terminal state mirrors are intentionally not
            // duplicated here — consumers that need them can subscribe
            // to the per-resource event stream and run the reducers
            // themselves.
        }
    }

    async fn apply_notification(&self, notification: &ProtocolNotification) {
        let mut state = self.shared.lock().await;
        match notification {
            ProtocolNotification::SessionAdded(n) => {
                state
                    .session_summaries
                    .insert(n.summary.resource.clone(), n.summary.clone());
            }
            ProtocolNotification::SessionRemoved(n) => {
                state.session_summaries.remove(&n.session);
            }
            ProtocolNotification::SessionSummaryChanged(n) => {
                if let Some(existing) = state.session_summaries.get_mut(&n.session) {
                    apply_summary_changes(existing, &n.changes);
                }
            }
            ProtocolNotification::AuthRequired(_) => {
                // No cache update; consumers observe via the event stream.
            }
        }
    }

    async fn handle_subscribe(&self, uri: String) -> Result<SubscribeResult, HostError> {
        let client = self
            .shared
            .lock()
            .await
            .current_client
            .clone()
            .ok_or_else(|| HostError::HostShutDown(self.config.id.clone()))?;
        let result: SubscribeResult = client
            .request(
                "subscribe",
                SubscribeParams {
                    resource: uri.clone(),
                },
            )
            .await
            .map_err(HostError::Client)?;
        // Track subscription so reconnect can replay it.
        {
            let mut state = self.shared.lock().await;
            if !state.subscriptions.contains(&uri) {
                state.subscriptions.push(uri.clone());
            }
        }
        // Make sure local broadcasts exist so per-URI listeners don't miss events.
        let _ = client.attach_subscription(&uri).await;
        Ok(result)
    }

    async fn handle_unsubscribe(&self, uri: String) -> Result<(), HostError> {
        let client_opt = { self.shared.lock().await.current_client.clone() };
        if let Some(client) = client_opt {
            client
                .unsubscribe(uri.clone())
                .await
                .map_err(HostError::Client)?;
        }
        let mut state = self.shared.lock().await;
        state.subscriptions.retain(|u| u != &uri);
        Ok(())
    }

    async fn handle_dispatch(&self, action: StateAction) -> Result<DispatchHandle, HostError> {
        let client = self
            .shared
            .lock()
            .await
            .current_client
            .clone()
            .ok_or_else(|| HostError::HostShutDown(self.config.id.clone()))?;
        client.dispatch(action).await.map_err(HostError::Client)
    }

    async fn client_handle(&self) -> Option<HostClientHandle> {
        let state = self.shared.lock().await;
        let client = state.current_client.clone()?;
        Some(HostClientHandle {
            host_id: self.config.id.clone(),
            generation: state.generation,
            client,
            shared: self.shared.clone(),
        })
    }

    async fn tear_down_client(&self) {
        let prev = {
            let mut state = self.shared.lock().await;
            state.current_client.take()
        };
        if let Some(client) = prev {
            client.shutdown().await;
        }
    }

    async fn set_state(&self, state: HostState, last_error: Option<String>) {
        {
            let mut s = self.shared.lock().await;
            s.state = state.clone();
            if last_error.is_some() {
                s.last_error = last_error.clone();
            }
        }
        let _ = self.host_events.send(HostEvent::StateChanged {
            host_id: self.config.id.clone(),
            state,
            last_error,
        });
    }
}

/// Apply a [`ahp_types::notifications::PartialSessionSummary`] in place.
fn apply_summary_changes(
    existing: &mut SessionSummary,
    changes: &ahp_types::notifications::PartialSessionSummary,
) {
    if let Some(v) = &changes.title {
        existing.title = v.clone();
    }
    if let Some(v) = changes.status {
        existing.status = v;
    }
    if let Some(v) = &changes.activity {
        existing.activity = Some(v.clone());
    }
    if let Some(v) = changes.modified_at {
        existing.modified_at = v;
    }
    if let Some(v) = &changes.project {
        existing.project = Some(v.clone());
    }
    if let Some(v) = &changes.model {
        existing.model = Some(v.clone());
    }
    if let Some(v) = &changes.working_directory {
        existing.working_directory = Some(v.clone());
    }
    if let Some(v) = &changes.diffs {
        existing.diffs = Some(v.clone());
    }
}

// ─── Random helpers (no external dep on `rand`) ─────────────────────────────

fn jitter_sample() -> f64 {
    // Hash of an instant + a counter is enough: the consumer can supply
    // their own RNG by overriding `ReconnectPolicy`. Using SipHash on
    // a small input keeps us free of crate-level RNG dependencies.
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut hasher = DefaultHasher::new();
    n.hash(&mut hasher);
    SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .hash(&mut hasher);
    let raw = hasher.finish();
    // Map 64 random bits into [0.0, 1.0).
    (raw as f64) / (u64::MAX as f64)
}

fn uuid_v4_bytes() -> [u8; 16] {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let mut hasher = DefaultHasher::new();
    let mut out = [0u8; 16];
    let now_nanos = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    for i in 0..2 {
        n.hash(&mut hasher);
        now_nanos.hash(&mut hasher);
        i.hash(&mut hasher);
        let bytes = hasher.finish().to_be_bytes();
        out[i * 8..(i + 1) * 8].copy_from_slice(&bytes);
    }
    // Stamp version (4) and variant (RFC 4122) bits.
    out[6] = (out[6] & 0x0f) | 0x40;
    out[8] = (out[8] & 0x3f) | 0x80;
    out
}
