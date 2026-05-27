# Contributing to the Agent Host Protocol

Thanks for your interest in contributing to AHP. This document covers the
mechanics of working in this repository as a contributor — for the
protocol design rationale see the [specification](docs/specification/) and
the [versioning policy](docs/specification/versioning.md), and for the
mechanics of cutting a release see [`RELEASING.md`](RELEASING.md).

> **Code of conduct:** participation is governed by the
> [Microsoft Open Source Code of Conduct](CODE_OF_CONDUCT.md).

## Repository layout

This is a polyglot repo. The TypeScript types under `types/` are the canonical
source of truth; everything else is generated from them or hand-maintained
against them.

| Path | What lives here |
| --- | --- |
| `types/` | Canonical TypeScript protocol types, reducers, version registry. |
| `schema/` | JSON Schema files generated from `types/`. |
| `docs/` | VitePress documentation source. |
| `scripts/` | TypeScript code-gen scripts (one per target language + shared helpers). |
| `clients/rust/` | `ahp-types`, `ahp`, `ahp-ws` Cargo workspace. |
| `clients/kotlin/` | Kotlin/JVM library (`com.microsoft.agenthostprotocol:agent-host-protocol`). |
| `clients/swift/` | Swift package (consumed by SwiftPM at the repo root). |
| `clients/typescript/` | npm package `@microsoft/agent-host-protocol`. |
| `.github/workflows/` | CI and per-artifact publish pipelines. |

## Local dev loop

```bash
npm install                      # install root tooling
npm run generate                 # regenerate every client + schemas
npm test                         # typecheck + lint + verify:release-metadata + reducer tests
```

Per-client builds (run only what's relevant to your change):

```bash
cd clients/typescript && npm ci && npm test && npm run build
cd clients/rust && cargo test --workspace
cd clients/kotlin && ./gradlew build
swift build && swift test        # Swift uses the root Package.swift
```

## Releases

Release mechanics — tag conventions, per-client publish flows, CI guards,
and the one-time admin setup for each environment — live in
[`RELEASING.md`](RELEASING.md). For the protocol-level versioning policy,
see [`docs/specification/versioning.md`](docs/specification/versioning.md).

## Code-style and review

Editor / lint / typecheck configuration lives in this repo's `eslint.config.mjs`,
`tsconfig.json`, and (per-client) the equivalent files. Run `npm test` before
opening a PR; CI runs the same checks plus per-language builds.

When iterating on the protocol surface in `types/`, see
[`.github/instructions/general-instructions.instructions.md`](.github/instructions/general-instructions.instructions.md)
for the project's editorial rules on type changes.

For language-specific code-gen conventions, see the `AGENTS.md` file in each
client directory (`clients/kotlin/AGENTS.md`, `clients/swift/AGENTS.md`).
