import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { getChainPath } from '../src/config/paths.js';

type ReportKind = 'insight' | 'categorize' | 'reflection';
type OutputMode = 'text' | 'json';

type ReportSummary = {
  index: number | null;
  timestamp: string | null;
  hash: string | null;
  reportType: ReportKind;
  dataType: string;
  schemaVersion: number | null;
  source: string | null;
  generatedAt: string | null;
  input: string | null;
  path: string;
};

const SCRIPT_SCHEMA_VERSION = 1;
const VALID_REPORT_TYPES = ['all', 'insight', 'categorize', 'reflection'] as const;
const REPORT_TYPE_MAP = {
  insight_report: 'insight',
  categorize_report: 'categorize',
  reflection_report: 'reflection',
} as const satisfies Record<string, ReportKind>;

type ParsedArgs = {
  outputMode: OutputMode;
  limit: number;
  typeFilter: (typeof VALID_REPORT_TYPES)[number];
};

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let outputMode: OutputMode = 'text';
  let limit = 10;
  let typeFilter: (typeof VALID_REPORT_TYPES)[number] = 'all';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') {
      outputMode = 'json';
      continue;
    }
    if (arg === '--limit') {
      const raw = args[i + 1];
      if (!raw) throw new Error('--limit requires a numeric value');
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0)
        throw new Error('--limit must be a positive integer');
      limit = parsed;
      i += 1;
      continue;
    }
    if (arg === '--type') {
      const raw = args[i + 1];
      if (!raw) throw new Error('--type requires a value: all|insight|categorize|reflection');
      if (!VALID_REPORT_TYPES.includes(raw as (typeof VALID_REPORT_TYPES)[number])) {
        throw new Error(`unsupported --type value: ${raw}`);
      }
      typeFilter = raw as (typeof VALID_REPORT_TYPES)[number];
      i += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }

  return { outputMode, limit, typeFilter };
}

function readJournalReports(chainPath: string): ReportSummary[] {
  if (!existsSync(chainPath)) {
    return [];
  }

  const files = readdirSync(chainPath)
    .filter((name) => name.endsWith('.json'))
    .sort();
  const reports: ReportSummary[] = [];

  for (const file of files) {
    const filePath = path.join(chainPath, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object') continue;
    const block = parsed as {
      index?: number;
      timestamp?: string;
      hash?: string;
      data?: {
        type?: string;
        schemaVersion?: number;
        source?: string;
        report?: {
          generatedAt?: string;
          input?: string;
        };
      };
    };
    const dataType = block.data?.type;
    if (!dataType || !(dataType in REPORT_TYPE_MAP)) continue;

    reports.push({
      index: typeof block.index === 'number' ? block.index : null,
      timestamp: typeof block.timestamp === 'string' ? block.timestamp : null,
      hash: typeof block.hash === 'string' ? block.hash : null,
      reportType: REPORT_TYPE_MAP[dataType as keyof typeof REPORT_TYPE_MAP],
      dataType,
      schemaVersion: typeof block.data?.schemaVersion === 'number' ? block.data.schemaVersion : null,
      source: typeof block.data?.source === 'string' ? block.data.source : null,
      generatedAt:
        typeof block.data?.report?.generatedAt === 'string' ? block.data.report.generatedAt : null,
      input: typeof block.data?.report?.input === 'string' ? block.data.report.input : null,
      path: filePath,
    });
  }

  return reports;
}

function formatText(reports: ReportSummary[], chainPath: string): string {
  if (reports.length === 0) {
    return `No cognitive reports found in ${chainPath}`;
  }

  return reports
    .map(
      (report) =>
        `[${report.reportType}] index=${report.index ?? 'n/a'} source=${report.source ?? 'n/a'} schema=${report.schemaVersion ?? 'n/a'} generatedAt=${report.generatedAt ?? 'n/a'} input=${report.input ?? '-'}`,
    )
    .join('\n');
}

function main(): void {
  let parsedArgs: ParsedArgs;
  try {
    parsedArgs = parseArgs(process.argv);
  } catch (error) {
    console.error(
      JSON.stringify(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const chainPath = getChainPath('journal', process.env);
  const reports = readJournalReports(chainPath)
    .filter((report) => parsedArgs.typeFilter === 'all' || report.reportType === parsedArgs.typeFilter)
    .slice(-parsedArgs.limit)
    .reverse();

  if (parsedArgs.outputMode === 'json') {
    console.log(
      JSON.stringify(
        {
          schemaVersion: SCRIPT_SCHEMA_VERSION,
          ok: true,
          chainPath,
          typeFilter: parsedArgs.typeFilter,
          limit: parsedArgs.limit,
          count: reports.length,
          reports,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(formatText(reports, chainPath));
}

main();
