/** Legacy wrapper options that the paired CLI never implemented. */
const unsupported = new Set(["--agents-md","--no-agents-md","--agents-md-create","--agents-md-auto-update","--agents-md-path","--auto-save-interval","--compression-threshold","--summarization-threshold","--skills","--skill-sources","--install-missing-skills","--permission-mode","--permission-allow-list","--permission-deny-list"]);
const switches = new Set(["--bare","--offline","--yes","--y","--dry-run","--debug","--auto-commit","-c","--unrestricted","--restricted","--plan","--answer-only","--setup-only","--no-idle-logout","--auto-skill","--learn","--learn-update","--project","--permissions","--settings","--traces-on","--traces-off","--login","--logout","--patch","--acp","--sdk-resume-last","--tmux","--auto-mode","--no-worktree","--interactive-on-complete","--setup","--about","--feedback","--cc","--context-compact","--no-cc","--no-context-compact","--ephemeral"]);

export function validateCliArguments(args: readonly string[]): void {
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === undefined) break;
    if (unsupported.has(argument)) throw new Error(argument + " is unsupported by the current CLI; use a supported CLI option or runtime RPC instead");
    if (!switches.has(argument)) index++;
  }
}
