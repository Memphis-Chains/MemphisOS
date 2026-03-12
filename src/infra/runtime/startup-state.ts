import type { TaskQueueResumePolicy } from '../storage/task-queue-service.js';

export interface StartupQueueResumeStatus {
  policy: TaskQueueResumePolicy;
  safeModeOverrideApplied: boolean;
  scanned: number;
  redispatched: number;
  failed: number;
  canceled: number;
  kept: number;
  errors: string[];
  completedAt: string;
}

let startupQueueResumeStatus: StartupQueueResumeStatus | null = null;

export function setStartupQueueResumeStatus(
  input: Omit<StartupQueueResumeStatus, 'completedAt'> & { completedAt?: string },
): StartupQueueResumeStatus {
  startupQueueResumeStatus = {
    ...input,
    errors: [...input.errors],
    completedAt: input.completedAt ?? new Date().toISOString(),
  };
  return getStartupQueueResumeStatus() as StartupQueueResumeStatus;
}

export function getStartupQueueResumeStatus(): StartupQueueResumeStatus | null {
  if (!startupQueueResumeStatus) return null;
  return {
    ...startupQueueResumeStatus,
    errors: [...startupQueueResumeStatus.errors],
  };
}

export function resetStartupRuntimeStateForTests(): void {
  startupQueueResumeStatus = null;
}
