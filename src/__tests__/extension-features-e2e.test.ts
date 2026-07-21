import { afterEach, describe, expect, it } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AutohandSDK } from '../index.js';

const temporaryDirectories: string[] = [];

async function createFeatureCli(options: {
  method: string;
  params: Record<string, unknown>;
  result: unknown;
  notifications?: Array<{ method: string; params: Record<string, unknown> }>;
}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'autohand-ts-features-'));
  temporaryDirectories.push(directory);
  const cliPath = join(directory, 'fake-feature-cli.cjs');
  const fixture = JSON.stringify(options);
  await writeFile(cliPath, `#!/usr/bin/env node
const readline = require('node:readline');
const fixture = ${fixture};
const lines = readline.createInterface({ input: process.stdin });
(async () => {
for await (const line of lines) {
  const request = JSON.parse(line);
  if (request.method === 'autohand.getState') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        status: 'idle',
        sessionId: null,
        model: 'fake',
        workspace: process.cwd(),
        contextPercent: 0,
        messageCount: 0,
      },
    }) + '\\n');
    for (const notification of fixture.notifications ?? []) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        method: notification.method,
        params: notification.params,
      }) + '\\n');
    }
    continue;
  }
  if (request.method !== fixture.method
    || JSON.stringify(request.params ?? {}) !== JSON.stringify(fixture.params)) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32602, message: 'unexpected method or params' },
    }) + '\\n');
    continue;
  }
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0',
    id: request.id,
    result: fixture.result,
  }) + '\\n');
}
})();
`);
  await chmod(cliPath, 0o755);
  return cliPath;
}

async function withSDK<T>(
  options: Parameters<typeof createFeatureCli>[0],
  run: (sdk: AutohandSDK) => Promise<T>
): Promise<T> {
  const cliPath = await createFeatureCli(options);
  const sdk = new AutohandSDK({ cliPath, timeout: 10_000 });
  await sdk.start();
  try {
    return await run(sdk);
  } finally {
    await sdk.close();
  }
}

async function nextNotification(sdk: AutohandSDK) {
  const events = sdk.events();
  const next = events.next();
  await sdk.getState();
  const event = await next;
  await events.return(undefined);
  return event.value;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('extension RPC features', () => {
  it('acknowledges a permission request through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.permissionAcknowledged',
      params: { requestId: 'permission-1' },
      result: { success: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.acknowledgePermission(fixture.params)
    )).resolves.toEqual({ success: true });
  });

  it('rejects a malformed permission acknowledgement result', async () => {
    const fixture = {
      method: 'autohand.permissionAcknowledged',
      params: { requestId: 'permission-1' },
      result: { success: 'yes' },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.acknowledgePermission(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.permissionAcknowledged/);
  });

  it('responds to directory access through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.directoryAccessResponse',
      params: { requestId: 'directory-1', granted: true },
      result: { success: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.respondToDirectoryAccess(fixture.params)
    )).resolves.toEqual({ success: true });
  });

  it('rejects a malformed directory access response result', async () => {
    const fixture = {
      method: 'autohand.directoryAccessResponse',
      params: { requestId: 'directory-1', granted: false },
      result: { success: 1 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.respondToDirectoryAccess(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.directoryAccessResponse/);
  });

  it('acknowledges directory access through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.directoryAccessAcknowledged',
      params: { requestId: 'directory-1' },
      result: { success: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.acknowledgeDirectoryAccess(fixture.params)
    )).resolves.toEqual({ success: true });
  });

  it('rejects a malformed directory access acknowledgement result', async () => {
    const fixture = {
      method: 'autohand.directoryAccessAcknowledged',
      params: { requestId: 'directory-1' },
      result: {},
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.acknowledgeDirectoryAccess(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.directoryAccessAcknowledged/);
  });

  it('applies a typed multi-file change decision through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.changesDecision',
      params: {
        batchId: 'batch-1',
        action: 'accept_selected' as const,
        selectedChangeIds: ['change-1'],
      },
      result: {
        success: true,
        appliedCount: 1,
        skippedCount: 1,
        errors: [{ changeId: 'change-2', error: 'conflict' }],
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.decideChanges(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects malformed multi-file change decision counts', async () => {
    const fixture = {
      method: 'autohand.changesDecision',
      params: { batchId: 'batch-1', action: 'accept_all' as const },
      result: { success: true, appliedCount: 'one', skippedCount: 0 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.decideChanges(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.changesDecision/);
  });

  it('gets paginated typed session history through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.getHistory',
      params: { page: 2, pageSize: 10 },
      result: {
        sessions: [{
          sessionId: 'session-1',
          createdAt: '2026-07-20T00:00:00.000Z',
          lastActiveAt: '2026-07-20T01:00:00.000Z',
          projectName: 'tin-wrapper',
          model: 'fantail',
          messageCount: 12,
          status: 'completed' as const,
        }],
        currentPage: 2,
        totalPages: 4,
        totalItems: 31,
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getHistory(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects session history entries with an unknown status', async () => {
    const fixture = {
      method: 'autohand.getHistory',
      params: {},
      result: {
        sessions: [{
          sessionId: 'session-1',
          createdAt: 't1',
          lastActiveAt: 't2',
          projectName: 'tin-wrapper',
          model: 'fantail',
          messageCount: 1,
          status: 'deleted',
        }],
        currentPage: 1,
        totalPages: 1,
        totalItems: 1,
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getHistory(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.getHistory/);
  });

  it('gets typed session details and messages through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.getSession',
      params: { sessionId: 'session-1' },
      result: {
        success: true as const,
        sessionId: 'session-1',
        projectName: 'tin-wrapper',
        model: 'fantail',
        messageCount: 1,
        status: 'completed',
        createdAt: '2026-07-20T00:00:00.000Z',
        lastActiveAt: '2026-07-20T01:00:00.000Z',
        summary: 'Implemented the feature.',
        messages: [{
          id: 'message-1',
          role: 'assistant' as const,
          content: 'Done',
          timestamp: '2026-07-20T01:00:00.000Z',
          toolCalls: [{ id: 'tool-1', name: 'write_file', args: { path: 'a.ts' } }],
        }],
        workspaceRoot: '/workspace',
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getSession(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('returns a typed missing-session result', async () => {
    const fixture = {
      method: 'autohand.getSession',
      params: { sessionId: 'missing' },
      result: { success: false as const, error: 'Session not found' },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getSession(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects incomplete successful session details', async () => {
    const fixture = {
      method: 'autohand.getSession',
      params: { sessionId: 'session-1' },
      result: { success: true, sessionId: 'session-1' },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getSession(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.getSession/);
  });

  it('attaches a saved session through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.session.attach',
      params: { sessionId: 'session-1' },
      result: {
        success: true,
        sessionId: 'session-1',
        workspaceRoot: '/workspace',
        messageCount: 8,
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.attachSession(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects a malformed saved-session attachment result', async () => {
    const fixture = {
      method: 'autohand.session.attach',
      params: { sessionId: 'session-1' },
      result: { success: false, error: 404 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.attachSession(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.session\.attach/);
  });

  it('sets timed YOLO mode through the canonical spawned-CLI method', async () => {
    const fixture = {
      method: 'autohand.yoloSet',
      params: { pattern: '*', timeoutSeconds: 300 },
      result: { success: true, expiresIn: 300 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.setYolo(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('supports the compatibility YOLO method alias', async () => {
    const fixture = {
      method: 'autohand.yolo.set',
      params: { pattern: 'bash:*', timeoutSeconds: 60 },
      result: { success: true, expiresIn: 60 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.setYoloCompat(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects a malformed timed YOLO result', async () => {
    const fixture = {
      method: 'autohand.yoloSet',
      params: { pattern: '' },
      result: { success: true, expiresIn: 'never' },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.setYolo(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.yoloSet/);
  });

  it('registers VS Code MCP tools through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.mcp.setVscodeTools',
      params: {
        tools: [{
          name: 'vscode.findReferences',
          description: 'Find symbol references',
          serverName: 'vscode',
          inputSchema: {
            type: 'object' as const,
            properties: { symbol: { type: 'string' } },
            required: ['symbol'],
          },
        }],
      },
      result: { success: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.setVscodeMcpTools(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects a malformed VS Code MCP registration result', async () => {
    const fixture = {
      method: 'autohand.mcp.setVscodeTools',
      params: { tools: [] },
      result: { success: null },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.setVscodeMcpTools(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.mcp\.setVscodeTools/);
  });

  it('sends an MCP invocation response through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.mcp.invokeResponse',
      params: { requestId: 'mcp-1', success: true, result: '{"matches":3}' },
      result: { success: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.respondToMcpInvocation(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects a malformed MCP invocation response acknowledgement', async () => {
    const fixture = {
      method: 'autohand.mcp.invokeResponse',
      params: { requestId: 'mcp-1', success: false, error: 'Tool failed' },
      result: { success: 'true' },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.respondToMcpInvocation(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.mcp\.invokeResponse/);
  });

  it('gets project learning recommendations through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.learn.recommend',
      params: { deep: true },
      result: {
        success: true,
        projectSummary: 'TypeScript SDK',
        audit: [{
          skill: 'old-testing',
          status: 'outdated' as const,
          reason: 'Uses a retired command',
        }],
        recommendations: [{
          slug: 'typescript-best-practices',
          score: 0.97,
          reason: 'Matches this repository',
        }],
        gapAnalysis: null,
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getLearningRecommendations(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects malformed project learning recommendation scores', async () => {
    const fixture = {
      method: 'autohand.learn.recommend',
      params: {},
      result: {
        success: true,
        projectSummary: 'SDK',
        audit: [],
        recommendations: [{ slug: 'testing', score: 'high', reason: 'Useful' }],
        gapAnalysis: 'Needs integration testing',
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getLearningRecommendations(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.learn\.recommend/);
  });

  it('updates learned project skills through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.learn.update',
      params: {},
      result: {
        success: true,
        updated: 1,
        unchanged: 1,
        results: [
          { name: 'typescript', status: 'updated' as const },
          { name: 'tdd', status: 'unchanged' as const },
        ],
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.updateLearnedSkills()
    )).resolves.toEqual(fixture.result);
  });

  it('rejects an unknown learned-skill update status', async () => {
    const fixture = {
      method: 'autohand.learn.update',
      params: {},
      result: {
        success: false,
        updated: 0,
        unchanged: 0,
        results: [{ name: 'typescript', status: 'skipped' }],
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.updateLearnedSkills()
    )).rejects.toThrow(/Invalid RPC result for autohand\.learn\.update/);
  });

  it('generates a project skill through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.learn.generate',
      params: { scope: 'project' as const },
      result: {
        success: true,
        skillName: 'tin-wrapper',
        skillPath: '/workspace/.autohand/skills/tin-wrapper/SKILL.md',
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.generateSkill(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects a malformed generated-skill path', async () => {
    const fixture = {
      method: 'autohand.learn.generate',
      params: { scope: 'user' as const },
      result: { success: true, skillName: 'shared', skillPath: 17 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.generateSkill(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.learn\.generate/);
  });

  it('gets the typed tools registry through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.getToolsRegistry',
      params: {},
      result: {
        tools: [{
          name: 'write_file',
          description: 'Write a file',
          requiresApproval: true,
          approvalMessage: 'Allow writing?',
          source: 'builtin' as const,
          scope: 'project' as const,
          disabled: false,
          createdAt: '2026-07-20T00:00:00.000Z',
          schemaVersion: 1,
          handlerPreview: 'write(path, content)',
          reuseHint: 'Use for complete file replacement',
        }],
        diagnostics: [{ file: 'tool.json', reason: 'duplicate ignored' }],
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getToolsRegistry()
    )).resolves.toEqual(fixture.result);
  });

  it('rejects tools registry entries with an unknown source', async () => {
    const fixture = {
      method: 'autohand.getToolsRegistry',
      params: {},
      result: {
        tools: [{ name: 'tool', description: 'Tool', source: 'remote' }],
        diagnostics: [],
      },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.getToolsRegistry()
    )).rejects.toThrow(/Invalid RPC result for autohand\.getToolsRegistry/);
  });

  it('controls context compaction through the spawned CLI', async () => {
    const fixture = {
      method: 'autohand.setContextCompact',
      params: { enabled: true },
      result: { enabled: true },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.setContextCompact(fixture.params)
    )).resolves.toEqual(fixture.result);
  });

  it('rejects a malformed context compaction result', async () => {
    const fixture = {
      method: 'autohand.setContextCompact',
      params: { enabled: false },
      result: { enabled: 0 },
    };

    await expect(withSDK(fixture, (sdk) =>
      sdk.setContextCompact(fixture.params)
    )).rejects.toThrow(/Invalid RPC result for autohand\.setContextCompact/);
  });
});

describe('extension notification features', () => {
  it('streams typed auto-mode iteration events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.automode.iteration',
      params: {
        sessionId: 'automode-1',
        iteration: 3,
        actions: ['edited src/index.ts', 'ran tests'],
        tokensUsed: 1_250,
        timestamp: '2026-07-20T00:03:00.000Z',
      },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };

    await expect(withSDK({
      method: 'unused',
      params: {},
      result: {},
      notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({
      type: 'automode_iteration',
      ...notification.params,
    });
  });

  it('drops malformed auto-mode iterations without hiding later valid events', async () => {
    const malformed = {
      method: 'autohand.automode.iteration',
      params: {
        sessionId: 'automode-1',
        iteration: 'three',
        actions: [],
        timestamp: '2026-07-20T00:03:00.000Z',
      },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };

    await expect(withSDK({
      method: 'unused',
      params: {},
      result: {},
      notifications: [malformed, sentinel],
    }, nextNotification)).resolves.toEqual({
      type: 'error',
      ...sentinel.params,
    });
  });

  it('streams typed auto-mode completion events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.automode.complete',
      params: {
        sessionId: 'automode-1',
        iterations: 8,
        filesCreated: 2,
        filesModified: 5,
        timestamp: '2026-07-20T00:08:00.000Z',
      },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'automode_complete', ...notification.params });
  });

  it('drops malformed auto-mode completion events', async () => {
    const malformed = {
      method: 'autohand.automode.complete',
      params: { sessionId: 'automode-1', iterations: 8, filesCreated: 2, filesModified: 'five', timestamp: 't' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'error', ...sentinel.params });
  });

  it('streams typed auto-mode error events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.automode.error',
      params: { sessionId: 'automode-1', error: 'Budget exceeded', timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'automode_error', ...notification.params });
  });

  it('drops malformed auto-mode error events', async () => {
    const malformed = {
      method: 'autohand.automode.error',
      params: { sessionId: 'automode-1', error: { message: 'bad' }, timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'error', ...sentinel.params });
  });

  it('streams typed pre-tool hook events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.hook.preTool',
      params: { toolId: 'tool-1', toolName: 'write_file', args: { path: 'a.ts' }, timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'hook_pre_tool', ...notification.params });
  });

  it('preserves malformed pre-tool hook events through the raw fallback', async () => {
    const malformed = {
      method: 'autohand.hook.preTool',
      params: { toolId: 'tool-1', toolName: 'write_file', args: 'a.ts', timestamp: 't1' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed],
    }, nextNotification)).resolves.toEqual({
      type: 'unknown_notification', method: malformed.method, params: malformed.params,
    });
  });

  it('streams typed post-tool hook events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.hook.postTool',
      params: { toolId: 'tool-1', toolName: 'write_file', success: true, duration: 42, output: 'ok', timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'hook_post_tool', ...notification.params });
  });

  it('preserves malformed post-tool hook events through the raw fallback', async () => {
    const malformed = {
      method: 'autohand.hook.postTool',
      params: { toolId: 'tool-1', toolName: 'write_file', success: true, duration: 'fast', timestamp: 't1' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed],
    }, nextNotification)).resolves.toEqual({
      type: 'unknown_notification', method: malformed.method, params: malformed.params,
    });
  });

  it('streams typed pre-prompt hook events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.hook.prePrompt',
      params: { instruction: 'Review this change', mentionedFiles: ['src/index.ts'], timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'hook_pre_prompt', ...notification.params });
  });

  it('preserves malformed pre-prompt hook events through the raw fallback', async () => {
    const malformed = {
      method: 'autohand.hook.prePrompt',
      params: { instruction: 'Review', mentionedFiles: [42], timestamp: 't1' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed],
    }, nextNotification)).resolves.toEqual({
      type: 'unknown_notification', method: malformed.method, params: malformed.params,
    });
  });

  it('streams typed post-response hook events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.hook.postResponse',
      params: { tokensUsed: 900, tokensUsageStatus: 'actual', toolCallsCount: 2, duration: 1250, timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'hook_post_response', ...notification.params });
  });

  it('preserves malformed post-response hook events through the raw fallback', async () => {
    const malformed = {
      method: 'autohand.hook.postResponse',
      params: { tokensUsed: 900, tokensUsageStatus: 'estimated', toolCallsCount: 2, duration: 1250, timestamp: 't1' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed],
    }, nextNotification)).resolves.toEqual({
      type: 'unknown_notification', method: malformed.method, params: malformed.params,
    });
  });

  const additionalHookCases = [
    {
      name: 'file-modified', method: 'autohand.hook.fileModified', type: 'file_modified',
      params: { filePath: 'src/index.ts', changeType: 'modify', toolId: 'tool-1', timestamp: 't1' },
      malformed: { filePath: 'src/index.ts', changeType: 'rename', toolId: 'tool-1', timestamp: 't1' },
    },
    {
      name: 'session-error', method: 'autohand.hook.sessionError', type: 'hook_session_error',
      params: { error: 'provider failed', code: 'PROVIDER_ERROR', context: { retryable: true }, timestamp: 't1' },
      malformed: { error: { message: 'provider failed' }, timestamp: 't1' },
    },
    {
      name: 'stop', method: 'autohand.hook.stop', type: 'hook_stop',
      params: { tokensUsed: 42, tokensUsageStatus: 'actual', toolCallsCount: 2, duration: 125, timestamp: 't1' },
      malformed: { tokensUsed: '42', tokensUsageStatus: 'actual', toolCallsCount: 2, duration: 125, timestamp: 't1' },
    },
    {
      name: 'session-start', method: 'autohand.hook.sessionStart', type: 'hook_session_start',
      params: { sessionType: 'resume', timestamp: 't1' },
      malformed: { sessionType: 'fork', timestamp: 't1' },
    },
    {
      name: 'session-end', method: 'autohand.hook.sessionEnd', type: 'hook_session_end',
      params: { reason: 'quit', duration: 250, timestamp: 't1' },
      malformed: { reason: 'timeout', duration: 250, timestamp: 't1' },
    },
    {
      name: 'subagent-stop', method: 'autohand.hook.subagentStop', type: 'hook_subagent_stop',
      params: { subagentId: 'sub-1', subagentName: 'reviewer', subagentType: 'worker', success: true, duration: 75, error: 'none', timestamp: 't1' },
      malformed: { subagentId: 'sub-1', subagentName: 'reviewer', subagentType: 'worker', success: 'yes', duration: 75, timestamp: 't1' },
    },
    {
      name: 'permission-request', method: 'autohand.hook.permissionRequest', type: 'hook_permission_request',
      params: { tool: 'write_file', path: 'src/index.ts', command: 'write', args: { force: false }, timestamp: 't1' },
      malformed: { tool: 'write_file', args: 'force', timestamp: 't1' },
    },
    {
      name: 'notification', method: 'autohand.hook.notification', type: 'hook_notification',
      params: { notificationType: 'info', message: 'Finished', timestamp: 't1' },
      malformed: { notificationType: 7, message: 'Finished', timestamp: 't1' },
    },
    {
      name: 'context-compacted', method: 'autohand.hook.contextCompacted', type: 'hook_context_compacted',
      params: { croppedCount: 3, summary: 'Earlier turns', usagePercent: 0.6125, reason: 'threshold', timestamp: 't1' },
      malformed: { croppedCount: '3', usagePercent: 0.6125, reason: 'threshold', timestamp: 't1' },
    },
    {
      name: 'context-overflow', method: 'autohand.hook.contextOverflow', type: 'hook_context_overflow',
      params: { tokensBefore: 12000, tokensAfter: 8000, croppedCount: 4, usagePercent: 1.05, timestamp: 't1' },
      malformed: { tokensBefore: '12000', tokensAfter: 8000, croppedCount: 4, usagePercent: 1.05, timestamp: 't1' },
    },
    {
      name: 'context-warning', method: 'autohand.hook.contextWarning', type: 'hook_context_warning',
      params: { usagePercent: 0.805, remainingTokens: 4096, timestamp: 't1' },
      malformed: { usagePercent: -0.1, remainingTokens: 4096, timestamp: 't1' },
    },
    {
      name: 'context-critical', method: 'autohand.hook.contextCritical', type: 'hook_context_critical',
      params: { usagePercent: 0.9575, remainingTokens: 1024, timestamp: 't1' },
      malformed: { usagePercent: 0.9575, remainingTokens: '1024', timestamp: 't1' },
    },
  ] as const;

  for (const hookCase of additionalHookCases) {
    it(`streams typed ${hookCase.name} hook events from the spawned CLI`, async () => {
      await expect(withSDK({
        method: 'unused', params: {}, result: {},
        notifications: [{ method: hookCase.method, params: hookCase.params }],
      }, nextNotification)).resolves.toEqual({ type: hookCase.type, ...hookCase.params });
    });

    it(`preserves malformed ${hookCase.name} hook events through the raw fallback`, async () => {
      await expect(withSDK({
        method: 'unused', params: {}, result: {},
        notifications: [{ method: hookCase.method, params: hookCase.malformed }],
      }, nextNotification)).resolves.toEqual({
        type: 'unknown_notification', method: hookCase.method, params: hookCase.malformed,
      });
    });
  }

  const fractionalContextCounterCases = [
    {
      method: 'autohand.hook.contextCompacted',
      params: { croppedCount: 0.5, usagePercent: 0.6125, reason: 'threshold', timestamp: 't1' },
    },
    {
      method: 'autohand.hook.contextOverflow',
      params: { tokensBefore: 12000.5, tokensAfter: 8000, croppedCount: 4, usagePercent: 1.05, timestamp: 't1' },
    },
    {
      method: 'autohand.hook.contextOverflow',
      params: { tokensBefore: 12000, tokensAfter: 8000.5, croppedCount: 4, usagePercent: 1.05, timestamp: 't1' },
    },
    {
      method: 'autohand.hook.contextOverflow',
      params: { tokensBefore: 12000, tokensAfter: 8000, croppedCount: 4.5, usagePercent: 1.05, timestamp: 't1' },
    },
    {
      method: 'autohand.hook.contextWarning',
      params: { usagePercent: 0.805, remainingTokens: 4096.5, timestamp: 't1' },
    },
    {
      method: 'autohand.hook.contextCritical',
      params: { usagePercent: 0.9575, remainingTokens: 1024.5, timestamp: 't1' },
    },
  ] as const;

  for (const hookCase of fractionalContextCounterCases) {
    it(`preserves fractional counters from ${hookCase.method} through the raw fallback`, async () => {
      await expect(withSDK({
        method: 'unused', params: {}, result: {},
        notifications: [{ method: hookCase.method, params: hookCase.params }],
      }, nextNotification)).resolves.toEqual({
        type: 'unknown_notification', method: hookCase.method, params: hookCase.params,
      });
    });
  }

  it('streams typed MCP invocation request events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.mcp.invokeRequest',
      params: { requestId: 'mcp-1', toolName: 'vscode.findReferences', args: { symbol: 'Agent' }, timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'mcp_invoke_request', ...notification.params });
  });

  it('drops malformed MCP invocation request events', async () => {
    const malformed = {
      method: 'autohand.mcp.invokeRequest',
      params: { requestId: 'mcp-1', toolName: 'tool', args: [], timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'error', ...sentinel.params });
  });

  it('streams typed MCP tools-changed events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.mcp.toolsChanged',
      params: { tools: [{ name: 'find', description: 'Find symbols', serverName: 'vscode' }], timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'mcp_tools_changed', ...notification.params });
  });

  it('drops malformed MCP tools-changed events', async () => {
    const malformed = {
      method: 'autohand.mcp.toolsChanged',
      params: { tools: [{ name: 'find', description: 'Find', serverName: 7 }], timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'error', ...sentinel.params });
  });

  it('streams typed learning progress events from the spawned CLI', async () => {
    const notification = {
      method: 'autohand.learn.progress',
      params: { status: 'loading-registry', timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'learn_progress', ...notification.params });
  });

  it('drops malformed learning progress events', async () => {
    const malformed = {
      method: 'autohand.learn.progress',
      params: { status: 'done', timestamp: 't1' },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [malformed, sentinel],
    }, nextNotification)).resolves.toEqual({ type: 'error', ...sentinel.params });
  });

  it('preserves unknown notifications through the public event stream', async () => {
    const notification = {
      method: 'autohand.future.event',
      params: { value: 7, nested: { retained: true } },
    };
    const sentinel = {
      method: 'autohand.error',
      params: { code: 500, message: 'sentinel', recoverable: true, timestamp: 'sentinel' },
    };
    await expect(withSDK({
      method: 'unused', params: {}, result: {}, notifications: [notification, sentinel],
    }, nextNotification)).resolves.toEqual({
      type: 'unknown_notification',
      method: notification.method,
      params: notification.params,
    });
  });
});
