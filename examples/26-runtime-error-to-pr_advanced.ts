/**
 * Advanced runtime error to pull request.
 *
 * This example builds a production incident packet, confirms that GitHub
 * credentials are available through the environment, and asks Autohand to
 * reproduce the failure, patch the app, run validation, commit, push, and open
 * a pull request.
 *
 * Required:
 *   AUTOHAND_TARGET_REPO=/path/to/app
 *   GITHUB_TOKEN or GH_TOKEN with repo scope
 *
 * Optional:
 *   AUTOHAND_GITHUB_BASE_BRANCH=main
 *   AUTOHAND_GITHUB_REMOTE=origin
 *   AUTOHAND_CLI_PATH=/path/to/autohand
 */

import { Agent } from '../src/index.js';

type GithubCredentials = {
  tokenEnvName: 'GITHUB_TOKEN' | 'GH_TOKEN';
  remote: string;
  baseBranch: string;
  repository?: string;
};

type IncidentPacket = {
  id: string;
  severity: 'sev1' | 'sev2' | 'sev3';
  service: string;
  firstSeen: string;
  release: string;
  errorSignature: string;
  userImpact: string;
  stackTrace: string;
  logs: string[];
  request: {
    method: string;
    path: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
  };
  suspectedFiles: string[];
  reproductionCommand: string;
  validationCommands: string[];
};

const targetRepo = process.env.AUTOHAND_TARGET_REPO ?? '.';
const cliPath = process.env.AUTOHAND_CLI_PATH;
const timeout = Number(process.env.AUTOHAND_TIMEOUT_MS ?? 600000);

function githubCredentialsFromEnv(): GithubCredentials {
  const tokenEnvName = process.env.GITHUB_TOKEN !== undefined && process.env.GITHUB_TOKEN !== ''
    ? 'GITHUB_TOKEN'
    : process.env.GH_TOKEN !== undefined && process.env.GH_TOKEN !== ''
      ? 'GH_TOKEN'
      : undefined;

  if (tokenEnvName === undefined) {
    throw new Error('Set GITHUB_TOKEN or GH_TOKEN before running this example.');
  }

  return {
    tokenEnvName,
    remote: process.env.AUTOHAND_GITHUB_REMOTE ?? 'origin',
    baseBranch: process.env.AUTOHAND_GITHUB_BASE_BRANCH ?? 'main',
    repository: process.env.GITHUB_REPOSITORY,
  };
}

function captureIncidentPacket(): IncidentPacket {
  try {
    const payload = {
      cartId: 'cart_live_9834',
      subtotal: 129,
      customer: null,
      coupon: { code: 'SPRING25', source: 'mobile-v5' },
      idempotencyKey: 'checkout:cart_live_9834:attempt_2',
    };

    const customer = payload.customer as { loyaltyTier: string } | null;
    if (customer!.loyaltyTier === 'gold') {
      return {} as IncidentPacket;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'INC-2026-05-12-0417',
      severity: 'sev2',
      service: 'checkout-api',
      firstSeen: '2026-05-12T09:14:22Z',
      release: 'checkout-api@2026.05.12.3',
      errorSignature: `TypeError: ${message}`,
      userImpact: 'Checkout returns HTTP 500 for guest customers using coupon replay from mobile clients.',
      stackTrace: [
        `TypeError: ${message}`,
        '    at calculateDiscount (src/checkout/discounts.ts:42:21)',
        '    at buildPaymentIntent (src/checkout/payment-intent.ts:118:16)',
        '    at createCheckoutSession (src/checkout/session.ts:88:18)',
      ].join('\n'),
      logs: [
        'level=error trace=trk_94 request_id=req_7f2 route=POST /checkout status=500 duration_ms=184',
        'level=warn trace=trk_94 idempotency_key=checkout:cart_live_9834:attempt_2 cache_status=miss',
        'level=info trace=trk_94 feature_flags=discount-v2,coupon-replay',
      ],
      request: {
        method: 'POST',
        path: '/checkout',
        payload: {
          cartId: 'cart_live_9834',
          subtotal: 129,
          customer: null,
          coupon: { code: 'SPRING25', source: 'mobile-v5' },
          idempotencyKey: 'checkout:cart_live_9834:attempt_2',
        },
        headers: {
          'x-client-version': 'ios/5.18.0',
          'x-request-id': 'req_7f2',
        },
      },
      suspectedFiles: [
        'src/checkout/discounts.ts',
        'src/checkout/payment-intent.ts',
        'src/checkout/session.ts',
        'tests/checkout/session.test.ts',
      ],
      reproductionCommand: 'npm test -- checkout/session.test.ts --runInBand',
      validationCommands: [
        'npm test -- checkout/session.test.ts --runInBand',
        'npm run typecheck',
        'npm run lint',
      ],
    };
  }

  throw new Error('Expected the simulated incident to fail.');
}

function buildPrompt(incident: IncidentPacket, github: GithubCredentials): string {
  return [
    'You are a senior QA engineering agent responsible for converting production incidents into verified repair pull requests.',
    '',
    'GitHub credentials:',
    `- A GitHub token is available in the ${github.tokenEnvName} environment variable. Do not print or commit the token.`,
    `- Use git remote ${github.remote}.`,
    `- Open the pull request against ${github.baseBranch}.`,
    github.repository ? `- GitHub repository hint: ${github.repository}.` : '- Discover the GitHub repository from git remote output.',
    '- Before pushing, run gh auth status or an equivalent non-secret auth check.',
    '',
    'Incident packet:',
    '```json',
    JSON.stringify(incident, null, 2),
    '```',
    '',
    'Required workflow:',
    '1. Inspect the target repository and confirm the likely failing path.',
    '2. Reproduce the incident using the provided payload or nearest existing test harness.',
    '3. Fix the root cause, not just the thrown exception.',
    '4. Add a regression test covering guest checkout, coupon replay, and idempotency behavior.',
    '5. Run the focused test first, then the relevant validation commands.',
    '6. Create a branch named autohand/fix-checkout-incident-inc-2026-05-12-0417.',
    '7. Commit the fix with a clear message.',
    '8. Push the branch and open a pull request.',
    '9. In the PR body, include the incident id, error signature, files changed, tests run, and any residual risk.',
  ].join('\n');
}

async function main(): Promise<void> {
  const github = githubCredentialsFromEnv();
  const incident = captureIncidentPacket();

  const agent = await Agent.create({
    cwd: targetRepo,
    ...(cliPath !== undefined && cliPath !== '' ? { cliPath } : {}),
    model: process.env.AUTOHAND_MODEL,
    timeout,
    instructions: 'Work like a careful senior QA engineer. Keep secrets out of logs and pull request text.',
  });

  try {
    const run = await agent.send(buildPrompt(incident, github));
    for await (const event of run.stream()) {
      switch (event.type) {
        case 'message_update':
          process.stdout.write(event.delta);
          break;
        case 'tool_start':
          console.log(`\n[tool] ${event.toolName}`);
          break;
        case 'permission_request':
          console.log(`\n[permission] ${event.tool}: ${event.description}`);
          break;
        case 'error':
          console.error(`\n[error] ${event.message}`);
          break;
      }
    }

    const result = await run.wait();
    console.log(`\n\nRun ${result.id} ${result.status}.`);
  } finally {
    await agent.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
