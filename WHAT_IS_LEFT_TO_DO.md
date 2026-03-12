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
- Implemented queue resume worker semantics:
  - resume policies: `keep` / `fail` / `redispatch`
  - startup queue recovery + redispatch in bootstrap
  - persisted queue payload for resumable chat tasks
- Added queue restart drill coverage (`tests/integration/queue-resume-restart.e2e.test.ts`).
- Added runbooks:
  - safe mode operations
  - systemd exit-code mapping
  - trust-root rotation ceremony
- Added dual-approval API idempotency contract:
  - required `approvalRequestId` for approve/cancel
  - persistent idempotency reservation table and replay handling
- Cleared dependency security advisories (`npm audit` now reports `0` vulnerabilities).
- Added Rust SOUL primitives and TS bridge wiring:
  - `memphis-core`: `harness` (deterministic replay + snapshot), `loop_engine`, `memory`
  - `memphis-napi`: `soul_replay`, `soul_loop_step`
  - TS adapter methods + unit coverage for replay/loop paths.

## In Progress Architecture (Already Implemented)

- Durable queue wiring with WAL + backpressure (`TaskQueueService`, `TaskQueueWal`).
- Dual-approval persistence and CAS transitions (`dual_approval_requests/events`).
- Trust-root transition validation module with downgrade protection checks.
- Safe-mode boundaries and security critical fallback logging.

## Next Priority Tasks

1. Add direct tests for bootstrap startup queue-resume path (including `safe-mode + redispatch -> keep` policy override).
2. Add API-level tests for `dual-approval/cancel` idempotency replay using `approvalRequestId`.
3. Expose queue resume policy and last-run summary in `/v1/ops/status` payload.
4. Add operational docs for queue resume env controls:
   - `MEMPHIS_QUEUE_RESUME_POLICY`
   - expectations for financial vs standard queue modes.
