# MemphisOS Roadmap

Updated: 2026-03-14

## Status

- `v0.1.0` is shipped.
- Release-path hardening is complete on `main`.
- New-user install guidance is in `docs/GETTING_STARTED.md`.
- The first post-release control-plane foundation is now in `main`:
  - `workspace init` / `context sync`
  - managed-app capability metadata
  - capability-aware `apps show` / `apps plan`
  - capability-aware `doctor` catalog checks
  - generic downstream MCP manifest template
- Current work should stay small, control-plane-focused, and grounded in real operator usage.

## Current Priorities

1. Add concise capability/risk hints to `apps list` so operators can spot pattern gaps without running `doctor`.
2. Add managed-app catalog hygiene flows such as `apps import` and `apps validate` for `~/.memphis/apps/manifests`.
3. Add one operator-grade tutorial for a downstream MCP-managed app using the new generic template.
4. Keep MemphisOS core as the control plane; move vendor integrations and memory/browser stacks downstream.

## Near-Term Roadmap

### 1. v0.1.1 Completion Slice

- Make `apps list` show lightweight capability-pattern warnings and guidance counts.
- Add explicit catalog-management commands for importing and validating downstream manifests.
- Ship one end-to-end tutorial that uses the generic MCP template as the downstream starting point.

### 2. Adoption

- Add step-by-step tutorials for the first three real workflows.
- Add screenshots or terminal transcripts for new users.
- Tighten onboarding defaults from actual install feedback.

### 3. Operations

- Validate backup, restore, incident export, and startup-guard flows in a real deployment.
- Add only the runbooks that operators actually need in practice.
- Keep CI and release contracts fail-closed.

### 4. Platform Growth

- Improve install packaging for non-developer users.
- Add capability-aware downstream integration patterns for memory, browser, and MCP-backed tools.
- Upstream only reusable framework improvements from downstream repos.

## Control-Plane Rule

MemphisOS core should own:

1. policy and approval gates
2. auditable execution and operator evidence
3. vault-backed secrets and runtime brokering
4. managed-app planning and lifecycle control
5. workspace scaffolding and context sync

Downstream repos should own:

1. vendor-specific agent runtimes
2. memory providers and vector stores
3. browser/MCP-specific adapters
4. app-specific onboarding promises and service assumptions

## Reference Docs

- `docs/GETTING_STARTED.md`
- `docs/WORKSPACES.md`
- `docs/MANAGED_APPS.md`
- `docs/V0_1_1_DIRECTION.md`
- `docs/runbooks/RELEASE.md`
- `docs/PROJECT_HISTORY.md`
