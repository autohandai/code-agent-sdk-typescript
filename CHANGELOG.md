# Changelog

## v1.0.4 - 2026-07-22

> Stable release.

Compare: https://github.com/autohandai/code-agent-sdk-typescript/compare/v1.0.3...v1.0.4

### Changes

- feat: add learning progress events (af63d03)
- feat: add MCP tools changed events (2036348)
- feat: add MCP invocation request events (865852a)
- feat: add post-response hook events (28c55d2)
- feat: add pre-prompt hook events (d11b91e)
- feat: add post-tool hook events (17234da)
- feat: add pre-tool hook events (006920f)
- feat: add auto-mode error events (0c2ca18)
- feat: add auto-mode completion events (ae2b544)
- feat: add auto-mode iteration events (1aff551)
- feat: add context compaction control (9bcbb7e)
- feat: add tools registry (2816202)
- feat: add skill generation (cdeb63c)
- feat: add project learning updates (db05707)
- feat: add project learning recommendations (52fce3b)
- feat: add MCP invocation responses (5f25a48)
- feat: add VS Code MCP tool registration (4129e0e)
- feat: add timed YOLO mode (262938a)
- feat: add session attachment (4832e6f)
- feat: add session details (2b724b1)
- feat: add session history (f9a28d4)
- feat: add multi-file change decisions (9f114af)
- feat: add directory access acknowledgement (bb6beb8)
- feat: add directory access responses (11f0252)
- feat: add permission acknowledgement (c3f847e)
- ci: release from detached tagged commits (b7477d0)
- fix: validate session control RPC results (306c40e)
- feat: add auto-mode iteration log (bad4d74)
- feat: add auto-mode cancellation (205abe0)
- feat: add auto-mode resume (0fa544c)
- feat: add auto-mode pause (5abfa1a)
- feat: add auto-mode status (aa7bb95)
- feat: add auto-mode start (00bf7ec)
- feat: add latest browser handoff attachment (ed61f23)
- feat: add browser handoff attachment (be8e31a)
- feat: add browser handoff creation (95aff87)
- feat: add conversation reset (9e15384)
- feat: harden transport and add discovery APIs (6a43c02)

## Unreleased

### Added

- Added typed skill registry discovery and installation APIs.
- Added typed MCP server, tool, and persisted-configuration inspection APIs.
- Added a reproducible p95 startup benchmark with a strict 50 ms budget.

### Fixed

- Removed the 500 ms startup delay and made process startup, shutdown, and retries race-safe.
- Reject pending requests immediately on child exit, write failure, timeout, or stdout closure.
- Forward the documented generic `env` option and retain bounded stderr diagnostics.
- Roll back partially initialized SDK sessions instead of leaving a poisoned live process.
- Broadcast events to independent bounded subscribers, close iterators on shutdown, and prevent stale prompt-stream reads from consuming later notifications.
- Serialize prompt operations without blocking control RPCs, abort abandoned streams before admitting the next prompt, and fail immediately if stdout closes while the child remains alive.
- Reap TERM-ignoring children after stdout EOF, including when their final JSON frame has no newline, and ship the startup benchmark in the npm package that references it.
- Wait for terminal work in non-streaming prompts and isolate each prompt from stale pre-request event backlog.
- Coordinate `stop()` with pre-spawn startup work so deferred binary detection or skill copying cannot create an orphan child after shutdown returns.
- Make every caller of a coalesced start observe the same spawn failure, and drain all complete buffered JSON frames before applying stdout-EOF termination.
- Reject malformed matching JSON-RPC result/error envelopes explicitly instead of clearing their timeout and orphaning the caller.
- Make SDK `start()` wait for an in-flight `stop()` and coalesce every post-stop restart caller onto the fresh session.
- Refuse to commit SDK startup if the CLI terminates immediately after acknowledging its final configuration RPC.

## v1.0.3 - 2026-07-16

> Stable release.

### Changes

- Added a published autoresearch and replayable-ledger guide with a runnable TypeScript example.
- Documented the complete typed lifecycle across initialization, evaluation, replay, rescoring, comparison, Pareto analysis, pinning, and pruning.
- Added strict example typechecking and clean-checkout bundling for the SDK's public self-import.
- Added durable v1.0.2 and v1.0.3 release notes plus protected-branch recovery guidance.
- Kept GitHub releases in draft state until npm publication succeeds and made historical note refreshes target the requested tag.

## v1.0.2-alpha.15.dbdc851 - 2026-07-15

> Bleeding edge alpha build from main.

### Changes

- Keep published SDK examples buildable from clean checkouts (dbdc851)
- Document replayable autoresearch SDK workflows (eb58e35)

## v1.0.2-alpha.13.eb58e35 - 2026-07-15

> Bleeding edge alpha build from main.

### Changes

- Document replayable autoresearch SDK workflows (eb58e35)

## v1.0.2 - 2026-07-15

> Stable release.

### Changes

- Expose replayable autoresearch decisions through the SDK (c2177f5)
- Refresh bundled CLI binaries with autoresearch support (5a66849)
- Expose typed autoresearch lifecycle in the TypeScript SDK (5af03fe)
- Bring the TypeScript SDK to current CLI feature parity (bb23840)
- ci: fix npm access preflight (10e6aca)
- ci: preflight npm publish permissions (072d08c)
- ci: automate alpha and stable sdk releases (2ff35ae)
- ci: allow publishing existing sdk releases (f249ed3)
- docs: clarify npm trusted publisher setup (d868449)
- ci: use trusted publishing for npm releases (68bb73d)
- ci: publish npm from sdk release workflow (9392e36)

## v1.0.1-alpha.9.c2177f5 - 2026-07-15

> Bleeding edge alpha build from main.

### Changes

- Expose replayable autoresearch decisions through the SDK (c2177f5)
- Refresh bundled CLI binaries with autoresearch support (5a66849)
- Expose typed autoresearch lifecycle in the TypeScript SDK (5af03fe)
- Bring the TypeScript SDK to current CLI feature parity (bb23840)
- ci: fix npm access preflight (10e6aca)
- ci: preflight npm publish permissions (072d08c)
- ci: automate alpha and stable sdk releases (2ff35ae)
- ci: allow publishing existing sdk releases (f249ed3)
- docs: clarify npm trusted publisher setup (d868449)
- ci: use trusted publishing for npm releases (68bb73d)
- ci: publish npm from sdk release workflow (9392e36)

## v1.0.1-alpha.2.2ff35ae - 2026-06-26

> Bleeding edge alpha build from main.

### Changes

- ci: automate alpha and stable sdk releases (2ff35ae)
- ci: allow publishing existing sdk releases (f249ed3)
- docs: clarify npm trusted publisher setup (d868449)
- ci: use trusted publishing for npm releases (68bb73d)
- ci: publish npm from sdk release workflow (9392e36)

All notable changes to `@autohandai/agent-sdk` are recorded here.

## v1.0.1 - 2026-06-26

### Changes

- Added versioned GitHub release automation for the TypeScript SDK.
- Added npm package artifact and README packaging checks.
- Expanded SDK hook event coverage.
