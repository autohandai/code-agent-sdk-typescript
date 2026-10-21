# Claude Agent SDK compatibility

This is an **unreleased implementation branch**, not a completed drop-in
replacement. Do not publish it as `latest` or describe F-0143 as complete.
The existing native SDK remains the supported entry point.

Baseline: Claude SDK `0.3.306`, Autohand SDK main `c820a3d`, CLI main
`86c30f0802f433ceaa47cc21b42989d2a5672cbe`, released CLI `0.9.8`.
The new entry point is `@autohandai/agent-sdk/claude`.

## Release blockers

1. A clean BYOK or local-model session still requires an Autohand account. The
   released CLI rejects startup before contacting the model provider. Product
   policy must decide whether accountless BYOK/local sessions are supported.
   An Anthropic key must never be copied into an Autohand credential field.
2. Permission requests do not carry full input and a tool-use ID before
   authorization. CLI main emits `tool_start` after canonical authorization.
   `canUseTool`, updated input, scoped preapproval and JS hooks need a correlated
   pre-execution RPC contract. Guessing from concurrent tool calls is unsafe.
3. Native permission lists operate on capability names. For example,
   `git_checkout`, dependency changes and file mutations may share `write_file`.
   Exact requested-tool preapproval requires a CLI policy extension.
   `acceptEdits` and bare file-tool preapproval are rejected before execution
   rather than granting these additional capabilities.
4. Dollar budgets are explicitly rejected by CLI main. Cost, exact main-agent
   turns and per-model usage are not present in the required RPC stream.
5. Five pinned CLI platform packages and the shared mapping package are not
   published. Local registry installation is proof of packaging, not an npm
   release. A failed CLI release workflow does not establish its exact billing
   cause; successful catalog jobs do not establish release readiness.

## Implemented and partial behavior

| Surface | Current implementation | Proof boundary |
| --- | --- | --- |
| `query()` | Lazy async iterator, one CLI process, init, assistant/tool messages and result | Subprocess fixtures; released CLI/provider fixture quickstart |
| Streaming input | Sequential text user messages in one session | Subprocess fixtures; attachments rejected |
| Lifecycle | Interrupt, early consumer exit, abort, close, stalled input cancellation | Subprocess fixtures |
| Errors | Global CLI startup diagnostics preserved; reported execution errors retained | Transport and reducer tests |
| File changes | Apply the canonically authorized RPC change batch before returning success; reject batches in plan mode | Actual file edit using released CLI with explicit bypass consent; failed/malformed batch tests |
| Authentication | Scoped env, canonical `AUTOHAND_AI_API_KEY`, alias `AUTOHAND_API_KEY`, Anthropic BYOK selection | Resolution tests; clean BYOK runtime remains blocked by account gate |
| Models | Public Claude aliases with native Anthropic; hosted Fantail; explicit provider/local prefixes | Selection tests; no live provider inference proof |
| `allowedTools` | Non-file bare aliases preapprove native capabilities; do not narrow advertised tools | File-tool preapproval rejected; scoped preapproval warns and remains unapproved; exact requested-tool policy blocked |
| `disallowedTools` / `tools` | Native deny scope / exclusive tool availability | Configuration tests; distinct from preapproval |
| Permission modes | Native interactive plus default-deny unanswered prompts; plan guard; explicit consent for bypass | `acceptEdits` rejected; no classifier for `auto` |
| MCP | stdio, HTTP and SSE configuration; `tool()` and `createSdkMcpServer()` | Real MCP protocol test including invalid input and structured content |
| SDK-hosted MCP | Authenticated loopback HTTP endpoint, full MCP result content, per-query cleanup | MCP client/server integration; Node installed-package API smoke |
| Tool schemas | Zod 4 raw shapes, validated before handler execution | Protocol and handler tests; Zod 3 is not yet supported |
| Resume / continue / fork | Native session attach RPC / workspace-filtered history / `--fork` | Subprocess/configuration fixtures, not a real persisted-session migration |
| Subagents | Native agents JSON and tool/model aliases | Configuration tests, not live parallel execution |
| `maxTurns` | Conservative total-model-request cap, including subagents; warns about different semantics | Configuration proof only; exact main-agent turn limit blocked |
| Usage and cost | Explicitly unavailable (`null`), including assistant usage | Never fabricated as zero; upstream type assignability is incomplete |
| `includePartialMessages` | Text/thinking deltas only | Not the full upstream message/block lifecycle event protocol |
| `settingSources: []` | Explicit bare runtime/config isolation | Configuration tests; does not claim a zero-outbound guarantee |
| Import codemod | Static/type/dynamic import and re-export specifiers; dry run by default, `--write` opt-in | Lexer and filesystem tests; no credential, config or dependency rewriting |

Unknown non-policy options warn once per query through `stderr` or the process
stderr stream. Unsupported execution, permission, persistence and isolation
constraints fail before spawning the CLI. An explicit nonempty `settingSources`
fails rather than silently ignoring Claude permission rules or hooks.

Compile-only drift checks cover the common option inputs and all permission
mode names against the pinned upstream package. The complete upstream type
surface is not mirrored yet. In particular,
`HookJSONOutput` and the full `Query` control API are unavailable, and result
usage fields are nullable. An index signature accepting an option does not mean
its runtime behavior is supported.

## Official examples

Two fixtures contain only the package-specifier replacement:

- The TypeScript [official quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart),
  retrieved 2026-10-21. Its file-edit result is checked on disk.
- [`hello-world`](https://github.com/anthropics/claude-agent-sdk-demos/blob/826b268506a5f3707623c9e6140b200befcbebae/hello-world/hello-world.ts),
  pinned at `826b268506a5f3707623c9e6140b200befcbebae`. The upstream demo
  repository identifies its sample code as MIT licensed. Its hook constraint
  fails explicitly; its hook type is also not exported by this preview.

Current controlled result: **0/2** executes successfully with only import
specifiers changed. The quickstart's file-tool preapproval is rejected, and the
hello-world hook constraint is rejected. Both require CLI work.

During investigation the quickstart read and changed `utils.py` using the
released CLI, but review then found the broader native permission capability.
That mapping was removed and the example is no longer counted as passing.
A separate mutation smoke test now verifies the file-batch adapter using
explicit bypass consent and local account/model fixtures. That smoke is not an
official example and does not count toward the acceptance total.

There is no clean one-env-var migration, production authentication or live-model
proof. No live-provider official example has been verified. The full official
demo collection has not been assessed.

Reproduce after `bun run build`:

```sh
node scripts/test-claude-official.mjs
```

The command intentionally reports both successes and blocked examples. It is
not a substitute for the release acceptance gate.

## Remaining phases

Phase 1 is partial pending the account decision, exact permission mapping,
shared CLI alias-table adoption and real persisted-session/subagent proof.

Phase 2 has working SDK-hosted MCP tools and the import codemod. Permission
callbacks, structured output, selective Claude config import, full upstream type
parity checks and a broader official-example suite remain required.

Phase 3 is unshipped: correlated permission/hook RPC, usage/cost events, exact
turn/dollar limits and the Python compatibility package. Existing native
allow/deny flags and request/token limits should be reused, not rebuilt.

The extra worktree isolation, plan-file metadata, safe session sharing and
complete Claude config import are not implemented by this facade. Native model
selection and hosted billing do not prove those extras.

## Migration command

```sh
npx @autohandai/agent-sdk migrate-claude ./src
npx @autohandai/agent-sdk migrate-claude ./src --write
```

These commands become available only after a tested release. The first command
prints a JSON review report without changing files. The second writes only
import-specifier edits. Symbolic links and generated/dependency directories are
skipped. Unparseable files remain unchanged and are reported. CommonJS
`require()` and computed dynamic imports require manual review.
