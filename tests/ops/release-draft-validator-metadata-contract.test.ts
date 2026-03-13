import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type ReleaseDraftValidatorMetadataContract = {
  packageOutputKeys: string[];
  uploadedArtifactOutputKeys: string[];
  releaseAssetOutputKeys: string[];
  summaryOutputKeys: string[];
  releaseNotesMarkers: string[];
  metadataTopLevelKeys: string[];
  metadataValidatorSchemaKeys: string[];
  metadataValidatorCheckOrderKeys: string[];
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
const exampleFixturePath = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'release-draft',
  'validator-metadata-example.json',
);

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('expected object value');
  }
  return value as Record<string, unknown>;
}

describe('release-draft validator metadata contract', () => {
  it('keeps validator metadata generation and workflow references aligned with fixture contract', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const contract = JSON.parse(
      readFileSync(fixturePath, 'utf8'),
    ) as ReleaseDraftValidatorMetadataContract;

    expect(workflow).toContain('VALIDATOR_METADATA_PATH="release-dist/validator-metadata.json"');
    expect(workflow).toContain('schemaVersion: 1,');
    expect(workflow).toContain('validatorSchema: {');
    expect(workflow).toContain('validatorCheckOrder: {');

    for (const key of contract.packageOutputKeys) {
      expect(workflow).toContain(`echo "${key}=`);
    }

    for (const key of contract.uploadedArtifactOutputKeys) {
      expect(workflow).toContain(`\${{ steps.package.outputs.${key} }}`);
    }

    for (const key of contract.releaseAssetOutputKeys) {
      expect(workflow).toContain(`"\${{ steps.package.outputs.${key} }}"`);
    }

    for (const key of contract.summaryOutputKeys) {
      expect(workflow).toContain(`steps.package.outputs.${key}`);
    }

    for (const marker of contract.releaseNotesMarkers) {
      expect(workflow).toContain(marker);
    }
  });

  it('keeps validator metadata JSON example keys aligned with fixture contract', () => {
    const contract = JSON.parse(
      readFileSync(fixturePath, 'utf8'),
    ) as ReleaseDraftValidatorMetadataContract;
    const examplePayload = asRecord(JSON.parse(readFileSync(exampleFixturePath, 'utf8')));

    expect(Object.keys(examplePayload).sort()).toEqual([...contract.metadataTopLevelKeys].sort());

    const validatorSchema = asRecord(examplePayload.validatorSchema);
    expect(Object.keys(validatorSchema).sort()).toEqual(
      [...contract.metadataValidatorSchemaKeys].sort(),
    );

    const validatorCheckOrder = asRecord(examplePayload.validatorCheckOrder);
    expect(Object.keys(validatorCheckOrder).sort()).toEqual(
      [...contract.metadataValidatorCheckOrderKeys].sort(),
    );
  });
});
