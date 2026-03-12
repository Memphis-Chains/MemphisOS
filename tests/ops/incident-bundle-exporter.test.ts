import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
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

async function runIncidentBundleExporter(
  args: string[],
  envOverrides: NodeJS.ProcessEnv = {},
): Promise<{
  status: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', '-s', 'ops:export-incident-bundle', '--', ...args], {
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

describe('incident bundle exporter', () => {
  it('exports startup status, audit tail, and guard drill output with redaction enabled by default', async () => {
    const dir = makeTempDir('memphis-incident-bundle-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const outPath = path.join(dir, 'bundle.json');
    writeFileSync(
      auditPath,
      [
        JSON.stringify({
          ts: '2026-01-01T00:00:00.000Z',
          action: 'a1',
          status: 'allowed',
          authorization: 'Bearer audit-token-123',
        }),
        JSON.stringify({
          ts: '2026-01-01T00:00:01.000Z',
          action: 'a2',
          status: 'blocked',
          openai_api_key: 'sk-0123456789abcdef',
        }),
      ].join('\n') + '\n',
      'utf8',
    );

    await withStatusServer(
      {
        startup: {
          trustRoot: { enabled: true, valid: true },
          revocationCache: { enabled: true, stale: false },
          safeModeNetwork: { enabled: false, mode: 'disabled' },
        },
        auth: {
          apiKey: 'sk-0123456789abcdef',
          authorization: 'Bearer top-secret-token',
          publicNote: 'operator-visible',
        },
      },
      async (statusUrl) => {
        const result = await runIncidentBundleExporter([
          '--status-url',
          statusUrl,
          '--audit-path',
          auditPath,
          '--out',
          outPath,
          '--audit-lines',
          '10',
        ]);
      expect(result.status).toBe(0);
      const emitted = JSON.parse(result.stdout) as { ok: boolean; output: string };
      expect(emitted.ok).toBe(true);
      expect(emitted.output).toBe(outPath);

      const bundle = JSON.parse(readFileSync(outPath, 'utf8')) as {
        schemaVersion: number;
        status: {
          ok: boolean;
          payload?: {
            startup?: { trustRoot?: { valid?: boolean } };
            auth?: { apiKey?: string; authorization?: string; publicNote?: string };
          };
        };
        securityAudit: { tailLines: Array<{ action?: string; authorization?: string; openai_api_key?: string }> };
        drill: { ok: boolean; result?: { schemaVersion?: number; scenarios?: Array<{ name?: string }> } };
      };

      expect(bundle.schemaVersion).toBe(1);
      expect(bundle.status.ok).toBe(true);
      expect(bundle.status.payload?.startup?.trustRoot?.valid).toBe(true);
      expect(bundle.status.payload?.auth?.apiKey).toBe('[REDACTED]');
      expect(bundle.status.payload?.auth?.authorization).toBe('[REDACTED]');
      expect(bundle.status.payload?.auth?.publicNote).toBe('operator-visible');
      expect(bundle.securityAudit.tailLines.length).toBe(2);
      expect(bundle.securityAudit.tailLines[1]?.action).toBe('a2');
      expect(bundle.securityAudit.tailLines[0]?.authorization).toBe('[REDACTED]');
      expect(bundle.securityAudit.tailLines[1]?.openai_api_key).toBe('[REDACTED]');
      expect(bundle.drill.ok).toBe(true);
      expect(bundle.drill.result?.schemaVersion).toBe(1);
      expect(bundle.drill.result?.scenarios?.map((s) => s.name).sort()).toEqual([
        'revocation-stale',
        'trust-root-invalid-strict',
      ]);
      },
    );
  });

  it('prunes old timestamped incident bundles and paired manifests using retention policy', async () => {
    const dir = makeTempDir('memphis-incident-bundle-retention-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const oldA = path.join(dir, 'incident-bundle-2026-01-01T00-00-00-000Z.json');
    const oldB = path.join(dir, 'incident-bundle-2026-01-02T00-00-00-000Z.json');
    const oldC = path.join(dir, 'incident-bundle-2026-01-03T00-00-00-000Z.json');
    writeFileSync(oldA, '{"schemaVersion":1}', 'utf8');
    writeFileSync(oldB, '{"schemaVersion":1}', 'utf8');
    writeFileSync(oldC, '{"schemaVersion":1}', 'utf8');
    writeFileSync(oldA.replace('.json', '.manifest.json'), '{"schemaVersion":1}', 'utf8');
    writeFileSync(oldB.replace('.json', '.manifest.json'), '{"schemaVersion":1}', 'utf8');
    writeFileSync(oldC.replace('.json', '.manifest.json'), '{"schemaVersion":1}', 'utf8');

    const now = new Date();
    utimesSync(oldA, now, new Date(now.getTime() - 30_000));
    utimesSync(oldB, now, new Date(now.getTime() - 20_000));
    utimesSync(oldC, now, new Date(now.getTime() - 10_000));

    const outPath = path.join(dir, 'incident-bundle-current.json');
    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const result = await runIncidentBundleExporter([
        '--status-url',
        statusUrl,
        '--audit-path',
        auditPath,
        '--out',
        outPath,
        '--retention-count',
        '2',
        '--retention-days',
        '3650',
      ]);
      expect(result.status).toBe(0);
      const emitted = JSON.parse(result.stdout) as { ok: boolean; prunedFiles: string[] };
      expect(emitted.ok).toBe(true);
      expect(emitted.prunedFiles.length).toBeGreaterThanOrEqual(2);
    });

    const remainingBundles = readdirSync(dir)
      .filter((name) => name.startsWith('incident-bundle-') && name.endsWith('.json') && !name.endsWith('.manifest.json'))
      .sort();
    expect(remainingBundles).toEqual([
      'incident-bundle-2026-01-03T00-00-00-000Z.json',
      'incident-bundle-current.json',
    ]);
    expect(existsSync(oldA)).toBe(false);
    expect(existsSync(oldB)).toBe(false);
    expect(existsSync(oldA.replace('.json', '.manifest.json'))).toBe(false);
    expect(existsSync(oldB.replace('.json', '.manifest.json'))).toBe(false);
    expect(existsSync(oldC)).toBe(true);
    expect(existsSync(oldC.replace('.json', '.manifest.json'))).toBe(true);
  });

  it('can emit a signed manifest for incident bundle chain-of-custody', async () => {
    const dir = makeTempDir('memphis-incident-bundle-signature-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle-signed.json');
    const manifestPath = path.join(dir, 'incident-bundle-signed.manifest.json');
    const keyPath = path.join(dir, 'manifest-signing-key.pem');
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const pair = generateKeyPairSync('ed25519');
    writeFileSync(
      keyPath,
      pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      'utf8',
    );

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const result = await runIncidentBundleExporter([
        '--status-url',
        statusUrl,
        '--audit-path',
        auditPath,
        '--out',
        bundlePath,
        '--manifest-out',
        manifestPath,
        '--signing-key-path',
        keyPath,
      ]);
      expect(result.status).toBe(0);
      const emitted = JSON.parse(result.stdout) as { ok: boolean; manifest: string | null };
      expect(emitted.ok).toBe(true);
      expect(emitted.manifest).toBe(manifestPath);
    });

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      schemaVersion: number;
      signature?: {
        algorithm?: string;
        value?: string;
        payloadSha256?: string;
      };
    };
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.signature?.algorithm).toBe('ed25519');
    expect(typeof manifest.signature?.value).toBe('string');
    expect(typeof manifest.signature?.payloadSha256).toBe('string');

    const signatureValue = manifest.signature?.value ?? '';
    const unsigned = { ...manifest };
    delete (unsigned as { signature?: unknown }).signature;
    const payload = JSON.stringify(unsigned);
    const signatureBytes = Buffer.from(signatureValue, 'base64');
    const verified = verify(null, Buffer.from(payload, 'utf8'), pair.publicKey, signatureBytes);
    expect(verified).toBe(true);
    expect(manifest.signature?.payloadSha256).toBe(createHash('sha256').update(payload).digest('hex'));
  });

  it('supports env-injected signing key PEM and records key-id metadata', async () => {
    const dir = makeTempDir('memphis-incident-bundle-env-key-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const bundlePath = path.join(dir, 'incident-bundle-signed.json');
    const manifestPath = path.join(dir, 'incident-bundle-signed.manifest.json');
    const keyId = 'incident-key-v1';
    writeFileSync(auditPath, `${JSON.stringify({ action: 'boot' })}\n`, 'utf8');

    const pair = generateKeyPairSync('ed25519');
    const privatePem = pair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

    await withStatusServer({ startup: { trustRoot: { valid: true } } }, async (statusUrl) => {
      const result = await runIncidentBundleExporter(
        [
          '--status-url',
          statusUrl,
          '--audit-path',
          auditPath,
          '--out',
          bundlePath,
          '--manifest-out',
          manifestPath,
        ],
        {
          MEMPHIS_INCIDENT_BUNDLE_SIGNING_KEY_PEM: privatePem,
          MEMPHIS_INCIDENT_BUNDLE_SIGNING_KEY_ID: keyId,
        },
      );
      expect(result.status).toBe(0);
      const emitted = JSON.parse(result.stdout) as {
        ok: boolean;
        manifest: string | null;
        signingKeySource: string | null;
        signingKeyId: string | null;
      };
      expect(emitted.ok).toBe(true);
      expect(emitted.manifest).toBe(manifestPath);
      expect(emitted.signingKeySource).toBe('env-pem');
      expect(emitted.signingKeyId).toBe(keyId);
    });

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      signature?: {
        keyId?: string;
        value?: string;
      };
    };
    expect(manifest.signature?.keyId).toBe(keyId);

    const signatureValue = manifest.signature?.value ?? '';
    const unsigned = { ...manifest };
    delete (unsigned as { signature?: unknown }).signature;
    const payload = JSON.stringify(unsigned);
    const signatureBytes = Buffer.from(signatureValue, 'base64');
    const verified = verify(null, Buffer.from(payload, 'utf8'), pair.publicKey, signatureBytes);
    expect(verified).toBe(true);
  });
});
