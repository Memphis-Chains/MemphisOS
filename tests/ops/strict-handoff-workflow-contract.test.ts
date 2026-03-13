import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');

const workflows = [
  path.join('.github', 'workflows', 'ci.yml'),
  path.join('.github', 'workflows', 'release-draft.yml'),
] as const;

const requiredSnippets = [
  './scripts/strict-handoff-validator-json-gate.sh',
] as const;

const releaseDraftRequiredSnippets = [
  'id: validator_json',
  'MEMPHIS_STRICT_HANDOFF_GATE_OUTPUT: "1"',
  'validator_check_order_status',
  'validator_check_ids',
] as const;

const gateScriptRequiredSnippets = [
  `OUT="$(npm run -s ops:validate-strict-handoff-fixtures -- --json)"`,
  `jq -e '.ok == true' <<<"$OUT" >/dev/null`,
  `EXPECTED_IDS="$(jq -c '.checkIds' tests/fixtures/strict-handoff/validator-output-contract.json)"`,
  `ACTUAL_IDS="$(jq -c '.checks | map(.id)' <<<"$OUT")"`,
  'strict-handoff validator check-id ordering mismatch',
  'echo "check_order_status=matched" >>"$GITHUB_OUTPUT"',
  'echo "check_ids=$ACTUAL_IDS" >>"$GITHUB_OUTPUT"',
] as const;

describe('strict-handoff workflow contracts', () => {
  for (const workflowRelativePath of workflows) {
    it(`${workflowRelativePath} enforces validator JSON check-id ordering`, () => {
      const workflow = readFileSync(path.join(repoRoot, workflowRelativePath), 'utf8');

      for (const snippet of requiredSnippets) {
        expect(workflow).toContain(snippet);
      }
    });
  }

  it('release-draft emits machine-readable check-order outputs and summary fields', () => {
    const workflow = readFileSync(
      path.join(repoRoot, '.github', 'workflows', 'release-draft.yml'),
      'utf8',
    );

    for (const snippet of releaseDraftRequiredSnippets) {
      expect(workflow).toContain(snippet);
    }
  });

  it('shared gate script enforces validator success, check-id order, and optional outputs', () => {
    const script = readFileSync(
      path.join(repoRoot, 'scripts', 'strict-handoff-validator-json-gate.sh'),
      'utf8',
    );

    for (const snippet of gateScriptRequiredSnippets) {
      expect(script).toContain(snippet);
    }
  });
});
