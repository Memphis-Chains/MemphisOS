import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type ReleaseDraftValidatorMetadataContract = {
  packageOutputKeys: string[];
  summaryOutputKeys: string[];
  releaseNotesMarkers: string[];
};

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'release-draft.yml');
const fixturePath = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'release-draft',
  'validator-metadata-contract.json',
);

describe('release-draft validator metadata contract', () => {
  it('keeps validator metadata outputs and summary references aligned with fixture contract', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const contract = JSON.parse(
      readFileSync(fixturePath, 'utf8'),
    ) as ReleaseDraftValidatorMetadataContract;

    for (const key of contract.packageOutputKeys) {
      expect(workflow).toContain(`echo "${key}=`);
    }

    for (const key of contract.summaryOutputKeys) {
      expect(workflow).toContain(`steps.package.outputs.${key}`);
    }

    for (const marker of contract.releaseNotesMarkers) {
      expect(workflow).toContain(marker);
    }
  });
});
