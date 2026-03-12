# Release Runbook

Use this runbook to produce and publish a MemphisOS release after sprint completion.

## 1. Preconditions

- working tree is clean
- branch is `main` and synced with `origin/main`
- all sprint checklist items are complete
- GitHub release permissions are available

## 2. Validate Quality Gates

```bash
npm run -s lint
npm run -s typecheck
npm run -s test:ops-artifacts
npm run -s test:ts
npm run -s test:chaos
npm run -s test:rust
```

## 3. Build Package Artifact

```bash
npm pack --dry-run
npm pack
```

Expected output: one tarball `memphis-chains-memphisos-<version>.tgz`.

## 4. Publish Git Release

```bash
git tag -a vX.Y.Z -m "MemphisOS vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

Create GitHub release notes including:

- highlights and risk notes
- ops/security behavior changes
- migration or runbook updates
- package artifact checksum (`sha256sum <tgz>`)

## 5. Post-Release Verification

- confirm CI `quality-gate` on pushed tag/commit
- validate release notes links
- verify artifact hash in release body matches local hash
