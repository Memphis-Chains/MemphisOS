# Incident Manifest Verification

Use this runbook to produce and verify incident evidence bundles before handoff to security/compliance or external responders.

## 1. Inputs

- incident timeframe and scope
- signing private key (file path or env-injected PEM)
- corresponding public key for verification
- signer key id (recommended)

## 2. Export Bundle + Manifest

```bash
npm run -s ops:export-incident-bundle -- \
  --out data/incident-bundle.json \
  --manifest-out data/incident-bundle.manifest.json \
  --signing-key-path /secure/path/incident-signing-key.pem \
  --signing-key-id incident-key-v1
```

Alternative key sources:

- `--signing-key-pem`
- `--signing-key-pem-base64`
- env vars: `MEMPHIS_INCIDENT_BUNDLE_SIGNING_KEY_PEM` / `MEMPHIS_INCIDENT_BUNDLE_SIGNING_KEY_PEM_BASE64`

Optional encrypted-at-rest companions for transfer:

```bash
npm run -s ops:export-incident-bundle -- \
  --out data/incident-bundle.json \
  --manifest-out data/incident-bundle.manifest.json \
  --encryption-passphrase "$MEMPHIS_INCIDENT_TRANSFER_PASSPHRASE"
```

Policy enforcement for financial workflows:

```bash
MEMPHIS_QUEUE_MODE=financial \
MEMPHIS_INCIDENT_REQUIRE_ENCRYPTED_ARTIFACTS=true \
npm run -s ops:export-incident-bundle -- \
  --out data/incident-bundle.json \
  --manifest-out data/incident-bundle.manifest.json \
  --encryption-passphrase "$MEMPHIS_INCIDENT_TRANSFER_PASSPHRASE"
```

## 3. Verify Evidence Integrity

```bash
npm run -s ops:verify-incident-manifest -- \
  --manifest-path data/incident-bundle.manifest.json \
  --public-key-path /secure/path/incident-signing-public.pem \
  --expected-key-id incident-key-v1 \
  --require-signature
```

Detached key bundle mode:

```bash
npm run -s ops:verify-incident-manifest -- \
  --manifest-path data/incident-bundle.manifest.json \
  --public-key-bundle-path data/public-key-bundle.json \
  --expected-key-id incident-key-v1 \
  --require-signature
```

Strict provenance mode (recommended for production handoffs):

```bash
npm run -s ops:verify-incident-manifest -- \
  --manifest-path data/incident-bundle.manifest.json \
  --public-key-bundle-path data/public-key-bundle.json \
  --trust-root-path config/trust_root.json \
  --expected-key-id incident-key-v1 \
  --require-signature \
  --require-key-bundle-signature
```

Strict chain-link mode with retry/backoff:

```bash
MEMPHIS_INCIDENT_CHAIN_EVENT_REQUIRED=true \
npm run -s ops:verify-incident-manifest -- \
  --manifest-path data/incident-bundle.manifest.json \
  --public-key-path /secure/path/incident-signing-public.pem \
  --expected-key-id incident-key-v1 \
  --require-signature \
  --chain-event-retry-count 2 \
  --chain-event-retry-backoff-ms 50
```

Bundle schema:

```json
{
  "schemaVersion": 1,
  "keys": [{ "keyId": "incident-key-v1", "publicKeyPem": "-----BEGIN PUBLIC KEY-----..." }],
  "provenance": {
    "algorithm": "ed25519",
    "signerRootId": "sha256(publicKeyPem)",
    "signerPublicKeyPem": "-----BEGIN PUBLIC KEY-----...",
    "payloadSha256": "sha256(JSON.stringify({schemaVersion,keys}))",
    "signature": "base64(ed25519-sign(payload))"
  }
}
```

Encrypted manifest/bundle verification mode:

```bash
npm run -s ops:verify-incident-manifest -- \
  --manifest-path data/incident-bundle.manifest.json.enc \
  --decryption-passphrase "$MEMPHIS_INCIDENT_TRANSFER_PASSPHRASE" \
  --public-key-path /secure/path/incident-signing-public.pem \
  --expected-key-id incident-key-v1 \
  --require-signature
```

Verification must report:

- `ok=true`
- `checks.bundleHashMatch=true`
- `checks.bundleSizeMatch=true`
- `checks.signatureVerified=true`
- `checks.keyFingerprintMatch=true`
- `checks.keyIdMatch=true` (when expected key id is set)
- `checks.keyBundleSignatureValid=true` and `checks.keyBundleTrustRootMatch=true` when strict detached-bundle provenance is enabled
- `checks.manifestEncrypted=true` and `checks.bundleEncrypted=true` when encrypted companions are used
- `chainEvent.written=true` (immutable `incident_manifest.verification` linkage)

## 4. Handoff Package

Attach these artifacts to incident records:

- `incident-bundle.json`
- `incident-bundle.manifest.json`
- optional encrypted companions: `incident-bundle.json.enc`, `incident-bundle.manifest.json.enc`
- verifier JSON output (`ok=true` proof)
- system chain event reference (`chainEvent.index` + `chainEvent.hash`)
- command transcript and timestamp of execution

Do not attach private signing keys.

## 5. Failure Handling

- `bundle sha256 mismatch`:
  - treat bundle as tampered/corrupted; regenerate and re-verify.
- `signature verification failed`:
  - verify public key source and signer identity; rotate keys if compromise is suspected.
- `signature key id mismatch`:
  - reject evidence package until signer identity is reconciled.

## 6. Closure Criteria

Incident evidence is ready for closure only when:

1. manifest verification passes with `ok=true`
2. signer identity (`keyId`) is validated against incident ownership records
3. bundle + manifest are archived according to retention policy
