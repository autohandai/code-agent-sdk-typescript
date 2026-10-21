# Migrating from the Claude Agent SDK

**UNRELEASED.** The `/claude` entry point is an implementation draft, not a
published drop-in replacement. The official-example acceptance result is 0/2.
See [COMPAT.md](../COMPAT.md) for the supported surface and release blockers.

## Current account requirement

The intended migration changes one import and adds an Autohand account key:

```diff
- import { query } from '@anthropic-ai/claude-agent-sdk';
+ import { query } from '@autohandai/agent-sdk/claude';
```

Get a free Autohand API key with a verified account at
<https://console.autohand.ai/api-keys> and set `AUTOHAND_API_KEY` in your server
or CI environment. This account key is required for hosted models, BYOK and
local models. The SDK fails before spawning the CLI if it is missing or blank.
`AUTOHAND_AI_API_KEY` is accepted as a legacy alias; the documented name
`AUTOHAND_API_KEY` takes precedence when both are present.

For Anthropic BYOK, retain your existing `ANTHROPIC_API_KEY`. This means adding
one Autohand environment variable while keeping the provider key you already
use, rather than claiming one credential can authenticate to both services.
An unset model or a Claude model uses Anthropic when that key is present.
Explicit hosted models such as `fantail` use the Autohand provider. Explicit
provider/model-prefix selection takes precedence.

Anthropic credentials are used only for Anthropic provider calls. They are
never copied into `AUTOHAND_API_KEY`, `AUTOHAND_AI_API_KEY` or the CLI's account
authentication field. `options.apiKey` selects a provider credential; it does
not remove the required Autohand account key. Session environment overrides
are scoped to the CLI process and do not rewrite your global configuration.

CLI authentication is unchanged. A possible no-account BYOK/local mode remains
Q-0061, awaiting Igor's decision, and would come through F-0091 local-only mode.

## Runtime limits

Existing native allowed/disallowed tool flags and request/token caps are reused.
`maxTurns` currently caps total model requests, including subagents, and is not
exact Claude main-agent turn accounting. `--max-cost` and `maxBudgetUsd` are
unsupported. A request or token cap must not be described as a dollar budget.

The compatibility facade still rejects `acceptEdits`, unsupported permission
callbacks and hooks, structured output and selective Claude configuration
import. Passing the account preflight does not make unsupported examples work.
Python compatibility is not implemented. Do not publish this guide or the
one-import migration claim until the release acceptance requirements pass.
