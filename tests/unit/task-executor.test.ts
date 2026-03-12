import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { TaskExecutor } from '../../src/modules/orchestration/task-executor.js';

const originalHome = process.env.HOME;
const originalMemphisDataDir = process.env.MEMPHIS_DATA_DIR;

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  if (originalMemphisDataDir === undefined) {
    delete process.env.MEMPHIS_DATA_DIR;
  } else {
    process.env.MEMPHIS_DATA_DIR = originalMemphisDataDir;
  }
});

describe('TaskExecutor', () => {
  it('reuses cached tool result for the same run id and avoids re-running provider tool', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'memphis-task-executor-'));
    process.env.HOME = dir;
    process.env.MEMPHIS_DATA_DIR = join(dir, '.memphis-data');

    const rawEnv = {
      ...process.env,
      RUST_CHAIN_ENABLED: 'false',
      MEMPHIS_DATA_DIR: process.env.MEMPHIS_DATA_DIR,
    } as NodeJS.ProcessEnv;

    let providerRuns = 0;
    const firstExecutor = new TaskExecutor({ rawEnv });
    const first = await firstExecutor.execute(
      {
        input: 'recoverable workload',
        provider: 'auto',
        execution: {
          taskId: 'task-1',
          runId: 'run-1',
          source: 'unit.test',
          enableReplayDedupe: true,
        },
      },
      async () => {
        providerRuns += 1;
        return {
          id: 'gen-1',
          providerUsed: 'local-fallback',
          modelUsed: 'local-fallback-v0',
          output: 'first execution output',
          timingMs: 9,
        };
      },
    );

    const secondExecutor = new TaskExecutor({ rawEnv });
    const second = await secondExecutor.execute(
      {
        input: 'recoverable workload',
        provider: 'auto',
        execution: {
          taskId: 'task-1',
          runId: 'run-1',
          source: 'unit.test',
          enableReplayDedupe: true,
        },
      },
      async () => {
        providerRuns += 1;
        throw new Error('provider should not run when cached tool_result exists');
      },
    );

    expect(providerRuns).toBe(1);
    expect(second.output).toBe(first.output);
    expect(second.providerUsed).toBe(first.providerUsed);
  });
});
