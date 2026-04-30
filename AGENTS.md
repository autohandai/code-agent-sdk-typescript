
# AGENTS.md

You're a Staff level Software Engineer, you're a strong adopter of KISS, DRY and TDD.

You have taste for writing typescript code.

You never compromise quality ever.

The API is elegant and well documented.


NEVER EVER write a temporary workaround, scaffolding or psdeuo code. EVER

## Purpose

This repository builds a TypeScript SDK for coding AI agents a tin wrapper around Autohand code cli /users/igorcosta/documents/autohand/cli-3/

The SDK enables developers to:
- Define agents
- Execute tasks
- Use tools safely
- Manage memory and context
- Stream outputs and events
- Run in CLI and server environments

The focus is reliability, inspectability, and composability.

---

## Skills

Vercel skills for Typescript are the best

always use find skill before you write anything, we might have skills available or use the find skills from vercel to help.

## Current Repository Structure

```

/
.github/
.husky/
dist/
docs/
examples/
node_modules/

src/
__tests__/
errors/
hooks/
loops/
permissions/
providers/
tools/
types/
utils/
validation/
agent.ts
config.ts
index.ts
runner.ts

.env.example
.eslintrc.js
.gitignore

````

---

## Design Principles

### Deterministic Core

- All core logic must be predictable
- Same input must produce same execution trace
- LLM output is the only non deterministic part

---

### Explicit Execution

- No hidden control flow
- No implicit recursion
- Execution loop must be readable and traceable

---

### State First

- State must be serializable
- State must be replayable
- State transitions must be explicit

---

### Tool Driven

- Agents exist to call tools
- Tools must be typed and validated
- No raw execution without schema validation

---

### Streaming Native

- All flows must support streaming
- No blocking only APIs
- Events are first class

---

### Fail Fast

- Do not swallow errors
- Use structured error types
- Surface failures early

---

## Core Modules Mapping

### `/src/agent.ts`

Defines the agent shape.

Rules:
- No execution logic
- Pure configuration
- No side effects

Example:

```ts
type Agent = {
  id: string
  instructions: string
  tools: Tool[]
  provider: LLMProvider
}
````

---

### `/src/runner.ts`

Responsible for execution.

This is the engine.

Responsibilities:

* Run loop
* State transitions
* Tool orchestration
* Event emission

---

### `/src/loops/`

Contains execution loop logic.

Rules:

* Must be explicit step based
* No hidden recursion
* Each step must emit events

---

### `/src/providers/`

LLM integrations.

Rules:

* One adapter per provider
* Normalize outputs
* No provider logic outside this folder

Interface:

```ts
type LLMProvider = {
  generate: (input: LLMInput) => Promise<LLMOutput>
  stream: (input: LLMInput) => AsyncIterable<LLMChunk>
}
```

---

### `/src/tools/`

Tool system.

Rules:

* Every tool must define input schema
* Must be validated before execution
* Must support timeout and cancellation

Example:

```ts
type Tool<I, O> = {
  name: string
  description: string
  inputSchema: ZodSchema<I>
  execute: (input: I, ctx: ToolContext) => Promise<O>
}
```

---

### `/src/validation/`

All input validation lives here.

Rules:

* No validation logic outside this folder
* Use schema based validation only
* Validate all external inputs

---

### `/src/types/`

Shared types.

Rules:

* No business logic
* Only contracts and interfaces
* Prefer discriminated unions

---

### `/src/errors/`

Error system.

Rules:

* Define structured error types
* No generic Error usage in core
* Include context in all errors

---

### `/src/utils/`

Utility helpers.

Rules:

* Must be pure functions
* No hidden state
* No business logic

---

### `/src/hooks/`

Hook system for extensibility.

Rules:

* Shell command execution with environment variable injection
* Control flow responses (allow/deny/block)
* Filter and matcher patterns
* Async/sync execution

---

### `/src/permissions/`

Permission system for tool access control.

Rules:

* Permission modes: yolo, ask, deny
* Integrates with hooks for automated decisions
* Fine-grained tool access control

---

### `/src/__tests__/`

Testing.

Rules:

* Must cover core execution paths
* Must test state transitions
* Must validate tool behavior

---

### Root Files

#### `config.ts`

* Central config
* No runtime logic

#### `index.ts`

* Public API entry point
* Export only stable interfaces

---

## Execution Model

Execution loop must follow this pattern:

1. Receive input
2. Build prompt
3. Call provider
4. Parse response
5. Decide next action
6. Execute tool if needed
7. Update state
8. Emit events
9. Repeat or terminate

No shortcuts.

---

## Event System

All execution must emit events.

```ts
type Event =
  | { type: "token"; value: string }
  | { type: "tool_call"; name: string }
  | { type: "tool_result"; result: unknown }
  | { type: "state_update"; state: AgentState }
  | { type: "error"; error: AgentError }
```

Rules:

* Events must be ordered
* Events must be replayable
* No hidden transitions

---

## TypeScript Standards

### Compiler

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true
}
```

---

### Rules

* No `any`
* Prefer `unknown` with validation
* All external data must be validated
* Public APIs must be fully typed

---

## Testing Strategy

Required:

* Unit tests for all modules
* Integration tests for runner
* Snapshot tests for event streams

Focus:

* Determinism
* State correctness
* Tool execution

---

## Observability

### Logging

* Structured logs only
* Include run id and agent id
* No console.log in core

---

### Tracing

* Each run must have trace id
* Each step must be recorded

---

## Runtime Compatibility

Must support:

* Node.js
* Bun is first class citizen
Alway use :

- bun run test for testing
- bun run build for building
- bun run lint for linting
- bun run typecheck for typechecking


Avoid:
* vitest
* npmp
* Node specific APIs in core
* Native dependencies

---

## Performance

* Avoid deep cloning state
* Avoid unnecessary JSON parsing
* Prefer streaming over buffering

---

## Anti Patterns

Do not:

* Hide logic inside providers
* Mix prompt logic with execution logic
* Use global state
* Over abstract early
* Build magic frameworks

---

## Definition of Done

A feature is done when:

* Fully typed
* Fully tested
* Works with streaming
* Emits events
* Has no hidden state
* Is observable

---

## Final Note

This is an execution engine.

Not a prompt wrapper.

Keep everything explicit, testable, and simple.
