# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the TypeScript runtime and CLI.
- `src/infra/cli/` holds command handlers, parser, routing, and CLI utilities.
- `src/app/`, `src/cognitive/`, and `src/providers/` contain core orchestration and model logic.
- `crates/` is the Rust workspace (`memphis-core`, `memphis-vault`, `memphis-embed`, `memphis-napi`).
- `tests/` is organized by scope: `unit/`, `integration/`, `ops/`, `security/`, `performance/`.
- `scripts/` contains operational commands used by `npm run -s ops:*`.
- `docs/` includes runbooks and sprint records.

## Build, Test, and Development Commands
```bash
npm run -s cli -- help          # CLI entrypoint usage
npm run -s lint                 # ESLint checks
npm run -s typecheck            # TypeScript no-emit checks
npm run -s test:ts              # Full Vitest suite
npm run -s test:chaos           # WAL chaos gate
npm run -s test:rust            # Cargo workspace tests
npm run -s build                # Rust + TypeScript build
npm run -s ops:query-cognitive-reports -- --json --limit 10
```
Run changed-area tests first, then full gates before opening a PR.

## Coding Style & Naming Conventions
- TypeScript uses ESM modules, 2-space indentation, and strict linting via `eslint.config.mjs`.
- Prefer clear, small functions and stable CLI response keys (`mode`, `saved`, `savedBlock`, `schemaVersion`).
- Use kebab-case filenames; tests follow `*.test.ts`.
- CLI-focused tests typically use `cli.<command>.test.ts` naming.
- Rust code should follow `rustfmt` conventions and idiomatic `snake_case`.

## Testing Guidelines
- TS tests use Vitest; Rust tests use Cargo.
- For persistence features, assert block shape in `chains/journal` (`type`, `source`, `schemaVersion`).
- Use temporary data dirs (`MEMPHIS_DATA_DIR`) in tests to avoid cross-test contamination.
- Keep regression coverage for CLI save flows and ops scripts.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat(cli): ...`, `docs(ops): ...`, `test(cli): ...`, `refactor(cli): ...`.
- Keep commits focused and scoped to one concern.
- PRs should include: change summary, risk/impact notes, and exact validation commands run.
- Link relevant issue/PR numbers and include sample output when CLI behavior changes.

## Security & Configuration Tips
- Never commit secrets, tokens, or private key material.
- Use `RUST_CHAIN_ENABLED=false` when tests need deterministic TS chain writes.
- Keep operational docs/runbooks updated whenever tooling or payload contracts change.
