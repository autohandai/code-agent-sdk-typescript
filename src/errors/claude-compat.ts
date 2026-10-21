export class ClaudeCompatibilityError extends Error {
  constructor(message: string, readonly code = 'AUTOHAND_CLAUDE_COMPAT') {
    super(message);
    this.name = 'ClaudeCompatibilityError';
  }
}

export class AbortError extends Error {
  constructor(message = 'The query was aborted') {
    super(message);
    this.name = 'AbortError';
  }
}
