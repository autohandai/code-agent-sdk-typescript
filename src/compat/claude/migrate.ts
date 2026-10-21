import { randomUUID } from 'node:crypto';
import { lstat, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { init, parse } from 'es-module-lexer';
import { ClaudeCompatibilityError } from '../../errors/claude-compat.js';

const sourcePackage = '@anthropic-ai/claude-agent-sdk';
const targetPackage = '@autohandai/agent-sdk/claude';
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cjs', '.cts']);
const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next']);

export async function migrateClaudeImports(source: string): Promise<{ source: string; imports: number }> {
  await init;
  const [imports] = parse(source);
  const edits = imports.filter(item => item.n === sourcePackage).sort((a, b) => b.s - a.s);
  let output = source;
  for (const item of edits) {
    const replacement = item.d >= 0 ? JSON.stringify(targetPackage) : targetPackage;
    output = output.slice(0, item.s) + replacement + output.slice(item.e);
  }
  return { source: output, imports: edits.length };
}

export interface MigrationReport {
  write: boolean;
  imports: number;
  changed: Array<{ path: string; imports: number }>;
  skipped: Array<{ path: string; reason: string }>;
  review: string[];
}

export async function migrateClaudeFiles(paths: string[], options: { write?: boolean } = {}): Promise<MigrationReport> {
  const files = new Set<string>();
  const report: MigrationReport = { write: options.write === true, imports: 0, changed: [], skipped: [],
    review: ['No dependency, environment variable, credential or permission setting was changed.',
      'Read COMPAT.md before executing. Import migration does not establish runtime compatibility.',
      'CommonJS require calls and computed dynamic imports need manual review.'] };
  async function collect(path: string): Promise<void> {
    const info = await lstat(path);
    if (info.isSymbolicLink()) { report.skipped.push({ path, reason: 'symbolic link' }); return; }
    if (info.isDirectory()) {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!ignored.has(entry.name)) await collect(resolve(path, entry.name));
      }
    } else if (info.isFile() && extensions.has(extname(path))) files.add(path);
  }
  for (const path of paths) await collect(resolve(path));
  for (const path of [...files].sort()) {
    const source = await readFile(path, 'utf8');
    let migrated: Awaited<ReturnType<typeof migrateClaudeImports>>;
    try { migrated = await migrateClaudeImports(source); }
    catch { report.skipped.push({ path, reason: 'module lexer could not parse this file; unchanged' }); continue; }
    if (migrated.imports === 0) continue;
    if (options.write === true) {
      const temporary = `${path}.autohand-migrate-${randomUUID()}`;
      try {
        const info = await lstat(path);
        if (!info.isFile() || await readFile(path, 'utf8') !== source) throw new ClaudeCompatibilityError(`File changed during migration: ${path}`);
        await writeFile(temporary, migrated.source, { flag: 'wx', mode: info.mode & 0o777 });
        await rename(temporary, path);
      } finally { await rm(temporary, { force: true }); }
    }
    report.imports += migrated.imports;
    report.changed.push({ path, imports: migrated.imports });
  }
  return report;
}
