//! Integration tests for the multi-host SDK (`ahp::hosts`).
//!
//! Uses an in-memory transport pair (mirroring `client_roundtrip.rs`)
//! so the runtime can drive a real `Client` end-to-end without any
//! networking. Each test spins up one or more "fake hosts" — small
//! tasks that respond to `initialize`, `listSessions`, and the
//! occasional `subscribe`, then optionally close their side of the
//! socket to force a reconnect.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use ahp::hosts::{
    HostConfig, HostError, HostEvent, HostId, HostState, MultiHostClient, ReconnectPolicy,
};
use ahp::transport::BoxedTransport;
use ahp::{Transport, TransportError, TransportMessage};
use ahp_types::messages::{
    JsonRpcMessage, JsonRpcNotification, JsonRpcRequest, JsonRpcSuccessResponse, JsonRpcVersion,
};
use ahp_types::state::AgentInfo;
use tokio::sync::{mpsc, Mutex};

// ─── In-memory transport ────────────────────────────────────────────────────

struct MemTransport {
    tx: mpsc::Sender<TransportMessage>,
    rx: mpsc::Receiver<TransportMessage>,
}

fn pair() -> (MemTransport, MemTransport) {
    let (a_tx, b_rx) = mpsc::channel(64);
    let (b_tx, a_rx) = mpsc::channel(64);
    (
        MemTransport { tx: a_tx, rx: a_rx },
        MemTransport { tx: b_tx, rx: b_rx },
    )
}

impl Transport for MemTransport {
    async fn send(&mut self, msg: TransportMessage) -> Result<(), TransportError> {
        self.tx.send(msg).await.map_err(|_| TransportError::Closed)
    }

    async fn recv(&mut self) -> Result<Option<TransportMessage>, TransportError> {
        Ok(self.rx.recv().await)
    }
}

// ─── Fake host ──────────────────────────────────────────────────────────────

#[derive(Clone)]
struct FakeHostState {
    /// Sequential serverSeq counter shared across reconnects on this host.
    server_seq: Arc<AtomicU32>,
    /// Optional list of agents to publish in the initial RootState snapshot.
    agents: Vec<AgentInfo>,
    /// Optional list of session summaries to return from `listSessions`.
    sessions: Vec<ahp_types::state::SessionSummary>,
}

impl FakeHostState {
    fn new() -> Self {
        Self {
            server_seq: Arc::new(AtomicU32::new(0)),
            agents: vec![],
            sessions: vec![],
        }
    }

    fn with_agents(mut self, agents: Vec<AgentInfo>) -> Self {
        self.agents = agents;
        self
    }

    fn with_sessions(mut self, sessions: Vec<ahp_types::state::SessionSummary>) -> Self {
        self.sessions = sessions;
        self
    }
}

/// Drive a single connection on the server side until the client closes.
async fn drive_fake_host_basic(mut transport: MemTransport, state: FakeHostState) {
    loop {
        let frame = match transport.recv().await {
            Ok(Some(f)) => f,
            _ => return,
        };
        let msg = match frame.into_parsed() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if let JsonRpcMessage::Request(req) = msg {
            let result = handle_request(&req, &state);
            let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                jsonrpc: JsonRpcVersion::V2,
                id: req.id,
                result: ahp_types::common::AnyValue::from(result),
            });
            if transport
                .send(TransportMessage::encode(&resp).unwrap())
                .await
                .is_err()
            {
                return;
            }
        }
    }
}

/// Like `drive_fake_host_basic`, but also injects a `notify/sessionAdded`
/// notification once `initialize` completes. Returns when the client
/// closes the transport.
async fn drive_fake_host_with_injection(
    mut transport: MemTransport,
    state: FakeHostState,
    inject_after_init: Arc<Mutex<Option<ahp_types::state::SessionSummary>>>,
) {
    loop {
        let frame = match transport.recv().await {
            Ok(Some(f)) => f,
            _ => return,
        };
        let msg = match frame.into_parsed() {
            Ok(m) => m,
            Err(_) => continue,
        };
        if let JsonRpcMessage::Request(req) = msg {
            let was_init = matches!(req.method.as_str(), "initialize" | "reconnect");
            let result = handle_request(&req, &state);
            let resp = JsonRpcMessage::SuccessResponse(JsonRpcSuccessResponse {
                jsonrpc: JsonRpcVersion::V2,
                id: req.id,
                result: ahp_types::common::AnyValue::from(result),
            });
            if transport
                .send(TransportMessage::encode(&resp).unwrap())
                .await
                .is_err()
            {
                return;
            }
            if was_init {
                let summary = inject_after_init.lock().await.take();
                if let Some(summary) = summary {
                    // Tiny delay so the client has consumed the prior
                    // listSessions response before the notification arrives.
                    tokio::time::sleep(Duration::from_millis(20)).await;
                    let payload = serde_json::json!({
                        "notification": {
                            "type": "notify/sessionAdded",
                            "summary": summary,
                        }
                    });
                    let notif = JsonRpcMessage::Notification(JsonRpcNotification {
                        jsonrpc: JsonRpcVersion::V2,
                        method: "notification".into(),
                        params: Some(ahp_types::common::AnyValue::from(payload)),
                    });
                    if transport
                        .send(TransportMessage::encode(&notif).unwrap())
                        .await
                        .is_err()
                    {
                        return;
                    }
                }
            }
        }
    }
}

fn handle_request(req: &JsonRpcRequest, state: &FakeHostState) -> serde_json::Value {
    match req.method.as_str() {
        "initialize" => {
            let seq = state.server_seq.load(Ordering::SeqCst);
            let snapshot = serde_json::json!({
                "resource": ahp_types::ROOT_RESOURCE_URI,
                "state": {
                    "type": "Root",
                    "agents": state.agents,
                    "activeSessions": state.sessions.len() as i64,
                },
                "fromSeq": seq,
            });
            serde_json::json!({
                "protocolVersion": ahp_types::PROTOCOL_VERSION,
                "serverSeq": seq,
                "snapshots": [snapshot],
            })
        }
        "reconnect" => serde_json::json!({
            "type": "replay",
            "actions": []
        }),
        "listSessions" => serde_json::json!({ "items": state.sessions }),
        "subscribe" => {
            let resource = req
                .params
                .as_ref()
                .and_then(|p| p.as_object())
                .and_then(|m| m.get("resource"))
                .and_then(|v| v.as_str())
                .unwrap_or(ahp_types::ROOT_RESOURCE_URI)
                .to_string();
            let seq = state.server_seq.load(Ordering::SeqCst);
            serde_json::json!({
                "snapshot": {
                    "resource": resource,
                    "state": {
                        "type": "Root",
                        "agents": state.agents,
                    },
                    "fromSeq": seq
                }
            })
        }
        _ => serde_json::json!({}),
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[tokio::test]
async fn single_constructor_yields_connected_handle() {
    let agent = AgentInfo {
        provider: "copilot".into(),
        display_name: "Copilot".into(),
        description: "demo".into(),
        models: vec![],
        protected_resources: None,
        customizations: None,
    };
    let state = FakeHostState::new().with_agents(vec![agent.clone()]);
    let factory = make_basic_factory(state);

    let config = HostConfig::new("local", "Local", factory);
    let (multi, _initial) = MultiHostClient::single(config).await.expect("single");

    let id = HostId::new("local");
    wait_for_state(&multi, &id, |s| s.is_connected(), 2000).await;

    let snap = multi.host(&id).await.expect("host present");
    assert!(snap.state.is_connected());
    assert_eq!(snap.label, "Local");
    assert_eq!(snap.agents, vec![agent]);
    assert_eq!(
        snap.protocol_version.as_deref(),
        Some(ahp_types::PROTOCOL_VERSION)
    );
    assert!(snap.last_connected_at.is_some());
}

#[tokio::test]
async fn two_hosts_register_and_connect_independently() {
    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new(
            "a",
            "A",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();
    multi
        .add_host(HostConfig::new(
            "b",
            "B",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("a"), |s| s.is_connected(), 2000).await;
    wait_for_state(&multi, &HostId::new("b"), |s| s.is_connected(), 2000).await;

    let hosts = multi.hosts().await;
    assert_eq!(hosts.len(), 2);
    assert!(hosts.iter().all(|h| h.state.is_connected()));
    let labels: Vec<_> = hosts.iter().map(|h| h.label.clone()).collect();
    assert!(labels.contains(&"A".to_string()));
    assert!(labels.contains(&"B".to_string()));
}

#[tokio::test]
async fn aggregated_sessions_track_listsessions_then_notification() {
    let initial_summary = make_summary("copilot:/s1", "Initial title", 1_000);
    let added_summary = make_summary("copilot:/s2", "Added later", 2_000);

    let state = FakeHostState::new().with_sessions(vec![initial_summary]);
    let injected = Arc::new(Mutex::new(Some(added_summary)));
    let factory = make_injecting_factory(state, injected);

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new("local", "Local", factory))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("local"), |s| s.is_connected(), 2000).await;

    wait_until(2000, || async {
        multi.aggregated_sessions().await.len() == 2
    })
    .await;
    let aggregated = multi.aggregated_sessions().await;
    let titles: Vec<_> = aggregated.iter().map(|h| h.summary.title.clone()).collect();
    assert_eq!(
        titles,
        vec!["Added later".to_string(), "Initial title".to_string()]
    );
    assert!(aggregated.iter().all(|h| h.host_id == HostId::new("local")));
    assert!(aggregated.iter().all(|h| h.host_label == "Local"));
}

#[tokio::test]
async fn host_client_handle_invalidates_after_reconnect() {
    let factory = make_basic_factory(FakeHostState::new());

    let multi = MultiHostClient::new();
    multi
        .add_host(
            HostConfig::new("local", "Local", factory)
                .with_reconnect_policy(ReconnectPolicy::immediate_forever()),
        )
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("local"), |s| s.is_connected(), 2000).await;

    let handle = multi
        .client(&HostId::new("local"))
        .await
        .expect("client handle");
    let initial_generation = handle.generation();

    multi
        .reconnect_host(&HostId::new("local"))
        .await
        .expect("reconnect");
    wait_until(2000, || async {
        multi
            .host(&HostId::new("local"))
            .await
            .map(|h| h.generation > initial_generation && h.state.is_connected())
            .unwrap_or(false)
    })
    .await;

    let err = handle
        .check_alive()
        .await
        .expect_err("expected HostReconnected");
    match err {
        HostError::HostReconnected {
            handle_generation,
            current_generation,
            ..
        } => {
            assert_eq!(handle_generation, initial_generation);
            assert!(current_generation > initial_generation);
        }
        other => panic!("unexpected error: {other:?}"),
    }

    let fresh = multi
        .client(&HostId::new("local"))
        .await
        .expect("fresh client handle");
    assert!(fresh.generation() > initial_generation);
    fresh.check_alive().await.expect("fresh handle alive");
}

#[tokio::test]
async fn remove_host_terminates_supervisor_and_emits_event() {
    let factory = make_basic_factory(FakeHostState::new());

    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new("temp", "Temporary", factory))
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("temp"), |s| s.is_connected(), 2000).await;

    let mut events = multi.host_events();

    multi
        .remove_host(&HostId::new("temp"))
        .await
        .expect("remove");

    let mut saw_removed = false;
    let deadline = tokio::time::Instant::now() + Duration::from_millis(1000);
    while tokio::time::Instant::now() < deadline {
        match tokio::time::timeout(Duration::from_millis(100), events.recv()).await {
            Ok(Some(HostEvent::Removed { host_id })) if host_id == HostId::new("temp") => {
                saw_removed = true;
                break;
            }
            Ok(Some(_)) => continue,
            _ => break,
        }
    }
    assert!(saw_removed, "expected HostEvent::Removed");

    assert!(multi.host(&HostId::new("temp")).await.is_none());
}

#[tokio::test]
async fn fan_in_events_carry_host_id_and_resource() {
    let summary = make_summary("copilot:/s1", "first", 100);

    let state_a = FakeHostState::new().with_sessions(vec![summary.clone()]);
    let state_b = FakeHostState::new().with_sessions(vec![summary.clone()]);
    let inject_a = Arc::new(Mutex::new(Some(make_summary(
        "copilot:/added-a",
        "a-side",
        200,
    ))));
    let inject_b = Arc::new(Mutex::new(Some(make_summary(
        "copilot:/added-b",
        "b-side",
        300,
    ))));

    // Subscribe BEFORE adding hosts so the broadcast captures every
    // event from the very first connect.
    let multi = MultiHostClient::new();
    let mut events = multi.events();

    multi
        .add_host(HostConfig::new(
            "a",
            "Host A",
            make_injecting_factory(state_a, inject_a),
        ))
        .await
        .unwrap();
    multi
        .add_host(HostConfig::new(
            "b",
            "Host B",
            make_injecting_factory(state_b, inject_b),
        ))
        .await
        .unwrap();

    let mut hosts_seen: std::collections::HashSet<HostId> = std::collections::HashSet::new();
    let deadline = tokio::time::Instant::now() + Duration::from_millis(2500);
    while tokio::time::Instant::now() < deadline && hosts_seen.len() < 2 {
        match tokio::time::timeout(Duration::from_millis(500), events.recv()).await {
            Ok(Some(event)) => {
                hosts_seen.insert(event.host_id.clone());
                // Notifications carry no resource URI by design; actions
                // would. The injected sessionAdded is a notification so
                // resource is None.
                assert!(event.resource.is_none());
            }
            _ => break,
        }
    }
    assert!(
        hosts_seen.contains(&HostId::new("a")),
        "missing event from host A; saw {hosts_seen:?}"
    );
    assert!(
        hosts_seen.contains(&HostId::new("b")),
        "missing event from host B; saw {hosts_seen:?}"
    );
}

#[tokio::test]
async fn transport_factory_is_called_for_each_reconnect() {
    let connect_count = Arc::new(AtomicU32::new(0));
    let count_clone = connect_count.clone();
    let state = FakeHostState::new();

    let factory = move |_host_id: HostId| {
        let count = count_clone.clone();
        let state = state.clone();
        Box::pin(async move {
            count.fetch_add(1, Ordering::SeqCst);
            let (client_side, server_side) = pair();
            tokio::spawn(drive_fake_host_basic(server_side, state));
            Ok(BoxedTransport::new(client_side))
        })
            as std::pin::Pin<
                Box<
                    dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send,
                >,
            >
    };

    let multi = MultiHostClient::new();
    multi
        .add_host(
            HostConfig::new("local", "Local", factory)
                .with_reconnect_policy(ReconnectPolicy::immediate_forever()),
        )
        .await
        .unwrap();

    wait_for_state(&multi, &HostId::new("local"), |s| s.is_connected(), 2000).await;
    assert_eq!(connect_count.load(Ordering::SeqCst), 1);

    multi
        .reconnect_host(&HostId::new("local"))
        .await
        .expect("reconnect");
    wait_until(2000, || async {
        connect_count.load(Ordering::SeqCst) >= 2
            && multi
                .host(&HostId::new("local"))
                .await
                .map(|h| h.state.is_connected())
                .unwrap_or(false)
    })
    .await;
    assert_eq!(connect_count.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn duplicate_host_id_is_rejected() {
    let multi = MultiHostClient::new();
    multi
        .add_host(HostConfig::new(
            "dup",
            "first",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .unwrap();

    let err = multi
        .add_host(HostConfig::new(
            "dup",
            "second",
            make_basic_factory(FakeHostState::new()),
        ))
        .await
        .err();
    assert!(err.is_some(), "expected duplicate-id rejection");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn make_summary(uri: &str, title: &str, modified_at: i64) -> ahp_types::state::SessionSummary {
    ahp_types::state::SessionSummary {
        resource: uri.into(),
        provider: "copilot".into(),
        title: title.into(),
        status: 0,
        activity: None,
        created_at: 0,
        modified_at,
        project: None,
        model: None,
        working_directory: None,
        diffs: None,
    }
}

fn make_basic_factory(
    state: FakeHostState,
) -> impl Fn(
    HostId,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send>,
> + Send
       + Sync
       + 'static {
    let state = Arc::new(state);
    move |_host_id| {
        let state = state.clone();
        Box::pin(async move {
            let (client_side, server_side) = pair();
            tokio::spawn(drive_fake_host_basic(server_side, (*state).clone()));
            Ok(BoxedTransport::new(client_side))
        })
    }
}

fn make_injecting_factory(
    state: FakeHostState,
    inject: Arc<Mutex<Option<ahp_types::state::SessionSummary>>>,
) -> impl Fn(
    HostId,
) -> std::pin::Pin<
    Box<dyn std::future::Future<Output = Result<BoxedTransport, TransportError>> + Send>,
> + Send
       + Sync
       + 'static {
    let state = Arc::new(state);
    move |_host_id| {
        let state = state.clone();
        let inject = inject.clone();
        Box::pin(async move {
            let (client_side, server_side) = pair();
            tokio::spawn(drive_fake_host_with_injection(
                server_side,
                (*state).clone(),
                inject,
            ));
            Ok(BoxedTransport::new(client_side))
        })
    }
}

async fn wait_for_state(
    multi: &MultiHostClient,
    id: &HostId,
    pred: impl Fn(&HostState) -> bool,
    timeout_ms: u64,
) {
    wait_until(timeout_ms, || async {
        multi
            .host(id)
            .await
            .map(|h| pred(&h.state))
            .unwrap_or(false)
    })
    .await;
}

async fn wait_until<F, Fut>(timeout_ms: u64, mut cond: F)
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = bool>,
{
    let deadline = tokio::time::Instant::now() + Duration::from_millis(timeout_ms);
    while tokio::time::Instant::now() < deadline {
        if cond().await {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("condition did not become true within {timeout_ms} ms");
}
