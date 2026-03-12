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

Bundle schema:

```json
{
  "schemaVersion": 1,
  "keys": [{ "keyId": "incident-key-v1", "publicKeyPem": "-----BEGIN PUBLIC KEY-----..." }]
}
```

Verification must report:

- `ok=true`
- `checks.bundleHashMatch=true`
- `checks.bundleSizeMatch=true`
- `checks.signatureVerified=true`
- `checks.keyFingerprintMatch=true`
- `checks.keyIdMatch=true` (when expected key id is set)

## 4. Handoff Package

Attach these artifacts to incident records:

- `incident-bundle.json`
- `incident-bundle.manifest.json`
- verifier JSON output (`ok=true` proof)
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
