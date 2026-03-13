import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import { getAppsPath, getDataDir } from '../../config/paths.js';
import { AppError } from '../../core/errors.js';

export type ManagedAppPlatform = 'linux' | 'darwin' | 'win32';
export type ManagedAppActionName = string;

type ManagedAppRuntimeCommand = {
  name: string;
  required: boolean;
  detail?: string;
};

type ManagedAppAction = {
  summary: string;
  cwd?: string;
  steps: string[];
  env: Record<string, string>;
  requiresEnv: string[];
};

export type ManagedAppManifest = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  homepage?: string;
  platforms: ManagedAppPlatform[];
  runtime: {
    node?: {
      minVersion: string;
      recommendedVersion?: string;
    };
    commands: ManagedAppRuntimeCommand[];
    systemdUserService: boolean;
  };
  paths: {
    home: string;
    state: string;
    config: string;
    expose: Record<string, 'home' | 'state' | 'config'>;
  };
  actions: Record<string, ManagedAppAction>;
  notes: string[];
};

export type ManagedAppManifestSource = {
  kind: 'builtin' | 'file';
  path?: string;
};

export type ManagedAppManifestRef = {
  manifest: ManagedAppManifest;
  source: ManagedAppManifestSource;
};

export type ManagedAppRequirementStatus = {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  ok: boolean;
  required: boolean;
  detail: string;
};

export type ManagedAppResolvedPaths = {
  dataDir: string;
  manifestsDir: string;
  appsDir: string;
  appRoot: string;
  home: string;
  state: string;
  config: string;
};

export type ManagedAppPlan = {
  ok: boolean;
  supportedPlatform: boolean;
  manifest: {
    id: string;
    name: string;
    description: string;
    homepage?: string;
  };
  source: ManagedAppManifestSource;
  action: string;
  summary: string;
  applyRequested: boolean;
  willExecute: boolean;
  paths: ManagedAppResolvedPaths;
  exportedEnv: Record<string, string>;
  cwd: string;
  steps: string[];
  requirements: ManagedAppRequirementStatus[];
  notes: string[];
};

export type ManagedAppStepResult = {
  step: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ManagedAppExecutionResult = ManagedAppPlan & {
  executed: boolean;
  results: ManagedAppStepResult[];
};

const MANIFEST_FILE_SUFFIX = '.json';
const MANIFEST_DIR_NAME = 'manifests';

const actionSchema = z.object({
  summary: z.string().min(1),
  cwd: z.string().min(1).optional(),
  steps: z.array(z.string().min(1)).min(1),
  env: z.record(z.string(), z.string()).optional(),
  requiresEnv: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).optional(),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  homepage: z.string().url().optional(),
  platforms: z.array(z.enum(['linux', 'darwin', 'win32'])).min(1).optional(),
  runtime: z
    .object({
      node: z
        .object({
          minVersion: z.string().min(1),
          recommendedVersion: z.string().min(1).optional(),
        })
        .optional(),
      commands: z
        .array(
          z.object({
            name: z.string().regex(/^[A-Za-z0-9._-]+$/),
            required: z.boolean().optional(),
            detail: z.string().min(1).optional(),
          }),
        )
        .optional(),
      systemdUserService: z.boolean().optional(),
    })
    .optional(),
  paths: z
    .object({
      home: z.string().min(1).optional(),
      state: z.string().min(1).optional(),
      config: z.string().min(1).optional(),
      expose: z.record(z.string(), z.enum(['home', 'state', 'config'])).optional(),
    })
    .optional(),
  actions: z.record(z.string().min(1), actionSchema).refine((value) => Object.keys(value).length > 0, {
    message: 'managed app manifest requires at least one action',
  }),
  notes: z.array(z.string().min(1)).optional(),
});

const BUILTIN_MANIFESTS: ManagedAppManifestRef[] = [];

function normalizeManifest(input: unknown): ManagedAppManifest {
  const parsed = manifestSchema.parse(input);
  return {
    schemaVersion: parsed.schemaVersion,
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    homepage: parsed.homepage,
    platforms: parsed.platforms ?? ['linux'],
    runtime: {
      node: parsed.runtime?.node,
      commands: (parsed.runtime?.commands ?? []).map((command) => ({
        name: command.name,
        required: command.required ?? true,
        detail: command.detail,
      })),
      systemdUserService: parsed.runtime?.systemdUserService ?? false,
    },
    paths: {
      home: parsed.paths?.home ?? '${APP_ROOT}/home',
      state: parsed.paths?.state ?? '${APP_ROOT}/state',
      config: parsed.paths?.config ?? '${APP_ROOT}/config/app.json',
      expose: parsed.paths?.expose ?? {},
    },
    actions: Object.fromEntries(
      Object.entries(parsed.actions).map(([name, action]) => [
        name,
        {
          summary: action.summary,
          cwd: action.cwd,
          steps: [...action.steps],
          env: action.env ?? {},
          requiresEnv: action.requiresEnv ?? [],
        },
      ]),
    ),
    notes: parsed.notes ?? [],
  };
}

function manifestsDir(rawEnv: NodeJS.ProcessEnv = process.env): string {
  return join(getAppsPath(rawEnv), MANIFEST_DIR_NAME);
}

function loadFileManifest(pathValue: string): ManagedAppManifestRef {
  const resolved = resolve(pathValue);
  const raw = readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return {
    manifest: normalizeManifest(parsed),
    source: { kind: 'file', path: resolved },
  };
}

function loadUserManifestRefs(rawEnv: NodeJS.ProcessEnv = process.env): ManagedAppManifestRef[] {
  const dir = manifestsDir(rawEnv);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((entry) => entry.endsWith(MANIFEST_FILE_SUFFIX))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => loadFileManifest(join(dir, entry)));
}

export function listManagedAppManifestRefs(
  rawEnv: NodeJS.ProcessEnv = process.env,
): ManagedAppManifestRef[] {
  const merged = new Map<string, ManagedAppManifestRef>();
  for (const ref of BUILTIN_MANIFESTS) merged.set(ref.manifest.id, ref);
  for (const ref of loadUserManifestRefs(rawEnv)) merged.set(ref.manifest.id, ref);
  return [...merged.values()].sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
}

export function getManagedAppManifest(input: {
  id?: string;
  file?: string;
  rawEnv?: NodeJS.ProcessEnv;
}): ManagedAppManifestRef {
  if (input.file) {
    return loadFileManifest(input.file);
  }

  const id = input.id?.trim();
  if (!id) {
    throw new AppError('VALIDATION_ERROR', 'managed app requires an id or --file manifest path', 400);
  }

  const manifests = listManagedAppManifestRefs(input.rawEnv);
  const hit = manifests.find((ref) => ref.manifest.id === id);
  if (!hit) {
    throw new AppError('VALIDATION_ERROR', `managed app manifest not found: ${id}`, 404, {
      id,
      available: manifests.map((ref) => ref.manifest.id),
    });
  }
  return hit;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map((part) => Number(part) || 0);
  const rightParts = right.split('.').map((part) => Number(part) || 0);
  const width = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < width; index += 1) {
    const a = leftParts[index] ?? 0;
    const b = rightParts[index] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => vars[name] ?? '');
}

function resolveManagedAppPaths(
  manifest: ManagedAppManifest,
  rawEnv: NodeJS.ProcessEnv = process.env,
): ManagedAppResolvedPaths {
  const dataDir = getDataDir(rawEnv);
  const appsDir = getAppsPath(rawEnv);
  const appRoot = join(appsDir, manifest.id);
  const baseVars = {
    MEMPHIS_DATA_DIR: dataDir,
    MEMPHIS_APPS_DIR: appsDir,
    APP_ID: manifest.id,
    APP_ROOT: appRoot,
  };

  const home = resolve(interpolateTemplate(manifest.paths.home, baseVars));
  const state = resolve(interpolateTemplate(manifest.paths.state, baseVars));
  const config = resolve(interpolateTemplate(manifest.paths.config, baseVars));

  return {
    dataDir,
    manifestsDir: manifestsDir(rawEnv),
    appsDir,
    appRoot,
    home,
    state,
    config,
  };
}

function exportedEnvForManifest(
  manifest: ManagedAppManifest,
  paths: ManagedAppResolvedPaths,
): Record<string, string> {
  const vars: Record<string, string> = {
    MEMPHIS_DATA_DIR: paths.dataDir,
    MEMPHIS_APPS_DIR: paths.appsDir,
    APP_ID: manifest.id,
    APP_ROOT: paths.appRoot,
    APP_HOME: paths.home,
    APP_STATE_DIR: paths.state,
    APP_CONFIG_PATH: paths.config,
    MEMPHIS_MANAGED_APP: '1',
  };

  for (const [envKey, binding] of Object.entries(manifest.paths.expose)) {
    vars[envKey] = binding === 'home' ? paths.home : binding === 'state' ? paths.state : paths.config;
  }

  return vars;
}

function npmGlobalBin(rawEnv: NodeJS.ProcessEnv): string | undefined {
  const result = spawnSync('bash', ['-lc', 'npm prefix -g'], {
    env: { ...process.env, ...rawEnv },
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (result.status !== 0) return undefined;
  const prefix = result.stdout.trim();
  if (!prefix) return undefined;
  return join(prefix, 'bin');
}

function checkCommandAvailable(name: string, rawEnv: NodeJS.ProcessEnv): boolean {
  const result = spawnSync('bash', ['-lc', `command -v ${name}`], {
    env: { ...process.env, ...rawEnv },
    stdio: 'pipe',
    encoding: 'utf8',
  });
  return result.status === 0;
}

export function checkManagedAppRequirements(
  manifest: ManagedAppManifest,
  rawEnv: NodeJS.ProcessEnv = process.env,
): ManagedAppRequirementStatus[] {
  const currentPlatform = process.platform as ManagedAppPlatform;
  const platformOk = manifest.platforms.includes(currentPlatform);
  const statuses: ManagedAppRequirementStatus[] = [
    {
      id: 'platform',
      status: platformOk ? 'pass' : 'fail',
      ok: platformOk,
      required: true,
      detail: platformOk
        ? `platform supported: ${currentPlatform}`
        : `platform ${currentPlatform} not in supported set: ${manifest.platforms.join(', ')}`,
    },
  ];

  if (manifest.runtime.node) {
    const current = process.versions.node;
    const minOk = compareVersions(current, manifest.runtime.node.minVersion) >= 0;
    statuses.push({
      id: 'node-min-version',
      status: minOk ? 'pass' : 'fail',
      ok: minOk,
      required: true,
      detail: minOk
        ? `node ${current} satisfies minimum ${manifest.runtime.node.minVersion}`
        : `node ${current} is below minimum ${manifest.runtime.node.minVersion}`,
    });

    if (manifest.runtime.node.recommendedVersion) {
      const recommendedOk = compareVersions(current, manifest.runtime.node.recommendedVersion) >= 0;
      statuses.push({
        id: 'node-recommended-version',
        status: recommendedOk ? 'pass' : 'warn',
        ok: recommendedOk,
        required: false,
        detail: recommendedOk
          ? `node ${current} satisfies recommended ${manifest.runtime.node.recommendedVersion}`
          : `node ${current} is below recommended ${manifest.runtime.node.recommendedVersion}`,
      });
    }
  }

  for (const command of manifest.runtime.commands) {
    const ok = checkCommandAvailable(command.name, rawEnv);
    statuses.push({
      id: `command:${command.name}`,
      status: ok ? 'pass' : command.required ? 'fail' : 'warn',
      ok,
      required: command.required,
      detail: ok
        ? `${command.name} available`
        : `${command.name} missing${command.detail ? ` (${command.detail})` : ''}`,
    });
  }

  if (manifest.runtime.systemdUserService) {
    const ok = checkCommandAvailable('systemctl', rawEnv);
    statuses.push({
      id: 'systemd-user-service',
      status: ok ? 'pass' : 'fail',
      ok,
      required: true,
      detail: ok
        ? 'systemctl available for Linux user-service workflows'
        : 'systemctl missing; Linux user-service workflows will not work',
    });
  }

  return statuses;
}

function resolveAction(manifest: ManagedAppManifest, actionName: string): ManagedAppAction {
  const hit = manifest.actions[actionName];
  if (!hit) {
    throw new AppError('VALIDATION_ERROR', `managed app action not found: ${actionName}`, 404, {
      action: actionName,
      availableActions: Object.keys(manifest.actions),
    });
  }
  return hit;
}

function checkActionEnvRequirements(
  action: ManagedAppAction,
  rawEnv: NodeJS.ProcessEnv,
): ManagedAppRequirementStatus[] {
  return action.requiresEnv.map((name) => {
    const value = rawEnv[name];
    const ok = typeof value === 'string' && value.trim().length > 0;
    return {
      id: `env:${name}`,
      status: ok ? 'pass' : 'fail',
      ok,
      required: true,
      detail: ok ? `${name} configured` : `${name} is required for this action`,
    };
  });
}

export function planManagedAppAction(
  ref: ManagedAppManifestRef,
  actionName: string,
  options: { rawEnv?: NodeJS.ProcessEnv; apply?: boolean } = {},
): ManagedAppPlan {
  const rawEnv = options.rawEnv ?? process.env;
  const manifest = ref.manifest;
  const action = resolveAction(manifest, actionName);
  const paths = resolveManagedAppPaths(manifest, rawEnv);
  const exportedEnv = exportedEnvForManifest(manifest, paths);
  const templateVars = { ...exportedEnv, MEMPHIS_MANIFESTS_DIR: paths.manifestsDir };
  const cwd = resolve(interpolateTemplate(action.cwd ?? paths.home, templateVars));
  const steps = action.steps.map((step) => interpolateTemplate(step, templateVars));
  const requirements = [...checkManagedAppRequirements(manifest, rawEnv), ...checkActionEnvRequirements(action, rawEnv)];
  const ok = requirements.every((status) => !status.required || status.ok);

  return {
    ok,
    supportedPlatform: requirements.find((status) => status.id === 'platform')?.ok ?? true,
    manifest: {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      homepage: manifest.homepage,
    },
    source: ref.source,
    action: actionName,
    summary: action.summary,
    applyRequested: options.apply === true,
    willExecute: options.apply === true && ok,
    paths,
    exportedEnv: {
      ...templateVars,
      ...Object.fromEntries(
        Object.entries(action.env).map(([key, value]) => [key, interpolateTemplate(value, templateVars)]),
      ),
    },
    cwd,
    steps,
    requirements,
    notes: [...manifest.notes],
  };
}

function ensureManagedAppLayout(paths: ManagedAppResolvedPaths): void {
  mkdirSync(paths.manifestsDir, { recursive: true });
  mkdirSync(paths.appsDir, { recursive: true });
  mkdirSync(paths.appRoot, { recursive: true });
  mkdirSync(paths.home, { recursive: true });
  mkdirSync(paths.state, { recursive: true });
  mkdirSync(dirname(paths.config), { recursive: true });
}

export function executeManagedAppAction(
  ref: ManagedAppManifestRef,
  actionName: string,
  options: { rawEnv?: NodeJS.ProcessEnv; apply?: boolean } = {},
): ManagedAppExecutionResult {
  const plan = planManagedAppAction(ref, actionName, options);
  if (!options.apply) {
    return { ...plan, executed: false, results: [] };
  }

  if (!plan.ok) {
    const failed = plan.requirements
      .filter((status) => status.required && !status.ok)
      .map((status) => status.detail);
    throw new AppError(
      'VALIDATION_ERROR',
      `managed app action cannot run until requirements pass: ${failed.join('; ')}`,
      400,
      { action: actionName, manifestId: ref.manifest.id, failedRequirements: failed },
    );
  }

  ensureManagedAppLayout(plan.paths);

  const results: ManagedAppStepResult[] = [];
  const globalNpmBin = npmGlobalBin(options.rawEnv ?? process.env);
  const mergedEnv = { ...process.env, ...(options.rawEnv ?? process.env), ...plan.exportedEnv };
  if (globalNpmBin) {
    mergedEnv.PATH = `${globalNpmBin}:${mergedEnv.PATH ?? process.env.PATH ?? ''}`;
  }

  for (const step of plan.steps) {
    const run = spawnSync('bash', ['-lc', step], {
      cwd: plan.cwd,
      env: mergedEnv,
      stdio: 'pipe',
      encoding: 'utf8',
    });

    const result: ManagedAppStepResult = {
      step,
      cwd: plan.cwd,
      exitCode: run.status ?? 1,
      stdout: run.stdout ?? '',
      stderr: run.stderr ?? '',
    };
    results.push(result);

    if ((run.status ?? 1) !== 0) {
      throw new AppError('INTERNAL_ERROR', `managed app action failed: ${step}`, 500, {
        manifestId: ref.manifest.id,
        action: actionName,
        cwd: plan.cwd,
        exitCode: run.status ?? 1,
        stdout: run.stdout ?? '',
        stderr: run.stderr ?? '',
      });
    }
  }

  return {
    ...plan,
    executed: true,
    results,
  };
}

export function describeManagedAppManifest(ref: ManagedAppManifestRef): {
  id: string;
  name: string;
  description: string;
  homepage?: string;
  source: ManagedAppManifestSource;
  platforms: ManagedAppPlatform[];
  actions: string[];
  notes: string[];
} {
  return {
    id: ref.manifest.id,
    name: ref.manifest.name,
    description: ref.manifest.description,
    homepage: ref.manifest.homepage,
    source: ref.source,
    platforms: [...ref.manifest.platforms],
    actions: Object.keys(ref.manifest.actions).sort(),
    notes: [...ref.manifest.notes],
  };
}
