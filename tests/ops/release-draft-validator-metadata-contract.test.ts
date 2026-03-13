import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';
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
  metadataSchemaPath: string;
  metadataExamplePath: string;
  metadataValidatorOutputContractPath: string;
  metadataValidationCommandId: string;
  metadataValidatorSchemaStatusValues: string[];
  metadataValidatorCheckOrderStatusValues: string[];
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('expected string[] value');
  }
  return value as string[];
}

function assertJsonPayload(validate: ValidateFunction, payload: unknown, label: string, ajv: Ajv2020): void {
  if (!validate(payload)) {
    throw new Error(`${label}: ${ajv.errorsText(validate.errors)}`);
  }
}

describe('release-draft validator metadata contract', () => {
  const contract = JSON.parse(
    readFileSync(fixturePath, 'utf8'),
  ) as ReleaseDraftValidatorMetadataContract;

  it('keeps validator metadata generation and workflow references aligned with fixture contract', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('VALIDATOR_METADATA_PATH="release-dist/validator-metadata.json"');
    expect(workflow).toContain(
      'VALIDATOR_METADATA_SCHEMA_PATH="tests/fixtures/release-draft/validator-metadata.schema.json"',
    );
    expect(workflow).toContain('schemaVersion: 1,');
    expect(workflow).toContain('validatorSchema: {');
    expect(workflow).toContain('validatorCheckOrder: {');
    expect(workflow).toContain(contract.metadataValidationCommandId);

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

  it('keeps validator metadata JSON example keys and values aligned with fixture contract', () => {
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

    expect(contract.metadataValidatorSchemaStatusValues).toContain(String(validatorSchema.status));
    expect(contract.metadataValidatorCheckOrderStatusValues).toContain(
      String(validatorCheckOrder.status),
    );
    expect(asStringArray(validatorCheckOrder.checkIds).length).toBeGreaterThan(0);
  });

  it('keeps validator metadata schema and example fixtures aligned with contract', () => {
    const schemaPath = path.join(repoRoot, contract.metadataSchemaPath);
    const examplePath = path.join(repoRoot, contract.metadataExamplePath);
    const validatorOutputContractPath = path.join(repoRoot, contract.metadataValidatorOutputContractPath);

    expect(existsSync(schemaPath)).toBe(true);
    expect(existsSync(examplePath)).toBe(true);
    expect(existsSync(validatorOutputContractPath)).toBe(true);

    const schema = asRecord(JSON.parse(readFileSync(schemaPath, 'utf8')));
    const example = JSON.parse(readFileSync(examplePath, 'utf8'));

    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(asStringArray(schema.required).sort()).toEqual([...contract.metadataTopLevelKeys].sort());

    const schemaProperties = asRecord(schema.properties);
    expect(Object.keys(schemaProperties).sort()).toEqual([...contract.metadataTopLevelKeys].sort());

    const validatorSchema = asRecord(schemaProperties.validatorSchema);
    expect(asStringArray(validatorSchema.required).sort()).toEqual(
      [...contract.metadataValidatorSchemaKeys].sort(),
    );

    const validatorSchemaProperties = asRecord(validatorSchema.properties);
    expect(asStringArray(asRecord(validatorSchemaProperties.status).enum).sort()).toEqual(
      [...contract.metadataValidatorSchemaStatusValues].sort(),
    );

    const validatorCheckOrder = asRecord(schemaProperties.validatorCheckOrder);
    expect(asStringArray(validatorCheckOrder.required).sort()).toEqual(
      [...contract.metadataValidatorCheckOrderKeys].sort(),
    );

    const validatorCheckOrderProperties = asRecord(validatorCheckOrder.properties);
    expect(asStringArray(asRecord(validatorCheckOrderProperties.status).enum).sort()).toEqual(
      [...contract.metadataValidatorCheckOrderStatusValues].sort(),
    );

    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(schema);
    assertJsonPayload(validate, example, 'validator metadata example schema mismatch', ajv);
  });
});
