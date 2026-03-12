# Clean-Slate Scope

Date: 2026-03-12

Goal: remove inherited legacy bulk and keep only MemphisOS core.

## Kept

- Rust kernel crates (`crates/`)
- TypeScript runtime/orchestration (`src/`)
- Tests (`tests/`)
- CI quality gate (`.github/workflows/ci.yml`)
- Branch-protection scripts (`scripts/enforce-branch-protection.sh`, `scripts/verify-branch-protection.sh`)
- Git hook setup (`scripts/setup-githooks.mjs`)

## Removed

- Legacy docs/release reports and proposal archives
- Benchmark/demo/deploy/plugin/package bundles
- Non-core workflows and smoke scripts

## Follow-up

- Keep new additions scoped to OS runtime and kernel concerns.
- Add docs only for active production flows and invariants.
