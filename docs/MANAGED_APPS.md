# Managed Apps

MemphisOS `main` keeps a generic managed-app framework. Vendor-specific integrations should live downstream in a separate branch or repo.

## What Lives In Core

- manifest parsing and validation
- lifecycle planning and execution
- installed-app registry
- Memphis-managed app paths
- generic CLI commands under `memphis apps ...`

## What Does Not Belong In Core

- vendor-specific manifests
- vendor-specific secrets and onboarding flows
- app-specific service conventions
- app-specific tutorials and operational promises

## Manifest Sources

MemphisOS can load manifests from:

- `--file <path>` for one-off runs
- `~/.memphis/apps/manifests/*.json` for user-managed manifests

Registry state is stored at:

- `~/.memphis/apps/registry.json`

## CLI Surface

```bash
memphis apps list
memphis apps show <id>
memphis apps plan <id> --action <name>
memphis apps run <id> --action <name> --apply
```

Lifecycle aliases are also supported:

```bash
memphis apps install <id> --apply
memphis apps start <id> --apply
memphis apps stop <id> --apply
memphis apps restart <id> --apply
memphis apps status <id> --apply
memphis apps doctor <id> --apply
memphis apps dashboard <id> --apply
```

Planning is the default. Real execution requires `--apply`.

## Vault-Backed Secrets

Managed-app actions can broker vault secrets into subprocess env vars or managed files:

- `vaultEnv`: map env var name to Memphis vault key
- `vaultFiles`: map target file path template to a vault key or `{ key, mode }`

Example:

```json
{
  "install": {
    "summary": "Run installer with a vault-backed token",
    "steps": ["app install --token \"$APP_TOKEN\""],
    "vaultEnv": {
      "APP_TOKEN": "APP_TOKEN"
    },
    "vaultFiles": {
      "${APP_STATE_DIR}/license.key": {
        "key": "APP_LICENSE_KEY",
        "mode": "600"
      }
    }
  }
}
```

Operator flow:

```bash
npm run -s cli -- vault init --passphrase 'strong-passphrase' --recovery-question 'pet' --recovery-answer 'nori'
npm run -s cli -- vault add --key APP_TOKEN --value 'secret-token'
npm run -s cli -- vault add --key APP_LICENSE_KEY --value 'secret-license'
npm run -s cli -- apps install vendor-app --file path/to/vendor.manifest.json --apply --json
```

Behavior:

- Directly exported env vars still override `vaultEnv` lookups for one-off debugging.
- `vaultFiles` are materialized only inside the managed app path before action execution.
- Plan and JSON output report binding status but never print secret values.

## Example Manifest

A safe example manifest is included at:

- `docs/templates/MANAGED_APP_MANIFEST.example.json`

Use it like this:

```bash
npm run -s cli -- apps show demo-shell --file docs/templates/MANAGED_APP_MANIFEST.example.json --json
npm run -s cli -- apps run demo-shell --file docs/templates/MANAGED_APP_MANIFEST.example.json --action doctor --apply --json
```

## Downstream Policy

If you want a concrete integration such as OpenClaw:

1. build it in a downstream branch or repo,
2. keep vendor-specific manifests and docs there,
3. upstream only the reusable framework improvements.
