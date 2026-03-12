import { afterEach, describe, expect, it, vi } from 'vitest';

import { printDoctorHumanV2, runDoctorChecksV2 } from '../src/infra/cli/utils/doctor-v2.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('doctor v2', () => {
  it('returns comprehensive report with 25+ checks and all 6 tiers', async () => {
    const report = await runDoctorChecksV2();

    expect(report.checks.length).toBeGreaterThanOrEqual(25);
    const tiers = new Set(report.checks.map((c) => c.tier));
    expect(tiers).toEqual(new Set([1, 2, 3, 4, 5, 6]));

    expect(report.summary.total).toBe(report.checks.length);
    expect(report).toHaveProperty('ok');
  });

  it('supports deep scan mode by adding deep checks', async () => {
    const base = await runDoctorChecksV2();
    const deep = await runDoctorChecksV2({ deep: true });

    expect(deep.checks.length).toBeGreaterThan(base.checks.length);
    expect(deep.checks.some((c) => c.id === 't6-deep-shell')).toBe(true);
  });

  it('prints ascii-box human summary', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const report = await runDoctorChecksV2();

    printDoctorHumanV2(report);

    const output = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('MEMPHIS DOCTOR v2.0');
    expect(output).toContain('Tier 1: Core Infrastructure');
    expect(output).toContain('Summary: total=');
  });

  it('legacy exports remain compatible', async () => {
    const doctor = await import('../src/infra/cli/utils/doctor.js');
    const report = await doctor.runDoctorChecks();
    expect(report.checks.length).toBeGreaterThanOrEqual(25);
  });

  it('warns when financial mode uses redispatch resume policy', async () => {
    const prevMode = process.env.MEMPHIS_QUEUE_MODE;
    const prevPolicy = process.env.MEMPHIS_QUEUE_RESUME_POLICY;
    process.env.MEMPHIS_QUEUE_MODE = 'financial';
    process.env.MEMPHIS_QUEUE_RESUME_POLICY = 'redispatch';
    try {
      const report = await runDoctorChecksV2();
      const check = report.checks.find((c) => c.id === 't4-queue-resume-policy');
      expect(check).toBeDefined();
      expect(check?.level).toBe('warn');
      expect(check?.detail).toContain('mode=financial');
      expect(check?.detail).toContain('resume=redispatch');
    } finally {
      if (prevMode === undefined) delete process.env.MEMPHIS_QUEUE_MODE;
      else process.env.MEMPHIS_QUEUE_MODE = prevMode;
      if (prevPolicy === undefined) delete process.env.MEMPHIS_QUEUE_RESUME_POLICY;
      else process.env.MEMPHIS_QUEUE_RESUME_POLICY = prevPolicy;
    }
  });

  it('passes queue resume policy check for financial keep policy', async () => {
    const prevMode = process.env.MEMPHIS_QUEUE_MODE;
    const prevPolicy = process.env.MEMPHIS_QUEUE_RESUME_POLICY;
    process.env.MEMPHIS_QUEUE_MODE = 'financial';
    process.env.MEMPHIS_QUEUE_RESUME_POLICY = 'keep';
    try {
      const report = await runDoctorChecksV2();
      const check = report.checks.find((c) => c.id === 't4-queue-resume-policy');
      expect(check).toBeDefined();
      expect(check?.level).toBe('pass');
      expect(check?.detail).toContain('mode=financial');
      expect(check?.detail).toContain('resume=keep');
    } finally {
      if (prevMode === undefined) delete process.env.MEMPHIS_QUEUE_MODE;
      else process.env.MEMPHIS_QUEUE_MODE = prevMode;
      if (prevPolicy === undefined) delete process.env.MEMPHIS_QUEUE_RESUME_POLICY;
      else process.env.MEMPHIS_QUEUE_RESUME_POLICY = prevPolicy;
    }
  });

  it('warns when no alert transport is configured', async () => {
    const prevPagerDuty = process.env.MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY;
    const prevOpsGenie = process.env.MEMPHIS_ALERT_OPSGENIE_API_KEY;
    const prevPagerDutyEndpoint = process.env.MEMPHIS_ALERT_PAGERDUTY_ENDPOINT;
    const prevOpsGenieEndpoint = process.env.MEMPHIS_ALERT_OPSGENIE_ENDPOINT;
    delete process.env.MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY;
    delete process.env.MEMPHIS_ALERT_OPSGENIE_API_KEY;
    delete process.env.MEMPHIS_ALERT_PAGERDUTY_ENDPOINT;
    delete process.env.MEMPHIS_ALERT_OPSGENIE_ENDPOINT;
    try {
      const report = await runDoctorChecksV2();
      const check = report.checks.find((c) => c.id === 't4-alert-transport-config');
      expect(check).toBeDefined();
      expect(check?.level).toBe('warn');
      expect(check?.detail).toContain('no external alert transport configured');
    } finally {
      if (prevPagerDuty === undefined) delete process.env.MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY;
      else process.env.MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY = prevPagerDuty;
      if (prevOpsGenie === undefined) delete process.env.MEMPHIS_ALERT_OPSGENIE_API_KEY;
      else process.env.MEMPHIS_ALERT_OPSGENIE_API_KEY = prevOpsGenie;
      if (prevPagerDutyEndpoint === undefined) delete process.env.MEMPHIS_ALERT_PAGERDUTY_ENDPOINT;
      else process.env.MEMPHIS_ALERT_PAGERDUTY_ENDPOINT = prevPagerDutyEndpoint;
      if (prevOpsGenieEndpoint === undefined) delete process.env.MEMPHIS_ALERT_OPSGENIE_ENDPOINT;
      else process.env.MEMPHIS_ALERT_OPSGENIE_ENDPOINT = prevOpsGenieEndpoint;
    }
  });

  it('fails when alert endpoint is set without key', async () => {
    const prevPagerDuty = process.env.MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY;
    const prevPagerDutyEndpoint = process.env.MEMPHIS_ALERT_PAGERDUTY_ENDPOINT;
    delete process.env.MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY;
    process.env.MEMPHIS_ALERT_PAGERDUTY_ENDPOINT = 'https://events.pagerduty.com/v2/enqueue';
    try {
      const report = await runDoctorChecksV2();
      const check = report.checks.find((c) => c.id === 't4-alert-transport-config');
      expect(check).toBeDefined();
      expect(check?.level).toBe('fail');
      expect(check?.ok).toBe(false);
      expect(check?.detail).toContain('inconsistent alert config');
    } finally {
      if (prevPagerDuty === undefined) delete process.env.MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY;
      else process.env.MEMPHIS_ALERT_PAGERDUTY_ROUTING_KEY = prevPagerDuty;
      if (prevPagerDutyEndpoint === undefined) delete process.env.MEMPHIS_ALERT_PAGERDUTY_ENDPOINT;
      else process.env.MEMPHIS_ALERT_PAGERDUTY_ENDPOINT = prevPagerDutyEndpoint;
    }
  });
});
