import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runStartupSecurityGuards } from '../../src/app/bootstrap.js';
import { createAppContainer } from '../../src/app/container.js';
import type { AppConfig } from '../../src/infra/config/schema.js';
import { createHttpServer } from '../../src/infra/http/server.js';
import { EXIT_CODES, resolveExitCode } from '../../src/infra/runtime/exit-codes.js';
import {
  resetStartupRuntimeStateForTests,
  setStartupSafeModeNetworkStatus,
} from '../../src/infra/runtime/startup-state.js';

function cfg(db: string): AppConfig {
  return {
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: 0,
    LOG_LEVEL: 'error',
    DEFAULT_PROVIDER: 'local-fallback',
    SHARED_LLM_API_BASE: undefined,
    SHARED_LLM_API_KEY: undefined,
    DECENTRALIZED_LLM_API_BASE: undefined,
    DECENTRALIZED_LLM_API_KEY: undefined,
    LOCAL_FALLBACK_ENABLED: true,
    GEN_TIMEOUT_MS: 30000,
    GEN_MAX_TOKENS: 512,
    GEN_TEMPERATURE: 0.4,
    RUST_CHAIN_ENABLED: false,
    RUST_CHAIN_BRIDGE_PATH: './crates/memphis-napi',
    DATABASE_URL: `file:${db}`,
  };
}

describe('S3.4 Ops status endpoint', () => {
  afterEach(() => {
    resetStartupRuntimeStateForTests();
  });

  it('returns combined runtime status', async () => {
    resetStartupRuntimeStateForTests();
    const dir = mkdtempSync(join(tmpdir(), 'mv4-s3ops-'));
    const conf = cfg(join(dir, 'ops.db'));
    const c = createAppContainer(conf);
    const app = createHttpServer(conf, c.orchestration, {
      sessionRepository: c.sessionRepository,
      generationEventRepository: c.generationEventRepository,
      dualApprovalRepository: c.dualApprovalRepository,
      taskQueue: c.taskQueue,
    });
    const resumeSummary = await c.taskQueue.resumeRecoveredPending({ policy: 'keep' });

    const res = await app.inject({ method: 'GET', url: '/v1/ops/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      service: string;
      providers: unknown[];
      metrics: { providers: unknown[] };
      uptimeSec: number;
      adapters: {
        chain: { backend: string };
        vault: { rustEnabled: boolean; vaultApiAvailable: boolean };
      };
      queue: {
        mode: 'financial' | 'standard';
        resumePolicy: 'keep' | 'fail' | 'redispatch';
        maxPendingTasks: number;
        pendingTasks: number;
        lastResume: {
          policy: 'keep' | 'fail' | 'redispatch';
          scanned: number;
          redispatched: number;
          failed: number;
          canceled: number;
          kept: number;
          errors: string[];
          completedAt: string;
        } | null;
      } | null;
      startup?: {
        queueResume: unknown | null;
        safeModeNetwork?: {
          enabled: boolean;
          attempted: boolean;
          enforced: boolean;
          backend: 'iptables' | 'none';
          mode: 'disabled' | 'enforced' | 'degraded';
          reason?: string;
          checkedAt: string;
        } | null;
      };
      dualApproval: {
        pending: number;
        approved: number;
        expired: number;
        canceled: number;
      } | null;
    };
    expect(body.service).toBe('memphis-v5');
    expect(Array.isArray(body.providers)).toBe(true);
    expect(Array.isArray(body.metrics.providers)).toBe(true);
    expect(body.uptimeSec >= 0).toBe(true);
    expect(body.adapters.chain.backend).toBe('ts-legacy');
    expect(typeof body.adapters.vault.rustEnabled).toBe('boolean');
    expect(typeof body.adapters.vault.vaultApiAvailable).toBe('boolean');
    expect(body.queue?.resumePolicy).toBe('keep');
    expect(body.queue?.maxPendingTasks).toBeGreaterThan(0);
    expect(body.queue?.lastResume?.policy).toBe('keep');
    expect(body.queue?.lastResume?.scanned).toBe(resumeSummary.scanned);
    expect(typeof body.queue?.lastResume?.completedAt).toBe('string');
    expect(body.startup?.queueResume ?? null).toBeNull();
    expect(body.startup?.safeModeNetwork).toMatchObject({
      enabled: false,
      attempted: false,
      enforced: false,
      backend: 'none',
      mode: 'disabled',
    });
    expect(body.dualApproval?.pending).toBe(0);

    await app.close();
  });

  it('surfaces strict-mode trust-root failure status and exit-code mapping', async () => {
    resetStartupRuntimeStateForTests();
    const dir = mkdtempSync(join(tmpdir(), 'mv4-s3ops-strict-trust-'));
    const conf = cfg(join(dir, 'ops-strict-trust.db'));
    const c = createAppContainer(conf);
    const app = createHttpServer(conf, c.orchestration, {
      sessionRepository: c.sessionRepository,
      generationEventRepository: c.generationEventRepository,
      dualApprovalRepository: c.dualApprovalRepository,
      taskQueue: c.taskQueue,
    });

    const guardEnv = {
      MEMPHIS_STRICT_MODE: 'true',
      MEMPHIS_TRUST_ROOT_REQUIRED: 'true',
      MEMPHIS_TRUST_ROOT_PATH: join(dir, 'missing-trust-root.json'),
      MEMPHIS_REVOCATION_CACHE_REQUIRED: 'false',
    } as NodeJS.ProcessEnv;

    let thrown: unknown;
    try {
      await runStartupSecurityGuards(guardEnv, {
        writeSecurityEvent: async () => ({
          wroteChain: false,
          wroteSyslog: false,
          wroteEmergency: false,
        }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(resolveExitCode(thrown)).toBe(EXIT_CODES.ERR_TRUST_ROOT);

    const res = await app.inject({ method: 'GET', url: '/v1/ops/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      startup?: {
        trustRoot?: {
          enabled: boolean;
          valid: boolean;
          path: string | null;
          reason?: string;
        } | null;
      };
    };
    expect(body.startup?.trustRoot).toMatchObject({
      enabled: true,
      valid: false,
      path: join(dir, 'missing-trust-root.json'),
    });
    expect(body.startup?.trustRoot?.reason).toContain('missing');

    await app.close();
  });

  it('keeps startup status consistent after guard state changes', async () => {
    resetStartupRuntimeStateForTests();
    const dir = mkdtempSync(join(tmpdir(), 'mv4-s3ops-startup-state-shift-'));
    const conf = cfg(join(dir, 'ops-startup-state-shift.db'));
    const c = createAppContainer(conf);
    const app = createHttpServer(conf, c.orchestration, {
      sessionRepository: c.sessionRepository,
      generationEventRepository: c.generationEventRepository,
      dualApprovalRepository: c.dualApprovalRepository,
      taskQueue: c.taskQueue,
    });

    setStartupSafeModeNetworkStatus({
      enabled: true,
      attempted: true,
      enforced: false,
      backend: 'iptables',
      mode: 'degraded',
      reason: 'capability missing',
    });

    await runStartupSecurityGuards(
      {
        MEMPHIS_STRICT_MODE: 'false',
        MEMPHIS_TRUST_ROOT_REQUIRED: 'false',
        MEMPHIS_REVOCATION_CACHE_REQUIRED: 'true',
        MEMPHIS_REVOCATION_CACHE_MAX_STALE_MS: '30000',
        MEMPHIS_REVOCATION_CACHE_LAST_SYNC_MS: String(1_000),
      } as NodeJS.ProcessEnv,
      {
        nowMs: 200_000,
        writeSecurityEvent: async () => ({
          wroteChain: false,
          wroteSyslog: false,
          wroteEmergency: false,
        }),
      },
    );

    let res = await app.inject({ method: 'GET', url: '/v1/ops/status' });
    expect(res.statusCode).toBe(200);
    let body = res.json() as {
      startup?: {
        safeModeNetwork?: { mode?: string; reason?: string } | null;
        revocationCache?: { enabled?: boolean; stale?: boolean; ageMs?: number | null } | null;
      };
    };
    expect(body.startup?.safeModeNetwork).toMatchObject({
      mode: 'degraded',
      reason: 'capability missing',
    });
    expect(body.startup?.revocationCache).toMatchObject({
      enabled: true,
      stale: true,
      ageMs: 199_000,
    });

    setStartupSafeModeNetworkStatus({
      enabled: true,
      attempted: true,
      enforced: true,
      backend: 'iptables',
      mode: 'enforced',
      reason: 'policy active',
    });

    await runStartupSecurityGuards(
      {
        MEMPHIS_STRICT_MODE: 'false',
        MEMPHIS_TRUST_ROOT_REQUIRED: 'false',
        MEMPHIS_REVOCATION_CACHE_REQUIRED: 'true',
        MEMPHIS_REVOCATION_CACHE_MAX_STALE_MS: '30000',
        MEMPHIS_REVOCATION_CACHE_LAST_SYNC_MS: String(200_000),
      } as NodeJS.ProcessEnv,
      {
        nowMs: 220_000,
        writeSecurityEvent: async () => ({
          wroteChain: false,
          wroteSyslog: false,
          wroteEmergency: false,
        }),
      },
    );

    res = await app.inject({ method: 'GET', url: '/v1/ops/status' });
    expect(res.statusCode).toBe(200);
    body = res.json() as {
      startup?: {
        safeModeNetwork?: { mode?: string; reason?: string; enforced?: boolean } | null;
        revocationCache?: { enabled?: boolean; stale?: boolean; ageMs?: number | null } | null;
      };
    };
    expect(body.startup?.safeModeNetwork).toMatchObject({
      mode: 'enforced',
      enforced: true,
      reason: 'policy active',
    });
    expect(body.startup?.revocationCache).toMatchObject({
      enabled: true,
      stale: false,
      ageMs: 20_000,
    });

    await app.close();
  });
});
