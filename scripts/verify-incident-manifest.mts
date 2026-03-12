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
}

interface IncidentBundleManifest {
  schemaVersion: number;
  generatedAt: string;
  bundle: BundleDescriptor;
  signature?: SignatureDescriptor;
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
    },
  };
}

function resolveBundlePath(bundlePath: string, manifestPath: string): string {
  const override = parseArg('--bundle-path') ?? process.env.MEMPHIS_INCIDENT_BUNDLE_PATH;
  if (override) return resolve(override);
  if (isAbsolute(bundlePath)) return bundlePath;
  return resolve(dirname(manifestPath), bundlePath);
}

function verifySignature(options: {
  manifest: IncidentBundleManifest;
  manifestObject: Record<string, unknown>;
  publicKeyPath: string | null;
  requireSignature: boolean;
  checks: VerifyOutput['checks'];
  errors: string[];
}): void {
  const signature = options.manifest.signature;
  options.checks.signaturePresent = Boolean(signature);

  if (!signature) {
    if (options.requireSignature) options.errors.push('signature is required but manifest is unsigned');
    return;
  }

  const unsigned = { ...options.manifestObject };
  delete unsigned.signature;
  const payload = JSON.stringify(unsigned);
  const payloadHash = sha256Hex(payload);
  options.checks.payloadHashMatch = payloadHash === signature.payloadSha256;
  if (!options.checks.payloadHashMatch) {
    options.errors.push('signature payload hash mismatch');
  }

  if (!options.publicKeyPath) {
    options.errors.push('signature is present but --public-key-path is missing');
    return;
  }

  if (!existsSync(options.publicKeyPath)) {
    options.errors.push(`public key file not found: ${options.publicKeyPath}`);
    return;
  }

  try {
    const publicKeyPem = readFileSync(options.publicKeyPath, 'utf8');
    const publicKey = createPublicKey(publicKeyPem);
    const expectedFingerprint = sha256Hex(publicKeyPem);
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
  const publicKeyPath =
    parseArg('--public-key-path') ?? process.env.MEMPHIS_INCIDENT_BUNDLE_VERIFY_PUBLIC_KEY_PATH ?? null;
  const checks: VerifyOutput['checks'] = {
    schemaValid: false,
    bundleExists: false,
    bundleHashMatch: false,
    bundleSizeMatch: false,
    signaturePresent: false,
    signatureVerified: false,
    payloadHashMatch: false,
    keyFingerprintMatch: false,
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

    verifySignature({
      manifest,
      manifestObject,
      publicKeyPath: publicKeyPath ? resolve(publicKeyPath) : null,
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
