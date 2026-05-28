/**
 * Guardrail Tool v2 Worker.
 *
 * Routes:
 *  - POST /api/preflight        → { ok, data: ProductCandidate[] } | { ok:false, error }
 *  - POST /api/extract  (SSE)   → text/event-stream of progress + final package
 *  - GET  /api/pricing          → { ok, data: PricingTable } (24h Cache API)
 *  - everything else            → static SPA via ASSETS binding
 *
 * Typed error envelope:
 *   { ok: true, data: T } | { ok: false, error: { code, message, retriable, phase } }
 *
 * The Worker holds the multi-roundtrip web_search loop server-side so the
 * browser sees one SSE connection per extract. Workers Paid plan recommended:
 * a 4-roundtrip web_search extract can take 60–180s and exceed free-tier
 * wall-clock limits.
 */

import {
  needsPicker,
  preflight,
  type ProductCandidate,
} from './lib/preflight';
import { extractWithLlm, ExtractionError, type ProgressEvent } from './lib/extract';
import { LlmCallError } from './lib/assess';
import { UsageTracker } from './lib/usage';
import { estimateCostUsd, fetchPricing } from './lib/pricing';
import {
  AI_SHAPES,
  CLOSED_SET_VERSION,
  DEPLOYMENTS,
  type AiShape,
  type Deployment,
} from '../src/schemas/guardrails';
import type { AssessmentPackage } from '../src/schemas/package';

interface Env {
  ASSETS: Fetcher;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL_PREFLIGHT?: string;
  OPENROUTER_MODEL_EXTRACT?: string;
  OPENROUTER_MODEL_ESCALATE?: string;
  ALLOWED_ORIGIN?: string;
}

const DEFAULT_PREFLIGHT = 'anthropic/claude-haiku-4.5';
const DEFAULT_EXTRACT = 'anthropic/claude-haiku-4.5';
const DEFAULT_ESCALATE = 'anthropic/claude-sonnet-4.6';

const EXTRACT_MAX_TOKENS = 16_000;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return preflightCors(env);
    }

    if (url.pathname === '/api/preflight' && req.method === 'POST') {
      return handlePreflight(req, env);
    }
    if (url.pathname === '/api/extract' && req.method === 'POST') {
      return handleExtract(req, env);
    }
    if (url.pathname === '/api/pricing' && req.method === 'GET') {
      return handlePricing(env);
    }
    if (url.pathname.startsWith('/api/')) {
      return errorResponse(env, 404, 'not_found', 'Not found', 'preflight');
    }

    return env.ASSETS.fetch(req);
  },
};

/* ──────────────────────────────────────────────────────────────────────── */
/* Routes                                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

interface PreflightBody {
  query?: unknown;
}

async function handlePreflight(req: Request, env: Env): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) {
    return errorResponse(env, 503, 'no_key', 'OPENROUTER_API_KEY not configured', 'preflight');
  }
  const body = await readJson<PreflightBody>(req);
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return errorResponse(env, 400, 'bad_request', 'Missing "query"', 'preflight');
  }
  if (query.length > 200) {
    return errorResponse(env, 400, 'bad_request', 'Query too long (max 200 chars)', 'preflight');
  }

  const usage = new UsageTracker();
  usage.setPhase('preflight');
  try {
    const candidates = await preflight(query, {
      apiKey: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL_PREFLIGHT || DEFAULT_PREFLIGHT,
      usage,
      signal: req.signal,
    });
    return okJson(env, {
      candidates,
      needsPicker: needsPicker(candidates),
      metrics: usage.snapshot({ escalated: false }),
    });
  } catch (e) {
    return errorFromException(env, e, 'preflight');
  }
}

interface ExtractBody {
  query?: unknown;
  product?: unknown;
  vendor?: unknown;
  deployment?: unknown;
  aiShape?: unknown;
}

async function handleExtract(req: Request, env: Env): Promise<Response> {
  if (!env.OPENROUTER_API_KEY) {
    return errorResponse(env, 503, 'no_key', 'OPENROUTER_API_KEY not configured', 'extraction');
  }
  const body = await readJson<ExtractBody>(req);
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const product = typeof body.product === 'string' ? body.product.trim() : '';
  const vendor = typeof body.vendor === 'string' ? body.vendor.trim() : '';
  const deployment = body.deployment;
  const aiShape = body.aiShape;

  if (!product || !vendor) {
    return errorResponse(env, 400, 'bad_request', 'Missing "product" or "vendor"', 'extraction');
  }
  if (!isOneOfArr<Deployment>(deployment, DEPLOYMENTS)) {
    return errorResponse(env, 400, 'bad_request', 'Invalid "deployment"', 'extraction');
  }
  if (!isOneOfArr<AiShape>(aiShape, AI_SHAPES)) {
    return errorResponse(env, 400, 'bad_request', 'Invalid "aiShape"', 'extraction');
  }

  // SSE response. Worker holds the loop; browser gets a single stream.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = (event: string, data: unknown) => {
    // Once the client disconnects, writing further events throws on a closed
    // writer; skip silently rather than fanning a noisy error per event.
    if (req.signal.aborted) return;
    void writer.write(
      encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
    );
  };

  // Run the loop asynchronously and stream events. Don't await inline — the
  // response needs to flush headers immediately. `req.signal` aborts when the
  // browser disconnects (refresh, navigation, Cancel button), which cascades
  // into the OpenRouter fetches so we stop burning tokens on a dead stream.
  void runExtract(
    env,
    {
      query,
      product,
      vendor,
      deployment,
      aiShape,
    },
    send,
    req.signal,
  )
    .catch(() => {
      // Already reported via send('error', ...) — or the abort is expected
      // (browser disconnected). Either way, swallow.
    })
    .finally(() => {
      try {
        void writer.close();
      } catch {
        // Writer may already be closed if the abort path tore it down.
      }
    });

  return new Response(readable, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      ...corsHeaders(env),
    },
  });
}

interface ExtractRunInput {
  query: string;
  product: string;
  vendor: string;
  deployment: Deployment;
  aiShape: AiShape;
}

async function runExtract(
  env: Env,
  input: ExtractRunInput,
  send: (event: string, data: unknown) => void,
  signal: AbortSignal,
): Promise<void> {
  const usage = new UsageTracker();
  usage.setPhase('extraction');
  const onProgress = (e: ProgressEvent) => send('progress', e);
  send('progress', { type: 'phase', phase: 'extraction' });

  let normalized;
  let escalated = false;
  try {
    normalized = await extractWithLlm(
      {
        apiKey: env.OPENROUTER_API_KEY!,
        model: env.OPENROUTER_MODEL_EXTRACT || DEFAULT_EXTRACT,
        maxTokens: EXTRACT_MAX_TOKENS,
        anchor: {
          productName: input.product,
          vendor: input.vendor,
          deployment: input.deployment,
          aiShape: input.aiShape,
        },
        usage,
        signal,
      },
      onProgress,
    );
  } catch (e) {
    // Browser disconnected mid-flight — fetches were aborted, nothing to report.
    if (signal.aborted) return;
    send('error', errorEnvelope(e, 'extraction'));
    return;
  }

  // Escalation gate (numerically pinned):
  //   - < 3 distinct primary-source evidence items, OR
  //   - > 30% of catalogue keys unknown/missing
  // Run on Sonnet 4.6 once with the same anchor; merge would belong here but
  // we keep v2 simple — escalation is a one-shot replacement.
  // Count distinct URLs among primary-source evidence. Items without a URL
  // can't contribute to source diversity, so filter them out before dedup —
  // otherwise N url-less items collapse to a single `undefined` bucket and
  // falsely trip the escalation gate (doubling cost on a good first pass).
  const distinctPrimary = new Set(
    normalized.evidence
      .filter(
        (e) =>
          (e.category === 'official_legal_terms' ||
            e.category === 'security_compliance_docs' ||
            e.category === 'vendor_product_docs' ||
            e.category === 'public_technical_docs') &&
          e.url,
      )
      .map((e) => e.url),
  ).size;
  const unknownRatio =
    normalized.observed.length === 0
      ? 1
      : normalized.observed.filter((o) => o.presence === 'unknown').length /
        normalized.observed.length;

  if (!signal.aborted && (distinctPrimary < 3 || unknownRatio > 0.3)) {
    send('progress', { type: 'phase', phase: 'escalation' });
    // Track escalation tokens in a side tracker so a failed escalation can be
    // discarded entirely — keeps metrics.byPhase consistent with the
    // top-level `escalated` flag (no contradictory "escalation phase row
    // populated but escalated: false" state in the CostBadge).
    const escalationUsage = new UsageTracker();
    escalationUsage.setPhase('escalation');
    try {
      const reextracted = await extractWithLlm(
        {
          apiKey: env.OPENROUTER_API_KEY!,
          model: env.OPENROUTER_MODEL_ESCALATE || DEFAULT_ESCALATE,
          maxTokens: EXTRACT_MAX_TOKENS,
          anchor: {
            productName: input.product,
            vendor: input.vendor,
            deployment: input.deployment,
            aiShape: input.aiShape,
          },
          usage: escalationUsage,
          signal,
        },
        onProgress,
      );
      // Success: fold escalation usage into the main tracker.
      usage.merge(escalationUsage);
      normalized = reextracted;
      escalated = true;
    } catch (e) {
      if (signal.aborted) return;
      // Escalation failure: keep the Haiku result and discard escalationUsage.
      send('progress', {
        type: 'message',
        message: `Escalation skipped: ${(e as Error).message}`,
      });
    }
  }

  if (signal.aborted) return;

  const pricing = await fetchPricing();
  const metricsRaw = usage.snapshot({ escalated, estimatedUsd: 0 });
  const estimatedUsd = estimateCostUsd(metricsRaw, pricing);
  const metrics = { ...metricsRaw, estimatedUsd };

  const pkg: Omit<AssessmentPackage, 'gaps'> = {
    schemaVersion: 1,
    closedSetVersion: CLOSED_SET_VERSION,
    createdAt: new Date().toISOString(),
    query: input.query,
    product: {
      name: normalized.product.name ?? input.product,
      vendor: normalized.product.vendor ?? input.vendor,
      category: normalized.product.category ?? 'AI product',
      url: normalized.product.url,
      version: normalized.product.version,
      deployment: input.deployment,
      aiShape: input.aiShape,
    },
    evidence: normalized.evidence,
    observed: normalized.observed,
    metrics,
    dropped: normalized.dropped,
    partial: false,
  };

  send('done', pkg);
}

async function handlePricing(env: Env): Promise<Response> {
  try {
    const pricing = await fetchPricing();
    return okJson(env, pricing);
  } catch (e) {
    return errorFromException(env, e, 'extraction');
  }
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                  */
/* ──────────────────────────────────────────────────────────────────────── */

async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

function isOneOfArr<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function okJson<T>(env: Env, data: T): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(env),
    },
  });
}

function errorResponse(
  env: Env,
  status: number,
  code: string,
  message: string,
  phase: 'preflight' | 'extraction' | 'escalation',
): Response {
  const retriable = status === 429 || status >= 500;
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, retriable, phase } }),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...corsHeaders(env),
      },
    },
  );
}

function errorFromException(
  env: Env,
  e: unknown,
  phase: 'preflight' | 'extraction' | 'escalation',
): Response {
  if (e instanceof LlmCallError) {
    return errorResponse(env, e.status, 'llm_call', e.message, phase);
  }
  if (e instanceof ExtractionError) {
    return errorResponse(env, 502, e.code, e.message, phase);
  }
  return errorResponse(env, 500, 'internal', (e as Error).message || 'Internal error', phase);
}

function errorEnvelope(
  e: unknown,
  phase: 'preflight' | 'extraction' | 'escalation',
): { code: string; message: string; retriable: boolean; phase: string } {
  if (e instanceof LlmCallError) {
    return { code: 'llm_call', message: e.message, retriable: e.retriable, phase };
  }
  if (e instanceof ExtractionError) {
    return { code: e.code, message: e.message, retriable: false, phase };
  }
  return {
    code: 'internal',
    message: (e as Error).message || 'Internal error',
    retriable: false,
    phase,
  };
}

function preflightCors(env: Env): Response {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}
