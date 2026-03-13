import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  describeManagedAppManifest,
  executeManagedAppAction,
  getManagedAppManifest,
  listManagedAppManifestRefs,
  planManagedAppAction,
} from '../../src/modules/apps/manifest.js';

describe('managed app manifests', () => {
  it('loads user-managed manifests from the Memphis manifests directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-apps-list-'));
    const manifestsDir = join(dir, 'apps', 'manifests');
    mkdirSync(manifestsDir, { recursive: true });
    writeFileSync(
      join(manifestsDir, 'demo.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app in managed manifests dir',
          actions: {
            doctor: {
              summary: 'print readiness token',
              steps: ['printf ready'],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const manifests = listManagedAppManifestRefs({ MEMPHIS_DATA_DIR: dir } as NodeJS.ProcessEnv);
    expect(manifests.map((item) => item.manifest.id)).toContain('demo-app');
    const demo = manifests.find((item) => item.manifest.id === 'demo-app');
    expect(describeManagedAppManifest(demo!).actions).toEqual(['doctor']);
  });

  it('plans a file-backed install action with Memphis-managed paths', () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-app-plan-'));
    const manifestPath = join(dir, 'demo.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app for path planning',
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

    const rawEnv = { MEMPHIS_DATA_DIR: '/tmp/memphis-apps' } as NodeJS.ProcessEnv;
    const ref = getManagedAppManifest({ file: manifestPath, rawEnv });
    const plan = planManagedAppAction(ref, 'install', { rawEnv });

    expect(plan.paths.appRoot).toBe('/tmp/memphis-apps/apps/demo-app');
    expect(plan.paths.home).toBe('/tmp/memphis-apps/apps/demo-app/home');
    expect(plan.paths.state).toBe('/tmp/memphis-apps/apps/demo-app/state');
    expect(plan.paths.config).toBe('/tmp/memphis-apps/apps/demo-app/config/app.json');
    expect(plan.exportedEnv.APP_HOME).toBe('/tmp/memphis-apps/apps/demo-app/home');
    expect(plan.exportedEnv.APP_STATE_DIR).toBe('/tmp/memphis-apps/apps/demo-app/state');
    expect(plan.exportedEnv.APP_CONFIG_PATH).toBe('/tmp/memphis-apps/apps/demo-app/config/app.json');
    expect(plan.steps).toEqual(['printf install-ready']);
  });

  it('executes a file-backed managed app action when apply is requested', () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-app-manifest-'));
    const manifestPath = join(dir, 'demo.json');
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          id: 'demo-app',
          name: 'Demo App',
          description: 'demo app for managed app execution tests',
          actions: {
            doctor: {
              summary: 'print readiness token',
              steps: ['printf ready'],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const rawEnv = { MEMPHIS_DATA_DIR: dir } as NodeJS.ProcessEnv;
    const ref = getManagedAppManifest({ file: manifestPath, rawEnv });
    const result = executeManagedAppAction(ref, 'doctor', { rawEnv, apply: true });

    expect(result.executed).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.stdout).toContain('ready');
    expect(result.paths.appRoot).toBe(join(dir, 'apps', 'demo-app'));
  });
});
