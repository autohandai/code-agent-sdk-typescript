import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

function readRepositoryFile(path: string): string {
  return readFileSync(join(repositoryRoot, path), 'utf8');
}

const ledgerMethods = [
  'startAutoresearch',
  'getAutoresearchStatus',
  'stopAutoresearch',
  'getAutoresearchHistory',
  'replayAutoresearch',
  'rescoreAutoresearch',
  'compareAutoresearch',
  'getAutoresearchPareto',
  'pinAutoresearch',
  'pruneAutoresearch',
] as const;

describe('autoresearch SDK documentation', () => {
  it('documents the complete replayable-ledger lifecycle', () => {
    const guide = readRepositoryFile('docs/autoresearch.md');
    const apiReference = readRepositoryFile('docs/API_REFERENCE.md');
    const readme = readRepositoryFile('README.md');

    for (const method of ledgerMethods) {
      expect(guide).toContain(method);
      expect(apiReference).toContain(`agent.${method}`);
      expect(apiReference).toContain(`sdk.${method}`);
    }

    expect(guide).toContain('METRIC test_ms=<number>');
    expect(guide).toContain("evaluator: 'original'");
    expect(guide).toContain("evaluator: 'current'");
    expect(guide).toContain('AutoresearchOperationEvent');
    expect(guide).toContain('dryRun: true');
    expect(guide).toContain('yes: true');
    expect(readme).toContain('docs/autoresearch.md');
    expect(readme).toContain('examples/27-autoresearch-ledger.ts');
  });

  it('ships a runnable example that emits every configured metric and drives the returned instruction', () => {
    const example = readRepositoryFile('examples/27-autoresearch-ledger.ts');

    expect(example).toContain('METRIC test_ms=');
    expect(example).toContain('METRIC build_ms=');
    expect(example).toContain("metricName: 'build_ms', operator: '<=', threshold: 600_000");
    expect(example).toContain('agent.send(started.instruction)');
    expect(example).toContain("evaluator: 'original'");
    expect(example).toContain("evaluator: 'current'");
    expect(example).toContain('operationEvent.operation');

    for (const method of ledgerMethods) {
      expect(example).toContain(method);
    }
  });

  it('includes the guide and example in the published package', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      files?: unknown;
      scripts?: Record<string, unknown>;
    };

    expect(Array.isArray(packageJson.files)).toBe(true);
    expect(packageJson.files).toContain('docs/autoresearch.md');
    expect(packageJson.files).toContain('examples/27-autoresearch-ledger.ts');
    expect(packageJson.files).toContain('tsconfig.examples.json');
    expect(packageJson.scripts?.['typecheck:examples']).toBe('tsc -p tsconfig.examples.json');
    expect(packageJson.scripts?.prepublishOnly).toContain('bun run typecheck:examples');
    expect(packageJson.scripts?.prepublishOnly).toContain('bun run test:examples');
    expect(packageJson.scripts?.prepublishOnly).toContain('bun run build:examples');
    expect(readRepositoryFile('tsconfig.examples.json')).toContain('examples/27-autoresearch-ledger.ts');
  });

  it('keeps the public package import external when repository examples are bundled', () => {
    const exampleBuilder = readRepositoryFile('scripts/build-examples.mjs');

    expect(exampleBuilder).toContain("'--external'");
    expect(exampleBuilder).toContain("'@autohandai/agent-sdk'");
  });
});
