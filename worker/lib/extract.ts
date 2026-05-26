/**
 * Worker-side deep extraction. Adapted from Prequal's `src/llm/extract.ts`:
 *   - same web_search tool definition (web_search_20260209)
 *   - same round-trip loop driven by stop_reason === "pause_turn"
 *   - same parse-with-recovery (one JSON-only retry on unparseable output)
 *   - adds an onProgress callback used by the SSE wrapper in worker/index.ts
 */

import { callApi, extractJson, type ApiMessage, type ContentBlock } from './assess';
import {
  EXTRACTION_SYSTEM_PROMPT,
  buildExtractionUserPrompt,
  buildJsonOnlyRetryMessage,
  type ExtractionAnchor,
} from './extractPrompt';
import { normalizeExtraction, type NormalizedExtraction, type RawExtraction } from './normalize';
import type { UsageTracker } from './usage';

const WEB_SEARCH_TOOLS = [
  { type: 'web_search_20260209', name: 'web_search' },
] as const;

export const WEB_SEARCH_MAX_ROUNDTRIPS = 4;
const ERROR_SNIPPET_CHARS = 240;

export type ExtractionErrorCode =
  | 'no_text'
  | 'unparseable_json'
  | 'max_tokens'
  | 'refusal';

export class ExtractionError extends Error {
  constructor(
    public readonly code: ExtractionErrorCode,
    message: string,
    public readonly snippet?: string,
    public readonly stopReason?: string | null,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ExtractOptions {
  apiKey: string;
  model: string;
  maxTokens: number;
  anchor: ExtractionAnchor;
  usage?: UsageTracker;
}

export type ProgressEvent =
  | { type: 'phase'; phase: 'preflight' | 'extraction' | 'escalation' }
  | { type: 'roundtrip'; n: number; max: number }
  | { type: 'message'; message: string };

export type ProgressFn = (event: ProgressEvent) => void;

export function parseStructuredResponse(
  content: ContentBlock[],
  stopReason: string | null,
): RawExtraction {
  const textBlocks = content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => (b.text as string).trim())
    .filter(Boolean);
  if (textBlocks.length === 0) {
    throw new ExtractionError(
      'no_text',
      'The model returned no text to parse.',
      undefined,
      stopReason,
    );
  }
  const candidates = [textBlocks[textBlocks.length - 1], textBlocks.join('\n')];
  for (const candidate of candidates) {
    try {
      return JSON.parse(extractJson(candidate)) as RawExtraction;
    } catch {
      // try next candidate
    }
  }
  const lastBlock = textBlocks[textBlocks.length - 1];
  const snippet = lastBlock.slice(-ERROR_SNIPPET_CHARS);
  if (stopReason === 'max_tokens') {
    throw new ExtractionError(
      'max_tokens',
      'Model ran out of room. Try a more specific product name.',
      snippet,
      stopReason,
    );
  }
  throw new ExtractionError(
    'unparseable_json',
    `Could not parse JSON. Last output ended: "${snippet}"`,
    snippet,
    stopReason,
  );
}

export async function extractWithLlm(
  opts: ExtractOptions,
  onProgress: ProgressFn,
): Promise<NormalizedExtraction> {
  const userPrompt = buildExtractionUserPrompt(opts.anchor);
  const messages: unknown[] = [{ role: 'user', content: userPrompt }];

  onProgress({ type: 'message', message: 'Researching the product…' });

  let response = await callApi(messages, {
    apiKey: opts.apiKey,
    model: opts.model,
    maxTokens: opts.maxTokens,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    tools: [...WEB_SEARCH_TOOLS],
    thinking: { type: 'adaptive' },
    cachePrompt: true,
  });
  opts.usage?.record(response, opts.model);

  let guard = 0;
  while (
    response.stop_reason === 'pause_turn' &&
    guard < WEB_SEARCH_MAX_ROUNDTRIPS
  ) {
    guard += 1;
    onProgress({ type: 'roundtrip', n: guard, max: WEB_SEARCH_MAX_ROUNDTRIPS });
    messages.push({ role: 'assistant', content: response.content });
    response = await callApi(messages, {
      apiKey: opts.apiKey,
      model: opts.model,
      maxTokens: opts.maxTokens,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      tools: [...WEB_SEARCH_TOOLS],
      thinking: { type: 'adaptive' },
      cachePrompt: true,
    });
    opts.usage?.record(response, opts.model);
  }

  if (response.stop_reason === 'refusal') {
    throw new ExtractionError(
      'refusal',
      'The model declined to assess this input.',
      undefined,
      response.stop_reason,
    );
  }

  try {
    return normalizeExtraction(parseStructuredResponse(response.content, response.stop_reason));
  } catch (err) {
    // One recovery attempt: nudge for JSON-only, no tools (no more roundtrips).
    if (err instanceof ExtractionError && err.code === 'unparseable_json') {
      onProgress({ type: 'message', message: 'Finalising structured output…' });
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: buildJsonOnlyRetryMessage() });
      const retry = await callApi(messages, {
        apiKey: opts.apiKey,
        model: opts.model,
        maxTokens: opts.maxTokens,
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        cachePrompt: true,
      });
      opts.usage?.record(retry, opts.model);
      return normalizeExtraction(parseStructuredResponse(retry.content, retry.stop_reason));
    }
    throw err;
  }
}

export function lastResponseStopReason(_response: ApiMessage): string | null {
  return _response.stop_reason;
}
