import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const repositoryRoot = join(import.meta.dir, '..', '..');

describe('stopWhen documentation', () => {
  it('documents step boundaries, stopped results, and continuation', async () => {
    const guide = await readFile(
      join(repositoryRoot, 'docs', 'step-control.md'),
      'utf8'
    );

    expect(guide).toContain('after a completed tool step');
    expect(guide).toContain("status: 'stopped'");
    expect(guide).toContain("agent.run('Continue");
    expect(guide).toContain('If a condition throws');
  });

  it('ships a runnable, typechecked example in the package', async () => {
    const [example, packageJson, examplesConfig] = await Promise.all([
      readFile(join(repositoryRoot, 'examples', '29-stop-when.ts'), 'utf8'),
      readFile(join(repositoryRoot, 'package.json'), 'utf8'),
      readFile(join(repositoryRoot, 'tsconfig.examples.json'), 'utf8'),
    ]);

    expect(example).toContain('stopWhen: isStepCount(1)');
    expect(example).toContain("inspected.status !== 'stopped'");
    expect(packageJson).toContain('"docs/step-control.md"');
    expect(packageJson).toContain('"examples/29-stop-when.ts"');
    expect(examplesConfig).toContain('"examples/29-stop-when.ts"');
    const manifest = JSON.parse(packageJson) as { files: string[] };
    expect(manifest.files).not.toContain('cli');
  });
});
