# Changelog

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

## Unreleased

- Added typed autoresearch start, status, and stop RPC methods.
- Added autoresearch lifecycle events, hook types, benchmark options, and persisted state types.
- Registered `/autoresearch` as a current CLI capability alongside the streamed slash-command helper.
- Added typed autoresearch history, replay, rescore, comparison, Pareto, pin, and prune methods.
- Added adaptive sampling, secondary objective, hard constraint, retention, and safe environment options.
- Added replayable evaluation and decision records plus ledger-operation notification and hook phases.

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
