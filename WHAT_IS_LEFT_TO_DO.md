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

## In Progress Architecture (Already Implemented)

- Durable queue wiring with WAL + backpressure (`TaskQueueService`, `TaskQueueWal`).
- Dual-approval persistence and CAS transitions (`dual_approval_requests/events`).
- Trust-root transition validation module with downgrade protection checks.
- Safe-mode boundaries and security critical fallback logging.

## Next Priority Tasks

1. Add cryptographic verification for admin action signatures in dual-approval endpoints.
2. Emit immutable chain events for dual-approval lifecycle transitions with correlation IDs.
3. Add queue resume worker semantics (recover pending tasks and re-dispatch policies on restart).
4. Add Prometheus counters for queue overload, dual-approval transitions, and safe-mode denials.
5. Add runbooks:
   - Safe Mode operations
   - systemd exit-code mapping (`RestartPreventExitStatus=102,103`)
   - trust-root rotation ceremony
6. Add CODEOWNERS and enforce code-owner review on protected branch.
7. Enable GitHub security features (Dependabot, secret scanning, push protection) and document status in `SECURITY.md`.
