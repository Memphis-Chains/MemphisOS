import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/core/errors.js';
import { TaskQueueService } from '../../src/infra/storage/task-queue-service.js';

describe('task queue service', () => {
  it('replays pending state from wal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mv5-queue-service-'));
    const walPath = join(dir, 'queue.wal');
    const queue = new TaskQueueService({
      walPath,
      mode: 'financial',
      maxPendingTasks: 10,
    });

    const t1 = queue.enqueue({ type: 'chat.generate', metadata: { requestId: 'r1' } });
    const t2 = queue.enqueue({ type: 'chat.generate', metadata: { requestId: 'r2' } });
    expect(queue.finish(t1.taskId, 'completed')).toBe(true);
    expect(queue.finish('unknown', 'completed')).toBe(false);

    const snapshotBeforeRestart = queue.snapshot();
    expect(snapshotBeforeRestart.pendingTasks).toBe(1);
    expect(snapshotBeforeRestart.totalEnqueued).toBe(2);
    expect(snapshotBeforeRestart.totalFinished).toBe(1);

    const queueAfterRestart = new TaskQueueService({
      walPath,
      mode: 'financial',
      maxPendingTasks: 10,
    });
    const snapshotAfterRestart = queueAfterRestart.snapshot();
    expect(snapshotAfterRestart.pendingTasks).toBe(1);
    expect(snapshotAfterRestart.recoveredPendingTasks).toBe(1);
    expect(snapshotAfterRestart.totalEnqueued).toBe(2);
    expect(snapshotAfterRestart.totalFinished).toBe(1);
    expect(queueAfterRestart.finish(t2.taskId, 'failed')).toBe(true);
  });

  it('fails fast when pending queue is full', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mv5-queue-full-'));
    const walPath = join(dir, 'queue.wal');
    const queue = new TaskQueueService({
      walPath,
      mode: 'financial',
      maxPendingTasks: 1,
    });

    queue.enqueue({ type: 'chat.generate', metadata: { requestId: 'r1' } });

    try {
      queue.enqueue({ type: 'chat.generate', metadata: { requestId: 'r2' } });
      expect.fail('expected overload error');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('OVERLOAD');
      expect(appError.statusCode).toBe(429);
    }
  });
});
