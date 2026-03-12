# MemphisOS

MemphisOS is a hybrid agent operating system:

- Rust kernel crates for integrity, vault, and deterministic core primitives.
- TypeScript orchestrator/runtime for HTTP, CLI, routing, and policy enforcement.
- Safety-first execution model with safe mode, branch protection ops, queue durability, and dual-approval controls.

## Repository Scope (Clean-Slate)

This repository was cleaned to keep only OS-core components.

Kept:

- `src/` runtime, orchestration, storage, auth, gateway, CLI
- `crates/` Rust core crates
- `tests/` unit/integration coverage
- `.github/workflows/ci.yml` quality gate
- `scripts/enforce-branch-protection.sh`
- `scripts/verify-branch-protection.sh`
- `scripts/setup-githooks.mjs`

Removed:

- legacy benchmark/demo/deploy/plugin/package bulk
- old release artifacts and non-core docs/workflows

## Quick Start

```bash
npm ci
npm run lint
npm run typecheck
npm run test:ops-artifacts
npm run test:ts
npm run test:chaos
npm run test:rust
```

Run API:

```bash
npm run dev
```

Run CLI:

```bash
npm run cli
```

## Setup For Anyone (Guided)

Use the onboarding wizard to generate a working `.env` profile:

```bash
npm run -s cli -- onboarding wizard --interactive
```

Then run bootstrap checks (dry-run first):

```bash
npm run -s cli -- onboarding bootstrap --profile dev-local --dry-run --json
```

If you want hosted/API LLMs, set:

- `DEFAULT_PROVIDER=shared-llm` and `SHARED_LLM_API_BASE`, `SHARED_LLM_API_KEY`, or
- `DEFAULT_PROVIDER=decentralized-llm` and `DECENTRALIZED_LLM_API_BASE`, `DECENTRALIZED_LLM_API_KEY`.

For local-first operation, keep `DEFAULT_PROVIDER=ollama` (or `local-fallback`).

## Alerting Integrations

Optional external pager integrations:

- PagerDuty: `MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY`
- OpsGenie: `MEMPHIS_ALERT_OPSGENIE_API_KEY`

If delivery fails, Memphis writes `[ALERT_FALLBACK]` events into emergency logging.

## SOUL Kernel Primitives (Rust Core)

The Rust core now exposes deterministic SOUL primitives:

- `soul_replay`: deterministic replay report (`accepted`, `rejected`, `snapshot.state_hash`)
- `soul_loop_step`: bounded loop transitions for Think -> Act -> Observe style execution
- `memory` module: append + recall primitives (keyword/tag) with chain validation

These are available through the NAPI bridge and TS adapter (`NapiChainAdapter`).

## Branch Protection Ops

```bash
# Apply protection (team profile: requires 1 approval)
GITHUB_OWNER=Memphis-Chains GITHUB_REPO=MemphisOS GITHUB_BRANCH=main npm run -s ops:protect-main

# Verify protection
GITHUB_OWNER=Memphis-Chains GITHUB_REPO=MemphisOS GITHUB_BRANCH=main npm run -s ops:verify-main-protection

# Solo operator profile (0 required approvals, quality-gate still required)
MEMPHIS_BRANCH_PROTECTION_PROFILE=solo \
GITHUB_OWNER=Memphis-Chains GITHUB_REPO=MemphisOS GITHUB_BRANCH=main npm run -s ops:protect-main
```

## Guard Failure Drill

```bash
npm run -s ops:drill-guards
npm run -s ops:drill-guards -- --json
npm run -s ops:export-incident-bundle -- --out data/incident-bundle.json
npm run -s ops:export-incident-bundle -- \
  --out data/incident-bundle.json \
  --manifest-out data/incident-bundle.manifest.json \
  --signing-key-path /secure/path/incident-signing-key.pem \
  --signing-key-id incident-key-v1
npm run -s ops:verify-incident-manifest -- \
  --manifest-path data/incident-bundle.manifest.json \
  --public-key-path /secure/path/incident-signing-public.pem \
  --expected-key-id incident-key-v1 \
  --require-signature
```

`ops:export-incident-bundle` defaults:

- sensitive fields in status/audit payloads are redacted (`[REDACTED]`)
- bundle history is pruned by retention policy (`--retention-count`, `--retention-days`)
- optional forensic manifest is written when `--manifest-out` or any signing key source is provided
- signing key sources: `--signing-key-path`, `--signing-key-pem`, `--signing-key-pem-base64` (or matching env vars)
- optional signer metadata: `--signing-key-id` / `MEMPHIS_INCIDENT_BUNDLE_SIGNING_KEY_ID`

`ops:verify-incident-manifest` checks:

- manifest schema validity (`schemaVersion=1`)
- bundle path existence + hash + byte-size integrity
- optional Ed25519 signature verification with fingerprint + payload hash + `keyId` expectation checks
- detached key registry mode supported via `--public-key-bundle-path` (`schemaVersion:1`, `keys:[{keyId,publicKeyPem}]`)

## Security Notes

- Never commit `.env` or raw tokens.
- Use short-lived tokens where possible.
- Keep `main` protected and require `quality-gate`.
