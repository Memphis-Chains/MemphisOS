import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');
const tempDirs: string[] = [];

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

async function runCommand(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', '-s', ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...envOverrides },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

describe('incident manifest verifier', () => {
  it('verifies signed manifest and bundle hash successfully', async () => {
    const dir = makeTempDir('memphis-incident-manifest-verify-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle-signed.json');
    const manifestPath = path.join(dir, 'incident-bundle-signed.manifest.json');
    const signingKeyPath = path.join(dir, 'signing-private.pem');
    const verifyKeyPath = path.join(dir, 'signing-public.pem');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    const keyId = 'incident-signer-a';
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const pair = generateKeyPairSync('ed25519');
    writeFileSync(
      signingKeyPath,
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      'utf8',
    );
    writeFileSync(
      verifyKeyPath,
      pair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      'utf8',
    );

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
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
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
      '--public-key-path',
      verifyKeyPath,
      '--require-signature',
      '--expected-key-id',
      keyId,
    ], commandEnv);
    expect(verifyResult.status).toBe(0);

    const parsed = JSON.parse(verifyResult.stdout) as {
      ok: boolean;
      checks: {
        schemaValid: boolean;
        bundleHashMatch: boolean;
        bundleSizeMatch: boolean;
        signaturePresent: boolean;
        signatureVerified: boolean;
        payloadHashMatch: boolean;
        keyFingerprintMatch: boolean;
        keyIdMatch: boolean;
      };
      errors: string[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.checks.schemaValid).toBe(true);
    expect(parsed.checks.bundleHashMatch).toBe(true);
    expect(parsed.checks.bundleSizeMatch).toBe(true);
    expect(parsed.checks.signaturePresent).toBe(true);
    expect(parsed.checks.signatureVerified).toBe(true);
    expect(parsed.checks.payloadHashMatch).toBe(true);
    expect(parsed.checks.keyFingerprintMatch).toBe(true);
    expect(parsed.checks.keyIdMatch).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  it('writes immutable system chain event for manifest verification results', async () => {
    const dir = makeTempDir('memphis-incident-manifest-chain-event-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const signingKeyPath = path.join(dir, 'signing-private.pem');
    const verifyKeyPath = path.join(dir, 'signing-public.pem');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const pair = generateKeyPairSync('ed25519');
    writeFileSync(
      signingKeyPath,
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      'utf8',
    );
    writeFileSync(
      verifyKeyPath,
      pair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      'utf8',
    );

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
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
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
      '--public-key-path',
      verifyKeyPath,
      '--require-signature',
    ], commandEnv);
    expect(verifyResult.status).toBe(0);
    const parsed = JSON.parse(verifyResult.stdout) as {
      ok: boolean;
      chainEvent?: { attempted?: boolean; written?: boolean; index?: number; hash?: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.chainEvent?.attempted).toBe(true);
    expect(parsed.chainEvent?.written).toBe(true);
    expect(typeof parsed.chainEvent?.index).toBe('number');
    expect(typeof parsed.chainEvent?.hash).toBe('string');

    const chainDir = path.join(commandEnv.MEMPHIS_DATA_DIR, 'chains', 'system');
    expect(existsSync(chainDir)).toBe(true);
    const files = readdirSync(chainDir).filter((name) => name.endsWith('.json')).sort();
    expect(files.length).toBeGreaterThan(0);
    const last = JSON.parse(readFileSync(path.join(chainDir, files.at(-1) ?? ''), 'utf8')) as {
      data?: { type?: string; event?: string; payload?: { ok?: boolean; manifestPath?: string; bundlePath?: string } };
    };
    expect(last.data?.type).toBe('system_event');
    expect(last.data?.event).toBe('incident_manifest.verification');
    expect(last.data?.payload?.ok).toBe(true);
    expect(last.data?.payload?.manifestPath).toBe(manifestPath);
    expect(last.data?.payload?.bundlePath).toContain('incident-bundle.json');
  });

  it('fails verification when bundle content is tampered after manifest export', async () => {
    const dir = makeTempDir('memphis-incident-manifest-tamper-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
        '--status-url',
        statusUrl,
        '--audit-path',
        auditPath,
        '--out',
        bundlePath,
        '--manifest-out',
        manifestPath,
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const original = readFileSync(bundlePath, 'utf8');
    writeFileSync(bundlePath, `${original}\n`, 'utf8');

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
    ], commandEnv);
    expect(verifyResult.status).toBe(1);

    const parsed = JSON.parse(verifyResult.stdout) as {
      ok: boolean;
      checks: {
        bundleHashMatch: boolean;
        bundleSizeMatch: boolean;
      };
      errors: string[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.checks.bundleHashMatch).toBe(false);
    expect(parsed.checks.bundleSizeMatch).toBe(false);
    expect(parsed.errors.some((item) => item.includes('bundle sha256 mismatch'))).toBe(true);
  });

  it('fails when signature is required but manifest is unsigned', async () => {
    const dir = makeTempDir('memphis-incident-manifest-require-signature-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
        '--status-url',
        statusUrl,
        '--audit-path',
        auditPath,
        '--out',
        bundlePath,
        '--manifest-out',
        manifestPath,
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
      '--require-signature',
    ], commandEnv);
    expect(verifyResult.status).toBe(1);

    const parsed = JSON.parse(verifyResult.stdout) as { ok: boolean; errors: string[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((item) => item.includes('signature is required'))).toBe(true);
  });

  it('fails when expected key id does not match manifest signature metadata', async () => {
    const dir = makeTempDir('memphis-incident-manifest-key-id-mismatch-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const signingKeyPath = path.join(dir, 'signing-private.pem');
    const verifyKeyPath = path.join(dir, 'signing-public.pem');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const pair = generateKeyPairSync('ed25519');
    writeFileSync(
      signingKeyPath,
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      'utf8',
    );
    writeFileSync(
      verifyKeyPath,
      pair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      'utf8',
    );

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
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
        'actual-key',
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
      '--public-key-path',
      verifyKeyPath,
      '--require-signature',
      '--expected-key-id',
      'expected-key',
    ], commandEnv);
    expect(verifyResult.status).toBe(1);

    const parsed = JSON.parse(verifyResult.stdout) as {
      ok: boolean;
      checks: { keyIdMatch: boolean };
      errors: string[];
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.checks.keyIdMatch).toBe(false);
    expect(parsed.errors.some((item) => item.includes('signature key id mismatch'))).toBe(true);
  });

  it('verifies signed manifest via detached public-key bundle lookup', async () => {
    const dir = makeTempDir('memphis-incident-manifest-key-bundle-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const signingKeyPath = path.join(dir, 'signing-private.pem');
    const publicKeyBundlePath = path.join(dir, 'public-key-bundle.json');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    const keyId = 'bundle-key-1';
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const pair = generateKeyPairSync('ed25519');
    const publicKeyPem = pair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    writeFileSync(
      signingKeyPath,
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      'utf8',
    );
    writeFileSync(
      publicKeyBundlePath,
      JSON.stringify(
        {
          schemaVersion: 1,
          keys: [{ keyId, publicKeyPem }],
        },
        null,
        2,
      ),
      'utf8',
    );

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
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
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
      '--public-key-bundle-path',
      publicKeyBundlePath,
      '--expected-key-id',
      keyId,
      '--require-signature',
    ], commandEnv);
    expect(verifyResult.status).toBe(0);

    const parsed = JSON.parse(verifyResult.stdout) as {
      ok: boolean;
      checks: { signatureVerified: boolean; keyFingerprintMatch: boolean; keyIdMatch: boolean };
      errors: string[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.checks.signatureVerified).toBe(true);
    expect(parsed.checks.keyFingerprintMatch).toBe(true);
    expect(parsed.checks.keyIdMatch).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  it('fails detached public-key bundle lookup when key id is missing', async () => {
    const dir = makeTempDir('memphis-incident-manifest-key-bundle-missing-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const signingKeyPath = path.join(dir, 'signing-private.pem');
    const publicKeyBundlePath = path.join(dir, 'public-key-bundle.json');
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const pair = generateKeyPairSync('ed25519');
    const publicKeyPem = pair.publicKey.export({ format: 'pem', type: 'spki' }).toString();
    writeFileSync(
      signingKeyPath,
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      'utf8',
    );
    writeFileSync(
      publicKeyBundlePath,
      JSON.stringify(
        {
          schemaVersion: 1,
          keys: [{ keyId: 'some-other-key', publicKeyPem }],
        },
        null,
        2,
      ),
      'utf8',
    );

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
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
        'expected-key',
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
      '--public-key-bundle-path',
      publicKeyBundlePath,
      '--expected-key-id',
      'expected-key',
      '--require-signature',
    ], commandEnv);
    expect(verifyResult.status).toBe(1);
    const parsed = JSON.parse(verifyResult.stdout) as { ok: boolean; errors: string[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((item) => item.includes('public key bundle missing keyId'))).toBe(true);
  });

  it('verifies encrypted manifest + bundle companions with decryption passphrase', async () => {
    const dir = makeTempDir('memphis-incident-manifest-encrypted-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const encryptedManifestPath = `${manifestPath}.enc`;
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    const signingKeyPath = path.join(dir, 'signing-private.pem');
    const verifyKeyPath = path.join(dir, 'signing-public.pem');
    const keyId = 'encrypted-key-v1';
    const passphrase = 'incident-transfer-passphrase';
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const pair = generateKeyPairSync('ed25519');
    writeFileSync(
      signingKeyPath,
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      'utf8',
    );
    writeFileSync(
      verifyKeyPath,
      pair.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      'utf8',
    );

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
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
        '--encryption-passphrase',
        passphrase,
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      encryptedManifestPath,
      '--decryption-passphrase',
      passphrase,
      '--public-key-path',
      verifyKeyPath,
      '--expected-key-id',
      keyId,
      '--require-signature',
    ], commandEnv);
    expect(verifyResult.status).toBe(0);
    const parsed = JSON.parse(verifyResult.stdout) as {
      ok: boolean;
      checks: {
        manifestEncrypted: boolean;
        bundleEncrypted: boolean;
        signatureVerified: boolean;
      };
      errors: string[];
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.checks.manifestEncrypted).toBe(true);
    expect(parsed.checks.bundleEncrypted).toBe(true);
    expect(parsed.checks.signatureVerified).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  it('fails encrypted manifest verification when decryption passphrase is missing', async () => {
    const dir = makeTempDir('memphis-incident-manifest-encrypted-no-passphrase-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
    const encryptedManifestPath = `${manifestPath}.enc`;
    const commandEnv = { MEMPHIS_DATA_DIR: path.join(dir, '.memphis-data') };
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const exportResult = await runCommand([
        'ops:export-incident-bundle',
        '--',
        '--status-url',
        statusUrl,
        '--audit-path',
        auditPath,
        '--out',
        bundlePath,
        '--manifest-out',
        manifestPath,
        '--encryption-passphrase',
        'missing-passphrase-test',
      ], commandEnv);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      encryptedManifestPath,
    ], commandEnv);
    expect(verifyResult.status).toBe(1);
    const parsed = JSON.parse(verifyResult.stdout) as { ok: boolean; errors: string[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((item) => item.includes('manifest is encrypted'))).toBe(true);
  });
});
