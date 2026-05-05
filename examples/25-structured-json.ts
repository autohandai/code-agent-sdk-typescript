/**
 * Structured JSON output with the high-level Agent API.
 *
 * This is SDK-level JSON mode: the SDK instructs the agent to return JSON,
 * parses the final text, and lets you provide an optional validator.
 *
 * Usage:
 *   AUTOHAND_CLI_PATH=/path/to/autohand bun run examples/25-structured-json.ts
 */

import { Agent, StructuredOutputError } from '../src/index.js';

interface ReleaseRisk {
  summary: string;
  risks: Array<{
    title: string;
    severity: 'low' | 'medium' | 'high';
    mitigation: string;
  }>;
}

const cliPath = process.env.AUTOHAND_CLI_PATH;
const timeout = Number(process.env.AUTOHAND_TIMEOUT_MS ?? 120000);

function validateReleaseRisk(value: unknown): ReleaseRisk {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a JSON object.');
  }

  const candidate = value as {
    summary?: unknown;
    risks?: unknown;
  };

  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.risks)) {
    throw new Error('Expected { summary: string, risks: array }.');
  }

  const risks = candidate.risks.map((risk): ReleaseRisk['risks'][number] => {
    if (typeof risk !== 'object' || risk === null) {
      throw new Error('Expected risk entries to be objects.');
    }

    const item = risk as {
      title?: unknown;
      severity?: unknown;
      mitigation?: unknown;
    };

    if (
      typeof item.title !== 'string'
      || !['low', 'medium', 'high'].includes(String(item.severity))
      || typeof item.mitigation !== 'string'
    ) {
      throw new Error('Expected risk entries with title, severity, and mitigation.');
    }

    return {
      title: item.title,
      severity: item.severity as 'low' | 'medium' | 'high',
      mitigation: item.mitigation,
    };
  });

  return {
    summary: candidate.summary,
    risks,
  };
}

async function main(): Promise<void> {
  console.log('Starting Autohand agent...');

  const agent = await Agent.create({
    cwd: '.',
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    model: process.env.AUTOHAND_MODEL,
    instructions: 'Prefer concise, factual release-readiness analysis.',
    timeout,
  });

  try {
    console.log('Agent started. Requesting structured JSON...\n');

    const run = await agent.send([
      'Assess this SDK repository for publish readiness. Do not execute commands.',
      '',
      'Return only valid JSON. Do not wrap the response in Markdown.',
      'The JSON value should satisfy: ReleaseRisk.',
      'Use this JSON schema or example shape:',
      JSON.stringify({
        summary: 'string',
        risks: [
          {
            title: 'string',
            severity: 'low | medium | high',
            mitigation: 'string',
          },
        ],
      }, null, 2),
      'If you cannot inspect the repository, still return a JSON object.',
      'Use summary to explain the limitation and set risks to an empty array if no risks can be assessed.',
    ].join('\n'));

    for await (const event of run.stream()) {
      switch (event.type) {
        case 'agent_start':
          console.log(`[agent] ${event.sessionId} using ${event.model}`);
          break;
        case 'message_update':
          process.stdout.write(event.delta);
          break;
        case 'message_end':
          if (event.content !== '') {
            process.stdout.write('\n');
          }
          break;
        case 'tool_start':
          console.log(`\n[tool] ${event.toolName}`);
          break;
        case 'permission_request':
          console.log(`\n[permission] ${event.tool}: ${event.description}`);
          await agent.denyPermission(event.requestId, 'once');
          break;
      }
    }

    const result = await run.json<ReleaseRisk>({
      validate: validateReleaseRisk,
    });

    console.log('\n\nParsed JSON:');
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await agent.close();
  }
}

main().catch((error) => {
  if (error instanceof StructuredOutputError) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
