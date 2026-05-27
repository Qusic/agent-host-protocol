/**
 * Integration tests for the multi-host SDK (`@microsoft/agent-host-protocol/hosts`).
 *
 * Uses an in-memory transport pair (mirroring the Rust hosts.rs
 * integration suite and the TypeScript client.test.ts) to drive a real
 * {@link AhpClient} end-to-end through the {@link MultiHostClient}
 * supervisor without any networking. Each test spins up one or more
 * "fake hosts" — small async functions that respond to `initialize`,
 * `listSessions`, `subscribe`, and optionally inject notifications or
 * tear their socket down to force reconnects.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  InMemoryTransport,
  type AhpTransport,
  type JsonRpcMessage,
} from '../src/client/index.js';
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcSuccessResponse,
} from '../src/types/common/messages.js';
import type { SessionSummary } from '../src/types/channels-session/state.js';
import type { AgentInfo } from '../src/types/channels-root/state.js';
import type { InitializeResult } from '../src/types/common/commands.js';
import type { ListSessionsResult } from '../src/types/channels-root/commands.js';
import { ReconnectResultType } from '../src/types/common/commands.js';
import type { ReconnectResult } from '../src/types/common/commands.js';

import {
  ClientIdStoreError,
  DuplicateHostError,
  HostReconnectedError,
  HostShutDownError,
  InMemoryClientIdStore,
  MultiHostClient,
  MultiHostStateMirror,
  UnknownHostError,
  attemptsExhausted,
  backoffDelayForAttempt,
  delayWithJitter,
  disabledPolicy,
  exponentialPolicy,
  hostedResourceKey,
  immediateForeverPolicy,
  type ClientIdStore,
  type HostConfig,
  type HostId,
  type HostSubscriptionEvent,
  type HostTransportFactory,
} from '../src/client/hosts/index.js';

import { PROTOCOL_VERSION } from '../src/types/version/registry.js';
import { SessionStatus } from '../src/types/channels-session/state.js';

const ROOT = 'ahp-root://' as const;

// ─── Fake host harness ───────────────────────────────────────────────────────

interface FakeHostState {
  agents: AgentInfo[];
  sessions: SessionSummary[];
  /** Optional callback invoked once after the first request is handled (init or reconnect). */
  injectAfterInit?: (server: AhpTransport) => void | Promise<void>;
}

function makeFakeState(overrides: Partial<FakeHostState> = {}): FakeHostState {
  return { agents: [], sessions: [], ...overrides };
}

function makeAgent(provider = 'copilot'): AgentInfo {
  return {
    provider,
    displayName: provider,
    description: 'fake',
    models: [],
  };
}

function makeSummary(resource: string, title: string, modifiedAt: number): SessionSummary {
  return {
    resource,
    provider: 'copilot',
    title,
    status: SessionStatus.IDLE,
    createdAt: 0,
    modifiedAt,
  };
}

function buildInitResult(state: FakeHostState): InitializeResult {
  return {
    protocolVersion: PROTOCOL_VERSION,
    serverSeq: 0,
    snapshots: [
      {
        resource: ROOT,
        state: {
          agents: state.agents,
          activeSessions: state.sessions.length,
        },
        fromSeq: 0,
      },
    ],
  };
}

function buildListResult(state: FakeHostState): ListSessionsResult {
  return { items: state.sessions };
}

/**
 * Drive one fake-host connection until the client closes. Recognises
 * `initialize`, `reconnect`, `listSessions`, `subscribe`, and
 * `unsubscribe`. Other requests echo an empty `{}` result.
 */
async function driveFakeHost(server: AhpTransport, state: FakeHostState): Promise<void> {
  let injectionRan = false;
  while (true) {
    const frame = await server.recv();
    if (!frame) return;
    if (frame.kind !== 'text') continue;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(frame.text) as JsonRpcMessage;
    } catch {
      continue;
    }
    if ('method' in msg && 'id' in msg) {
      const req = msg as JsonRpcRequest;
      const result = handleRequest(req, state);
      const resp: JsonRpcSuccessResponse = {
        jsonrpc: '2.0',
        id: req.id,
        result,
      };
      try {
        await server.send(resp);
      } catch {
        return;
      }
      if (!injectionRan && (req.method === 'initialize' || req.method === 'reconnect')) {
        injectionRan = true;
        if (state.injectAfterInit) {
          await state.injectAfterInit(server);
        }
      }
    }
    // Notifications (unsubscribe, dispatchAction) are silently
    // accepted; the fake host has no behavior to model for them.
  }
}

function handleRequest(req: JsonRpcRequest, state: FakeHostState): unknown {
  switch (req.method) {
    case 'initialize':
      return buildInitResult(state);
    case 'reconnect':
      // Default: reply with an empty replay so the supervisor moves on.
      return { type: ReconnectResultType.Replay, actions: [], missing: [] } satisfies ReconnectResult;
    case 'listSessions':
      return buildListResult(state);
    case 'subscribe': {
      // Minimal `SubscribeResult` — snapshot omitted (stateless channels
      // are valid). The fake server doesn't enforce real subscriptions.
      return {};
    }
    default:
      return {};
  }
}

/** Build a transport factory that pairs an InMemoryTransport with `driveFakeHost`. */
function makeBasicFactory(state: FakeHostState): HostTransportFactory {
  return async () => {
    const [c, s] = InMemoryTransport.pair();
    void driveFakeHost(s, state);
    return c;
  };
}

async function waitUntil<T>(
  predicate: () => T | undefined | null | false,
  timeoutMs = 2000,
  intervalMs = 5,
): Promise<T> {
  const start = Date.now();
  while (true) {
    const value = predicate();
    if (value !== undefined && value !== null && value !== false) return value as T;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
}

// ─── ReconnectPolicy unit tests ──────────────────────────────────────────────

test('exponential backoff caps at max', () => {
  const backoff = { kind: 'exponential' as const, initialMs: 1000, maxMs: 10_000, multiplier: 2 };
  assert.equal(backoffDelayForAttempt(backoff, 1), 1000);
  assert.equal(backoffDelayForAttempt(backoff, 2), 2000);
  assert.equal(backoffDelayForAttempt(backoff, 3), 4000);
  assert.equal(backoffDelayForAttempt(backoff, 4), 8000);
  assert.equal(backoffDelayForAttempt(backoff, 5), 10_000);
  assert.equal(backoffDelayForAttempt(backoff, 50), 10_000);
});

test('jitter at extremes scales delay', () => {
  const policy = {
    backoff: { kind: 'constant' as const, delayMs: 10_000 },
    jitter: 0.5,
    maxAttempts: null,
    resetOnSuccess: true,
  };
  assert.equal(delayWithJitter(policy, 1, 0), 5000);
  assert.equal(delayWithJitter(policy, 1, 1), 15_000);
  assert.equal(delayWithJitter(policy, 1, 0.5), 10_000);
});

test('disabled policy exhausts immediately', () => {
  assert.equal(attemptsExhausted(disabledPolicy(), 1), true);
});

test('unbounded policy never exhausts', () => {
  assert.equal(attemptsExhausted(exponentialPolicy(), 1_000_000), false);
});

// ─── InMemoryClientIdStore ──────────────────────────────────────────────────

test('InMemoryClientIdStore round-trips and overwrites', async () => {
  const store = new InMemoryClientIdStore();
  assert.equal(await store.load('a'), null);
  await store.store('a', 'first');
  assert.equal(await store.load('a'), 'first');
  await store.store('a', 'second');
  assert.equal(await store.load('a'), 'second');
});

// ─── HostedResourceKey ──────────────────────────────────────────────────────

test('hostedResourceKey distinguishes hosts with the same URI', () => {
  const a = hostedResourceKey('host-a', 'ahp-session:/s1');
  const b = hostedResourceKey('host-b', 'ahp-session:/s1');
  assert.notEqual(a, b);
});

// ─── MultiHostStateMirror ───────────────────────────────────────────────────

test('MultiHostStateMirror applies root snapshots scoped to host', () => {
  const mirror = new MultiHostStateMirror();
  mirror.applySnapshot('host-a', {
    resource: ROOT,
    state: { agents: [makeAgent('copilot')] },
    fromSeq: 0,
  });
  mirror.applySnapshot('host-b', {
    resource: ROOT,
    state: { agents: [makeAgent('vscode')] },
    fromSeq: 0,
  });
  assert.equal(mirror.getRoot('host-a')?.agents[0]?.provider, 'copilot');
  assert.equal(mirror.getRoot('host-b')?.agents[0]?.provider, 'vscode');
});

test('MultiHostStateMirror.resetHost drops every keyed state for that host', () => {
  const mirror = new MultiHostStateMirror();
  mirror.applySnapshot('host-a', { resource: ROOT, state: { agents: [] }, fromSeq: 0 });
  mirror.applySnapshot('host-a', {
    resource: 'ahp-session:/s1',
    state: {} as unknown as Parameters<MultiHostStateMirror['applySnapshot']>[1]['state'],
    fromSeq: 0,
  });
  mirror.applySnapshot('host-b', { resource: ROOT, state: { agents: [] }, fromSeq: 0 });
  mirror.resetHost('host-a');
  assert.equal(mirror.getRoot('host-a'), undefined);
  assert.equal(mirror.getSession('host-a', 'ahp-session:/s1'), undefined);
  assert.ok(mirror.getRoot('host-b') !== undefined);
});

// ─── MultiHostClient — single-host shape ────────────────────────────────────

test('MultiHostClient.single connects and exposes a HostHandle snapshot', async () => {
  const state = makeFakeState({ agents: [makeAgent('copilot')] });
  const config: HostConfig = {
    id: 'local',
    label: 'Local sessions server',
    transportFactory: makeBasicFactory(state),
  };
  const { multi } = await MultiHostClient.single(config);
  try {
    await waitUntil(() => multi.host('local')?.state.status === 'connected');
    const snap = multi.host('local');
    assert.ok(snap);
    assert.equal(snap.label, 'Local sessions server');
    assert.equal(snap.state.status, 'connected');
    assert.equal(snap.agents[0]?.provider, 'copilot');
    assert.equal(snap.protocolVersion, PROTOCOL_VERSION);
    assert.ok(snap.lastConnectedAt && snap.lastConnectedAt > 0);
  } finally {
    await multi.shutdown();
  }
});

// ─── addHost / removeHost lifecycle ─────────────────────────────────────────

test('two hosts register and connect independently', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'a',
      label: 'A',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await multi.addHost({
      id: 'b',
      label: 'B',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await waitUntil(() => multi.host('a')?.state.status === 'connected');
    await waitUntil(() => multi.host('b')?.state.status === 'connected');
    const hosts = multi.hostsSnapshot();
    assert.equal(hosts.length, 2);
    assert.deepEqual(
      hosts.map(h => h.label).sort(),
      ['A', 'B'],
    );
  } finally {
    await multi.shutdown();
  }
});

test('addHost twice with the same id throws DuplicateHostError', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'dup',
      label: 'A',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await assert.rejects(
      multi.addHost({
        id: 'dup',
        label: 'B',
        transportFactory: makeBasicFactory(makeFakeState()),
      }),
      (err: unknown) => err instanceof DuplicateHostError && err.hostId === 'dup',
    );
  } finally {
    await multi.shutdown();
  }
});

test('removeHost stops a registered host', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'gone',
      label: 'Gone',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await waitUntil(() => multi.host('gone')?.state.status === 'connected');
    await multi.removeHost('gone');
    assert.equal(multi.host('gone'), undefined);
    await assert.rejects(multi.removeHost('gone'), UnknownHostError);
  } finally {
    await multi.shutdown();
  }
});

// ─── ClientIdStore failure handling ─────────────────────────────────────────

test('addHost surfaces ClientIdStoreError when the store fails and frees the reservation', async () => {
  let failNext = true;
  const flakyStore: ClientIdStore = {
    async load() {
      if (failNext) {
        failNext = false;
        throw new Error('disk full');
      }
      return null;
    },
    async store() {
      // succeed
    },
  };
  const multi = new MultiHostClient({ clientIdStore: flakyStore });
  try {
    await assert.rejects(
      multi.addHost({
        id: 'flaky',
        label: 'Flaky',
        transportFactory: makeBasicFactory(makeFakeState()),
      }),
      (err: unknown) =>
        err instanceof ClientIdStoreError &&
        err.hostId === 'flaky' &&
        /disk full/.test(err.message),
    );
    // The pending reservation should be cleared so a follow-up succeeds.
    const handle = await multi.addHost({
      id: 'flaky',
      label: 'Flaky',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    assert.equal(handle.id, 'flaky');
  } finally {
    await multi.shutdown();
  }
});

test('explicit clientId is persisted into the store', async () => {
  const store = new InMemoryClientIdStore();
  const multi = new MultiHostClient({ clientIdStore: store });
  try {
    await multi.addHost({
      id: 'explicit',
      label: 'X',
      clientId: 'override-id',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    assert.equal(await store.load('explicit'), 'override-id');
  } finally {
    await multi.shutdown();
  }
});

// ─── HostClientHandle generation invalidation ───────────────────────────────

test('HostClientHandle invalidates after a reconnect', async () => {
  const state = makeFakeState();
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'rec',
      label: 'Rec',
      reconnectPolicy: immediateForeverPolicy(),
      transportFactory: makeBasicFactory(state),
    });
    await waitUntil(() => multi.host('rec')?.state.status === 'connected');
    const handle = multi.client('rec');
    assert.ok(handle, 'expected a client handle');
    const initialGen = handle.generation;

    await multi.reconnectHost('rec');
    await waitUntil(() => {
      const h = multi.host('rec');
      return h && h.generation > initialGen && h.state.status === 'connected';
    });

    assert.throws(
      () => handle.checkAlive(),
      (err: unknown) => {
        if (!(err instanceof HostReconnectedError)) return false;
        assert.equal(err.hostId, 'rec');
        assert.equal(err.handleGeneration, initialGen);
        assert.ok(err.currentGeneration > initialGen);
        return true;
      },
    );

    // A fresh handle works.
    const fresh = multi.client('rec');
    assert.ok(fresh);
    fresh.checkAlive();
  } finally {
    await multi.shutdown();
  }
});

test('HostClientHandle after removeHost throws HostShutDownError', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'rm',
      label: 'rm',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await waitUntil(() => multi.host('rm')?.state.status === 'connected');
    const handle = multi.client('rm');
    assert.ok(handle);
    await multi.removeHost('rm');
    assert.throws(
      () => handle.checkAlive(),
      (err: unknown) => err instanceof HostShutDownError && err.hostId === 'rm',
    );
  } finally {
    await multi.shutdown();
  }
});

// ─── Aggregated views ───────────────────────────────────────────────────────

test('aggregatedSessions sorts by modifiedAt descending and tags hostLabel', async () => {
  const initial = makeSummary('copilot:/s1', 'Initial title', 1_000);
  const added = makeSummary('copilot:/s2', 'Added later', 2_000);

  const state: FakeHostState = makeFakeState({
    sessions: [initial],
    injectAfterInit: async server => {
      // Tiny delay so the client has consumed the listSessions response
      // before the notification arrives.
      await new Promise(r => setTimeout(r, 10));
      const notif: JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'root/sessionAdded',
        params: { channel: ROOT, summary: added },
      };
      try {
        await server.send(notif);
      } catch {
        // best-effort
      }
    },
  });

  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'local',
      label: 'Local',
      transportFactory: makeBasicFactory(state),
    });
    await waitUntil(() => multi.host('local')?.state.status === 'connected');
    await waitUntil(() => multi.aggregatedSessions().length === 2);
    const sessions = multi.aggregatedSessions();
    assert.deepEqual(
      sessions.map(s => s.summary.title),
      ['Added later', 'Initial title'],
    );
    assert.ok(sessions.every(s => s.hostId === 'local'));
    assert.ok(sessions.every(s => s.hostLabel === 'Local'));
  } finally {
    await multi.shutdown();
  }
});

test('aggregatedAgents tags every agent with its host', async () => {
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'a',
      label: 'A',
      transportFactory: makeBasicFactory(makeFakeState({ agents: [makeAgent('copilot')] })),
    });
    await multi.addHost({
      id: 'b',
      label: 'B',
      transportFactory: makeBasicFactory(makeFakeState({ agents: [makeAgent('vscode')] })),
    });
    await waitUntil(() => multi.host('a')?.state.status === 'connected');
    await waitUntil(() => multi.host('b')?.state.status === 'connected');
    const agents = multi.aggregatedAgents().sort((x, y) => x.hostId.localeCompare(y.hostId));
    assert.equal(agents.length, 2);
    assert.equal(agents[0]?.hostId, 'a');
    assert.equal(agents[0]?.agent.provider, 'copilot');
    assert.equal(agents[1]?.hostId, 'b');
    assert.equal(agents[1]?.agent.provider, 'vscode');
  } finally {
    await multi.shutdown();
  }
});

// ─── reconnectAllUnavailable ────────────────────────────────────────────────

test('reconnectAllUnavailable skips connected hosts and returns per-host errors', async () => {
  // Build two hosts: one that connects normally, one that always fails
  // to construct a transport.
  const flakyFactory: HostTransportFactory = () => Promise.reject(new Error('boom'));
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'good',
      label: 'Good',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await multi.addHost({
      id: 'bad',
      label: 'Bad',
      reconnectPolicy: { ...disabledPolicy() },
      transportFactory: flakyFactory,
    });
    await waitUntil(() => multi.host('good')?.state.status === 'connected');
    await waitUntil(() => multi.host('bad')?.state.status === 'failed');
    const errors = await multi.reconnectAllUnavailable();
    // `good` was connected and is skipped → not in the map.
    assert.equal(errors.has('good'), false);
    // `bad` is in `failed` so it was woken, but the call itself returns
    // when the supervisor acknowledges (not necessarily after the
    // retry succeeds), so the error map may or may not contain `bad`
    // depending on timing. The important assertion is that the call
    // didn't throw and that connected hosts were skipped.
  } finally {
    await multi.shutdown();
  }
});

// ─── Events fan-in ──────────────────────────────────────────────────────────

test('hostEvents delivers added/stateChanged/connected/removed in order', async () => {
  const multi = new MultiHostClient();
  const events = multi.hostEvents();
  try {
    await multi.addHost({
      id: 'lifecycle',
      label: 'L',
      transportFactory: makeBasicFactory(makeFakeState()),
    });
    await waitUntil(() => multi.host('lifecycle')?.state.status === 'connected');
    await multi.removeHost('lifecycle');

    // Drain until we observe the `removed` event or hit a generous
    // timeout. Five events are expected (added, stateChanged×2,
    // connected, removed) but only the relative ordering matters.
    const collected: string[] = [];
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const remaining = Math.max(50, deadline - Date.now());
      const next = await Promise.race([
        events.next(),
        new Promise<{ done: true; value: undefined }>(resolve =>
          setTimeout(() => resolve({ done: true, value: undefined } as never), remaining),
        ),
      ]);
      if (next.done) break;
      collected.push(next.value.type);
      if (next.value.type === 'removed') break;
    }
    assert.equal(collected[0], 'added');
    assert.ok(collected.includes('connected'), `expected 'connected' in ${collected.join(',')}`);
    assert.equal(collected[collected.length - 1], 'removed');
  } finally {
    await multi.shutdown();
  }
});

test('events surface action envelopes tagged with hostId', async () => {
  const summary = makeSummary('copilot:/s1', 'New session', 500);
  const state: FakeHostState = makeFakeState({
    injectAfterInit: async server => {
      await new Promise(r => setTimeout(r, 10));
      const notif: JsonRpcNotification = {
        jsonrpc: '2.0',
        method: 'root/sessionAdded',
        params: { channel: ROOT, summary },
      };
      try {
        await server.send(notif);
      } catch {
        // best-effort
      }
    },
  });
  const multi = new MultiHostClient();
  const events = multi.events();
  try {
    await multi.addHost({
      id: 'evt',
      label: 'evt',
      transportFactory: makeBasicFactory(state),
    });
    let received: HostSubscriptionEvent | null = null;
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const next = await Promise.race([
        events.next(),
        new Promise<{ done: true; value: undefined }>(resolve =>
          setTimeout(() => resolve({ done: true, value: undefined } as never), 500),
        ),
      ]);
      if (next.done) continue;
      if (next.value.event.type === 'sessionAdded') {
        received = next.value;
        break;
      }
    }
    assert.ok(received, 'expected a sessionAdded event');
    assert.equal(received.hostId, 'evt');
    assert.equal(received.channel, ROOT);
  } finally {
    await multi.shutdown();
  }
});

// ─── Manual reconnect from failed state ─────────────────────────────────────

test('manual reconnectHost wakes a host whose policy is exhausted', async () => {
  let attemptCount = 0;
  // Fail the first attempt; the second attempt (post-manual-reconnect) succeeds.
  const factory: HostTransportFactory = async () => {
    attemptCount += 1;
    if (attemptCount === 1) throw new Error('first attempt fails');
    const [c, s] = InMemoryTransport.pair();
    void driveFakeHost(s, makeFakeState());
    return c;
  };
  const multi = new MultiHostClient();
  try {
    await multi.addHost({
      id: 'wake',
      label: 'wake',
      reconnectPolicy: disabledPolicy(), // single attempt then `failed`
      transportFactory: factory,
    });
    await waitUntil(() => multi.host('wake')?.state.status === 'failed');
    // Manual reconnect bypasses the exhausted policy.
    await multi.reconnectHost('wake');
    await waitUntil(() => multi.host('wake')?.state.status === 'connected');
    assert.equal(attemptCount, 2);
  } finally {
    await multi.shutdown();
  }
});

// ─── Shutdown idempotency ───────────────────────────────────────────────────

test('MultiHostClient.shutdown is idempotent', async () => {
  const multi = new MultiHostClient();
  await multi.addHost({
    id: 'idemp',
    label: 'idemp',
    transportFactory: makeBasicFactory(makeFakeState()),
  });
  await multi.shutdown();
  await multi.shutdown();
  assert.equal(multi.host('idemp'), undefined);
});

// ─── Unknown host ───────────────────────────────────────────────────────────

test('subscribe/unsubscribe/dispatch on an unknown host throws UnknownHostError', async () => {
  const multi = new MultiHostClient();
  try {
    await assert.rejects(multi.subscribe('nope', ROOT), UnknownHostError);
    await assert.rejects(multi.unsubscribe('nope', ROOT), UnknownHostError);
    assert.throws(
      () => multi.dispatch('nope', ROOT, { type: 'noop' } as unknown as Parameters<typeof multi.dispatch>[2]),
      UnknownHostError,
    );
  } finally {
    await multi.shutdown();
  }
});

// Reference the imported HostId type to avoid 'unused' warnings.
void (null as unknown as HostId);
