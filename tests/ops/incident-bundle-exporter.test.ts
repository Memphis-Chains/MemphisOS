import { spawn } from 'node:child_process';
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

describe('incident bundle exporter', () => {
  it('exports startup status, audit tail, and guard drill output in one command', async () => {
    const dir = makeTempDir('memphis-incident-bundle-');
    const auditPath = path.join(dir, 'security-audit.jsonl');
    const outPath = path.join(dir, 'bundle.json');
    writeFileSync(
      auditPath,
      [
        JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', action: 'a1', status: 'allowed' }),
        JSON.stringify({ ts: '2026-01-01T00:00:01.000Z', action: 'a2', status: 'blocked' }),
      ].join('\n') + '\n',
      'utf8',
    );

    const server = createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          startup: {
            trustRoot: { enabled: true, valid: true },
            revocationCache: { enabled: true, stale: false },
            safeModeNetwork: { enabled: false, mode: 'disabled' },
          },
        }),
      );
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>(
        (resolve, reject) => {
          const child = spawn(
            'npm',
            [
              'run',
              '-s',
              'ops:export-incident-bundle',
              '--',
              '--status-url',
              `http://127.0.0.1:${port}/v1/ops/status`,
              '--audit-path',
              auditPath,
              '--out',
              outPath,
              '--audit-lines',
              '10',
            ],
            {
              cwd: repoRoot,
              env: process.env,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );
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
        },
      );

      expect(result.status).toBe(0);
      const emitted = JSON.parse(result.stdout) as { ok: boolean; output: string };
      expect(emitted.ok).toBe(true);
      expect(emitted.output).toBe(outPath);

      const bundle = JSON.parse(readFileSync(outPath, 'utf8')) as {
        schemaVersion: number;
        status: { ok: boolean; payload?: { startup?: { trustRoot?: { valid?: boolean } } } };
        securityAudit: { tailLines: Array<{ action?: string }> };
        drill: { ok: boolean; result?: { schemaVersion?: number; scenarios?: Array<{ name?: string }> } };
      };

      expect(bundle.schemaVersion).toBe(1);
      expect(bundle.status.ok).toBe(true);
      expect(bundle.status.payload?.startup?.trustRoot?.valid).toBe(true);
      expect(bundle.securityAudit.tailLines.length).toBe(2);
      expect(bundle.securityAudit.tailLines[1]?.action).toBe('a2');
      expect(bundle.drill.ok).toBe(true);
      expect(bundle.drill.result?.schemaVersion).toBe(1);
      expect(bundle.drill.result?.scenarios?.map((s) => s.name).sort()).toEqual([
        'revocation-stale',
        'trust-root-invalid-strict',
      ]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  });
});
