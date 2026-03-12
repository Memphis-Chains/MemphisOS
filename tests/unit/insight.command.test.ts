import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadInsightBlocks,
  runInsightCommand,
  saveInsightReportToJournal,
} from '../../src/cli/commands/insight.js';
import type { InsightReport } from '../../src/cognitive/insight-generator.js';
import type { Block } from '../../src/memory/chain.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('legacy insight command helpers', () => {
  it('loads deep-period blocks from all configured chains in timestamp order', async () => {
    const loadBlocks = vi
      .fn()
      .mockImplementation(async (chain: string): Promise<Block[]> => {
        if (chain === 'journal') {
          return [{ chain, timestamp: '2026-03-11T10:00:00.000Z', data: { content: 'j' } }];
        }
        if (chain === 'decision') {
          return [{ chain, timestamp: '2026-03-11T08:00:00.000Z', data: { content: 'd' } }];
        }
        if (chain === 'reflection') {
          return [{ chain, timestamp: '2026-03-11T09:00:00.000Z', data: { content: 'r' } }];
        }
        return [{ chain, timestamp: '2026-03-11T07:00:00.000Z', data: { content: 'i' } }];
      });

    const blocks = await loadInsightBlocks('deep', loadBlocks);

    expect(loadBlocks).toHaveBeenCalledTimes(4);
    expect(loadBlocks).toHaveBeenCalledWith('journal', 360);
    expect(loadBlocks).toHaveBeenCalledWith('decision', 360);
    expect(loadBlocks).toHaveBeenCalledWith('reflection', 360);
    expect(loadBlocks).toHaveBeenCalledWith('insights', 360);
    expect(blocks.map((item) => item.chain)).toEqual(['insights', 'decision', 'reflection', 'journal']);
  });

  it('saves compact insight report payload to journal chain', async () => {
    const appendInsight = vi.fn().mockResolvedValue({
      index: 7,
      hash: 'abc123',
      chain: 'journal',
      timestamp: '2026-03-12T00:00:00.000Z',
    });
    const report: InsightReport = {
      generated: new Date('2026-03-12T00:00:00.000Z'),
      mood: 'reflective',
      summary: '2 insight(s) generated',
      quickWins: ['capture one decision'],
      insights: [
        {
          type: 'pattern',
          title: 'Pattern A',
          description: 'desc A',
          confidence: 0.8,
          evidence: [],
          actionable: true,
          actions: ['act'],
        },
        {
          type: 'recommendation',
          title: 'Pattern B',
          description: 'desc B',
          confidence: 0.7,
          evidence: [],
          actionable: false,
          actions: [],
        },
      ],
    };

    const saved = await saveInsightReportToJournal(report, appendInsight);

    expect(saved.index).toBe(7);
    expect(appendInsight).toHaveBeenCalledOnce();
    expect(appendInsight).toHaveBeenCalledWith(
      'journal',
      expect.objectContaining({
        type: 'insight_report',
        source: 'insight-cli',
        report: expect.objectContaining({
          mood: 'reflective',
          count: 2,
        }),
      }),
    );
  });

  it('runs save flow when requested', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const saveReportFn = vi.fn().mockResolvedValue({
      index: 1,
      hash: 'hash-1',
      chain: 'journal',
      timestamp: '2026-03-12T00:00:00.000Z',
    });
    const blocks: Block[] = [
      {
        chain: 'journal',
        timestamp: new Date().toISOString(),
        data: { content: 'Need reliability improvements', tags: ['reliability', 'ops'] },
      },
    ];

    await runInsightCommand(blocks, { period: 'daily', format: 'json', save: true }, { saveReportFn });

    expect(saveReportFn).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalled();
  });
});
