import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

interface IncidentBundle {
  schemaVersion: number;
  generatedAt: string;
  status: {
    ok: boolean;
    url: string;
    httpStatus: number | null;
    payload?: JsonValue;
    error?: string;
  };
  securityAudit: {
    path: string;
    tailLines: JsonValue[];
  };
  drill: {
    ok: boolean;
    result?: JsonValue;
    error?: string;
  };
}

function parseArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = process.argv[idx + 1];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseIntArg(flag: string, fallback: number): number {
  const raw = parseArg(flag);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function tailLines(input: string, count: number): string[] {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.slice(Math.max(0, lines.length - count));
}

function parseJsonLine(line: string): JsonValue {
  try {
    return JSON.parse(line) as JsonValue;
  } catch {
    return { raw: line };
  }
}

async function fetchStatus(url: string): Promise<IncidentBundle['status']> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3_000),
    });
    const text = await response.text();
    let payload: JsonValue = { raw: text };
    try {
      payload = JSON.parse(text) as JsonValue;
    } catch {
      payload = { raw: text };
    }
    return {
      ok: response.ok,
      url,
      httpStatus: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      url,
      httpStatus: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function runGuardDrillJson(repoRoot: string): IncidentBundle['drill'] {
  const out = spawnSync('npm', ['run', '-s', 'ops:drill-guards', '--', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
  });
  if (out.status !== 0) {
    return {
      ok: false,
      error: out.stderr?.trim() || out.stdout?.trim() || `exit=${out.status ?? 'null'}`,
    };
  }
  try {
    return {
      ok: true,
      result: JSON.parse(out.stdout) as JsonValue,
    };
  } catch (error) {
    return {
      ok: false,
      error: `failed to parse drill JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function readAuditTail(auditPath: string, count: number): JsonValue[] {
  try {
    const raw = readFileSync(auditPath, 'utf8');
    return tailLines(raw, count).map(parseJsonLine);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(moduleDir, '..');
  const statusUrl = parseArg('--status-url') ?? 'http://127.0.0.1:8080/v1/ops/status';
  const auditPath = resolve(parseArg('--audit-path') ?? process.env.MEMPHIS_SECURITY_AUDIT_LOG_PATH ?? 'data/security-audit.jsonl');
  const outPath = resolve(
    parseArg('--out') ??
      `data/incident-bundle-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  const auditLines = parseIntArg('--audit-lines', 50);

  const bundle: IncidentBundle = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: await fetchStatus(statusUrl),
    securityAudit: {
      path: auditPath,
      tailLines: readAuditTail(auditPath, auditLines),
    },
    drill: runGuardDrillJson(repoRoot),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(bundle, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, output: outPath }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
