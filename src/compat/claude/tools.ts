import { claudeToolAliases, claudeToolNames } from '@autohandai/agent-compat-data';

export function toClaudeTool(tool: string): string { return claudeToolNames[tool] ?? tool; }
export function toNativeToolPatterns(pattern: string): string[] {
  const split = pattern.indexOf('(');
  const name = split < 0 ? pattern : pattern.slice(0, split);
  const canonical = claudeToolAliases[name] ?? name;
  const suffix = split < 0 ? '' : pattern.slice(split);
  const names = Object.entries(claudeToolNames).filter(([, value]) => value === canonical).map(([key]) => key);
  return (names.length ? names : [name]).map(native => native + suffix);
}
export function toClaudeInput(_tool: string, input: Record<string, unknown>): Record<string, unknown> {
  return { ...input,
    ...(typeof input.path === 'string' ? { file_path: input.path } : {}),
    ...(typeof input.contents === 'string' ? { content: input.contents } : {}),
    ...(typeof input.oldText === 'string' ? { old_string: input.oldText } : {}),
    ...(typeof input.newText === 'string' ? { new_string: input.newText } : {}),
  };
}
