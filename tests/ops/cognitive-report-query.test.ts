import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { runCli } from '../helpers/cli.js';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');

async function seedCognitiveReports(dataDir: string): Promise<void> {
  const env = { MEMPHIS_DATA_DIR: dataDir, RUST_CHAIN_ENABLED: 'false' };
  await runCli(['insights', '--json', '--save'], { env });
  await runCli(['categorize', 'Prepare release checklist', '--json', '--save'], { env });
  await runCli(['reflect', '--json', '--save'], { env });
}

describe('cognitive report query script', () => {
  it('returns latest cognitive reports as JSON for ops automation', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'memphis-cognitive-query-'));
    try {
      await seedCognitiveReports(dataDir);

      const result = spawnSync(
        'npm',
        ['run', '-s', 'ops:query-cognitive-reports', '--', '--json', '--limit', '5'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: { ...process.env, MEMPHIS_DATA_DIR: dataDir },
        },
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        schemaVersion: number;
        ok: boolean;
        typeFilter: string;
        count: number;
        reports: Array<{ reportType: string; schemaVersion: number | null }>;
      };
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.ok).toBe(true);
      expect(parsed.typeFilter).toBe('all');
      expect(parsed.count).toBeGreaterThanOrEqual(3);
      expect(new Set(parsed.reports.map((item) => item.reportType))).toEqual(
        new Set(['insight', 'categorize', 'reflection']),
      );
      expect(parsed.reports.every((item) => item.schemaVersion === 1)).toBe(true);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('supports type filtering for targeted triage', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'memphis-cognitive-query-filter-'));
    try {
      await seedCognitiveReports(dataDir);

      const result = spawnSync(
        'npm',
        ['run', '-s', 'ops:query-cognitive-reports', '--', '--json', '--type', 'categorize'],
        {
          cwd: repoRoot,
          encoding: 'utf8',
          env: { ...process.env, MEMPHIS_DATA_DIR: dataDir },
        },
      );

      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout) as {
        schemaVersion: number;
        ok: boolean;
        typeFilter: string;
        reports: Array<{ reportType: string; dataType: string }>;
      };
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.ok).toBe(true);
      expect(parsed.typeFilter).toBe('categorize');
      expect(parsed.reports.length).toBeGreaterThan(0);
      expect(parsed.reports.every((item) => item.reportType === 'categorize')).toBe(true);
      expect(parsed.reports.every((item) => item.dataType === 'categorize_report')).toBe(true);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
