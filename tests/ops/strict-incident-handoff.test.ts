import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign as signDetached } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');
const tempDirs: string[] = [];

interface HandoffSummary {
  ok: boolean;
  stage: 'preflight' | 'export' | 'verify';
  artifacts: { bundlePath: string | null; manifestPath: string | null };
  checks: {
    signatureVerified: boolean | null;
    keyBundleSignatureValid: boolean | null;
    keyBundleTrustRootMatch: boolean | null;
    cognitiveSummaryRequirementSatisfied: boolean | null;
    chainEventWritten: boolean | null;
  };
  error: string | null;
  errors: string[];
}

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

async function withStatusServer<T>(
  payload: unknown,
  fn: (statusUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(payload));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const statusUrl = `http://127.0.0.1:${port}/v1/ops/status`;
  try {
    return await fn(statusUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function runStrictHandoff(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): { status: number | null; stdout: string; stderr: string } {
  return spawnSync('npm', ['run', '-s', 'ops:strict-incident-handoff', '--', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...envOverrides },
    timeout: 30_000,
  });
}

function writeStrictKeyFixtures(dir: string, keyId: string): {
  signingKeyPath: string;
  publicKeyBundlePath: string;
  trustRootPath: string;
} {
  const signingKeyPath = path.join(dir, 'incident-signing-private.pem');
  const publicKeyBundlePath = path.join(dir, 'public-key-bundle.json');
  const trustRootPath = path.join(dir, 'trust_root.json');

  const manifestPair = generateKeyPairSync('ed25519');
  writeFileSync(
    signingKeyPath,
    manifestPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    'utf8',
  );
  const bundlePublicKeyPem = manifestPair.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString();

  const trustRootSigner = generateKeyPairSync('ed25519');
  const signerPublicKeyPem = trustRootSigner.publicKey
    .export({ format: 'pem', type: 'spki' })
    .toString();
  const signerRootId = sha256Hex(signerPublicKeyPem);
  const unsignedBundle = {
    schemaVersion: 1,
    keys: [{ keyId, publicKeyPem: bundlePublicKeyPem }],
  };
  const unsignedPayload = JSON.stringify(unsignedBundle);
  const provenanceSignature = signDetached(
    null,
    Buffer.from(unsignedPayload, 'utf8'),
    trustRootSigner.privateKey,
  ).toString('base64');

  writeFileSync(
    publicKeyBundlePath,
    JSON.stringify(
      {
        ...unsignedBundle,
        provenance: {
          algorithm: 'ed25519',
          signerRootId,
          signerPublicKeyPem,
          payloadSha256: sha256Hex(unsignedPayload),
          signature: provenanceSignature,
          signedAt: '2026-03-13T00:00:00.000Z',
        },
      },
      null,
      2,
    ),
    'utf8',
  );
  writeFileSync(
    trustRootPath,
    JSON.stringify({ version: 1, rootIds: [signerRootId] }, null, 2),
    'utf8',
  );

  return { signingKeyPath, publicKeyBundlePath, trustRootPath };
}

describe('strict incident handoff script', () => {
  it('prints help hints for operators and shell completion tooling', () => {
    const result = runStrictHandoff(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: npm run -s ops:strict-incident-handoff -- [options]');
    expect(result.stdout).toContain('--completion-hints');
    expect(result.stdout).toContain('MEMPHIS_INCIDENT_BUNDLE_PUBLIC_KEY_BUNDLE_PATH');
    expect(result.stdout).toContain('MEMPHIS_TRUST_ROOT_PATH');
  });

  it('prints machine-readable completion hints', () => {
    const result = runStrictHandoff(['--completion-hints']);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      schemaVersion: number;
      command: string;
      profiles: { export: string; verify: string };
      requiredFlags: string[];
      optionalBooleanFlags: string[];
      policyEnvVars: string[];
    };
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.command).toBe('ops:strict-incident-handoff');
    expect(parsed.profiles).toEqual({ export: 'strict-handoff', verify: 'trust-root-strict' });
    expect(parsed.requiredFlags).toContain('--public-key-bundle-path');
    expect(parsed.optionalBooleanFlags).toContain('--json');
    expect(parsed.optionalBooleanFlags).toContain('--preflight-only');
    expect(parsed.optionalBooleanFlags).toContain('--completion-hints');
    expect(parsed.policyEnvVars).toContain('MEMPHIS_INCIDENT_BUNDLE_PUBLIC_KEY_BUNDLE_PATH');
  });

  it('supports preflight-only mode for readiness checks without export/verify', () => {
    const dir = makeTempDir('memphis-strict-handoff-preflight-only-');
    const keyId = 'strict-preflight-only-key-v1';
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const { signingKeyPath, publicKeyBundlePath, trustRootPath } = writeStrictKeyFixtures(dir, keyId);

    const result = runStrictHandoff([
      '--preflight-only',
      '--out',
      bundlePath,
      '--signing-key-path',
      signingKeyPath,
      '--signing-key-id',
      keyId,
      '--public-key-bundle-path',
      publicKeyBundlePath,
      '--trust-root-path',
      trustRootPath,
      '--json',
    ]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as HandoffSummary;
    expect(parsed.ok).toBe(true);
    expect(parsed.stage).toBe('preflight');
    expect(parsed.artifacts.bundlePath).toBeNull();
    expect(parsed.artifacts.manifestPath).toBeNull();
    expect(parsed.errors).toEqual([]);
    expect(existsSync(bundlePath)).toBe(false);
  });

  it('prints human-readable preflight pass summary for operator smoke checks', () => {
    const dir = makeTempDir('memphis-strict-handoff-preflight-human-');
    const keyId = 'strict-preflight-human-key-v1';
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const { signingKeyPath, publicKeyBundlePath, trustRootPath } = writeStrictKeyFixtures(dir, keyId);

    const result = runStrictHandoff([
      '--preflight-only',
      '--out',
      bundlePath,
      '--signing-key-path',
      signingKeyPath,
      '--signing-key-id',
      keyId,
      '--public-key-bundle-path',
      publicKeyBundlePath,
      '--trust-root-path',
      trustRootPath,
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[PASS] strict incident handoff preflight checks passed');
    expect(existsSync(bundlePath)).toBe(false);
  });

  it('runs strict export+verify flow and returns pass summary in json mode', async () => {
    const dir = makeTempDir('memphis-strict-handoff-success-');
    const keyId = 'strict-handoff-key-v1';
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    writeFileSync(auditPath, `${JSON.stringify({ action: 'startup.ok' })}\n`, 'utf8');
    const { signingKeyPath, publicKeyBundlePath, trustRootPath } = writeStrictKeyFixtures(dir, keyId);

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const result = runStrictHandoff(
        [
          '--status-url',
          statusUrl,
          '--audit-path',
          auditPath,
          '--out',
          bundlePath,
          '--manifest-out',
          manifestPath,
          '--signing-key-path',
          signingKeyPath,
          '--signing-key-id',
          keyId,
          '--public-key-bundle-path',
          publicKeyBundlePath,
          '--trust-root-path',
          trustRootPath,
          '--json',
        ],
        commandEnv,
      );
      expect(result.status).toBe(0);

      const parsed = JSON.parse(result.stdout) as HandoffSummary;
      expect(parsed.ok).toBe(true);
      expect(parsed.stage).toBe('verify');
      expect(parsed.artifacts.bundlePath).toBe(bundlePath);
      expect(parsed.artifacts.manifestPath).toBe(manifestPath);
      expect(parsed.checks.signatureVerified).toBe(true);
      expect(parsed.checks.keyBundleSignatureValid).toBe(true);
      expect(parsed.checks.keyBundleTrustRootMatch).toBe(true);
      expect(parsed.checks.cognitiveSummaryRequirementSatisfied).toBe(true);
      expect(parsed.checks.chainEventWritten).toBe(true);
      expect(parsed.error).toBeNull();
      expect(parsed.errors).toEqual([]);
    });
  });

  it('fails preflight when public key bundle is missing', () => {
    const dir = makeTempDir('memphis-strict-handoff-preflight-');
    const keyId = 'strict-preflight-key-v1';
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const { signingKeyPath, trustRootPath } = writeStrictKeyFixtures(dir, keyId);
    writeFileSync(auditPath, `${JSON.stringify({ action: 'startup.ok' })}\n`, 'utf8');

    const result = runStrictHandoff([
      '--audit-path',
      auditPath,
      '--signing-key-path',
      signingKeyPath,
      '--signing-key-id',
      keyId,
      '--trust-root-path',
      trustRootPath,
      '--json',
    ]);
    expect(result.status).toBe(1);
    const parsed = JSON.parse(result.stdout) as HandoffSummary;
    expect(parsed.ok).toBe(false);
    expect(parsed.stage).toBe('preflight');
    expect(parsed.error).toContain('preflight failed');
    expect(parsed.errors.some((entry) => entry.includes('public-key-bundle-path'))).toBe(true);
  });

  it('fails verify stage when expected key id does not match signer key id', async () => {
    const dir = makeTempDir('memphis-strict-handoff-verify-fail-');
    const keyId = 'strict-verify-key-v1';
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    writeFileSync(auditPath, `${JSON.stringify({ action: 'startup.ok' })}\n`, 'utf8');
    const { signingKeyPath, publicKeyBundlePath, trustRootPath } = writeStrictKeyFixtures(dir, keyId);

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const result = runStrictHandoff(
        [
          '--status-url',
          statusUrl,
          '--audit-path',
          auditPath,
          '--out',
          bundlePath,
          '--manifest-out',
          manifestPath,
          '--signing-key-path',
          signingKeyPath,
          '--signing-key-id',
          keyId,
          '--expected-key-id',
          'wrong-key-id',
          '--public-key-bundle-path',
          publicKeyBundlePath,
          '--trust-root-path',
          trustRootPath,
          '--json',
        ],
        commandEnv,
      );
      expect(result.status).toBe(1);
      const parsed = JSON.parse(result.stdout) as HandoffSummary;
      expect(parsed.ok).toBe(false);
      expect(parsed.stage).toBe('verify');
      expect(parsed.error).toContain('verify command failed');
      expect(
        parsed.errors.some(
          (entry) =>
            entry.includes('signature key id mismatch') ||
            entry.includes('public key bundle missing keyId'),
        ),
      ).toBe(true);
    });
  });
});
