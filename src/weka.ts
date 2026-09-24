export type WekaJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly WekaJsonValue[]
  | { readonly [key: string]: WekaJsonValue };

export type WekaDescription =
  | string
  | readonly WekaJsonValue[]
  | { readonly [key: string]: WekaJsonValue }
  | null;

export interface WekaNoulQuestion {
  readonly type: 'noul';
  readonly instructions: WekaDescription;
  readonly criteria?: {
    readonly true?: WekaDescription;
    readonly false?: WekaDescription;
  } | null;
}

export interface WekaChoiceQuestion<Choice extends string = string> {
  readonly type: 'choice';
  readonly instructions: WekaDescription;
  readonly criteria: Readonly<Record<Choice, WekaDescription>>;
}

export interface WekaScoreQuestion {
  readonly type: 'score';
  readonly instructions: WekaDescription;
  readonly criteria: readonly [WekaDescription, WekaDescription, ...WekaDescription[]];
}

export type WekaQuestion = WekaNoulQuestion | WekaChoiceQuestion | WekaScoreQuestion;
export type WekaQuestions = Readonly<Record<string, WekaQuestion>>;

export interface WekaNoulAnswer {
  readonly type: 'noul';
  readonly noul: number;
}

export interface WekaChoiceAnswer<Choice extends string = string> {
  readonly type: 'choice';
  readonly choice: Choice;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<string, number>>;
}

export interface WekaScoreAnswer {
  readonly type: 'score';
  readonly score: number;
  readonly confidence: number;
  readonly legend: Readonly<Record<string, string>>;
  readonly probabilities: Readonly<Record<string, number>>;
}

export type WekaAnswer = WekaNoulAnswer | WekaChoiceAnswer | WekaScoreAnswer;

export type WekaAnswerFor<Question extends WekaQuestion> =
  Question extends WekaNoulQuestion
    ? WekaNoulAnswer
    : Question extends WekaChoiceQuestion<infer Choice>
      ? WekaChoiceAnswer<Choice>
      : Question extends WekaScoreQuestion
        ? WekaScoreAnswer
        : never;

export interface WekaDecisionRequest<
  State extends WekaJsonValue = WekaJsonValue,
  Questions extends WekaQuestions = WekaQuestions,
> {
  readonly model: 'weka';
  readonly state: State;
  readonly questions: Questions;
}

export interface WekaUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
}

export type WekaDecisionResponse<Questions extends WekaQuestions = WekaQuestions> = {
  readonly model: string;
  readonly answers: { readonly [Name in keyof Questions]: WekaAnswerFor<Questions[Name]> };
  readonly usage: WekaUsage;
};

export type WekaFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface WekaClientOptions {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly fetch?: WekaFetch;
}

export class WekaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WekaValidationError';
  }
}

export class WekaRequestError extends Error {
  readonly status: number | undefined;
  readonly requestId: string | undefined;

  constructor(
    message: string,
    options: {
      status?: number | undefined;
      requestId?: string | undefined;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'WekaRequestError';
    this.status = options.status;
    this.requestId = options.requestId;
  }
}

const DEFAULT_BASE_URL = 'https://api.autohand.ai';
const DEFAULT_TIMEOUT_MS = 15_000;

export class WekaClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: WekaFetch;

  constructor(options: WekaClientOptions = {}) {
    this.#apiKey = requiredApiKey(options.apiKey);
    this.#baseUrl = normalizeBaseUrl(
      options.baseUrl
        ?? process.env.AUTOHAND_AI_BASE_URL
        ?? process.env.AUTOHAND_API_URL
        ?? DEFAULT_BASE_URL,
    );
    this.#timeoutMs = validateTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async decide<
    State extends WekaJsonValue,
    Questions extends WekaQuestions,
  >(
    request: WekaDecisionRequest<State, Questions>,
  ): Promise<WekaDecisionResponse<Questions>> {
    assertValidRequest(request);

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/v1/decisions`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      throw new WekaRequestError('Weka request could not be completed.', { cause: error });
    }

    const requestIdHeader = response.headers.get('x-request-id');
    const requestId = requestIdHeader !== null && requestIdHeader !== ''
      ? requestIdHeader
      : undefined;
    if (!response.ok) {
      const requestIdSuffix = requestId !== undefined ? ` (${requestId})` : '';
      throw new WekaRequestError(
        `Weka request failed with HTTP ${response.status}${requestIdSuffix}.`,
        { status: response.status, requestId },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw unexpectedResponse(response.status, requestId, error);
    }

    if (!isWekaResponse(payload, request.questions)) {
      throw unexpectedResponse(response.status, requestId);
    }

    return payload as WekaDecisionResponse<Questions>;
  }
}

function requiredApiKey(explicitApiKey?: string): string {
  const apiKey = explicitApiKey
    ?? process.env.AUTOHAND_AI_API_KEY
    ?? process.env.AUTOHAND_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    throw new WekaValidationError(
      'Set AUTOHAND_AI_API_KEY or pass apiKey when creating WekaClient.',
    );
  }
  return apiKey;
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new WekaValidationError(`Invalid Weka base URL: ${String(error)}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new WekaValidationError('Weka base URL must use http or https.');
  }
  return value.replace(/\/+$/, '');
}

function validateTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new WekaValidationError('Weka timeoutMs must be a positive integer.');
  }
  return value;
}

function unexpectedResponse(
  status: number,
  requestId: string | undefined,
  cause?: unknown,
): WekaRequestError {
  return new WekaRequestError('Weka returned an unexpected response shape.', {
    status,
    requestId,
    cause,
  });
}

function assertValidRequest(value: unknown): asserts value is WekaDecisionRequest {
  const candidate = object(value);
  if (
    !candidate
    || !onlyKeys(candidate, ['model', 'state', 'questions'])
    || candidate.model !== 'weka'
    || !Object.hasOwn(candidate, 'state')
    || !json(candidate.state)
  ) {
    throw new WekaValidationError('Invalid Weka request.');
  }

  const questions = object(candidate.questions);
  if (
    !questions
    || Object.keys(questions).length === 0
    || !Object.entries(questions).every(([name, entry]) => name.length > 0 && isQuestion(entry))
  ) {
    throw new WekaValidationError(
      'Weka questions must be a non-empty record of valid named questions.',
    );
  }
}

function isQuestion(value: unknown): value is WekaQuestion {
  const candidate = object(value);
  if (
    !candidate
    || !onlyKeys(candidate, ['type', 'instructions', 'criteria'])
    || !description(candidate.instructions)
  ) {
    return false;
  }

  if (candidate.type === 'noul') {
    if (candidate.criteria === undefined || candidate.criteria === null) return true;
    const criteria = object(candidate.criteria);
    return criteria !== null
      && onlyKeys(criteria, ['true', 'false'])
      && Object.values(criteria).every(description);
  }

  if (candidate.type === 'choice') {
    const criteria = object(candidate.criteria);
    return criteria !== null
      && Object.keys(criteria).length > 0
      && Object.values(criteria).every(description);
  }

  if (candidate.type === 'score') {
    return Array.isArray(candidate.criteria)
      && candidate.criteria.length >= 2
      && candidate.criteria.every(description);
  }

  return false;
}

function isWekaResponse(value: unknown, questions: WekaQuestions): boolean {
  const candidate = object(value);
  if (
    !candidate
    || !onlyKeys(candidate, ['model', 'answers', 'usage'])
    || typeof candidate.model !== 'string'
    || candidate.model.length === 0
  ) {
    return false;
  }

  const answers = object(candidate.answers);
  const usage = object(candidate.usage);
  if (
    !answers
    || !usage
    || !onlyKeys(usage, ['input_tokens', 'output_tokens'])
    || !nonNegativeSafeInteger(usage.input_tokens)
    || !nonNegativeSafeInteger(usage.output_tokens)
  ) {
    return false;
  }

  const names = Object.keys(questions);
  return Object.keys(answers).length === names.length
    && names.every((name) => isAnswer(answers[name], questions[name]));
}

function isAnswer(value: unknown, requested: WekaQuestion | undefined): boolean {
  const candidate = object(value);
  if (!candidate || !requested || candidate.type !== requested.type) return false;

  if (candidate.type === 'noul') {
    return onlyKeys(candidate, ['type', 'noul']) && probability(candidate.noul);
  }

  if (candidate.type === 'choice' && requested.type === 'choice') {
    return onlyKeys(candidate, ['type', 'choice', 'confidence', 'probabilities'])
      && typeof candidate.choice === 'string'
      && Object.hasOwn(requested.criteria, candidate.choice)
      && probability(candidate.confidence)
      && probabilities(candidate.probabilities);
  }

  if (candidate.type === 'score' && requested.type === 'score') {
    const legend = object(candidate.legend);
    return onlyKeys(candidate, ['type', 'score', 'confidence', 'legend', 'probabilities'])
      && typeof candidate.score === 'number'
      && Number.isFinite(candidate.score)
      && probability(candidate.confidence)
      && legend !== null
      && Object.values(legend).every((label) => typeof label === 'string')
      && probabilities(candidate.probabilities);
  }

  return false;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function json(value: unknown): value is WekaJsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(json);
  const fields = object(value);
  return fields !== null && Object.values(fields).every(json);
}

function description(value: unknown): value is WekaDescription {
  if (value === null || typeof value === 'string') return true;
  if (Array.isArray(value)) return value.every(json);
  const fields = object(value);
  return fields !== null && Object.values(fields).every(json);
}

function probability(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 1;
}

function probabilities(value: unknown): value is Readonly<Record<string, number>> {
  const candidate = object(value);
  return candidate !== null && Object.values(candidate).every(probability);
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
