# MemphisOS Roadmap

Updated: 2026-03-13

## Status

- Core product work is complete for the current phase.
- Release-path hardening is complete on `main`.
- New-user install guidance is in `docs/GETTING_STARTED.md`.
- Remaining work is about release execution, real usage, and platform expansion.

## Current Priorities

1. Cut and review the first guarded draft release from `.github/workflows/release-draft.yml`.
2. Run a real local install/start/use pass and capture the first operator tutorial.
3. Convert early user friction into README, onboarding, and `doctor` improvements.
4. Keep optional hardening focused on real failures, not speculative churn.

## Near-Term Roadmap

### 1. Release

- Run the guarded draft release workflow.
- Review generated artifacts, checksums, and release notes.
- Publish `v0.1.0` when the first release candidate passes manual review.

### 2. Adoption

- Add step-by-step tutorials for the first three real workflows.
- Add screenshots or terminal transcripts for new users.
- Tighten onboarding defaults from actual install feedback.

### 3. Operations

- Validate backup, restore, incident export, and startup-guard flows in a real deployment.
- Add only the runbooks that operators actually need in practice.
- Keep CI and release contracts fail-closed.

### 4. Packaging And Platform Growth

- Improve install packaging for non-developer users.
- Evaluate system service packaging for MemphisOS itself.
- Define a managed third-party application model.

## Stretch Goal: Downstream App Integrations

Goal: make MemphisOS a clean core for managed third-party applications while keeping vendor-specific integrations outside `main`.

Core capabilities that belong in MemphisOS:

1. Third-party app manifests: package source, version pinning, checksum policy, install/update commands.
2. Runtime dependency checks: runtimes, package managers, service-manager prerequisites, and host compatibility.
3. Managed state layout: dedicated app home/state/config paths instead of ad hoc directories.
4. Service supervision: install, start, stop, restart, logs, health, and auto-recovery for long-running apps.
5. Secret brokering: map Memphis vault entries into app env/files without leaking credentials.
6. Port and ingress policy: reserve, expose, and audit app web/UI ports safely.
7. Compatibility doctor: preflight checks for app-specific requirements and known footguns.
8. Upgrade and rollback: versioned installs with safe revert if a new app build fails.

Downstream integration policy:

- `main` keeps the generic managed-app framework.
- concrete integrations such as OpenClaw should live in separate branches or downstream repos.
- only reusable framework pieces should be merged back into `main`.

## Reference Docs

- `docs/GETTING_STARTED.md`
- `docs/MANAGED_APPS.md`
- `docs/runbooks/RELEASE.md`
- `docs/PROJECT_HISTORY.md`
