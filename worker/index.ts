/**
 * Cloudflare Worker for the Guardrail Tool.
 *
 *  - POST /api/suggest   { query }   → { suggestions: [{ name, vendor, oneLiner }] }
 *  - POST /api/classify  { product } → { patternId, rationale }
 *  - GET  /*             → static SPA assets (ASSETS binding)
 *
 * The Worker is a thin proxy to OpenRouter. The OpenRouter API key never
 * touches the browser. CORS is open by default for dev; lock down via
 * ALLOWED_ORIGIN in production.
 */

import { PATTERN_IDS, PATTERN_SUMMARY } from '../src/data/patternSummary';

interface Env {
  ASSETS: Fetcher;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  ALLOWED_ORIGIN?: string;
}

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return preflight(env);
    }

    if (url.pathname === '/api/suggest' && req.method === 'POST') {
      return wrap(env, () => handleSuggest(req, env));
    }
    if (url.pathname === '/api/classify' && req.method === 'POST') {
      return wrap(env, () => handleClassify(req, env));
    }
    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404, env);
    }

    return env.ASSETS.fetch(req);
  },
};

/* ──────────────────────────────────────────────────────────────────────── */
/* Routes                                                                   */
/* ──────────────────────────────────────────────────────────────────────── */

async function handleSuggest(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ query?: unknown }>(req);
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return json({ error: 'Missing "query"' }, 400, env);
  if (query.length > 200) {
    return json({ error: 'Query too long (max 200 chars)' }, 400, env);
  }

  const system = [
    'You help map products and platforms to AI architecture patterns.',
    'Given a partial product/platform name typed by a user, return up to 6 real,',
    'commonly used AI products or platforms that plausibly match what they typed.',
    'Prefer well-known products. If the input is too vague or matches nothing,',
    'return an empty array. Do not invent products that do not exist.',
    '',
    'Respond ONLY as compact JSON in this exact shape:',
    '{ "suggestions": [ { "name": string, "vendor": string, "oneLiner": string } ] }',
    'oneLiner must be at most 80 characters. No prose, no markdown.',
  ].join('\n');

  const user = `User typed: ${JSON.stringify(query)}`;

  const llm = await callOpenRouter(env, system, user);
  if (!llm.ok) return json({ error: llm.error }, llm.status, env);

  const parsed = safeJson<{ suggestions?: Array<Record<string, unknown>> }>(llm.text);
  const rawList = Array.isArray(parsed?.suggestions) ? parsed!.suggestions! : [];
  const suggestions = rawList
    .map((s) => ({
      name: str(s.name),
      vendor: str(s.vendor),
      oneLiner: str(s.oneLiner).slice(0, 120),
    }))
    .filter((s) => s.name && s.vendor)
    .slice(0, 6);

  return json({ suggestions }, 200, env);
}

async function handleClassify(req: Request, env: Env): Promise<Response> {
  const body = await readJson<{ product?: unknown }>(req);
  const product = typeof body.product === 'string' ? body.product.trim() : '';
  if (!product) return json({ error: 'Missing "product"' }, 400, env);
  if (product.length > 200) {
    return json({ error: 'Product too long (max 200 chars)' }, 400, env);
  }

  const patternList = PATTERN_SUMMARY.map(
    (p) => `- ${p.id} — ${p.name}: ${p.tagline}`,
  ).join('\n');

  const system = [
    'You classify AI products/platforms into one of 8 architecture patterns.',
    'Pick the SINGLE best matching patternId for the product the user names.',
    'When in doubt between two, pick the one with the broader risk surface',
    '(e.g. an agent that can take actions outranks a chat-only assistant).',
    '',
    'Patterns:',
    patternList,
    '',
    'Respond ONLY as compact JSON:',
    '{ "patternId": "<one of the ids above>", "rationale": "<1-2 sentences, max 200 chars>" }',
    'No prose, no markdown.',
  ].join('\n');

  const user = `Product: ${JSON.stringify(product)}`;

  const llm = await callOpenRouter(env, system, user);
  if (!llm.ok) return json({ error: llm.error }, llm.status, env);

  const parsed = safeJson<{ patternId?: unknown; rationale?: unknown }>(llm.text);
  let patternId = str(parsed?.patternId);
  let rationale = str(parsed?.rationale).slice(0, 280);

  if (!PATTERN_IDS.includes(patternId)) {
    // Fall back to single-turn — the broadest, lowest-risk default.
    patternId = 'single-turn';
    rationale =
      rationale ||
      'Could not confidently classify — defaulting to single-turn prompt as a low-risk baseline.';
  }

  return json({ patternId, rationale }, 200, env);
}

/* ──────────────────────────────────────────────────────────────────────── */
/* OpenRouter call                                                          */
/* ──────────────────────────────────────────────────────────────────────── */

type LlmResult =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

async function callOpenRouter(
  env: Env,
  system: string,
  user: string,
): Promise<LlmResult> {
  if (!env.OPENROUTER_API_KEY) {
    return { ok: false, status: 503, error: 'OPENROUTER_API_KEY not configured' };
  }
  const model = env.OPENROUTER_MODEL || DEFAULT_MODEL;
  let res: Response;
  try {
    res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (e) {
    return { ok: false, status: 502, error: `OpenRouter unreachable: ${(e as Error).message}` };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return {
      ok: false,
      status: 502,
      error: `OpenRouter ${res.status}: ${detail.slice(0, 200)}`,
    };
  }
  const data = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const text = data?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) {
    return { ok: false, status: 502, error: 'OpenRouter returned empty content' };
  }
  return { ok: true, text };
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

function safeJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    // Models occasionally wrap JSON in ```json fences — try to recover.
    const fenced = text.match(/\{[\s\S]*\}/);
    if (fenced) {
      try {
        return JSON.parse(fenced[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

async function wrap(env: Env, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return json({ error: (e as Error).message || 'Internal error' }, 500, env);
  }
}

function preflight(env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env),
  });
}

function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(env),
    },
  });
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}
