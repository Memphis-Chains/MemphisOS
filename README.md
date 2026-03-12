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

## Branch Protection Ops

```bash
# Apply protection
GITHUB_OWNER=Memphis-Chains GITHUB_REPO=MemphisOS GITHUB_BRANCH=main npm run -s ops:protect-main

# Verify protection
GITHUB_OWNER=Memphis-Chains GITHUB_REPO=MemphisOS GITHUB_BRANCH=main npm run -s ops:verify-main-protection
```

## Security Notes

- Never commit `.env` or raw tokens.
- Use short-lived tokens where possible.
- Keep `main` protected and require `quality-gate`.
