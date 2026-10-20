import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

// Invoke npm's JavaScript entry point on Windows; .cmd files cannot use execFile.
export function npmCommand(args) {
  if (process.platform !== 'win32') return ['npm', args];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const cli = join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (existsSync(cli)) return [process.execPath, [cli, ...args]];
  }
  throw new Error('npm is required to verify or publish SDK packages');
}
