import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

type ReleaseDraftDocsContract = {
  docs: string[];
  requiredReferences: string[];
  runbookCommandSnippets?: string[];
  readmeCommandSnippets?: string[];
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
