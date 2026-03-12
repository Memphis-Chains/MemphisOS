# Sprint Closure Note Template

Use this template at the end of each sprint. Keep all links and checksums immutable once published.

## Sprint

- Name: `<sprint-name>`
- Date closed: `<YYYY-MM-DD>`
- Owner: `<owner>`
- Scope baseline commit: `<sha>`

## Delivered

- PRs merged:
  - `<pr-url>`
  - `<pr-url>`
- Commits included:
  - `<sha> <summary>`
  - `<sha> <summary>`

## Validation Evidence

- CI/quality-gate run URL: `<github-actions-url>`
- Local gates executed:
  - `npm run -s lint`
  - `npm run -s typecheck`
  - `npm run -s test:ops-artifacts`
  - `npm run -s test:ts`
  - `npm run -s test:chaos`
  - `npm run -s test:rust`
- Additional targeted tests:
  - `<command>`
  - `<command>`

## Artifacts (If Produced)

- Package file: `<artifact-name>`
- SHA256: `<sha256>`
- Draft release URL (if used): `<github-release-url>`
- Workflow run URL (if used): `<github-actions-url>`

## Ops/Security Impact

- Branch protection changes: `<none|details>`
- Trust-root/revocation impact: `<none|details>`
- Incident tooling changes: `<none|details>`
- Backward compatibility risks: `<none|details>`

## Rollback Plan

- Revert commit(s): `<sha-list>`
- Feature flags to disable: `<env-vars>`
- Runbook references:
  - `docs/runbooks/RELEASE.md`
  - `docs/runbooks/STARTUP_GUARD_TRIAGE.md`

## Follow-Ups

- Outstanding items:
  - `<item>`
  - `<item>`
- Target branch for next sprint: `<branch-name>`
