# Startup Guard Incident Triage

Use this runbook when startup guard checks fail or `/v1/ops/status` reports degraded startup security state.

## 1. Capture Current Status

```bash
curl -s http://127.0.0.1:8080/v1/ops/status | jq '.startup'
```

Focus on:

- `startup.trustRoot`
- `startup.revocationCache`
- `startup.safeModeNetwork`

## 2. Field-To-Action Mapping

### `startup.trustRoot`

- `enabled=true`, `valid=false`
Action: verify `MEMPHIS_TRUST_ROOT_PATH` exists and schema is valid (`version > 0`, non-empty unique `rootIds`).

- `enabled=true`, `valid=true`
Action: no trust-root startup action required.

- `reason` contains `missing`
Action: restore trust root manifest from known-good source; do not disable strict mode in production as a first response.

### `startup.revocationCache`

- `enabled=true`, `stale=true`
Action: refresh revocation cache source and set `MEMPHIS_REVOCATION_CACHE_LAST_SYNC_MS` to current epoch ms from trusted updater.

- `enabled=true`, `stale=false`
Action: cache freshness is acceptable.

- `ageMs > maxStaleMs`
Action: investigate scheduler/worker responsible for cache sync; treat high-risk routes as intentionally blocked.

### `startup.safeModeNetwork`

- `enabled=true`, `mode=degraded`, `enforced=false`
Action: confirm required privileges for network enforcement (for iptables backend) or keep safe mode with no-spawn policy until fixed.

- `enabled=true`, `mode=enforced`, `enforced=true`
Action: safe-mode network posture is active.

- `enabled=false`, `mode=disabled`
Action: normal for non-safe-mode boot.

## 3. Exit Code Correlation

- `101` `ERR_HARDENING`: hardening primitive failed in strict mode.
- `102` `ERR_CORRUPTION`: chain/snapshot corruption path.
- `103` `ERR_TRUST_ROOT`: trust-root validation failed in strict mode.

If process exits with `103`, expect `startup.trustRoot.valid=false` in drill/test paths and fix trust-root inputs before restart.

## 4. Fast Verification Commands

```bash
npm run -s ops:drill-guards
npm run -s test:ts -- tests/integration/ops-status.e2e.test.ts
npm run -s ops:export-incident-bundle -- --out data/incident-bundle.json
npm run -s ops:export-incident-bundle -- \
  --out data/incident-bundle.json \
  --manifest-out data/incident-bundle.manifest.json \
  --signing-key-path /secure/path/incident-signing-key.pem
```

Both commands must pass before closing incident.

Exporter behavior:

- redaction is enabled by default (`[REDACTED]` marker); use `--no-redact` only for isolated local debugging
- retention pruning defaults to `--retention-count 20` and `--retention-days 14`
- retention can be tuned with `MEMPHIS_INCIDENT_BUNDLE_RETENTION_COUNT` and `MEMPHIS_INCIDENT_BUNDLE_RETENTION_DAYS`
- signed manifest output is optional and intended for forensic chain-of-custody records

## 5. Combined Failure Escalation

Treat this as high severity when both conditions are present:

- `startup.safeModeNetwork.mode = degraded`
- `startup.revocationCache.stale = true`

Escalation thresholds:

- Longer than 5 minutes in combined state:
Action: page on-call operator and freeze high-risk workflow submissions.

- Longer than 15 minutes in combined state:
Action: declare incident, keep safe mode active, and block financial/admin mutation paths until recovery is verified.
