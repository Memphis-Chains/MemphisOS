import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type ValidatorOutputContract = {
  schemaVersion: number;
  summaryTopLevelKeys: string[];
};

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');
const outputContractPath = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'release-draft',
  'validator-metadata-validator-output-contract.json',
);

describe('release-draft validator metadata schema validator command', () => {
  it('passes for the release-draft validator metadata example fixture', () => {
    const result = spawnSync(
      'npm',
      [
        'run',
        '-s',
        'ops:validate-release-draft-validator-metadata',
        '--',
        '--metadata-path',
        'tests/fixtures/release-draft/validator-metadata-example.json',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60_000,
        env: process.env,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[PASS] validator metadata matches schema');
  });

  it('fails closed for invalid metadata payloads', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'memphis-release-metadata-'));
    const invalidPath = path.join(outDir, 'invalid-validator-metadata.json');
    writeFileSync(invalidPath, JSON.stringify({ schemaVersion: 1 }, null, 2), 'utf8');

    const result = spawnSync(
      'npm',
      [
        'run',
        '-s',
        'ops:validate-release-draft-validator-metadata',
        '--',
        '--metadata-path',
        invalidPath,
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60_000,
        env: process.env,
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('validator metadata schema validation failed');
  });

  it('emits stable machine-readable output keys in --json mode', () => {
    const result = spawnSync(
      'npm',
      [
        'run',
        '-s',
        'ops:validate-release-draft-validator-metadata',
        '--',
        '--metadata-path',
        'tests/fixtures/release-draft/validator-metadata-example.json',
        '--json',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 60_000,
        env: process.env,
      },
    );

    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      schemaVersion: number;
      ok: boolean;
      metadataPath: string;
      schemaPath: string;
      error: string | null;
    };
    const contract = JSON.parse(readFileSync(outputContractPath, 'utf8')) as ValidatorOutputContract;

    expect(parsed.schemaVersion).toBe(contract.schemaVersion);
    expect(Object.keys(parsed).sort()).toEqual([...contract.summaryTopLevelKeys].sort());
    expect(parsed.ok).toBe(true);
    expect(parsed.error).toBeNull();
  });
});
