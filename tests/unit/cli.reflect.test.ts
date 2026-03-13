import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli } from '../helpers/cli.js';

describe('CLI reflect', () => {
  it('runs daily reflection and returns 6 reflections', async () => {
    const out = await runCli(['reflect', '--json'], {
      env: { DEFAULT_PROVIDER: 'local-fallback' },
    });

    const data = JSON.parse(out);
    expect(data.ok).toBe(true);
    expect(data.mode).toBe('reflect');
    expect(data.count).toBe(6);
    expect(Array.isArray(data.reflections)).toBe(true);
    expect(data.saved).toBe(false);
    expect(data.savedBlock).toBeNull();
  });

  it('persists reflection report block to journal when --save is requested', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'memphis-cli-reflect-save-'));
    const out = await runCli(['reflect', '--json', '--save'], {
      env: { MEMPHIS_DATA_DIR: dataDir, RUST_CHAIN_ENABLED: 'false' },
    });

    const data = JSON.parse(out) as {
      ok: boolean;
      mode: string;
      saved: boolean;
      savedBlock?: { chain?: string; index?: number };
    };
    expect(data.ok).toBe(true);
    expect(data.mode).toBe('reflect');
    expect(data.saved).toBe(true);
    expect(data.savedBlock?.chain).toBe('journal');
    expect(typeof data.savedBlock?.index).toBe('number');

    const journalDir = join(dataDir, 'chains', 'journal');
    expect(existsSync(journalDir)).toBe(true);
    const files = readdirSync(journalDir)
      .filter((name) => name.endsWith('.json'))
      .sort();
    expect(files.length).toBeGreaterThan(0);

    const latest = JSON.parse(
      readFileSync(join(journalDir, files.at(-1) ?? ''), 'utf8'),
    ) as {
      data?: {
        type?: string;
        source?: string;
      };
    };
    expect(latest.data?.type).toBe('reflection_report');
    expect(latest.data?.source).toBe('cli.reflect');
  });
});
