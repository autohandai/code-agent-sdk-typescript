# Agent CLI comparison harness

The comparison harness sends one read-only prompt to Autohand, Cursor Agent,
and Pi concurrently. It records the exact command, duration, exit code, signal,
stdout, and stderr for every CLI in one normalized report.

```bash
bun run compare:agents -- \
  --workspace /path/to/repository \
  --prompt "Review the public API without editing files." \
  --agents autohand,cursor,pi \
  --timeout-ms 120000 \
  --json
```

The default adapters deliberately disable writes:

- Autohand uses patch mode, which captures proposed changes without applying
  them, plus `stream-json`.
- Cursor uses ask mode and `stream-json`.
- Pi enables only `read`, `grep`, `find`, and `ls`, with an ephemeral session
  and package/skill/theme discovery disabled for a stable baseline. The harness
  sets `PI_OFFLINE=1` to prevent package updates during the measured startup;
  model requests still use Pi's configured provider.

Each CLI uses its existing local authentication. No credentials are accepted
as harness arguments or included in reports. A missing executable is reported
as `unavailable`; a non-zero exit as `failed`; and a process that exceeds its
budget as `timed_out`. Vendor stream errors, including a Pi message with
`stopReason: "error"` and an Autohand permission denial, also fail the run even
when the CLI process exits with code zero. The harness exits with code `2` when
any candidate does not pass.

Use these environment variables when binaries are not on `PATH`, or when an
E2E fixture needs to provide a controlled executable:

```bash
AUTOHAND_COMPARE_AUTOHAND_BIN=/path/to/autohand
AUTOHAND_COMPARE_CURSOR_BIN=/path/to/cursor-agent
AUTOHAND_COMPARE_PI_BIN=/path/to/pi
```

The report compares execution behavior and latency. It does not claim semantic
answer quality; evaluate that separately with task-specific assertions.
