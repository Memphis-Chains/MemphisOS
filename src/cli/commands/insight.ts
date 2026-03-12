/**
 * Memphis Insight CLI Command
 *
 * Generates AI-powered insights from memory chains
 *
 * @usage memphis insight [--period daily|weekly|deep]
 */

import { InsightGenerator, type InsightReport } from '../../cognitive/insight-generator.js';
import type { Insight } from '../../cognitive/model-e-types.js';
import { appendBlock, type AppendBlockResult } from '../../infra/storage/chain-adapter.js';
import { getRecentBlocks } from '../../infra/storage/rust-chain-adapter.js';
import type { Block } from '../../memory/chain.js';

export interface InsightCommandOptions {
  period?: 'daily' | 'weekly' | 'deep';
  format?: 'text' | 'json';
  save?: boolean;
}

type InsightPeriod = NonNullable<InsightCommandOptions['period']>;

type LoadBlocksFn = (chain?: string, limit?: number) => Promise<Block[]>;
type AppendInsightFn = (
  chain: string,
  data: Record<string, unknown>,
) => Promise<AppendBlockResult>;
type SaveInsightReportFn = (report: InsightReport) => Promise<AppendBlockResult>;

const PERIOD_CHAIN_MAP: Record<InsightPeriod, string[]> = {
  daily: ['journal', 'decision'],
  weekly: ['journal', 'decision', 'reflection'],
  deep: ['journal', 'decision', 'reflection', 'insights'],
};

const PERIOD_LIMIT_MAP: Record<InsightPeriod, number> = {
  daily: 120,
  weekly: 240,
  deep: 360,
};

const defaultAppendInsight: AppendInsightFn = (chain, data) => appendBlock(chain, data, process.env);

function normalizePeriod(period: InsightCommandOptions['period']): InsightPeriod {
  if (period === 'weekly' || period === 'deep') return period;
  return 'daily';
}

function moodFromInsights(insights: Insight[]): InsightReport['mood'] {
  if (insights.length >= 5) return 'productive';
  if (insights.some((item) => item.type === 'prediction')) return 'exploring';
  if (insights.length >= 2) return 'reflective';
  return 'struggling';
}

function buildInsightReport(period: InsightPeriod, insights: Insight[]): InsightReport {
  const mood = moodFromInsights(insights);
  const quickWins = insights
    .filter((item) => item.actionable)
    .flatMap((item) => item.actions ?? [])
    .slice(0, 4);

  return {
    generated: new Date(),
    insights,
    quickWins,
    mood,
    summary: `${insights.length} insight(s) generated for ${period} mode; mood=${mood}`,
  };
}

function summarizeInsights(insights: Insight[]): Array<{
  type: Insight['type'];
  title: string;
  confidence: number;
  actionable: boolean;
  actions: string[];
  evidenceCount: number;
}> {
  return insights.slice(0, 10).map((item) => ({
    type: item.type,
    title: item.title,
    confidence: item.confidence,
    actionable: item.actionable,
    actions: item.actions ?? [],
    evidenceCount: item.evidence.length,
  }));
}

function dedupeInsights(insights: Insight[]): Insight[] {
  const seen = new Set<string>();
  const deduped: Insight[] = [];
  for (const item of insights) {
    const key = `${item.type}|${item.title}|${item.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

async function generateInsightsForPeriod(
  generator: InsightGenerator,
  period: InsightPeriod,
): Promise<Insight[]> {
  if (period === 'weekly') {
    return generator.generateWeeklyInsights();
  }
  if (period === 'deep') {
    const [weekly, daily] = await Promise.all([
      generator.generateWeeklyInsights(),
      generator.generateDailyInsights(),
    ]);
    return dedupeInsights([...weekly, ...daily]).slice(0, 12);
  }
  return generator.generateDailyInsights();
}

export async function loadInsightBlocks(
  period: InsightPeriod = 'daily',
  loadBlocksFn: LoadBlocksFn = getRecentBlocks,
): Promise<Block[]> {
  const chains = PERIOD_CHAIN_MAP[period];
  const limit = PERIOD_LIMIT_MAP[period];
  const loaded = await Promise.all(chains.map((chain) => loadBlocksFn(chain, limit)));

  return loaded.flat().sort((a, b) => {
    const aTs = new Date(a.timestamp ?? 0).getTime();
    const bTs = new Date(b.timestamp ?? 0).getTime();
    return aTs - bTs;
  });
}

export async function saveInsightReportToJournal(
  report: InsightReport,
  appendInsightFn: AppendInsightFn = defaultAppendInsight,
): Promise<AppendBlockResult> {
  const content = `Insight Report (${report.mood}): ${report.summary}`;
  return appendInsightFn('journal', {
    type: 'insight_report',
    source: 'insight-cli',
    content,
    tags: ['insight', 'report', report.mood],
    report: {
      generatedAt: report.generated.toISOString(),
      mood: report.mood,
      summary: report.summary,
      count: report.insights.length,
      quickWins: report.quickWins,
      insights: summarizeInsights(report.insights),
    },
  });
}

export async function runInsightCommand(
  blocks: Block[],
  options: InsightCommandOptions = {},
  deps: { saveReportFn?: SaveInsightReportFn } = {},
): Promise<void> {
  const generator = new InsightGenerator(blocks);
  const period = normalizePeriod(options.period);
  const saveReportFn = deps.saveReportFn ?? saveInsightReportToJournal;

  console.log('');
  console.log('🧠 Memphis Insight Generator');
  console.log('');

  try {
    const insights = await generateInsightsForPeriod(generator, period);
    const report = buildInsightReport(period, insights);

    if (options.format === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(generator.format(report));
    }

    if (options.save) {
      const appended = await saveReportFn(report);
      if (options.format !== 'json') {
        console.log('');
        console.log(`💾 Saved to ${appended.chain}#${appended.index} (${appended.hash})`);
      }
    }
  } catch (error) {
    console.error('❌ Failed to generate insights:', error);
    process.exit(1);
  }
}

/**
 * CLI entry point
 */
export function createInsightCommand(): {
  name: string;
  description: string;
  options: Array<{ name: string; description: string; default?: string }>;
  action: (options: Record<string, unknown>) => Promise<void>;
} {
  return {
    name: 'insight',
    description: 'Generate AI-powered insights from memory chains',
    options: [
      {
        name: 'period',
        description: 'Analysis period (daily, weekly, deep)',
        default: 'daily',
      },
      {
        name: 'format',
        description: 'Output format (text, json)',
        default: 'text',
      },
      {
        name: 'save',
        description: 'Save report to journal',
      },
    ],
    action: async (options) => {
      const typed = options as InsightCommandOptions;
      const period = normalizePeriod(typed.period);
      const blocks = await loadInsightBlocks(period);
      await runInsightCommand(blocks, typed);
    },
  };
}
