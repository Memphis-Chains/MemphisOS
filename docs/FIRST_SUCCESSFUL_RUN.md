# First Successful Run

This guide is the shortest verified path from clone to a real, successful MemphisOS action.

It uses an isolated `MEMPHIS_DATA_DIR` so you do not inherit old local state from `~/.memphis`.

## Goal

By the end of this tutorial you will have:

- built MemphisOS from source
- run a successful health check
- executed a managed-app action through MemphisOS
- written real state under an isolated Memphis data directory

## 1. Clone And Build

```bash
git clone https://github.com/Memphis-Chains/MemphisOS.git
cd MemphisOS
npm ci
npm run build
```

## 2. Use A Clean Data Directory

Pick a fresh directory for this run:

```bash
export MEMPHIS_DATA_DIR="$PWD/.memphis-first-run"
mkdir -p "$MEMPHIS_DATA_DIR"
```

If you want a throwaway path instead:

```bash
export MEMPHIS_DATA_DIR="$(mktemp -d)"
```

## 3. Check Basic Runtime Health

```bash
npm run -s cli -- health --json
```

Success looks like:

- `"status": "ok"`
- `"service": "memphis-v5"`

Notes:

- `defaultProvider` may show `local-fallback`
- you may also see an informational Ollama message before the JSON output

## 4. Run A Real Managed Action

Execute the safe built-in demo manifest:

```bash
npm run -s cli -- apps run demo-shell --file docs/templates/MANAGED_APP_MANIFEST.example.json --action doctor --apply --json
```

Success looks like:

- `"ok": true`
- `"executed": true`
- result stdout contains `demo-shell ok`

This command creates real managed-app state inside your isolated Memphis data directory.

## 5. Verify The State Written By MemphisOS

```bash
cat "$MEMPHIS_DATA_DIR/apps/registry.json"
```

You should see a `demo-shell` record with:

- `"installed": true`
- `"lastAction": "doctor"`

## 6. Optional Diagnostics

`doctor` is a diagnostics command, not the first-success gate. On a clean install it can still report warnings about things you have not configured yet.

Run it if you want a baseline:

```bash
npm run -s cli -- doctor --json
```

Typical clean-install warnings include:

- vault not initialized
- no embeddings indexed yet
- no backups found yet
- optional integrations not configured

## 7. What To Do Next

After this tutorial, the next useful docs are:

- [GETTING_STARTED.md](GETTING_STARTED.md) for full local setup
- [MANAGED_APPS.md](MANAGED_APPS.md) for generic app lifecycle flows
- [runbooks/RELEASE.md](runbooks/RELEASE.md) for guarded release execution
