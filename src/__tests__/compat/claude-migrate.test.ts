import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateClaudeImports, migrateClaudeFiles } from '../../compat/claude/migrate.js';

describe('Claude import migration', () => {
  it('changes only import specifiers, including type imports and dynamic imports', async () => {
    const source = `// import { query } from '@anthropic-ai/claude-agent-sdk';
const prompt = "@anthropic-ai/claude-agent-sdk";
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from "@anthropic-ai/claude-agent-sdk";
const dynamic = import('@anthropic-ai/claude-agent-sdk');
export { query } from '@anthropic-ai/claude-agent-sdk';
`;
    const result = await migrateClaudeImports(source);
    expect(result.imports).toBe(4);
    expect(result.source).toContain(`// import { query } from '@anthropic-ai/claude-agent-sdk';`);
    expect(result.source).toContain('const prompt = "@anthropic-ai/claude-agent-sdk";');
    expect(result.source).toContain(`import { query } from '@autohandai/agent-sdk/claude';`);
    expect(result.source).toContain(`import type { Options } from "@autohandai/agent-sdk/claude";`);
    expect((await migrateClaudeImports(result.source)).imports).toBe(0);
  });

  it('defaults to a dry run and never rewrites credentials or configuration', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'autohand-migration-'));
    const path = join(directory, 'agent.ts');
    const source = `import {query} from '@anthropic-ai/claude-agent-sdk';\nprocess.env.ANTHROPIC_API_KEY = 'unchanged';\n`;
    try {
      await writeFile(path, source);
      const dry = await migrateClaudeFiles([directory]);
      expect(dry.changed).toHaveLength(1);
      expect(await readFile(path, 'utf8')).toBe(source);
      const written = await migrateClaudeFiles([directory], { write: true });
      expect(written.imports).toBe(1);
      expect(await readFile(path, 'utf8')).toContain("process.env.ANTHROPIC_API_KEY = 'unchanged'");
      expect((await migrateClaudeFiles([directory])).changed).toHaveLength(0);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
