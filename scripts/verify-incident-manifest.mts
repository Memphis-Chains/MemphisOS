import { randomUUID, createPublicKey, verify as verifyDetached } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import {
  decryptBlob,
  isEncryptedBlobJson,
  parseEncryptedBlob,
  sha256Hex,
} from './lib/encrypted-blob.mts';
import { appendBlock, type AppendBlockResult } from '../src/infra/storage/chain-adapter.js';

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
  encryptedArtifacts?: {
    schemaVersion: number;
    format: string;
    algorithm: string;
    kdf: string;
    bundle: BundleDescriptor;
    manifest?: {
      path: string;
    };
  };
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
    manifestEncrypted: boolean;
    bundleExists: boolean;
    bundleEncrypted: boolean;
    bundleHashMatch: boolean;
    bundleSizeMatch: boolean;
    signaturePresent: boolean;
    signatureVerified: boolean;
    payloadHashMatch: boolean;
    keyFingerprintMatch: boolean;
    keyIdMatch: boolean;
  };
  errors: string[];
  chainEvent?: {
    attempted: boolean;
    written: boolean;
    chain: 'system';
    index?: number;
    hash?: string;
    error?: string;
  };
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

function resolveDecryptionPassphrase(): string | null {
  const argRaw = parseArg('--decryption-passphrase');
  const argBase64 = parseArg('--decryption-passphrase-base64');
  const argFile = parseArg('--decryption-passphrase-file');

  const envRaw = process.env.MEMPHIS_INCIDENT_BUNDLE_DECRYPTION_PASSPHRASE ?? null;
  const envBase64 = process.env.MEMPHIS_INCIDENT_BUNDLE_DECRYPTION_PASSPHRASE_BASE64 ?? null;
  const envFile = process.env.MEMPHIS_INCIDENT_BUNDLE_DECRYPTION_PASSPHRASE_FILE ?? null;

  const declared = [
    argRaw,
    argBase64,
    argFile,
    envRaw,
    envBase64,
    envFile,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0);
  if (declared.length === 0) return null;
  if (declared.length > 1) {
    throw new Error(
      'multiple decryption passphrase sources provided; use exactly one of --decryption-passphrase, --decryption-passphrase-base64, --decryption-passphrase-file (or matching env vars)',
    );
  }

  if (argBase64 || envBase64) {
    return Buffer.from(argBase64 ?? envBase64 ?? '', 'base64').toString('utf8');
  }
  if (argFile || envFile) {
    return readFileSync(resolve(argFile ?? envFile ?? ''), 'utf8').trim();
  }
  return argRaw ?? envRaw ?? null;
}

function resolveManifestPath(): string {
  const provided = parseArg('--manifest-path') ?? parseArg('--manifest') ?? process.env.MEMPHIS_INCIDENT_BUNDLE_MANIFEST_PATH;
  if (!provided) {
    throw new Error('missing required --manifest-path (or MEMPHIS_INCIDENT_BUNDLE_MANIFEST_PATH)');
  }
  return resolve(provided);
}

function parseManifestObject(parsed: unknown): IncidentBundleManifest {
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

  let encryptedArtifacts: IncidentBundleManifest['encryptedArtifacts'] | undefined = undefined;
  if (value.encryptedArtifacts !== undefined) {
    if (!value.encryptedArtifacts || typeof value.encryptedArtifacts !== 'object' || Array.isArray(value.encryptedArtifacts)) {
      throw new Error('manifest encryptedArtifacts must be an object when present');
    }
    const encrypted = value.encryptedArtifacts as { [k: string]: unknown };
    if (encrypted.schemaVersion !== 1) {
      throw new Error('manifest encryptedArtifacts.schemaVersion must be 1');
    }
    if (encrypted.format !== 'memphis.encrypted-blob.v1') {
      throw new Error('manifest encryptedArtifacts.format must be memphis.encrypted-blob.v1');
    }
    if (encrypted.algorithm !== 'aes-256-gcm') {
      throw new Error('manifest encryptedArtifacts.algorithm must be aes-256-gcm');
    }
    if (encrypted.kdf !== 'scrypt') {
      throw new Error('manifest encryptedArtifacts.kdf must be scrypt');
    }
    if (!encrypted.bundle || typeof encrypted.bundle !== 'object' || Array.isArray(encrypted.bundle)) {
      throw new Error('manifest encryptedArtifacts.bundle must be an object');
    }
    const encryptedBundle = encrypted.bundle as { [k: string]: unknown };
    if (typeof encryptedBundle.path !== 'string' || encryptedBundle.path.length === 0) {
      throw new Error('manifest encryptedArtifacts.bundle.path must be a non-empty string');
    }
    if (typeof encryptedBundle.sha256 !== 'string' || encryptedBundle.sha256.length === 0) {
      throw new Error('manifest encryptedArtifacts.bundle.sha256 must be a non-empty string');
    }
    if (
      typeof encryptedBundle.bytes !== 'number' ||
      !Number.isFinite(encryptedBundle.bytes) ||
      encryptedBundle.bytes < 0
    ) {
      throw new Error('manifest encryptedArtifacts.bundle.bytes must be a non-negative number');
    }
    let manifestEncryptedPath: string | undefined = undefined;
    if (encrypted.manifest !== undefined) {
      if (!encrypted.manifest || typeof encrypted.manifest !== 'object' || Array.isArray(encrypted.manifest)) {
        throw new Error('manifest encryptedArtifacts.manifest must be an object when present');
      }
      const encryptedManifest = encrypted.manifest as { [k: string]: unknown };
      if (typeof encryptedManifest.path !== 'string' || encryptedManifest.path.length === 0) {
        throw new Error('manifest encryptedArtifacts.manifest.path must be a non-empty string');
      }
      manifestEncryptedPath = encryptedManifest.path;
    }
    encryptedArtifacts = {
      schemaVersion: 1,
      format: 'memphis.encrypted-blob.v1',
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      bundle: {
        path: encryptedBundle.path,
        sha256: encryptedBundle.sha256,
        bytes: encryptedBundle.bytes,
      },
      manifest: manifestEncryptedPath ? { path: manifestEncryptedPath } : undefined,
    };
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
      encryptedArtifacts,
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
    encryptedArtifacts,
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

function resolveEncryptedCompanionPath(path: string): string {
  return `${path}.enc`;
}

function loadManifest(options: {
  manifestPath: string;
  decryptionPassphrase: string | null;
  checks: VerifyOutput['checks'];
  errors: string[];
}): { manifest: IncidentBundleManifest | null; manifestObject: Record<string, unknown> } {
  try {
    const rawBytes = readFileSync(options.manifestPath);
    const parsed = JSON.parse(rawBytes.toString('utf8')) as unknown;
    if (isEncryptedBlobJson(parsed)) {
      options.checks.manifestEncrypted = true;
      if (!options.decryptionPassphrase) {
        options.errors.push('manifest is encrypted; provide --decryption-passphrase or matching env var');
        return { manifest: null, manifestObject: {} };
      }
      const decryptedManifest = decryptBlob({
        blob: parseEncryptedBlob(rawBytes),
        passphrase: options.decryptionPassphrase,
      });
      const manifestObject = JSON.parse(decryptedManifest.toString('utf8')) as Record<string, unknown>;
      const manifest = parseManifestObject(manifestObject);
      options.checks.schemaValid = true;
      return { manifest, manifestObject };
    }

    const manifestObject = parsed as Record<string, unknown>;
    const manifest = parseManifestObject(manifestObject);
    options.checks.schemaValid = true;
    return { manifest, manifestObject };
  } catch (error) {
    options.errors.push(error instanceof Error ? error.message : String(error));
    return { manifest: null, manifestObject: {} };
  }
}

function resolveBundleBytes(options: {
  manifest: IncidentBundleManifest;
  manifestPath: string;
  decryptionPassphrase: string | null;
  preferEncrypted: boolean;
  checks: VerifyOutput['checks'];
  errors: string[];
}): { bundlePath: string; bytes: Buffer | null } {
  const plainPath = resolveBundlePath(options.manifest.bundle.path, options.manifestPath);
  const encryptedPathFromManifest = options.manifest.encryptedArtifacts?.bundle?.path
    ? isAbsolute(options.manifest.encryptedArtifacts.bundle.path)
      ? options.manifest.encryptedArtifacts.bundle.path
      : resolve(dirname(options.manifestPath), options.manifest.encryptedArtifacts.bundle.path)
    : null;
  const encryptedCandidates = [encryptedPathFromManifest, resolveEncryptedCompanionPath(plainPath)].filter(
    (value): value is string => Boolean(value),
  );
  const orderedCandidates = options.preferEncrypted
    ? [...encryptedCandidates, plainPath]
    : [plainPath, ...encryptedCandidates];

  const uniqueCandidates = [...new Set(orderedCandidates)];
  for (const candidate of uniqueCandidates) {
    if (!existsSync(candidate)) continue;

    options.checks.bundleExists = true;
    const bytes = readFileSync(candidate);
    try {
      const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
      if (isEncryptedBlobJson(parsed)) {
        options.checks.bundleEncrypted = true;
        if (!options.decryptionPassphrase) {
          options.errors.push(
            `bundle file is encrypted (${candidate}); provide --decryption-passphrase or matching env var`,
          );
          return { bundlePath: candidate, bytes: null };
        }
        const decrypted = decryptBlob({
          blob: parseEncryptedBlob(bytes),
          passphrase: options.decryptionPassphrase,
        });
        return { bundlePath: candidate, bytes: decrypted };
      }
      return { bundlePath: candidate, bytes };
    } catch {
      return { bundlePath: candidate, bytes };
    }
  }

  options.errors.push(`bundle file not found: ${plainPath}`);
  return { bundlePath: plainPath, bytes: null };
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

async function writeVerificationChainEvent(options: {
  manifestPath: string;
  bundlePath: string;
  expectedKeyId: string | null;
  checks: VerifyOutput['checks'];
  errors: string[];
  ok: boolean;
}): Promise<VerifyOutput['chainEvent']> {
  const eventId = randomUUID();
  const taskId = `incident-manifest-verify:${sha256Hex(options.manifestPath).slice(0, 16)}`;
  const payload = {
    type: 'system_event',
    event: 'incident_manifest.verification',
    schemaVersion: 1,
    eventId,
    timestamp: new Date().toISOString(),
    correlation: {
      taskId,
      runId: eventId,
      agentId: 'ops.verify-incident-manifest',
      toolCallId: null,
    },
    payload: {
      manifestPath: options.manifestPath,
      bundlePath: options.bundlePath,
      expectedKeyId: options.expectedKeyId,
      ok: options.ok,
      checks: options.checks,
      errors: options.errors,
    },
  } as const;

  try {
    const appended: AppendBlockResult = await appendBlock('system', payload, process.env);
    return {
      attempted: true,
      written: true,
      chain: 'system',
      index: appended.index,
      hash: appended.hash,
    };
  } catch (error) {
    return {
      attempted: true,
      written: false,
      chain: 'system',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const manifestPath = resolveManifestPath();
  const requireSignature = hasFlag('--require-signature');
  const decryptionPassphrase = resolveDecryptionPassphrase();
  const skipChainEvent = hasFlag('--skip-chain-event');
  const expectedKeyId = parseArg('--expected-key-id') ?? process.env.MEMPHIS_INCIDENT_BUNDLE_EXPECTED_KEY_ID ?? null;
  const checks: VerifyOutput['checks'] = {
    schemaValid: false,
    manifestEncrypted: false,
    bundleExists: false,
    bundleEncrypted: false,
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
  const loaded = loadManifest({
    manifestPath,
    decryptionPassphrase,
    checks,
    errors,
  });
  manifestObject = loaded.manifestObject;
  const manifest = loaded.manifest;

  let bundlePath = '';
  if (manifest) {
    const bundleResolution = resolveBundleBytes({
      manifest,
      manifestPath,
      decryptionPassphrase,
      preferEncrypted: checks.manifestEncrypted,
      checks,
      errors,
    });
    bundlePath = bundleResolution.bundlePath;
    if (bundleResolution.bytes) {
      checks.bundleHashMatch = sha256Hex(bundleResolution.bytes) === manifest.bundle.sha256;
      checks.bundleSizeMatch = bundleResolution.bytes.byteLength === manifest.bundle.bytes;
      if (!checks.bundleHashMatch) errors.push('bundle sha256 mismatch');
      if (!checks.bundleSizeMatch) errors.push('bundle byte size mismatch');
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

  const verificationOk = errors.length === 0;
  const chainEvent = skipChainEvent
    ? {
        attempted: false,
        written: false,
        chain: 'system' as const,
      }
    : await writeVerificationChainEvent({
        manifestPath,
        bundlePath,
        expectedKeyId,
        checks,
        errors,
        ok: verificationOk,
      });
  if (!skipChainEvent && chainEvent && !chainEvent.written) {
    errors.push(`failed to append incident verification chain event: ${chainEvent.error ?? 'unknown_error'}`);
  }

  const result: VerifyOutput = {
    ok: errors.length === 0,
    manifestPath,
    bundlePath,
    checks,
    errors,
    chainEvent,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

try {
  await main();
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
