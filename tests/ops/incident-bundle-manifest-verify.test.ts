import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

async function runCommand(args: string[]): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', '-s', ...args], {
      cwd: repoRoot,
      env: process.env,
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
      ]);
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
    ]);
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
    expect(parsed.errors).toEqual([]);
  });

  it('fails verification when bundle content is tampered after manifest export', async () => {
    const dir = makeTempDir('memphis-incident-manifest-tamper-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle.json');
    const manifestPath = path.join(dir, 'incident-bundle.manifest.json');
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
      ]);
      expect(exportResult.status).toBe(0);
    });

    const original = readFileSync(bundlePath, 'utf8');
    writeFileSync(bundlePath, `${original}\n`, 'utf8');

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
    ]);
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
      ]);
      expect(exportResult.status).toBe(0);
    });

    const verifyResult = await runCommand([
      'ops:verify-incident-manifest',
      '--',
      '--manifest-path',
      manifestPath,
      '--require-signature',
    ]);
    expect(verifyResult.status).toBe(1);

    const parsed = JSON.parse(verifyResult.stdout) as { ok: boolean; errors: string[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.errors.some((item) => item.includes('signature is required'))).toBe(true);
  });
});
