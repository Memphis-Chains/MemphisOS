import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');

describe('strict-handoff fixture validation script', () => {
  it('validates fixtures and live command outputs against strict-handoff schemas', () => {
    const result = spawnSync('npm', ['run', '-s', 'ops:validate-strict-handoff-fixtures'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 60_000,
      env: process.env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[PASS] summary example fixture matches summary schema');
    expect(result.stdout).toContain(
      '[PASS] completion-hints example fixture matches completion-hints schema',
    );
    expect(result.stdout).toContain(
      '[PASS] completion-hints command output matches completion-hints schema',
    );
    expect(result.stdout).toContain('[PASS] summary command output matches summary schema');
    expect(result.stdout).toContain('[PASS] strict-handoff fixture/schema validation completed');
  });
});
