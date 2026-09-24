import { describe, expect, it } from 'bun:test';

import {
  WekaClient,
  WekaRequestError,
  WekaValidationError,
  type WekaDecisionRequest,
} from '../index.js';

const request = {
  model: 'weka',
  state: {
    tests: 'passed',
    changedSystems: ['checkout'],
  },
  questions: {
    needs_review: {
      type: 'noul',
      instructions: 'Does this release need a person?',
      criteria: {
        true: 'A person must review the evidence.',
        false: 'The automated checks are sufficient.',
      },
    },
    release_lane: {
      type: 'choice',
      instructions: 'Choose the safest release lane.',
      criteria: {
        continue: 'All required checks passed.',
        review: 'The evidence needs a person.',
      },
    },
    risk: {
      type: 'score',
      instructions: 'Score the release risk.',
      criteria: ['Low risk', 'Medium risk', 'High risk'],
    },
  },
} as const satisfies WekaDecisionRequest;

describe('WekaClient', () => {
  it('sends the Weka decision contract and preserves named choice types', async () => {
    let capturedUrl = '';
    let capturedAuthorization = '';
    let capturedBody: unknown;
    const client = new WekaClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.test/',
      fetch: async (input, init) => {
        capturedUrl = input.toString();
        capturedAuthorization = new Headers(init?.headers).get('authorization') ?? '';
        capturedBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          model: 'weka',
          answers: {
            needs_review: {
              type: 'noul',
              noul: 0.73,
            },
            release_lane: {
              type: 'choice',
              choice: 'review',
              confidence: 0.82,
              probabilities: { continue: 0.18, review: 0.82 },
            },
            risk: {
              type: 'score',
              score: 1.3,
              confidence: 0.7,
              legend: { '0': 'Low risk', '1': 'Medium risk', '2': 'High risk' },
              probabilities: { '0': 0.1, '1': 0.5, '2': 0.4 },
            },
          },
          usage: { input_tokens: 426, output_tokens: 73 },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-request-id': 'req-success' },
        });
      },
    });

    const result = await client.decide(request);
    const selected: 'continue' | 'review' = result.answers.release_lane.choice;

    expect(selected).toBe('review');
    expect(result.answers.needs_review.noul).toBe(0.73);
    expect(result.answers.risk.score).toBe(1.3);
    expect(result.usage.input_tokens).toBe(426);
    expect(capturedUrl).toBe('https://example.test/v1/decisions');
    expect(capturedAuthorization).toBe('Bearer test-key');
    expect(capturedBody).toEqual(request);
  });

  it('rejects an invalid request before calling fetch', async () => {
    let fetchCalls = 0;
    const client = new WekaClient({
      apiKey: 'test-key',
      fetch: async () => {
        fetchCalls += 1;
        return new Response('{}');
      },
    });
    const invalidRequest = {
      model: 'weka',
      state: {},
      questions: {
        risk: {
          type: 'score',
          instructions: 'Score the risk.',
          criteria: ['Only one anchor'],
        },
      },
    } as unknown as WekaDecisionRequest;

    await expect(client.decide(invalidRequest)).rejects.toBeInstanceOf(WekaValidationError);
    expect(fetchCalls).toBe(0);
  });

  it('rejects an answer whose selected choice was not requested', async () => {
    const client = new WekaClient({
      apiKey: 'test-key',
      fetch: async () => new Response(JSON.stringify({
        model: 'weka',
        answers: {
          needs_review: {
            type: 'noul',
            noul: 0.73,
          },
          release_lane: {
            type: 'choice',
            choice: 'blocked',
            confidence: 0.99,
            probabilities: { continue: 0.01, review: 0, blocked: 0.99 },
          },
          risk: {
            type: 'score',
            score: 0,
            confidence: 1,
            legend: { '0': 'Low risk', '1': 'Medium risk', '2': 'High risk' },
            probabilities: { '0': 1, '1': 0, '2': 0 },
          },
        },
        usage: { input_tokens: 10, output_tokens: 5 },
      }), { status: 200 }),
    });

    await expect(client.decide(request)).rejects.toThrow('unexpected response shape');
  });

  it('reports HTTP status and request ID without exposing the response body', async () => {
    const client = new WekaClient({
      apiKey: 'test-key',
      fetch: async () => new Response(
        JSON.stringify({ secret: 'must-not-appear' }),
        { status: 429, headers: { 'x-request-id': 'req-rate-limit' } },
      ),
    });

    try {
      await client.decide(request);
      throw new Error('Expected the Weka request to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(WekaRequestError);
      expect((error as WekaRequestError).status).toBe(429);
      expect((error as WekaRequestError).requestId).toBe('req-rate-limit');
      expect((error as Error).message).not.toContain('must-not-appear');
    }
  });
});
