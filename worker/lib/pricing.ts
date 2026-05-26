/**
 * Server-side pricing. Fetches OpenRouter /models, caches via Workers Cache
 * API (regional, 24h TTL), falls back to a hardcoded table for the ~6 models
 * we use so cost display never breaks.
 */

import type { AssessmentMetrics, ModelUsageBreakdown } from '../../src/schemas/package';

export interface ModelPricing {
  /** USD per input token. */
  input: number;
  /** USD per output token. */
  output: number;
  /** USD per cached-input token. */
  cachedInput?: number;
}

export type PricingTable = Record<string, ModelPricing>;

/** Fallback pricing for the models we actually call. Approximate — refreshed at deploy time. */
export const FALLBACK_PRICING: PricingTable = {
  'anthropic/claude-haiku-4.5': {
    input: 1.0 / 1_000_000,
    output: 5.0 / 1_000_000,
    cachedInput: 0.1 / 1_000_000,
  },
  'anthropic/claude-sonnet-4.5': {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
    cachedInput: 0.3 / 1_000_000,
  },
  'anthropic/claude-sonnet-4.6': {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
    cachedInput: 0.3 / 1_000_000,
  },
  'anthropic/claude-opus-4.7': {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
    cachedInput: 1.5 / 1_000_000,
  },
};

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_SECONDS = 24 * 60 * 60;

interface OpenRouterModel {
  id: string;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
    web_search?: string;
    internal_reasoning?: string;
    input_cache_read?: string;
  };
}

function parseOpenRouterPricing(payload: unknown): PricingTable {
  const out: PricingTable = {};
  const data = (payload as { data?: OpenRouterModel[] })?.data ?? [];
  for (const m of data) {
    const input = Number(m.pricing?.prompt ?? '');
    const output = Number(m.pricing?.completion ?? '');
    if (!isFinite(input) || !isFinite(output)) continue;
    const cached = Number(m.pricing?.input_cache_read ?? '');
    out[m.id] = {
      input,
      output,
      cachedInput: isFinite(cached) ? cached : undefined,
    };
  }
  return out;
}

export async function fetchPricing(): Promise<PricingTable> {
  const cacheKey = new Request(OPENROUTER_MODELS_URL);
  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const data = (await cached.json()) as unknown;
      const parsed = parseOpenRouterPricing(data);
      if (Object.keys(parsed).length > 0) return parsed;
    } catch {
      // fall through to refetch
    }
  }
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      cf: { cacheTtl: CACHE_TTL_SECONDS },
    } as RequestInit);
    if (!res.ok) return FALLBACK_PRICING;
    const data = await res.clone().json();
    // Stamp Cache-Control so Cache API honours TTL on put().
    const cacheable = new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
      },
    });
    await cache.put(cacheKey, cacheable);
    const parsed = parseOpenRouterPricing(data);
    return Object.keys(parsed).length > 0 ? parsed : FALLBACK_PRICING;
  } catch {
    return FALLBACK_PRICING;
  }
}

/** Compute USD cost for a usage breakdown. */
export function estimateCostUsd(
  metrics: AssessmentMetrics,
  pricing: PricingTable,
): number {
  let total = 0;
  for (const [model, b] of Object.entries(metrics.byModel)) {
    const rate = pricing[model] ?? FALLBACK_PRICING[model];
    if (!rate) continue;
    total += costForBreakdown(b, rate);
  }
  return total;
}

function costForBreakdown(b: ModelUsageBreakdown, rate: ModelPricing): number {
  const cachedRate = rate.cachedInput ?? rate.input;
  return (
    b.inputTokens * rate.input +
    b.cachedInputTokens * cachedRate +
    b.cacheCreationInputTokens * rate.input +
    b.outputTokens * rate.output
  );
}
