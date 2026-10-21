// Compile-only drift checks against the pinned official SDK. Runtime support
// remains governed by COMPAT.md; matching an input type does not imply support.
import type { Options as UpstreamOptions, PermissionMode as UpstreamPermissionMode } from '@anthropic-ai/claude-agent-sdk';
import type { Options, PermissionMode } from '../../compat/claude/types.js';

type CommonKeys = 'cwd' | 'env' | 'model' | 'allowedTools' | 'disallowedTools'
  | 'permissionMode' | 'allowDangerouslySkipPermissions' | 'resume' | 'continue'
  | 'forkSession' | 'persistSession' | 'includePartialMessages' | 'maxTurns'
  | 'additionalDirectories';

export function acceptUpstreamCommonOptions(options: Pick<UpstreamOptions, CommonKeys>): Options {
  return options;
}

export const permissionModeInputs = {
  default: 'default', acceptEdits: 'acceptEdits', bypassPermissions: 'bypassPermissions',
  plan: 'plan', dontAsk: 'dontAsk', auto: 'auto',
} satisfies Record<UpstreamPermissionMode, PermissionMode>;
