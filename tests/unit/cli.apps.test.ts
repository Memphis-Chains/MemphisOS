import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { vaultEncrypt } from '../../src/infra/storage/rust-vault-adapter.js';
import { saveVaultEntry } from '../../src/infra/storage/vault-entry-store.js';
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
          capabilities: ['workspace', 'mcp'],
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
      capabilityCounts: Record<string, number>;
      manifestErrors: Array<{ path: string; detail: string }>;
      manifests: Array<{
        id: string;
        source: { kind: string };
        actions: string[];
        capabilities: string[];
        capabilityGuidance: string[];
      }>;
    };
    expect(data.manifests.map((item) => item.id)).toContain('demo-app');
    expect(data.manifests.find((item) => item.id === 'demo-app')?.source.kind).toBe('file');
    expect(data.manifests.find((item) => item.id === 'demo-app')?.capabilities).toEqual([
      'mcp',
      'workspace',
    ]);
    expect(data.manifests.find((item) => item.id === 'demo-app')?.capabilityGuidance).toEqual([
      expect.stringContaining('Workspace:'),
      expect.stringContaining('MCP:'),
    ]);
    expect(data.capabilityCounts).toMatchObject({
      mcp: 1,
      workspace: 1,
    });
    expect(data.manifestErrors).toEqual([]);
  });

  it('prints capability guidance in human app show output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-cli-app-show-'));
    const manifestPath = join(dir, 'demo.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app',
          capabilities: ['workspace', 'secrets'],
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

    const out = await runCli(['apps', 'show', 'demo-app', '--file', manifestPath], {
      env: { MEMPHIS_DATA_DIR: dir },
    });

    expect(out).toContain('capabilities: secrets, workspace');
    expect(out).toContain('guidance:');
    expect(out).toContain('Workspace:');
    expect(out).toContain('Secrets:');
  });

  it('returns capability guidance in JSON app show output', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-cli-app-show-json-'));
    const manifestPath = join(dir, 'demo.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app',
          capabilities: ['mcp', 'secrets'],
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

    const out = await runCli(['apps', 'show', 'demo-app', '--file', manifestPath, '--json'], {
      env: { MEMPHIS_DATA_DIR: dir },
    });

    const data = JSON.parse(out) as {
      manifest: { id: string; capabilityGuidance: string[] };
    };
    expect(data.manifest.id).toBe('demo-app');
    expect(data.manifest.capabilityGuidance).toEqual([
      expect.stringContaining('MCP:'),
      expect.stringContaining('Secrets:'),
    ]);
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

  it('executes a file-backed action with a vault-backed env binding', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-cli-app-vault-'));
    const bridgePath = join(dir, 'mock-bridge.cjs');
    const entriesPath = join(dir, 'vault-entries.json');
    const manifestPath = join(dir, 'demo.json');

    writeFileSync(
      bridgePath,
      `module.exports = {
  vault_init: () => JSON.stringify({ ok: true, data: { version: 1, did: 'did:memphis:cli-apps' } }),
  vault_encrypt: (key, plaintext) => JSON.stringify({ ok: true, data: { key, encrypted: 'enc:' + plaintext, iv: 'iv' } }),
  vault_decrypt: (entryJson) => {
    const e = JSON.parse(entryJson);
    return JSON.stringify({ ok: true, data: { plaintext: String(e.encrypted).replace('enc:', '') } });
  }
};`,
      'utf8',
    );

    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app with vault-backed env binding',
          actions: {
            install: {
              summary: 'install demo app',
              steps: ['test "$DEMO_TOKEN" = "secret-demo" && printf cli-vault-ready'],
              vaultEnv: {
                DEMO_TOKEN: 'DEMO_TOKEN',
              },
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const env = {
      MEMPHIS_DATA_DIR: dir,
      MEMPHIS_VAULT_ENTRIES_PATH: entriesPath,
      MEMPHIS_VAULT_PEPPER: 'very-secure-pepper',
      RUST_CHAIN_ENABLED: 'true',
      RUST_CHAIN_BRIDGE_PATH: bridgePath,
    };
    saveVaultEntry(vaultEncrypt('DEMO_TOKEN', 'secret-demo', env), env);

    const out = await runCli(['apps', 'install', 'demo-app', '--file', manifestPath, '--apply', '--json'], {
      env,
    });

    const data = JSON.parse(out) as {
      executed: boolean;
      secretBindings: Array<{ envName: string; source: string; ok: boolean }>;
      results: Array<{ stdout: string }>;
    };
    expect(data.executed).toBe(true);
    expect(data.secretBindings).toEqual([
      expect.objectContaining({
        envName: 'DEMO_TOKEN',
        source: 'vault',
        ok: true,
      }),
    ]);
    expect(data.results[0]?.stdout).toContain('cli-vault-ready');
  });

  it('executes a file-backed action with a vault-backed file binding', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-cli-app-vault-file-'));
    const bridgePath = join(dir, 'mock-bridge.cjs');
    const entriesPath = join(dir, 'vault-entries.json');
    const manifestPath = join(dir, 'demo.json');

    writeFileSync(
      bridgePath,
      `module.exports = {
  vault_init: () => JSON.stringify({ ok: true, data: { version: 1, did: 'did:memphis:cli-apps-file' } }),
  vault_encrypt: (key, plaintext) => JSON.stringify({ ok: true, data: { key, encrypted: 'enc:' + plaintext, iv: 'iv' } }),
  vault_decrypt: (entryJson) => {
    const e = JSON.parse(entryJson);
    return JSON.stringify({ ok: true, data: { plaintext: String(e.encrypted).replace('enc:', '') } });
  }
};`,
      'utf8',
    );

    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app with vault-backed file binding',
          actions: {
            install: {
              summary: 'install demo app',
              steps: ['test "$(cat "$APP_STATE_DIR/token.txt")" = "secret-file-demo" && printf cli-vault-file-ready'],
              vaultFiles: {
                '${APP_STATE_DIR}/token.txt': {
                  key: 'DEMO_FILE_TOKEN',
                  mode: '600',
                },
              },
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const env = {
      MEMPHIS_DATA_DIR: dir,
      MEMPHIS_VAULT_ENTRIES_PATH: entriesPath,
      MEMPHIS_VAULT_PEPPER: 'very-secure-pepper',
      RUST_CHAIN_ENABLED: 'true',
      RUST_CHAIN_BRIDGE_PATH: bridgePath,
    };
    saveVaultEntry(vaultEncrypt('DEMO_FILE_TOKEN', 'secret-file-demo', env), env);

    const out = await runCli(['apps', 'install', 'demo-app', '--file', manifestPath, '--apply', '--json'], {
      env,
    });

    const data = JSON.parse(out) as {
      executed: boolean;
      secretBindings: Array<{ target: string; path?: string; source: string; ok: boolean }>;
      results: Array<{ stdout: string }>;
      paths: { state: string };
    };
    expect(data.executed).toBe(true);
    expect(data.secretBindings).toEqual([
      expect.objectContaining({
        target: 'file',
        path: join(dir, 'apps', 'demo-app', 'state', 'token.txt'),
        source: 'vault',
        ok: true,
      }),
    ]);
    expect(data.results[0]?.stdout).toContain('cli-vault-file-ready');
    expect(readFileSync(join(data.paths.state, 'token.txt'), 'utf8')).toBe('secret-file-demo');
  });
});
