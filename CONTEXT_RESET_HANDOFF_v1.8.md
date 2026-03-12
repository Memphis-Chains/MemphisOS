# Context Reset Handoff (v1.8 -> v1.8.1)

Date: 2026-03-12

## Repository migration status

- Local repo created: `/home/memphis_ai_brain_on_chain/MemphisOS`
- Base checkpoint used: `09f19a7` from previous `memphis` repo
- GitHub repo created and pushed: `https://github.com/elathoxu-crypto/MemphisOS`
- `main` branch protection enabled (`quality-gate`, PR review, admin enforce, no force push)

Note: Could not create under `Memphis-Chains` with current token because token identity is `elathoxu-crypto`.

## Implemented in this continuation slice

1. Durable API queue wiring + backpressure
- New: `src/infra/storage/task-queue-service.ts`
  - WAL-backed replay (`TaskQueueWal`)
  - fail-fast overload (`OVERLOAD`, HTTP 429)
  - queue snapshot metrics (pending, totals, recovered pending)
- Wired into chat route:
  - `src/infra/http/routes/chat.ts`
  - Queue-first persist before generation
  - finish markers on success/failure
- Wired into status:
  - `src/infra/http/server.ts` -> `/v1/ops/status` includes `queue`
  - `src/gateway/server.ts` -> `/ops/status` includes `queue`
- Container wiring:
  - `src/app/container.ts` creates `taskQueue`
  - `src/app/bootstrap.ts` passes `taskQueue`

2. Queue configuration + error code
- Updated:
  - `src/infra/config/schema.ts` (queue env fields)
  - `src/core/errors.ts` (`OVERLOAD` code)

3. Dual-approval state machine persistence (CAS + events)
- Migration:
  - `src/infra/storage/sqlite/client.ts`
  - Added tables:
    - `dual_approval_requests`
    - `dual_approval_events`
- New repository:
  - `src/infra/storage/sqlite/repositories/dual-approval-repository.ts`
  - Features:
    - create/approve/cancel/expire
    - optimistic CAS via `state_version`
    - self-approve denial (normalized identities)
    - transition event persistence
- Container wiring:
  - `src/app/container.ts` creates `dualApprovalRepository`
- HTTP endpoints:
  - `POST /v1/admin/dual-approval/request`
  - `POST /v1/admin/dual-approval/approve`
  - `POST /v1/admin/dual-approval/cancel`
  - `GET /v1/admin/dual-approval/:requestId`
  - implemented in `src/infra/http/server.ts`
  - auth policy updated in `src/infra/http/auth-policy.ts`

4. Trust-root validation module
- New:
  - `src/infra/runtime/trust-root.ts`
  - forward-only version check (`new_version > current_version`)
  - transition metadata validation

5. Package metadata updated for new repo
- `package.json` repository/homepage/bugs now point to `elathoxu-crypto/MemphisOS`

## Tests added/updated in this slice

New tests:
- `tests/unit/task-queue-service.test.ts`
- `tests/unit/dual-approval-repository.test.ts`
- `tests/unit/trust-root.test.ts`
- `tests/integration/chat-queue-overload.e2e.test.ts`

Updated tests:
- `tests/integration/ops-status.e2e.test.ts`
- `tests/integration/ops-health-color.e2e.test.ts`

## Verified commands (passed)

```bash
cd /home/memphis_ai_brain_on_chain/MemphisOS
npm run -s test:ts -- \
  tests/unit/task-queue-service.test.ts \
  tests/unit/dual-approval-repository.test.ts \
  tests/unit/trust-root.test.ts \
  tests/integration/chat-queue-overload.e2e.test.ts \
  tests/integration/ops-status.e2e.test.ts \
  tests/integration/ops-health-color.e2e.test.ts

npm run -s typecheck
```

## Git status summary for this slice

Primary changed files:
- `src/app/bootstrap.ts`
- `src/app/container.ts`
- `src/core/errors.ts`
- `src/gateway/server.ts`
- `src/infra/config/request-schemas.ts`
- `src/infra/config/schema.ts`
- `src/infra/http/auth-policy.ts`
- `src/infra/http/routes/chat.ts`
- `src/infra/http/server.ts`
- `src/infra/storage/sqlite/client.ts`
- `src/infra/storage/task-queue-service.ts` (new)
- `src/infra/storage/sqlite/repositories/dual-approval-repository.ts` (new)
- `src/infra/runtime/trust-root.ts` (new)
- `tests/integration/chat-queue-overload.e2e.test.ts` (new)
- `tests/unit/task-queue-service.test.ts` (new)
- `tests/unit/dual-approval-repository.test.ts` (new)
- `tests/unit/trust-root.test.ts` (new)
- `WHAT_IS_LEFT_TO_DO.md`

## Remaining work (next slice)

1. Add signed-admin receipt verification in dual-approval endpoints (validate signature payload).
2. Emit immutable chain blocks for dual-approval transitions with correlation IDs.
3. Add restart-resume worker flow for pending queue tasks (not only replayed status).
4. Add Prometheus counters for queue overload and dual-approval transitions.
5. Add Safe Mode runbook docs + systemd mapping (`RestartPreventExitStatus=102,103`).
