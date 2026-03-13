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
npm run -s ops:export-incident-bundle -- \
  --profile financial-strict \
  --out data/incident-bundle.json \
  --encryption-passphrase "$MEMPHIS_INCIDENT_TRANSFER_PASSPHRASE"
npm run -s ops:export-incident-bundle -- \
  --profile forensics-lite \
  --out data/incident-bundle.json
npm run -s ops:strict-incident-handoff -- \
  --status-url http://127.0.0.1:8080/v1/ops/status \
  --audit-path data/security-audit.jsonl \
  --out data/incident-bundle.json \
  --manifest-out data/incident-bundle.manifest.json \
  --signing-key-path /secure/path/incident-signing-key.pem \
  --signing-key-id incident-key-v2 \
  --public-key-bundle-path data/public-key-bundle.json \
  --trust-root-path config/trust_root.json
npm run -s ops:strict-incident-handoff -- \
  --preflight-only \
  --signing-key-path /secure/path/incident-signing-key.pem \
  --signing-key-id incident-key-v2 \
  --public-key-bundle-path data/public-key-bundle.json \
  --trust-root-path config/trust_root.json
npm run -s ops:strict-incident-handoff -- --completion-hints
npm run -s ops:verify-incident-manifest -- \
  --manifest-path data/incident-bundle.manifest.json \
  --public-key-path /secure/path/incident-signing-public.pem \
  --expected-key-id incident-key-v1 \
  --require-signature
npm run -s ops:verify-incident-manifest -- \
  --profile trust-root-strict \
  --manifest-path data/incident-bundle.manifest.json \
  --public-key-bundle-path data/public-key-bundle.json \
  --expected-key-id incident-key-v1
npm run -s ops:verify-incident-manifest -- \
  --profile legacy-compat \
  --manifest-path data/incident-bundle.manifest.json
npm run -s ops:verify-incident-manifest -- \
  --manifest-path data/incident-bundle.manifest.json.enc \
  --decryption-passphrase "$MEMPHIS_INCIDENT_TRANSFER_PASSPHRASE" \
  --public-key-path /secure/path/incident-signing-public.pem \
  --expected-key-id incident-key-v1 \
  --require-signature
npm run -s ops:rotate-key-bundle -- \
  --trust-root-path config/trust_root.json \
  --trust-root-signing-key-path /secure/path/trust-root-signer.pem \
  --base-bundle-path data/public-key-bundle.json \
  --bundle-out data/public-key-bundle.json \
  --new-key-id incident-key-v2 \
  --new-private-key-out /secure/path/incident-key-v2.pem \
  --new-public-key-out data/incident-key-v2.pub.pem
```

`ops:export-incident-bundle` defaults:

- sensitive fields in status/audit payloads are redacted (`[REDACTED]`)
- bundle history is pruned by retention policy (`--retention-count`, `--retention-days`)
- optional forensic manifest is written when `--manifest-out` or any signing key source is provided
- signing key sources: `--signing-key-path`, `--signing-key-pem`, `--signing-key-pem-base64` (or matching env vars)
- optional signer metadata: `--signing-key-id` / `MEMPHIS_INCIDENT_BUNDLE_SIGNING_KEY_ID`
- encrypted-at-rest companion artifacts: `--encryption-passphrase`, `--encryption-passphrase-base64`, `--encryption-passphrase-file` (or matching env vars)
- optional encrypted output overrides: `--encrypted-bundle-out`, `--encrypted-manifest-out`
- policy gate: `--require-encrypted-artifacts` or `MEMPHIS_INCIDENT_REQUIRE_ENCRYPTED_ARTIFACTS=true` (recommended for financial mode)
- profiles: `--profile financial-strict|forensics-lite|strict-handoff` (or `MEMPHIS_INCIDENT_BUNDLE_EXPORT_PROFILE`)
  - `financial-strict`: requires encrypted artifacts + writes manifest by default + higher audit/retention defaults
  - `forensics-lite`: writes manifest by default with lighter defaults, encryption optional
  - `strict-handoff`: writes manifest + includes cognitive summaries by default for strict verifier handoff

`ops:verify-incident-manifest` checks:

- manifest schema validity (`schemaVersion=1`)
- bundle path existence + hash + byte-size integrity
- encrypted manifest/bundle companions are supported with `--decryption-passphrase` (or matching env vars)
- optional Ed25519 signature verification with fingerprint + payload hash + `keyId` expectation checks
- detached key registry mode supported via `--public-key-bundle-path` (`schemaVersion:1`, `keys:[{keyId,publicKeyPem}]`)
- optional detached-bundle provenance enforcement via `--require-key-bundle-signature --trust-root-path <trust_root.json>`
- verification results are linked to immutable `system` chain events (`incident_manifest.verification`); use `--skip-chain-event` only for read-only dry runs
- chain-link reliability controls: `--chain-event-retry-count`, `--chain-event-retry-backoff-ms`, and `MEMPHIS_INCIDENT_CHAIN_EVENT_REQUIRED=true|false`
- profiles: `--profile trust-root-strict|legacy-compat` (or `MEMPHIS_INCIDENT_MANIFEST_VERIFY_PROFILE`)
  - `trust-root-strict`: enables signature + detached key-bundle provenance enforcement (strict handoff mode)
  - `legacy-compat`: disables strict signature/provenance and treats chain-link failures as non-fatal

`ops:strict-incident-handoff` quick reference:

- runs export (`--profile strict-handoff`) and verify (`--profile trust-root-strict`) in one command
- supports `--preflight-only` readiness checks without running export/verify
- fails preflight when signer key input, public key bundle path, trust root path, or signer key id are missing
- `--completion-hints` prints machine-readable flag/env contracts for shell tooling
- `ops:validate-strict-handoff-fixtures` validates strict-handoff fixture payloads + live command output against JSON Schemas
- integration contract fixtures for tooling:
  - summary/completion contract: `tests/fixtures/strict-handoff/output-contract.json`
  - JSON Schemas: `tests/fixtures/strict-handoff/summary.schema.json`, `tests/fixtures/strict-handoff/completion-hints.schema.json`
  - schema example payloads: `tests/fixtures/strict-handoff/summary-example-preflight.json`, `tests/fixtures/strict-handoff/completion-hints-example.json`
  - failure contracts: `tests/fixtures/strict-handoff/failure-preflight.json`, `tests/fixtures/strict-handoff/failure-export.json`, `tests/fixtures/strict-handoff/failure-verify.json`
  - parser/validation examples (`jq`, TypeScript, Ajv CLI): `docs/runbooks/INCIDENT_MANIFEST_VERIFICATION.md`

`ops:rotate-key-bundle` does:

- generates a new Ed25519 incident-signing keypair
- appends the new public key to the detached bundle
- signs bundle provenance with the active trust root signer (fails closed if signer root is not trusted)
- emits machine-readable output with new key paths and signer metadata

## Package And Release

Preferred: run the guarded draft-release workflow in GitHub Actions (`release-draft`), then review and publish the generated draft release.

Manual fallback:

```bash
npm run -s lint
npm run -s typecheck
npm run -s test:ops-artifacts
npm run -s test:ts
npm run -s test:chaos
npm run -s test:rust
npm pack --dry-run
npm pack
```

Release details and workflow inputs are documented in `docs/runbooks/RELEASE.md`.

## Security Notes

- Never commit `.env` or raw tokens.
- Use short-lived tokens where possible.
- Keep `main` protected and require `quality-gate`.
