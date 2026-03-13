import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type ReleaseDraftDocsContract = {
  docs: string[];
  requiredReferences: string[];
  runbookCommandSnippets?: string[];
  readmeCommandSnippets?: string[];
  requiredArtifactNames?: string[];
  requiredPreflightOutputKeys?: string[];
  requiredOutputEnvControls?: string[];
  requiredHelperScriptPaths?: string[];
  requiredReleaseCommands?: string[];
  requiredTriageAnchors?: string[];
  requiredGateAnchorTokens?: string[];
  requiredManualFallbackCommands?: string[];
  requiredChecksumCommands?: string[];
  requiredTagPushCommands?: string[];
  requiredPackCommands?: string[];
  requiredReleaseDirCommands?: string[];
  requiredStrictFixtureValidationCommands?: string[];
  requiredStrictFixtureRerunCommands?: string[];
  requiredStrictJsonGateScriptMarkers?: string[];
  requiredOpsArtifactsCommands?: string[];
  requiredChaosCommands?: string[];
};

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, '..', '..');
const fixturePath = path.join(
  repoRoot,
  'tests',
  'fixtures',
  'release-draft',
  'docs-contract.json',
);

function extractReleaseDraftFixtureReferences(markdown: string): Set<string> {
  return new Set(markdown.match(/tests\/fixtures\/release-draft\/[a-z0-9.-]+\.json/g) ?? []);
}

describe('release-draft docs fixture references', () => {
  const contract = JSON.parse(readFileSync(fixturePath, 'utf8')) as ReleaseDraftDocsContract;

  for (const docRelativePath of contract.docs) {
    it(`${docRelativePath} references release-draft schema/example fixtures`, () => {
      const docPath = path.join(repoRoot, docRelativePath);
      const markdown = readFileSync(docPath, 'utf8');
      const references = extractReleaseDraftFixtureReferences(markdown);

      for (const requiredRef of contract.requiredReferences) {
        expect(markdown.includes(requiredRef)).toBe(true);
        expect(references.has(requiredRef)).toBe(true);
        expect(existsSync(path.join(repoRoot, requiredRef))).toBe(true);
      }

      if (Array.isArray(contract.requiredArtifactNames)) {
        for (const artifactName of contract.requiredArtifactNames) {
          expect(markdown.includes(artifactName)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredPreflightOutputKeys)) {
        for (const outputKey of contract.requiredPreflightOutputKeys) {
          expect(markdown.includes(outputKey)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredOutputEnvControls)) {
        for (const envControl of contract.requiredOutputEnvControls) {
          expect(markdown.includes(envControl)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredHelperScriptPaths)) {
        for (const helperScriptPath of contract.requiredHelperScriptPaths) {
          expect(markdown.includes(helperScriptPath)).toBe(true);
          expect(existsSync(path.join(repoRoot, helperScriptPath))).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredReleaseCommands)) {
        for (const command of contract.requiredReleaseCommands) {
          expect(markdown.includes(command)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredTriageAnchors)) {
        for (const anchor of contract.requiredTriageAnchors) {
          expect(markdown.includes(anchor)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredGateAnchorTokens)) {
        for (const anchorToken of contract.requiredGateAnchorTokens) {
          expect(markdown.includes(anchorToken)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredManualFallbackCommands)) {
        for (const command of contract.requiredManualFallbackCommands) {
          expect(markdown.includes(command)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredChecksumCommands)) {
        for (const checksumCommand of contract.requiredChecksumCommands) {
          expect(markdown.includes(checksumCommand)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredTagPushCommands)) {
        for (const tagPushCommand of contract.requiredTagPushCommands) {
          expect(markdown.includes(tagPushCommand)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredPackCommands)) {
        for (const packCommand of contract.requiredPackCommands) {
          expect(markdown.includes(packCommand)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredReleaseDirCommands)) {
        for (const releaseDirCommand of contract.requiredReleaseDirCommands) {
          expect(markdown.includes(releaseDirCommand)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredStrictFixtureValidationCommands)) {
        for (const strictFixtureCommand of contract.requiredStrictFixtureValidationCommands) {
          expect(markdown.includes(strictFixtureCommand)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredStrictFixtureRerunCommands)) {
        for (const strictFixtureRerunCommand of contract.requiredStrictFixtureRerunCommands) {
          expect(markdown.includes(strictFixtureRerunCommand)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredStrictJsonGateScriptMarkers)) {
        for (const marker of contract.requiredStrictJsonGateScriptMarkers) {
          expect(markdown.includes(marker)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredOpsArtifactsCommands)) {
        for (const opsArtifactsCommand of contract.requiredOpsArtifactsCommands) {
          expect(markdown.includes(opsArtifactsCommand)).toBe(true);
        }
      }

      if (Array.isArray(contract.requiredChaosCommands)) {
        for (const chaosCommand of contract.requiredChaosCommands) {
          expect(markdown.includes(chaosCommand)).toBe(true);
        }
      }

      if (
        docRelativePath === 'docs/runbooks/RELEASE.md' &&
        Array.isArray(contract.runbookCommandSnippets)
      ) {
        for (const snippet of contract.runbookCommandSnippets) {
          expect(markdown.includes(snippet)).toBe(true);
        }
      }

      if (docRelativePath === 'README.md' && Array.isArray(contract.readmeCommandSnippets)) {
        for (const snippet of contract.readmeCommandSnippets) {
          expect(markdown.includes(snippet)).toBe(true);
        }
      }
    });
  }
});
