//! Pluggable factories: transport opener and `clientId` persistence.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;

use crate::transport::BoxedTransport;
use crate::TransportError;

use super::types::HostId;

/// Factory that opens (or re-opens) a transport for a host.
///
/// The supervisor calls this on every connect attempt — including
/// reconnects — so consumers can refresh tokens, rotate URLs, or pick
/// different backends per attempt.
///
/// Any closure of shape `Fn(HostId) -> impl Future<Output = Result<BoxedTransport, TransportError>>`
/// implements this trait via the blanket impl below — you only need
/// to implement it manually for stateful factories.
///
/// ```no_run
/// use ahp::hosts::HostTransportFactory;
/// use ahp::transport::BoxedTransport;
/// use ahp::TransportError;
///
/// async fn open_ws(host_id: ahp::hosts::HostId) -> Result<BoxedTransport, TransportError> {
///     // Look up the URL for `host_id`, refresh tokens, etc.
///     # let _ = host_id;
///     # unimplemented!()
/// }
///
/// // `open_ws` already implements `HostTransportFactory`.
/// fn use_factory<F: HostTransportFactory>(_: F) {}
/// use_factory(open_ws);
/// ```
pub trait HostTransportFactory: Send + Sync + 'static {
    /// Open a fresh transport for `host_id`.
    ///
    /// Errors are surfaced as the host's `last_error` and trigger the
    /// reconnect schedule (or `Failed` state if reconnects are disabled
    /// or attempts are exhausted).
    fn open_transport(
        &self,
        host_id: HostId,
    ) -> Pin<Box<dyn Future<Output = Result<BoxedTransport, TransportError>> + Send + '_>>;
}

impl<F, Fut> HostTransportFactory for F
where
    F: Fn(HostId) -> Fut + Send + Sync + 'static,
    Fut: Future<Output = Result<BoxedTransport, TransportError>> + Send + 'static,
{
    fn open_transport(
        &self,
        host_id: HostId,
    ) -> Pin<Box<dyn Future<Output = Result<BoxedTransport, TransportError>> + Send + '_>> {
        Box::pin(self(host_id))
    }
}

/// Persistence hook for stable `clientId`s per host.
///
/// On `add_host`, the multi-host client looks up `host_id` here. If the
/// store returns `Some`, that id is reused — letting the server treat
/// successive launches as the same client (which the AHP `reconnect`
/// flow needs to replay missed actions). If the store returns `None`,
/// the multi-host client generates a fresh UUID and stores it.
///
/// The default implementation is [`InMemoryClientIdStore`], which is
/// session-stable but does **not** survive process restarts. Plug a
/// keychain/file-backed implementation in for production multi-host
/// apps so reconnects keep working across launches.
pub trait ClientIdStore: Send + Sync + 'static {
    /// Look up the previously stored `clientId` for `host_id`, if any.
    fn load(&self, host_id: &HostId) -> Option<String>;

    /// Persist `client_id` for `host_id`.
    ///
    /// Implementations should overwrite any previous value.
    fn store(&self, host_id: &HostId, client_id: &str);
}

/// In-process [`ClientIdStore`].
///
/// Keeps assigned ids in a `Mutex<HashMap>`. Survives reconnects within
/// the same process but **not** restarts. Fine for tests, ephemeral
/// CLIs, and as a starting point — production apps should provide a
/// persistent implementation (filesystem, keychain, secure enclave, …).
#[derive(Default)]
pub struct InMemoryClientIdStore {
    inner: Mutex<HashMap<HostId, String>>,
}

impl InMemoryClientIdStore {
    /// Build a fresh, empty store.
    pub fn new() -> Self {
        Self::default()
    }
}

impl ClientIdStore for InMemoryClientIdStore {
    fn load(&self, host_id: &HostId) -> Option<String> {
        self.inner.lock().ok()?.get(host_id).cloned()
    }

    fn store(&self, host_id: &HostId, client_id: &str) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.insert(host_id.clone(), client_id.to_string());
        }
    }
}

impl std::fmt::Debug for InMemoryClientIdStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let count = self.inner.lock().map(|g| g.len()).unwrap_or(0);
        f.debug_struct("InMemoryClientIdStore")
            .field("entries", &count)
            .finish()
    }
}
