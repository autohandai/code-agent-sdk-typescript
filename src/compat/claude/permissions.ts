import type { PermissionMode as NativePermissionMode } from '../../types/index.js';
import { ClaudeCompatibilityError } from '../../errors/claude-compat.js';
import type { PermissionMode } from './types.js';

export function resolvePermissionMode(mode: PermissionMode = 'default', dangerous = false): { mode: NativePermissionMode; planMode: boolean } {
  if (mode === 'acceptEdits') throw new ClaudeCompatibilityError('acceptEdits requires requested-tool permission rules in the CLI');
  if (mode === 'bypassPermissions' && !dangerous) throw new ClaudeCompatibilityError('bypassPermissions requires allowDangerouslySkipPermissions: true');
  return { mode: mode === 'bypassPermissions' ? 'unrestricted' : 'interactive', planMode: mode === 'plan' };
}
