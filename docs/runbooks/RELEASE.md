# Release Runbook

Use this runbook to produce and publish a MemphisOS release after sprint completion.

## 1. Preconditions

- working tree is clean
- branch is `main` and synced with `origin/main`
- all sprint checklist items are complete
- GitHub release permissions are available
- run `npm run -s ops:release-preflight -- --json` before triggering release workflow

## 2. Preferred Path: Automated Draft Release Workflow

Use GitHub Actions workflow `.github/workflows/release-draft.yml`.

Inputs:

- `version`: semver without `v` (example: `0.1.0`)
- `target_ref`: must stay `main` (guarded)
- `confirm`: must be exactly `draft-release`

Preflight flow:

- primary: `npm run -s ops:release-preflight -- --json` (single preflight gate step in workflow)
- fallback: run the per-step gate list below when command-level diagnostics are needed

The workflow then performs release packaging automatically:

- preflight command above runs lint/typecheck/strict-handoff validator/ops artifact/TS/chaos/Rust gates in deterministic fail-fast order
- `npm pack --dry-run`
- `npm pack --pack-destination release-dist`
- generates `release-dist/validator-metadata.json` (schema + check-order status contract)
  - schema fixture: `tests/fixtures/release-draft/validator-metadata.schema.json`
  - success example payload: `tests/fixtures/release-draft/validator-metadata-example.json`
  - failure example payload: `tests/fixtures/release-draft/validator-metadata-preflight-failure-example.json`
- `npm run -s ops:validate-release-draft-validator-metadata -- --metadata-path release-dist/validator-metadata.json`
  - validates release metadata against `tests/fixtures/release-draft/validator-metadata.schema.json`
  - troubleshooting invalid-shape contracts: `tests/fixtures/release-draft/validator-metadata-invalid-preflight-gate.json`
  - local debug command:

```bash
npm run -s ops:validate-release-draft-validator-metadata -- \
  --metadata-path tests/fixtures/release-draft/validator-metadata-invalid-preflight-gate.json
```
- creates draft GitHub release `v<version>` with:
  - package tarball asset
  - `.sha256` checksum asset
  - `validator-metadata.json` asset
  - `validator-metadata.json.sha256` asset
  - generated draft release notes

## 3. Review And Publish Draft Release

- verify draft release body and links
- confirm checksum in draft notes matches uploaded `.sha256` file
- check validator contract status line in draft notes; if `schemaVersion` changed, add explicit JSON contract change + migration guidance before publish
- publish draft release when approved

## 4. Manual Fallback (If Workflow Is Unavailable)

Use this when `ops:release-preflight` cannot be run and you need direct gate-by-gate execution.

```bash
npm run -s lint
npm run -s typecheck
npm run -s ops:validate-strict-handoff-fixtures
./scripts/strict-handoff-validator-json-gate.sh
npm run -s test:ops-artifacts
npm run -s test:ts
npm run -s test:chaos
npm run -s test:rust
npm pack --dry-run
mkdir -p release-dist
npm pack --pack-destination release-dist
sha256sum release-dist/memphis-chains-memphisos-<version>.tgz
git tag -a vX.Y.Z -m "MemphisOS vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

<a id="ci-preflight-failure-triage-map"></a>
## CI Preflight Failure Triage Map

`ops:release-preflight -- --json` fails fast and reports the first failing gate id. Use the matching section below.

<a id="ci-preflight-gate-lint"></a>
### CI Preflight Gate lint

- rerun gate: `npm run -s lint`
- fix lint violations, then rerun: `npm run -s lint`
- verify full preflight: `npm run -s ops:release-preflight -- --json`

<a id="ci-preflight-gate-typecheck"></a>
### CI Preflight Gate typecheck

- rerun gate: `npm run -s typecheck`
- fix TypeScript type errors, then rerun: `npm run -s typecheck`
- verify full preflight: `npm run -s ops:release-preflight -- --json`

<a id="ci-preflight-gate-strictHandoffFixtureValidator"></a>
### CI Preflight Gate strictHandoffFixtureValidator

- rerun gate: `npm run -s ops:validate-strict-handoff-fixtures -- --json`
- fix reported fixture/schema drift, then rerun the validator command
- verify full preflight: `npm run -s ops:release-preflight -- --json`

<a id="ci-preflight-gate-strictHandoffJsonGate"></a>
### CI Preflight Gate strictHandoffJsonGate

- rerun gate: `./scripts/strict-handoff-validator-json-gate.sh`
- if check-order fails, align `checks[].id` ordering with `tests/fixtures/strict-handoff/validator-output-contract.json`
- verify full preflight: `npm run -s ops:release-preflight -- --json`

<a id="ci-preflight-gate-opsArtifacts"></a>
### CI Preflight Gate opsArtifacts

- rerun gate: `npm run -s test:ops-artifacts`
- fix the failing ops regression or fixture contract, then rerun the gate command
- verify full preflight: `npm run -s ops:release-preflight -- --json`

<a id="ci-preflight-gate-testTs"></a>
### CI Preflight Gate testTs

- rerun gate: `npm run -s test:ts`
- fix the failing unit/integration tests, then rerun: `npm run -s test:ts`
- verify full preflight: `npm run -s ops:release-preflight -- --json`

<a id="ci-preflight-gate-testChaos"></a>
### CI Preflight Gate testChaos

- rerun gate: `npm run -s test:chaos`
- fix deterministic chaos test failures, then rerun: `npm run -s test:chaos`
- verify full preflight: `npm run -s ops:release-preflight -- --json`

<a id="ci-preflight-gate-testRust"></a>
### CI Preflight Gate testRust

- rerun gate: `npm run -s test:rust`
- fix the failing Rust tests/crates, then rerun: `npm run -s test:rust`
- verify full preflight: `npm run -s ops:release-preflight -- --json`

## 5. Post-Release Verification

- confirm CI `quality-gate` on pushed tag/commit
- validate release notes links
- verify artifact hash in release body matches local hash
