import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');

type GateOverride = { id: string; command: string; args: string[] };

function runCiPreflightGateWithOverride(
  overrideGatesRaw: string,
  sha: string,
): { result: ReturnType<typeof spawnSync>; stepSummaryPath: string } {
  const outDir = mkdtempSync(path.join(tmpdir(), 'memphis-ci-preflight-gate-'));
  const stepSummaryPath = path.join(outDir, 'step-summary.md');
  writeFileSync(stepSummaryPath, '', 'utf8');

  const result = spawnSync('bash', ['./scripts/ci-release-preflight-gate.sh'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      MEMPHIS_RELEASE_PREFLIGHT_GATE_OVERRIDE_JSON: overrideGatesRaw,
      RUNNER_TEMP: outDir,
      GITHUB_STEP_SUMMARY: stepSummaryPath,
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'Memphis-Chains/MemphisOS',
      GITHUB_SHA: sha,
    },
  });

  return { result, stepSummaryPath };
}

describe('ci release-preflight gate helper script', () => {
  it('emits failing-gate remediation URL for forced gate failures', () => {
    const override: GateOverride[] = [
      { id: 'lint', command: 'node', args: ['-e', 'process.exit(0)'] },
      { id: 'typecheck', command: 'node', args: ['-e', 'process.exit(9)'] },
    ];
    const { result, stepSummaryPath } = runCiPreflightGateWithOverride(
      JSON.stringify(override),
      'forced-sha-1',
    );

    expect(result.status).not.toBe(0);
    const expectedUrl =
      'https://github.com/Memphis-Chains/MemphisOS/blob/forced-sha-1/docs/runbooks/RELEASE.md#ci-preflight-gate-typecheck';
    const combinedOutput = `${result.stdout}${result.stderr}`;
    const stepSummary = readFileSync(stepSummaryPath, 'utf8');

    expect(combinedOutput).toContain(`::error::Release preflight failed. Remediation: ${expectedUrl}`);
    expect(stepSummary).toContain(`- [${expectedUrl}](${expectedUrl})`);
  });

  it('falls back to triage-map remediation URL when failed gate id is unavailable', () => {
    const { result, stepSummaryPath } = runCiPreflightGateWithOverride('[]', 'forced-sha-2');

    expect(result.status).not.toBe(0);
    const expectedUrl =
      'https://github.com/Memphis-Chains/MemphisOS/blob/forced-sha-2/docs/runbooks/RELEASE.md#ci-preflight-failure-triage-map';
    const combinedOutput = `${result.stdout}${result.stderr}`;
    const stepSummary = readFileSync(stepSummaryPath, 'utf8');

    expect(combinedOutput).toContain('::error::release preflight emitted empty gates list');
    expect(combinedOutput).toContain(`::error::Release preflight failed. Remediation: ${expectedUrl}`);
    expect(stepSummary).toContain(`- [${expectedUrl}](${expectedUrl})`);
  });
});
