#!/usr/bin/env node
import { migrateClaudeFiles } from './compat/claude/migrate.js';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'migrate-claude' || args.includes('--help')) {
    process.stdout.write('Usage: autohand-agent-sdk migrate-claude [paths...] [--write]\nDefaults to a dry run. Read COMPAT.md before running migrated agents.\n');
    if (command !== undefined && command !== '--help' && command !== 'migrate-claude') process.exitCode = 2;
    return;
  }
  const unknown = args.find(argument => argument.startsWith('-') && argument !== '--write');
  if (unknown !== undefined) throw new Error(`Unknown option: ${unknown}`);
  const paths = args.filter(argument => argument !== '--write');
  const report = await migrateClaudeFiles(paths.length > 0 ? paths : [process.cwd()], { write: args.includes('--write') });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

void main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
