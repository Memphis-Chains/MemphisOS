# Security Policy

## Supported versions

For the v1.0.0 production line:

- ✅ `1.x` — supported
- ⚠️ pre-1.0 tags (`0.x`, alpha/rc builds) — best effort, no guarantee

## Responsible disclosure

Please report vulnerabilities privately. Do **not** open public issues for exploitable security findings.

When reporting, include:

1. Affected version/commit
2. Reproduction steps
3. Impact assessment
4. Suggested mitigation (if known)

## Security contact

- GitHub Security Advisories (preferred):
  `https://github.com/Memphis-Chains/MemphisOS/security/advisories`
- Fallback issue channel (for non-sensitive security hardening questions):
  `https://github.com/Memphis-Chains/MemphisOS/issues`

## Security features

MemphisOS includes:

- **Local-first storage model** (reduced third-party data exposure)
- **Secret hygiene policy** (`.env` / external secret stores, no secrets in git)
- **Input validation boundaries** (schema-first validation paths)
- **Auth policy controls** for protected API/gateway routes
- **Rate limiting / abuse guardrails** on sensitive endpoints
  - Global limit: **100 requests / minute** per IP+method
  - Sensitive limit: **10 requests / minute** per IP+method+route (`/exec`, `/provider/chat`, `/v1/chat/generate`, `/v1/vault/*`, etc.)
- **Operational smoke gates** for release confidence
- **Dual-approval signature verification** for admin actions:
  - `MEMPHIS_ADMIN_PUBLIC_KEYS_JSON` maps admin identity -> Ed25519 public key (PEM)
  - `MEMPHIS_ADMIN_SIGNATURE_REQUIRED=true` enforces fail-closed verification
- **Immutable dual-approval lifecycle journaling** to `system` chain with correlation IDs
- **Safe-mode denial and overload observability** via Prometheus counters
- **GitHub security controls enabled**:
  - Dependabot alerts/security updates
  - secret scanning + push protection
  - protected `main` branch with CODEOWNERS review

## Encryption details

Cryptographic tracks used in the project architecture:

- **Argon2id** for password/key derivation hardening
- **AES-256-GCM** for authenticated encryption in vault-oriented paths
- **Ed25519** for signing/verification paths used by closure/proof workflows
- **SHA-256 chaining** for integrity-linked memory/ledger primitives

> Exact active surfaces can vary by deployment profile and enabled runtime flags.

## Admin Signature Bootstrap and Rotation

Dual-approval admin actions (`request`, `approve`, `cancel`) support Ed25519 signature verification.

Bootstrap:

1. Generate per-admin Ed25519 keypairs.
2. Publish only public keys in `MEMPHIS_ADMIN_PUBLIC_KEYS_JSON`.
3. Use normalized admin identities (same canonical identity used in runtime auth checks).
4. Enable enforcement with `MEMPHIS_ADMIN_SIGNATURE_REQUIRED=true`.

Example:

```json
{
  "admin-a": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
  "admin-b": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
}
```

Rotation:

1. Add new public key for the same admin identity.
2. Deploy updated `MEMPHIS_ADMIN_PUBLIC_KEYS_JSON`.
3. Verify signed dual-approval action succeeds with the new key.
4. Remove old key material from configuration and secret stores.

Operational guidance:

- Keep private keys outside repository and outside runtime logs.
- Treat key changes as privileged operations with audit evidence.
- Prefer staged rollout to ensure no lockout before removing old keys.

## Audit status

- Internal security baseline and hardening docs are maintained in-repo.
- Security smoke scripts are included and expected in release gates.
- At v1.0.0, **no independent third-party formal audit is claimed** unless explicitly published by maintainers.

## Security update policy

- Critical vulnerabilities: patch release as soon as validated.
- High severity: prioritized in nearest release window.
- Lower severity hardening: scheduled via normal roadmap and release cycle.
