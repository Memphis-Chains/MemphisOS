import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';

type OutputContractFixture = {
  summaryJsonSchemaPath: string;
  completionHintsJsonSchemaPath: string;
  summaryExamplePath: string;
  completionHintsExamplePath: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function validateJsonPayload(
  validate: ValidateFunction,
  payload: unknown,
  label: string,
  ajv: Ajv2020,
): void {
  if (!validate(payload)) {
    fail(`[FAIL] ${label}: ${ajv.errorsText(validate.errors)}`);
  }
  console.log(`[PASS] ${label}`);
}

function runCommand(commandArgs: string[], cwd: string): ReturnType<typeof spawnSync> {
  return spawnSync('npm', commandArgs, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    timeout: 30_000,
  });
}

function parseJsonOutput(stdout: string, label: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`[FAIL] ${label}: invalid JSON output (${message})`);
  }
}

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..');
const contractPath = path.resolve(repoRoot, 'tests', 'fixtures', 'strict-handoff', 'output-contract.json');
const outputContract = readJsonFile(contractPath) as OutputContractFixture;

const summarySchema = readJsonFile(path.resolve(repoRoot, outputContract.summaryJsonSchemaPath));
const completionSchema = readJsonFile(path.resolve(repoRoot, outputContract.completionHintsJsonSchemaPath));
const summaryExample = readJsonFile(path.resolve(repoRoot, outputContract.summaryExamplePath));
const completionExample = readJsonFile(path.resolve(repoRoot, outputContract.completionHintsExamplePath));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSummary = ajv.compile(summarySchema);
const validateCompletion = ajv.compile(completionSchema);

validateJsonPayload(validateSummary, summaryExample, 'summary example fixture matches summary schema', ajv);
validateJsonPayload(
  validateCompletion,
  completionExample,
  'completion-hints example fixture matches completion-hints schema',
  ajv,
);

const completionHintsResult = runCommand(
  ['run', '-s', 'ops:strict-incident-handoff', '--', '--completion-hints'],
  repoRoot,
);
if (completionHintsResult.status !== 0) {
  fail(
    `[FAIL] completion-hints command failed (status=${String(completionHintsResult.status)}): ${completionHintsResult.stderr}`,
  );
}
const completionHintsPayload = parseJsonOutput(
  completionHintsResult.stdout,
  'completion-hints command output',
);
validateJsonPayload(
  validateCompletion,
  completionHintsPayload,
  'completion-hints command output matches completion-hints schema',
  ajv,
);

const summaryResult = runCommand(['run', '-s', 'ops:strict-incident-handoff', '--', '--json'], repoRoot);
if (summaryResult.status !== 0 && summaryResult.status !== 1) {
  fail(`[FAIL] summary command returned unexpected status=${String(summaryResult.status)}: ${summaryResult.stderr}`);
}
const summaryPayload = parseJsonOutput(summaryResult.stdout, 'strict-handoff summary command output');
validateJsonPayload(validateSummary, summaryPayload, 'summary command output matches summary schema', ajv);

console.log('[PASS] strict-handoff fixture/schema validation completed');
