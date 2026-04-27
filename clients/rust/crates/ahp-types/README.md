# ahp-types

Wire protocol types for the [Agent Host Protocol (AHP)](https://github.com/microsoft/agent-host-protocol).

[![crates.io](https://img.shields.io/crates/v/ahp-types.svg)](https://crates.io/crates/ahp-types)
[![docs.rs](https://img.shields.io/docsrs/ahp-types)](https://docs.rs/ahp-types)

This crate provides Rust counterparts for the TypeScript source-of-truth types. All types are `Serialize + Deserialize` and use the same JSON field names as the protocol wire format.

## Modules

| Module | Contents |
|---|---|
| [`state`](https://docs.rs/ahp-types/latest/ahp_types/state/) | `RootState`, `SessionState`, tool-call lifecycle, terminal state |
| [`actions`](https://docs.rs/ahp-types/latest/ahp_types/actions/) | `StateAction` discriminated union and `ActionEnvelope` |
| [`commands`](https://docs.rs/ahp-types/latest/ahp_types/commands/) | Command params and result types |
| [`notifications`](https://docs.rs/ahp-types/latest/ahp_types/notifications/) | Protocol notifications |
| [`messages`](https://docs.rs/ahp-types/latest/ahp_types/messages/) | JSON-RPC wire envelopes |
| [`errors`](https://docs.rs/ahp-types/latest/ahp_types/errors/) | AHP and JSON-RPC error codes |
| [`version`](https://docs.rs/ahp-types/latest/ahp_types/version/) | Protocol version constants |

## Usage

```toml
[dependencies]
ahp-types = "0.1"
serde_json = "1"
```

```rust
use ahp_types::actions::{ActionEnvelope, StateAction};

let json = r#"{
  "action": { "type": "session/titleChanged", "session": "copilot:/s1", "title": "Hi" },
  "serverSeq": 7,
  "origin": null
}"#;
let env: ActionEnvelope = serde_json::from_str(json).unwrap();
match env.action {
    StateAction::SessionTitleChanged(a) => println!("title: {}", a.title),
    _ => {}
}
```

## Code generation

These files are generated from the TypeScript source of truth in [`types/`](../../../../types/). Regenerate with:

```sh
npm run generate:rust
```

from the repository root (requires Node.js and a Rust toolchain).
