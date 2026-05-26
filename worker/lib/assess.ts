/**
 * Worker-side LLM client. Adapted from Prequal's `src/assess.ts`:
 *  - reads the OpenRouter key from `env` (not import.meta.env) so the secret
 *    never reaches the browser
 *  - same Anthropic-on-OpenRouter request shape, headers, and `cachePrompt`
 *    behaviour (last-tool + system are wrapped in cache_control: ephemeral)
 *  - same `extractJson` JSON-recovery helper for tolerating LLM stray prose
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/messages';

export interface ContentBlock {
  type: string;
  text?: string;
  [k: string]: unknown;
}

export interface ApiUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface ApiMessage {
  content: ContentBlock[];
  stop_reason: string | null;
  usage?: ApiUsage;
  model?: string;
}

export interface CallApiOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  tools?: unknown[];
  thinking?: { type: string };
  cachePrompt?: boolean;
}

export class LlmCallError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retriable: boolean,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
}

/**
 * Attach `cache_control: ephemeral` to the LAST tool definition so the entire
 * tool list above it is cached as part of the same prefix.
 */
function withToolCacheControl(tools: unknown[]): unknown[] {
  if (tools.length === 0) return tools;
  const last = tools[tools.length - 1];
  if (!last || typeof last !== 'object') return tools;
  return [
    ...tools.slice(0, -1),
    { ...(last as object), cache_control: { type: 'ephemeral' } },
  ];
}

export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in the model response.');
  }
  return candidate.slice(start, end + 1);
}

export async function callApi(
  messages: unknown[],
  options: CallApiOptions,
): Promise<ApiMessage> {
  const body: Record<string, unknown> = {
    model: options.model,
    max_tokens: options.maxTokens,
    system: options.cachePrompt
      ? [
          {
            type: 'text',
            text: options.systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ]
      : options.systemPrompt,
    messages,
  };
  if (options.tools) {
    body.tools = options.cachePrompt
      ? withToolCacheControl(options.tools)
      : options.tools;
  }
  if (options.thinking) body.thinking = options.thinking;

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
        'anthropic-version': '2023-06-01',
        'HTTP-Referer': 'https://github.com/danr75/guardrails-guide',
        'X-Title': 'Guardrail Tool',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new LlmCallError(
      `Network error reaching OpenRouter: ${(e as Error).message}`,
      502,
      true,
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const retriable = res.status === 429 || res.status >= 500;
    throw new LlmCallError(
      `OpenRouter ${res.status}: ${detail.slice(0, 240)}`,
      res.status,
      retriable,
    );
  }
  return (await res.json()) as ApiMessage;
}
