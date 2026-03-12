import { createHash, createPublicKey, verify as verifyDetached } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

interface BundleDescriptor {
  path: string;
  sha256: string;
  bytes: number;
}

interface SignatureDescriptor {
  algorithm: 'ed25519';
  value: string;
  payloadSha256: string;
  keyFingerprint: string;
  keyId?: string;
}

interface IncidentBundleManifest {
  schemaVersion: number;
  generatedAt: string;
  bundle: BundleDescriptor;
  signature?: SignatureDescriptor;
}

interface PublicKeyBundleEntry {
  keyId: string;
  publicKeyPem: string;
}

interface PublicKeyBundle {
  schemaVersion: number;
  keys: PublicKeyBundleEntry[];
}

interface VerifyOutput {
  ok: boolean;
  manifestPath: string;
  bundlePath: string;
  checks: {
    schemaValid: boolean;
    bundleExists: boolean;
    bundleHashMatch: boolean;
    bundleSizeMatch: boolean;
    signaturePresent: boolean;
    signatureVerified: boolean;
    payloadHashMatch: boolean;
    keyFingerprintMatch: boolean;
    keyIdMatch: boolean;
  };
  errors: string[];
}

function parseArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function resolveManifestPath(): string {
  const provided = parseArg('--manifest-path') ?? parseArg('--manifest') ?? process.env.MEMPHIS_INCIDENT_BUNDLE_MANIFEST_PATH;
  if (!provided) {
    throw new Error('missing required --manifest-path (or MEMPHIS_INCIDENT_BUNDLE_MANIFEST_PATH)');
  }
  return resolve(provided);
}

function parseManifest(raw: string): IncidentBundleManifest {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('manifest must be a JSON object');
  }
  const value = parsed as { [k: string]: unknown };
  const schemaVersion = value.schemaVersion;
  const generatedAt = value.generatedAt;
  const bundle = value.bundle;
  if (schemaVersion !== 1) throw new Error('manifest schemaVersion must be 1');
  if (typeof generatedAt !== 'string' || generatedAt.length === 0) {
    throw new Error('manifest generatedAt must be a non-empty string');
  }
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    throw new Error('manifest bundle must be an object');
  }
  const bundleObj = bundle as { [k: string]: unknown };
  if (typeof bundleObj.path !== 'string' || bundleObj.path.length === 0) {
    throw new Error('manifest bundle.path must be a non-empty string');
  }
  if (typeof bundleObj.sha256 !== 'string' || bundleObj.sha256.length === 0) {
    throw new Error('manifest bundle.sha256 must be a non-empty string');
  }
  if (typeof bundleObj.bytes !== 'number' || !Number.isFinite(bundleObj.bytes) || bundleObj.bytes < 0) {
    throw new Error('manifest bundle.bytes must be a non-negative number');
  }

  if (value.signature === undefined) {
    return {
      schemaVersion,
      generatedAt,
      bundle: {
        path: bundleObj.path,
        sha256: bundleObj.sha256,
        bytes: bundleObj.bytes,
      },
    };
  }

  if (!value.signature || typeof value.signature !== 'object' || Array.isArray(value.signature)) {
    throw new Error('manifest signature must be an object when present');
  }
  const signature = value.signature as { [k: string]: unknown };
  if (signature.algorithm !== 'ed25519') throw new Error('manifest signature.algorithm must be ed25519');
  if (typeof signature.value !== 'string' || signature.value.length === 0) {
    throw new Error('manifest signature.value must be a non-empty string');
  }
  if (typeof signature.payloadSha256 !== 'string' || signature.payloadSha256.length === 0) {
    throw new Error('manifest signature.payloadSha256 must be a non-empty string');
  }
  if (typeof signature.keyFingerprint !== 'string' || signature.keyFingerprint.length === 0) {
    throw new Error('manifest signature.keyFingerprint must be a non-empty string');
  }
  if (signature.keyId !== undefined && (typeof signature.keyId !== 'string' || signature.keyId.length === 0)) {
    throw new Error('manifest signature.keyId must be a non-empty string when present');
  }

  return {
    schemaVersion,
    generatedAt,
    bundle: {
      path: bundleObj.path,
      sha256: bundleObj.sha256,
      bytes: bundleObj.bytes,
    },
    signature: {
      algorithm: 'ed25519',
      value: signature.value,
      payloadSha256: signature.payloadSha256,
      keyFingerprint: signature.keyFingerprint,
      keyId: signature.keyId as string | undefined,
    },
  };
}

function resolveBundlePath(bundlePath: string, manifestPath: string): string {
  const override = parseArg('--bundle-path') ?? process.env.MEMPHIS_INCIDENT_BUNDLE_PATH;
  if (override) return resolve(override);
  if (isAbsolute(bundlePath)) return bundlePath;
  return resolve(dirname(manifestPath), bundlePath);
}

function parsePublicKeyBundle(raw: string): PublicKeyBundle {
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('public key bundle must be a JSON object');
  }
  const value = parsed as { [k: string]: unknown };
  if (value.schemaVersion !== 1) throw new Error('public key bundle schemaVersion must be 1');
  if (!Array.isArray(value.keys)) throw new Error('public key bundle keys must be an array');
  const keys: PublicKeyBundleEntry[] = [];
  for (const entry of value.keys) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('public key bundle entry must be an object');
    }
    const row = entry as { [k: string]: unknown };
    if (typeof row.keyId !== 'string' || row.keyId.length === 0) {
      throw new Error('public key bundle entry keyId must be a non-empty string');
    }
    if (typeof row.publicKeyPem !== 'string' || row.publicKeyPem.length === 0) {
      throw new Error('public key bundle entry publicKeyPem must be a non-empty string');
    }
    keys.push({ keyId: row.keyId, publicKeyPem: row.publicKeyPem });
  }
  return { schemaVersion: 1, keys };
}

function resolvePublicKeyPem(options: {
  manifest: IncidentBundleManifest;
  expectedKeyId: string | null;
}): { publicKeyPem: string | null; source: 'path' | 'bundle' | 'none'; errors: string[] } {
  const errors: string[] = [];
  const directPathRaw =
    parseArg('--public-key-path') ?? process.env.MEMPHIS_INCIDENT_BUNDLE_VERIFY_PUBLIC_KEY_PATH ?? null;
  if (directPathRaw) {
    const directPath = resolve(directPathRaw);
    if (!existsSync(directPath)) {
      errors.push(`public key file not found: ${directPath}`);
      return { publicKeyPem: null, source: 'none', errors };
    }
    return {
      publicKeyPem: readFileSync(directPath, 'utf8'),
      source: 'path',
      errors,
    };
  }

  const bundlePathRaw =
    parseArg('--public-key-bundle-path') ??
    process.env.MEMPHIS_INCIDENT_BUNDLE_PUBLIC_KEY_BUNDLE_PATH ??
    null;
  if (!bundlePathRaw) return { publicKeyPem: null, source: 'none', errors };

  const keyId = options.manifest.signature?.keyId ?? options.expectedKeyId;
  if (!keyId) {
    errors.push('public key bundle lookup requires signature.keyId or --expected-key-id');
    return { publicKeyPem: null, source: 'none', errors };
  }

  const bundlePath = resolve(bundlePathRaw);
  if (!existsSync(bundlePath)) {
    errors.push(`public key bundle not found: ${bundlePath}`);
    return { publicKeyPem: null, source: 'none', errors };
  }

  try {
    const bundle = parsePublicKeyBundle(readFileSync(bundlePath, 'utf8'));
    const key = bundle.keys.find((entry) => entry.keyId === keyId);
    if (!key) {
      errors.push(`public key bundle missing keyId: ${keyId}`);
      return { publicKeyPem: null, source: 'none', errors };
    }
    return { publicKeyPem: key.publicKeyPem, source: 'bundle', errors };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { publicKeyPem: null, source: 'none', errors };
  }
}

function verifySignature(options: {
  manifest: IncidentBundleManifest;
  manifestObject: Record<string, unknown>;
  publicKeyPem: string | null;
  expectedKeyId: string | null;
  requireSignature: boolean;
  checks: VerifyOutput['checks'];
  errors: string[];
}): void {
  const signature = options.manifest.signature;
  options.checks.signaturePresent = Boolean(signature);

  if (!signature) {
    if (options.expectedKeyId) {
      options.checks.keyIdMatch = false;
      options.errors.push('expected key id provided but manifest is unsigned');
    }
    if (options.requireSignature) options.errors.push('signature is required but manifest is unsigned');
    return;
  }

  if (options.expectedKeyId) {
    options.checks.keyIdMatch = signature.keyId === options.expectedKeyId;
    if (!options.checks.keyIdMatch) {
      options.errors.push(
        `signature key id mismatch (expected=${options.expectedKeyId}, actual=${signature.keyId ?? 'none'})`,
      );
    }
  }

  const unsigned = { ...options.manifestObject };
  delete unsigned.signature;
  const payload = JSON.stringify(unsigned);
  const payloadHash = sha256Hex(payload);
  options.checks.payloadHashMatch = payloadHash === signature.payloadSha256;
  if (!options.checks.payloadHashMatch) {
    options.errors.push('signature payload hash mismatch');
  }

  if (!options.publicKeyPem) {
    options.errors.push('signature is present but no public key source is available');
    return;
  }

  try {
    const publicKey = createPublicKey(options.publicKeyPem);
    const expectedFingerprint = sha256Hex(options.publicKeyPem);
    options.checks.keyFingerprintMatch = expectedFingerprint === signature.keyFingerprint;
    if (!options.checks.keyFingerprintMatch) {
      options.errors.push('signature key fingerprint mismatch');
    }

    const signatureBytes = Buffer.from(signature.value, 'base64');
    options.checks.signatureVerified = verifyDetached(
      null,
      Buffer.from(payload, 'utf8'),
      publicKey,
      signatureBytes,
    );
    if (!options.checks.signatureVerified) {
      options.errors.push('signature verification failed');
    }
  } catch (error) {
    options.errors.push(error instanceof Error ? error.message : String(error));
  }
}

function main(): void {
  const manifestPath = resolveManifestPath();
  const requireSignature = hasFlag('--require-signature');
  const expectedKeyId = parseArg('--expected-key-id') ?? process.env.MEMPHIS_INCIDENT_BUNDLE_EXPECTED_KEY_ID ?? null;
  const checks: VerifyOutput['checks'] = {
    schemaValid: false,
    bundleExists: false,
    bundleHashMatch: false,
    bundleSizeMatch: false,
    signaturePresent: false,
    signatureVerified: false,
    payloadHashMatch: false,
    keyFingerprintMatch: false,
    keyIdMatch: true,
  };
  const errors: string[] = [];

  let manifestObject: Record<string, unknown> = {};
  let manifest: IncidentBundleManifest | null = null;
  try {
    const raw = readFileSync(manifestPath, 'utf8');
    manifestObject = JSON.parse(raw) as Record<string, unknown>;
    manifest = parseManifest(raw);
    checks.schemaValid = true;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  let bundlePath = '';
  if (manifest) {
    bundlePath = resolveBundlePath(manifest.bundle.path, manifestPath);
    checks.bundleExists = existsSync(bundlePath);
    if (!checks.bundleExists) {
      errors.push(`bundle file not found: ${bundlePath}`);
    } else {
      try {
        const bytes = readFileSync(bundlePath);
        checks.bundleHashMatch = sha256Hex(bytes) === manifest.bundle.sha256;
        checks.bundleSizeMatch = bytes.byteLength === manifest.bundle.bytes;
        if (!checks.bundleHashMatch) errors.push('bundle sha256 mismatch');
        if (!checks.bundleSizeMatch) errors.push('bundle byte size mismatch');
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const keyResolution = resolvePublicKeyPem({ manifest, expectedKeyId });
    errors.push(...keyResolution.errors);

    verifySignature({
      manifest,
      manifestObject,
      publicKeyPem: keyResolution.publicKeyPem,
      expectedKeyId,
      requireSignature,
      checks,
      errors,
    });
  }

  const result: VerifyOutput = {
    ok: errors.length === 0,
    manifestPath,
    bundlePath,
    checks,
    errors,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}
