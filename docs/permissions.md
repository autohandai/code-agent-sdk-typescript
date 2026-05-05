# Permissions

The Autohand CLI asks before executing shell commands, file writes, and other destructive tools. The SDK surfaces these requests as events and lets you respond programmatically.

## Permission Modes

Set the mode when creating the SDK instance:

```typescript
const sdk = new AutohandSDK({
  permissionMode: 'interactive',  // Ask every time (default)
});
```

| Mode | Behavior |
|---|---|
| `interactive` | Emit `permission_request` events. Your code decides. |
| `unrestricted` | Allow everything without asking. |
| `restricted` | Deny risky tools automatically. |
| `external` | Delegate decisions to a configured callback. |

Legacy aliases like `default` and `bypassPermissions` still work but should not be used in new code.

## Responding to Permission Requests

During `streamPrompt()`, watch for `permission_request` events:

```typescript
for await (const event of sdk.streamPrompt({ message: 'Run tests' })) {
  if (event.type === 'permission_request') {
    console.log(`Tool: ${event.tool}`);
    console.log(`Description: ${event.description}`);

    await sdk.permissionResponse({
      requestId: event.requestId,
      allowed: true,   // or false
    });
  }
}
```

## Granular Control

Use `PermissionSettings` for fine-grained rules:

```typescript
const sdk = new AutohandSDK({
  permissions: {
    mode: 'interactive',
    allowList: ['read_file', 'write_file', 'git_status'],
    denyList: ['delete_path', 'run_command'],
    allowPatterns: ['git *', 'npm install'],
    denyPatterns: ['rm -rf', 'sudo'],
  },
});
```

Tools matching `allowList` pass through. Tools matching `denyList` are blocked. Patterns are matched with simple glob-like rules.

## Yolo Patterns

For unattended scripts, auto-approve tools matching a pattern:

```typescript
const sdk = new AutohandSDK({
  yolo: 'allow:read,write',
  yoloTimeout: 60,  // Auto-approve expires after 60 seconds.
});
```

## Changing Mode at Runtime

```typescript
await sdk.setPermissionMode('unrestricted');
await sdk.setPermissionMode('interactive');
```

This calls `autohand.permissionModeSet` over JSON-RPC and updates the local config.

## Permission Decision Scopes

When responding, you can scope the decision:

```typescript
await sdk.permissionResponse({
  requestId: event.requestId,
  allowed: true,
  remember: true,   // Remember this decision for the session.
});
```

Set `remember: false` to ask again next time the same tool is called.
