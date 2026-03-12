import { randomUUID } from 'node:crypto';

import { TaskQueueWal } from './task-queue-wal.js';
import { AppError } from '../../core/errors.js';

export type TaskQueueMode = 'financial' | 'standard';
export type TaskQueueStatus = 'completed' | 'failed' | 'canceled';

export interface TaskQueueServiceOptions {
  walPath: string;
  mode?: TaskQueueMode;
  maxPendingTasks?: number;
  maxWalBytes?: number;
  faultInject?: string;
}

export interface QueueTaskInput {
  type: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface QueueTicket {
  taskId: string;
  enqueuedAt: string;
}

export interface TaskQueueSnapshot {
  mode: TaskQueueMode;
  maxPendingTasks: number;
  pendingTasks: number;
  recoveredPendingTasks: number;
  totalEnqueued: number;
  totalFinished: number;
}

type QueueEnvelope =
  | {
      op: 'enqueue';
      taskId: string;
      enqueuedAt: string;
      task: QueueTaskInput;
    }
  | {
      op: 'finish';
      taskId: string;
      status: TaskQueueStatus;
      finishedAt: string;
      metadata?: Record<string, unknown>;
    };

interface PendingTask {
  taskId: string;
  enqueuedAt: string;
  task: QueueTaskInput;
}

function parseEnvelope(raw: string): QueueEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as Partial<QueueEnvelope>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.op !== 'string') {
      return null;
    }

    if (
      parsed.op === 'enqueue' &&
      typeof parsed.taskId === 'string' &&
      typeof parsed.enqueuedAt === 'string' &&
      parsed.task &&
      typeof parsed.task === 'object' &&
      typeof (parsed.task as QueueTaskInput).type === 'string'
    ) {
      return parsed as QueueEnvelope;
    }

    if (
      parsed.op === 'finish' &&
      typeof parsed.taskId === 'string' &&
      typeof parsed.finishedAt === 'string' &&
      (parsed.status === 'completed' || parsed.status === 'failed' || parsed.status === 'canceled')
    ) {
      return parsed as QueueEnvelope;
    }
  } catch {
    return null;
  }

  return null;
}

export class TaskQueueService {
  private readonly wal: TaskQueueWal;
  private readonly mode: TaskQueueMode;
  private readonly maxPendingTasks: number;
  private readonly pending = new Map<string, PendingTask>();
  private recoveredPendingTasks = 0;
  private totalEnqueued = 0;
  private totalFinished = 0;

  constructor(options: TaskQueueServiceOptions) {
    this.mode = options.mode ?? 'financial';
    this.maxPendingTasks = options.maxPendingTasks ?? 100;
    this.wal = new TaskQueueWal({
      walPath: options.walPath,
      mode: this.mode,
      maxWalBytes: options.maxWalBytes,
      faultInject: options.faultInject,
    });

    this.recover();
  }

  public enqueue(task: QueueTaskInput): QueueTicket {
    if (this.pending.size >= this.maxPendingTasks) {
      throw new AppError('OVERLOAD', 'task queue is full', 429, {
        pendingTasks: this.pending.size,
        maxPendingTasks: this.maxPendingTasks,
      });
    }

    const taskId = randomUUID();
    const enqueuedAt = new Date().toISOString();
    const envelope: QueueEnvelope = {
      op: 'enqueue',
      taskId,
      enqueuedAt,
      task,
    };

    this.wal.enqueue(envelope);
    this.pending.set(taskId, { taskId, enqueuedAt, task });
    this.totalEnqueued += 1;

    return { taskId, enqueuedAt };
  }

  public finish(
    taskId: string,
    status: TaskQueueStatus,
    metadata?: Record<string, unknown>,
  ): boolean {
    const pending = this.pending.get(taskId);
    if (!pending) return false;

    const envelope: QueueEnvelope = {
      op: 'finish',
      taskId,
      status,
      finishedAt: new Date().toISOString(),
      metadata,
    };
    this.wal.enqueue(envelope);
    this.pending.delete(taskId);
    this.totalFinished += 1;
    return true;
  }

  public snapshot(): TaskQueueSnapshot {
    return {
      mode: this.mode,
      maxPendingTasks: this.maxPendingTasks,
      pendingTasks: this.pending.size,
      recoveredPendingTasks: this.recoveredPendingTasks,
      totalEnqueued: this.totalEnqueued,
      totalFinished: this.totalFinished,
    };
  }

  private recover(): void {
    const records = this.wal.recoverAndRead();
    for (const record of records) {
      const envelope = parseEnvelope(record.payload);
      if (!envelope) continue;

      if (envelope.op === 'enqueue') {
        this.pending.set(envelope.taskId, {
          taskId: envelope.taskId,
          enqueuedAt: envelope.enqueuedAt,
          task: envelope.task,
        });
        this.totalEnqueued += 1;
        continue;
      }

      this.pending.delete(envelope.taskId);
      this.totalFinished += 1;
    }

    this.recoveredPendingTasks = this.pending.size;
  }
}
