# Autohand SDK Implementation Status

## Overview

The SDK now has a comprehensive API surface similar to Anthropic's Claude Agent SDK, but many features require corresponding RPC method implementations in the CLI.

## Implemented Features

### SDK Configuration (50+ Options)

**Basic Configuration:**
- ✅ cwd, cliPath, debug, timeout

**Provider Configuration:**
- ✅ config, model, fallbackModel, maxTurns, maxBudgetUsd

**Tool Configuration:**
- ✅ allowedTools, disallowedTools, canUseTool callback

**Permission Configuration:**
- ✅ permissionMode (6 modes), yoloPattern, yoloTimeout

**System Prompt:**
- ✅ systemPrompt, appendSystemPrompt

**Session Configuration:**
- ✅ persistSession, sessionId, resume, continue

**Workspace:**
- ✅ additionalDirectories

**Environment:**
- ✅ env

**Thinking:**
- ✅ thinking (none, normal, extended, enabled, adaptive)
- ✅ effort (low, medium, high, max)

**Sandbox:**
- ✅ enabled, failIfUnavailable
- ✅ filesystem (allowWrite, denyWrite, denyRead, allowRead, allowManagedReadPathsOnly)
- ✅ network (allowedDomains, allowManagedDomainsOnly, allowUnixSockets, allowAllUnixSockets, allowLocalBinding, allowMachLookup, httpProxyPort, socksProxyPort)
- ✅ ignoreViolations

**File Checkpointing:**
- ✅ enableFileCheckpointing

**MCP:**
- ✅ mcpServers (full McpServerConfig interface)

**Hooks:**
- ✅ hooks (Record<string, HookFunction>)
- ✅ onElicitation callback

**Plugins:**
- ✅ plugins array

**Output:**
- ✅ outputFormat (text, json)

**Advanced:**
- ✅ pathToClaudeCodeExecutable, spawnClaudeCodeProcess, extraArgs
- ✅ debugFile, strictMcpConfig, betas, taskBudget

### SDK Control Methods (Like Anthropic's Query Interface)

**Lifecycle:**
- ✅ start(), stop(), close()

**Prompt Methods:**
- ✅ prompt(), streamPrompt(), streamInput()

**Control Methods:**
- ✅ interrupt()
- ⏳ setPermissionMode() - needs CLI RPC method
- ⏳ setModel() - needs CLI RPC method
- ⏳ setMaxThinkingTokens() - needs CLI RPC method
- ⏳ applyFlagSettings() - needs CLI RPC method

**Information Methods:**
- ✅ initializationResult()
- ⏳ supportedCommands() - needs CLI RPC method
- ⏳ supportedModels() - needs CLI RPC method
- ⏳ supportedAgents() - needs CLI RPC method
- ⏳ mcpServerStatus() - needs CLI RPC method
- ⏳ getContextUsage() - needs CLI RPC method
- ⏳ reloadPlugins() - needs CLI RPC method
- ⏳ accountInfo() - needs CLI RPC method

**MCP Server Management:**
- ⏳ reconnectMcpServer() - needs CLI RPC method
- ⏳ toggleMcpServer() - needs CLI RPC method
- ⏳ setMcpServers() - needs CLI RPC method

**File Checkpointing:**
- ⏳ rewindFiles() - needs CLI RPC method
- ⏳ seedReadState() - needs CLI RPC method

**State and Messages:**
- ✅ getState(), getMessages(), abort()

**Permission Handling:**
- ✅ permissionResponse()

**Event Streaming:**
- ✅ events()

**Utility Methods:**
- ✅ isStarted(), isConnected(), getConfig(), updateConfig()

### Event Types (13 Events)

- ✅ agent_start, agent_end
- ✅ turn_start, turn_end
- ✅ message_start, message_update, message_end
- ✅ tool_start, tool_update, tool_end
- ✅ permission_request
- ✅ error

**Missing Hook Events (from Anthropic SDK):**
- ⏳ pre_tool, post_tool
- ⏳ file_modified
- ⏳ pre_prompt, post_response
- ⏳ session_error
- ⏳ stop
- ⏳ session_start, session_end
- ⏳ subagent_stop
- ⏳ notification
- ⏳ (10+ more hook events)

## Required CLI RPC Protocol Extensions

To fully support the SDK's feature set, the CLI needs to implement the following RPC methods:

### Control Methods

```typescript
// Change permission mode mid-session
autohand.setPermissionMode(mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto')

// Change model mid-session
autohand.setModel(model?: string)

// Set thinking budget
autohand.setMaxThinkingTokens(maxThinkingTokens: number | null)

// Apply flag settings
autohand.applyFlagSettings(settings: Partial<SDKConfig>)
```

### Information Methods

```typescript
// Get supported commands
autohand.getSupportedCommands() -> string[]

// Get supported models
autohand.getSupportedModels() -> ModelInfo[]

// Get supported agents
autohand.getSupportedAgents() -> AgentInfo[]

// Get MCP server status
autohand.getMcpServerStatus() -> McpServerStatus[]

// Get context usage
autohand.getContextUsage() -> ContextUsage

// Reload plugins
autohand.reloadPlugins() -> ReloadPluginsResult

// Get account info
autohand.getAccountInfo() -> AccountInfo
```

### MCP Server Management

```typescript
// Reconnect MCP server
autohand.reconnectMcpServer(serverName: string)

// Toggle MCP server
autohand.toggleMcpServer(serverName: string, enabled: boolean)

// Set MCP servers
autohand.setMcpServers(servers: Record<string, McpServerConfig>) -> McpSetServersResult
```

### File Checkpointing

```typescript
// Rewind files
autohand.rewindFiles(userMessageId: string, options?: { dryRun?: boolean }) -> RewindFilesResult

// Seed read state
autohand.seedReadState(path: string, mtime: number)
```

### Hook Events

The CLI needs to emit the following hook notifications:

```typescript
autohand.hook.preTool
autohand.hook.postTool
autohand.hook.fileModified
autohand.hook.prePrompt
autohand.hook.postResponse
autohand.hook.sessionError
autohand.hook.stop
autohand.hook.sessionStart
autohand.hook.sessionEnd
autohand.hook.subagentStop
autohand.hook.notification
```

### Configuration Application

The CLI needs to accept configuration at startup via command-line flags:

```bash
autohand --mode rpc \
  --permission-mode default \
  --allowed-tools read,write \
  --disallowed-tools delete \
  --system-prompt @file.txt \
  --append-system-prompt "additional context" \
  --session-id uuid \
  --resume \
  --additional-dir /path/to/dir \
  --thinking normal \
  --sandbox-enabled \
  --enable-file-checkpointing \
  ...
```

## Next Steps

### Immediate (High Priority)

1. **Implement basic control RPC methods in CLI:**
   - setPermissionMode
   - setModel
   - setMaxThinkingTokens

2. **Add configuration flags to CLI:**
   - --permission-mode
   - --allowed-tools
   - --disallowed-tools
   - --system-prompt
   - --append-system-prompt
   - --thinking
   - --sandbox-enabled
   - --enable-file-checkpointing

3. **Implement hook event notifications in CLI:**
   - pre_tool
   - post_tool
   - file_modified
   - pre_prompt
   - post_response

### Medium Priority

4. **Implement information RPC methods:**
   - getSupportedCommands
   - getSupportedModels
   - getContextUsage

5. **Implement MCP management RPC methods:**
   - getMcpServerStatus
   - toggleMcpServer
   - setMcpServers

6. **Implement session management RPC methods:**
   - resumeSession
   - forkSession

### Long-term (Advanced Features)

7. **Implement file checkpointing:**
   - rewindFiles
   - seedReadState

8. **Implement advanced hooks:**
   - session lifecycle hooks
   - subagent hooks

9. **Implement plugin system:**
   - reloadPlugins
   - plugin discovery

## Architecture Notes

### SDK Side

The SDK is now feature-complete in terms of API surface. All methods are defined and typed. The TODO comments indicate which methods require CLI RPC protocol support.

### CLI Side

The CLI RPC protocol needs to be extended to support:
1. Dynamic configuration changes (setPermissionMode, setModel, etc.)
2. Information queries (getSupportedModels, getContextUsage, etc.)
3. MCP server management (toggle, set, status)
4. File checkpointing (rewind, seed)
5. Hook event emissions (pre_tool, post_tool, etc.)

### Configuration Flow

**Option 1: CLI Flags (Recommended)**
- Configuration passed as CLI flags at startup
- Limited to startup-time configuration
- Simpler to implement

**Option 2: RPC Configuration**
- Configuration sent via RPC methods
- Allows mid-session configuration changes
- More complex but more flexible

**Option 3: Hybrid (Best)**
- Startup configuration via CLI flags
- Dynamic changes via RPC methods
- Best of both worlds

## Comparison with Anthropic SDK

| Feature | Anthropic SDK | Autohand SDK | Status |
|---------|--------------|--------------|--------|
| Control Methods | 15+ | 15+ | ✅ API defined, ⏳ CLI support needed |
| Configuration Options | 50+ | 50+ | ✅ API defined, ⏳ CLI flags needed |
| Hook Events | 25+ | 13 | ⏳ CLI needs to emit more events |
| Permission Modes | 6 | 6 | ✅ API defined, ⏳ CLI support needed |
| Tool Selection | Yes | Yes | ✅ API defined, ⏳ CLI support needed |
| MCP Management | Yes | Yes | ✅ API defined, ⏳ CLI RPC methods needed |
| File Checkpointing | Yes | Yes | ✅ API defined, ⏳ CLI RPC methods needed |
| Session Management | Yes | Yes | ✅ API defined, ⏳ CLI RPC methods needed |

## Conclusion

The SDK now has a comprehensive API surface that matches Anthropic's SDK in terms of feature set. The main work remaining is:

1. **CLI RPC Protocol Extensions** - Add new RPC methods to support dynamic configuration and information queries
2. **CLI Command-Line Flags** - Add flags for startup-time configuration
3. **Hook Event Emissions** - Emit additional hook events from the CLI
4. **Testing** - Test all features end-to-end once CLI support is added

The SDK is ready to use for basic operations (prompt, streamPrompt, getState, getMessages, etc.), but advanced features (setPermissionMode, setModel, MCP management, etc.) require CLI support.
