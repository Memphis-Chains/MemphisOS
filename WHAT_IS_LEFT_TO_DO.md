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
- Added runtime TaskExecutor loop integration:
  - `OrchestrationService.generate` now runs through `TaskExecutor` (Think -> Act -> Observe)
  - System/tool/error lifecycle events are persisted to `system` chain
  - Queue redispatch passes stable `runId` and reuses cached `task.tool_result` events to avoid re-running completed tool calls after restart.
- Added SOUL API + CLI surface:
  - HTTP endpoints: `POST /v1/soul/replay`, `POST /v1/soul/loop-step`
  - CLI commands: `memphis soul replay`, `memphis soul step`
  - Added replay block loader/normalizer utility for chain-backed replays.
- Added direct bootstrap queue-resume coverage:
  - exported startup resume policy resolver (`safe-mode + redispatch => keep` override)
  - unit tests for startup queue resume dispatch path.
- Added API-level idempotency replay coverage for `dual-approval/cancel`:
  - replay with same `approvalRequestId` returns stable state
  - no duplicate dual-approval transition metric on replay.
- Exposed queue resume runtime state in `/v1/ops/status`:
  - `queue.resumePolicy` (configured default)
  - `queue.lastResume` summary (`policy`, counters, `errors`, `completedAt`).
- Added runbook for queue resume controls and mode expectations:
  - `docs/runbooks/QUEUE_RESUME_POLICY.md`
  - includes `MEMPHIS_QUEUE_RESUME_POLICY` and `financial` vs `standard` guidance.
- Added explicit replay markers on dual-approval mutation responses:
  - `POST /v1/admin/dual-approval/approve` returns `replayed: boolean`
  - `POST /v1/admin/dual-approval/cancel` returns `replayed: boolean`
  - integration tests cover first-call (`replayed=false`) vs idempotent retry (`replayed=true`).
- Added bootstrap startup queue-resume drill:
  - integration test executes the real startup resume path via `resumeRecoveredQueueTasksOnStartup`
  - validates `queue.resume.startup` audit payload fields, including safe-mode `redispatch -> keep` override.
- Surfaced startup queue-recovery decision in `/v1/ops/status`:
  - top-level `startup.queueResume` now exposes policy, safe-mode override, counters, and completion timestamp from bootstrap runtime.
  - integration coverage validates both null default and populated startup status paths.
- Extended `doctor` queue-policy risk checks:
  - adds `t4-queue-resume-policy` warning when `MEMPHIS_QUEUE_MODE=financial` and `MEMPHIS_QUEUE_RESUME_POLICY=redispatch`
  - recommends `MEMPHIS_QUEUE_RESUME_POLICY=keep` for financial profiles
  - includes tests for both warning and pass cases.

## In Progress Architecture (Already Implemented)

- Durable queue wiring with WAL + backpressure (`TaskQueueService`, `TaskQueueWal`).
- Dual-approval persistence and CAS transitions (`dual_approval_requests/events`).
- Trust-root transition validation module with downgrade protection checks.
- Safe-mode boundaries and security critical fallback logging.

## Next Priority Tasks

1. Remove duplicate `quality-gate` check contexts by updating CI trigger strategy so PRs produce a single required status (eliminates stuck `push` + `pull_request` duplication).
2. Add an operator profile switch for branch-protection automation (`solo` vs `team`) to avoid repeated manual protection relax/restore churn.
