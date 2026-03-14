# Getting Started

This guide is for a first local install from source.

If you want the shortest verified path to one successful MemphisOS action first, start with [FIRST_SUCCESSFUL_RUN.md](FIRST_SUCCESSFUL_RUN.md).

## 1. Prerequisites

Install these first:

- `git`
- Node.js `22.x`
- `npm`
- Rust stable via `rustup`
- optional: `ollama` if you want local model execution

Check them:

```bash
git --version
node --version
npm --version
rustc --version
cargo --version
```

## 2. Clone And Install

```bash
git clone https://github.com/Memphis-Chains/MemphisOS.git
cd MemphisOS
npm ci
npm run build
```

## 3. Verify The Environment

```bash
npm run -s cli -- doctor --json
npm run -s cli -- health --json
```

If `doctor` reports missing prerequisites, fix those first before moving on.

## 4. Generate Local Config

Use the guided onboarding flow:

```bash
npm run -s cli -- onboarding wizard --interactive
```

Then preview the bootstrap plan:

```bash
npm run -s cli -- onboarding bootstrap --profile dev-local --dry-run --json
```

## 5. Start MemphisOS

Run the local runtime:

```bash
npm run dev
```

In a second shell, run the CLI:

```bash
npm run -s cli -- health --json
npm run -s cli -- doctor --json
node bin/memphis.js health --json
```

## 6. Useful First Checks

```bash
npm run lint
npm run typecheck
npm run test:ops-artifacts
```

## 7. Common Issues

- `npm ci` fails: make sure Node.js is `22.x`.
- Rust bridge/build fails: re-run `rustup default stable` and then `npm run build`.
- `doctor` reports missing local model tooling: either install `ollama` or configure a hosted provider during onboarding.
- CLI works but runtime does not: re-run `npm run -s cli -- onboarding bootstrap --profile dev-local --dry-run --json` and check your generated env/config values.

## 8. Next Docs

- Main overview: [README.md](../README.md)
- Release workflow: [docs/runbooks/RELEASE.md](runbooks/RELEASE.md)
- Guard triage: [docs/runbooks/STARTUP_GUARD_TRIAGE.md](runbooks/STARTUP_GUARD_TRIAGE.md)
