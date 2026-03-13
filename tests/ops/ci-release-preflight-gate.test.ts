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
  extraEnv: Record<string, string> = {},
): { result: ReturnType<typeof spawnSync>; stepSummaryPath: string; githubOutputPath: string } {
  const outDir = mkdtempSync(path.join(tmpdir(), 'memphis-ci-preflight-gate-'));
  const stepSummaryPath = path.join(outDir, 'step-summary.md');
  const githubOutputPath = path.join(outDir, 'github-output.txt');
  writeFileSync(stepSummaryPath, '', 'utf8');
  writeFileSync(githubOutputPath, '', 'utf8');

  const result = spawnSync('bash', ['./scripts/ci-release-preflight-gate.sh'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      ...process.env,
      MEMPHIS_RELEASE_PREFLIGHT_GATE_OVERRIDE_JSON: overrideGatesRaw,
      RUNNER_TEMP: outDir,
      GITHUB_STEP_SUMMARY: stepSummaryPath,
      GITHUB_OUTPUT: githubOutputPath,
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'Memphis-Chains/MemphisOS',
      GITHUB_SHA: sha,
      ...extraEnv,
    },
  });

  return { result, stepSummaryPath, githubOutputPath };
}

function parseGithubOutput(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const heredocIndex = line.indexOf('<<');
    if (heredocIndex > 0) {
      const key = line.slice(0, heredocIndex);
      const terminator = line.slice(heredocIndex + 2);
      const chunks: string[] = [];
      index += 1;
      while (index < lines.length && lines[index] !== terminator) {
        chunks.push(lines[index]);
        index += 1;
      }
      result[key] = chunks.join('\n');
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex > 0) {
      result[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
    }
  }
  return result;
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

  it('emits release-preflight outputs when output mode is enabled', () => {
    const override: GateOverride[] = [
      { id: 'lint', command: 'node', args: ['-e', 'process.exit(0)'] },
      { id: 'typecheck', command: 'node', args: ['-e', 'process.exit(0)'] },
    ];
    const { result, githubOutputPath } = runCiPreflightGateWithOverride(
      JSON.stringify(override),
      'forced-sha-3',
      { MEMPHIS_RELEASE_PREFLIGHT_GATE_OUTPUT: '1' },
    );

    expect(result.status).toBe(0);
    const output = parseGithubOutput(readFileSync(githubOutputPath, 'utf8'));

    expect(output.preflight_gate_ids).toBe('["lint","typecheck"]');
    expect(output.preflight_summary_json).toContain('"schemaVersion": 1');
    expect(output.preflight_summary_json).toContain('"ok": true');
  });

  it('fails closed when strict output mode is enabled but strict gate outputs are missing', () => {
    const override: GateOverride[] = [
      { id: 'lint', command: 'node', args: ['-e', 'process.exit(0)'] },
      { id: 'typecheck', command: 'node', args: ['-e', 'process.exit(0)'] },
    ];
    const { result } = runCiPreflightGateWithOverride(JSON.stringify(override), 'forced-sha-4', {
      MEMPHIS_RELEASE_PREFLIGHT_GATE_OUTPUT: '1',
      MEMPHIS_STRICT_HANDOFF_GATE_OUTPUT: '1',
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      'strict-handoff gate outputs were not emitted by ops:release-preflight',
    );
  });
});
