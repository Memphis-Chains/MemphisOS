# MemphisOS Backlog

Updated: 2026-03-12

## Completed Now (Clean-Slate Pass)

- Created and pushed `Memphis-Chains/MemphisOS`.
- Enabled and verified `main` branch protection (`quality-gate`, PR required, admin enforce, no force push).
- Removed inherited legacy bulk:
  - old docs/reports/proposals
  - benchmark/demo/deploy/plugin/package bundles
  - non-core GitHub workflows
  - legacy smoke/phase scripts
- Kept OS-core code paths:
  - `src/` runtime + orchestrator + storage
  - `crates/` Rust kernel/vault/embed/NAPI crates
  - `tests/` suite
  - minimal ops scripts (`enforce/verify protection`, `setup-githooks`)
- Stabilized CI and package surface for clean-slate repo.
- Full checks pass on current tree:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:ts`
  - `npm run test:rust`
- Added admin signature verification for dual-approval endpoints:
  - `MEMPHIS_ADMIN_PUBLIC_KEYS_JSON` key registry
  - `MEMPHIS_ADMIN_SIGNATURE_REQUIRED` fail-closed mode
- Added immutable `system` chain events for dual-approval lifecycle transitions with correlation IDs.
- Added Prometheus counters and `/v1/metrics` snapshot fields for:
  - queue overload rejects
  - safe-mode denials
  - dual-approval transitions
- Added integration/unit coverage for signature enforcement and new metrics.
- Added/enforced CODEOWNERS + code-owner review on protected `main`.
- Enabled GitHub security controls (Dependabot alerts/updates, secret scanning, push protection).

## In Progress Architecture (Already Implemented)

- Durable queue wiring with WAL + backpressure (`TaskQueueService`, `TaskQueueWal`).
- Dual-approval persistence and CAS transitions (`dual_approval_requests/events`).
- Trust-root transition validation module with downgrade protection checks.
- Safe-mode boundaries and security critical fallback logging.

## Next Priority Tasks

1. Add queue resume worker semantics (recover pending tasks and re-dispatch policies on restart).
2. Add runbooks:
   - Safe Mode operations
   - systemd exit-code mapping (`RestartPreventExitStatus=102,103`)
   - trust-root rotation ceremony
3. Document admin signature key rotation and bootstrap in `SECURITY.md`.
4. Extend dual-approval signing to include explicit `approval_request_id` idempotency checks in API contracts.
5. Add restart drill test for queue recovery policy (crash with pending task, restart, deterministic outcome).
