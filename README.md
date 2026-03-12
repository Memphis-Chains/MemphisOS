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
npm run test:ts
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

## Security Notes

- Never commit `.env` or raw tokens.
- Use short-lived tokens where possible.
- Keep `main` protected and require `quality-gate`.
