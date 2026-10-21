export const claudeToolNames = Object.freeze({
  run_command: 'Bash', shell: 'Bash', read_file: 'Read', write_file: 'Write',
  append_file: 'Write', search_replace: 'Edit', apply_patch: 'Edit', multi_file_edit: 'Edit',
  glob: 'Glob', find: 'Glob', fff_find: 'Glob', search: 'Grep', search_code: 'Grep',
  grep: 'Grep', find_grep: 'Grep', web_search: 'WebSearch', fetch_url: 'WebFetch',
  delegate_task: 'Agent', ask_followup_question: 'AskUserQuestion',
  todo_write: 'TodoWrite', notebook_edit: 'NotebookEdit',
});
export const claudeToolAliases = Object.freeze({ Task: 'Agent' });
export const claudeModelAliases = Object.freeze({
  opus: 'claude-opus-5', sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-4-5',
});
