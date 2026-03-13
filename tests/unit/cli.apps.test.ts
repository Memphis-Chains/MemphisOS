import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli } from '../helpers/cli.js';

describe('CLI apps', () => {
  it('lists user-managed manifests as JSON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-cli-app-list-'));
    const manifestsDir = join(dir, 'apps', 'manifests');
    mkdirSync(manifestsDir, { recursive: true });
    writeFileSync(
      join(manifestsDir, 'demo.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app',
          actions: {
            status: {
              summary: 'print status token',
              steps: ['printf status-ready'],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const out = await runCli(['apps', 'list', '--json'], {
      env: { MEMPHIS_DATA_DIR: dir },
    });

    const data = JSON.parse(out) as {
      manifests: Array<{ id: string; source: { kind: string }; actions: string[] }>;
    };
    expect(data.manifests.map((item) => item.id)).toContain('demo-app');
    expect(data.manifests.find((item) => item.id === 'demo-app')?.source.kind).toBe('file');
  });

  it('plans a file-backed install action without executing it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-cli-app-plan-'));
    const manifestPath = join(dir, 'demo.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app',
          actions: {
            install: {
              summary: 'print install token',
              steps: ['printf install-ready'],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const out = await runCli(['apps', 'install', 'demo-app', '--file', manifestPath, '--json'], {
      env: { MEMPHIS_DATA_DIR: dir },
    });

    const data = JSON.parse(out) as {
      action: string;
      applyRequested: boolean;
      willExecute: boolean;
      executed: boolean;
      steps: string[];
    };
    expect(data.action).toBe('install');
    expect(data.applyRequested).toBe(false);
    expect(data.willExecute).toBe(false);
    expect(data.executed).toBe(false);
    expect(data.steps[0]).toContain('printf install-ready');
  });

  it('executes a file-backed action when --apply is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-cli-app-'));
    const manifestPath = join(dir, 'demo.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app',
          actions: {
            doctor: {
              summary: 'print readiness token',
              steps: ['printf cli-ready'],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const out = await runCli(
      ['apps', 'run', 'demo-app', '--file', manifestPath, '--action', 'doctor', '--apply', '--json'],
      {
        env: { MEMPHIS_DATA_DIR: dir },
      },
    );

    const data = JSON.parse(out) as {
      executed: boolean;
      results: Array<{ stdout: string }>;
      installedRecord?: { installed: boolean; lastAction: string };
    };
    expect(data.executed).toBe(true);
    expect(data.results[0]?.stdout).toContain('cli-ready');
    expect(data.installedRecord?.installed).toBe(true);
    expect(data.installedRecord?.lastAction).toBe('doctor');
  });
});
