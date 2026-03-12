# Release Runbook

Use this runbook to produce and publish a MemphisOS release after sprint completion.

## 1. Preconditions

- working tree is clean
- branch is `main` and synced with `origin/main`
- all sprint checklist items are complete
- GitHub release permissions are available

## 2. Preferred Path: Automated Draft Release Workflow

Use GitHub Actions workflow `.github/workflows/release-draft.yml`.

Inputs:

- `version`: semver without `v` (example: `0.1.0`)
- `target_ref`: must stay `main` (guarded)
- `confirm`: must be exactly `draft-release`

The workflow performs all release gates automatically:

- `npm run -s lint`
- `npm run -s typecheck`
- `npm run -s test:ops-artifacts`
- `npm run -s test:ts`
- `npm run -s test:chaos`
- `npm run -s test:rust`
- `npm pack --dry-run`
- `npm pack --pack-destination release-dist`
- creates draft GitHub release `v<version>` with:
  - package tarball asset
  - `.sha256` checksum asset
  - generated draft release notes

## 3. Review And Publish Draft Release

- verify draft release body and links
- confirm checksum in draft notes matches uploaded `.sha256` file
- publish draft release when approved

## 4. Manual Fallback (If Workflow Is Unavailable)

```bash
npm run -s lint
npm run -s typecheck
npm run -s test:ops-artifacts
npm run -s test:ts
npm run -s test:chaos
npm run -s test:rust
npm pack --dry-run
npm pack
sha256sum memphis-chains-memphisos-<version>.tgz
git tag -a vX.Y.Z -m "MemphisOS vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

## 5. Post-Release Verification

- confirm CI `quality-gate` on pushed tag/commit
- validate release notes links
- verify artifact hash in release body matches local hash
