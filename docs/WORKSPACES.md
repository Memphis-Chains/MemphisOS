# Workspaces

MemphisOS workspaces are local-first project roots for supervised agent work.

A workspace scaffold gives you:

- `.memphis/context.json` as the Memphis-managed source of truth
- `AGENTS.md` for agent tools that read Codex-style project instructions
- `CLAUDE.md` for Claude-style project memory
- `memory/`, `notes/`, and `apps/` directories for shared local state

## Initialize A Workspace

Run from the folder you want to use, or pass a target path:

```bash
npm run -s cli -- workspace init ./brain --json
```

Generated files and directories:

- `./brain/.memphis/context.json`
- `./brain/AGENTS.md`
- `./brain/CLAUDE.md`
- `./brain/memory/`
- `./brain/notes/`
- `./brain/apps/`

Use `--force` only when you want MemphisOS to overwrite an existing unmanaged `AGENTS.md` or `CLAUDE.md`.

## Sync Context Files

Edit `.memphis/context.json`, then resync the managed blocks:

```bash
npm run -s cli -- context sync ./brain --json
```

Behavior:

- if `AGENTS.md` or `CLAUDE.md` contains Memphis markers, only the managed block is updated
- local notes outside the managed block are preserved
- unmanaged files are skipped unless `--force` is provided

## Suggested Operator Flow

```bash
mkdir -p ~/workspace/brain
cd ~/workspace/brain
npm run -s cli -- workspace init . --json
```

Then keep human notes in `notes/`, local memory state in `memory/`, and integration manifests in `apps/` or `~/.memphis/apps/manifests/` depending on scope.
