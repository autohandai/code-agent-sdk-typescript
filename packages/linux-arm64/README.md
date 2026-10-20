# Autohand CLI for linux-arm64

This optional package supplies the verified Autohand CLI 0.9.8 binary for
`@autohandai/agent-sdk`. npm and Bun select it for the matching operating system
and architecture. This package requires glibc. It doesn't run on Alpine or other musl-based systems.

The SDK also supports an explicit `cliPath`, `AUTOHAND_CLI_PATH`, or an
`autohand` installation on PATH. See [Agent SDK](https://autohand.ai/code/sdk/).
