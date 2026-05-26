# Guardrail Tool

Type a product → identify the implementation pattern → extract the guardrails
the vendor builds in for that pattern (web search + verbatim-quote evidence)
→ deterministic gap analysis classifies each required guardrail as
**present / configurable / missing / disputed** and points you at the
external control surface where you must compensate for missing ones.

The discipline is cloned from the [Prequal](https://github.com/danr75/Prequal-)
sibling project: **two-pass LLM workflow** (cheap preflight → user picker →
deep extraction with `web_search`) followed by a **pure-code** gap-analysis
engine. The LLM only gathers evidence; rules in code apply the verdicts.
That's what makes results auditable and re-renderable without re-billing
OpenRouter.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind
- **Backend:** A single Cloudflare Worker (`worker/index.ts`) that proxies
  OpenRouter and serves the built SPA via the `[assets]` binding.
- **LLM:** OpenRouter — `anthropic/claude-haiku-4.5` for preflight + extract,
  escalates to `anthropic/claude-sonnet-4.6` on weak evidence.
- **Search:** Anthropic's `web_search_20260209` tool (server-side via OpenRouter).

## Architecture

```
user query
  ▼
POST /api/preflight       (cheap, no tools, max_tokens=1200, Haiku, ~5s)
  │   → ProductCandidate[] (≤4) with deploymentOptions + aiShapeOptions
  ▼
needsPicker(candidates) ?
  │   yes → ProductPicker: user picks candidate + (deployment, aiShape) tuple
  │   no  → silent default
  ▼
POST /api/extract  (SSE)  (web_search, ≤4 roundtrips, escalation gated)
  │   Streams phase / roundtrip / message events
  │   → { product, evidence[], guardrails[], metrics, partial?: true }
  ▼
evaluateGuardrails(observed)   (pure code, no LLM)
  │   → GapResult[] (present | configurable | missing | disputed | n/a)
  ▼
render: ControlPlacementMap + GapReport + GuardrailMatrix + CostBadge
```

### Closed sets

These are the load-bearing types in `src/schemas/guardrails.ts`. **The LLM is
constrained to emit only these keys.** Adding a key requires a code change
(bump `CLOSED_SET_VERSION`).

- 5 `Deployment` (SaaS multi-tenant / SaaS dedicated / Self-hosted / API endpoint / Embedded SDK)
- 5 `AiShape` (Chat assistant / Agent with tools / RAG-grounded / Fine-tuned / Generative)
- 27 `GuardrailKey` (prompt_injection_filter, output_filter, pii_redaction, …)
- 10 `ControlSurface` (vendor_runtime, vendor_admin_console, customer_config, client_application, network_edge_proxy, identity_provider, data_loss_prevention, siem_or_observability, api_gateway, governance_policy)
- 5 `Presence` (built_in / configurable / optional_add_on / not_supported / unknown)
- 5 `GapStatus` (present / configurable / missing / disputed / not_applicable)

A static `ALLOWED_SURFACES: Record<GuardrailKey, ControlSurface[]>` rejects
nonsense combinations (e.g. `tenant_isolation @ client_application`).
`presence: built_in` requires a verbatim quote ≥20 chars from a high-trust
primary source — otherwise normalization downgrades it.

## Local dev

```bash
npm install
cp .env.example .dev.vars   # then set OPENROUTER_API_KEY=sk-or-...

# Two terminals:
npm run worker   # wrangler dev on :8787 (mkdir -p dist first time)
npm run dev      # vite on :5173, proxies /api → :8787
```

Open <http://localhost:5173>. Try `"Microsoft 365 Copilot"`.

Without `OPENROUTER_API_KEY`, `/api/*` returns `503 no_key` and the UI shows
a clean error. The 8 manual-pattern picker from v1 is gone — there is no
deterministic fallback for the LLM step. (The gap-analysis engine is still
pure code, so it runs in unit tests without the LLM.)

## Deploy

```bash
npx wrangler secret put OPENROUTER_API_KEY   # one-time
npm run deploy                                # vite build + wrangler deploy
```

**Workers Paid plan is recommended.** A 4-roundtrip web_search extract can
take 60–180s, which exceeds Workers free-tier wall-clock limits.

## Endpoints

All routes use a typed envelope:

```ts
{ ok: true, data: T }
| { ok: false, error: { code, message, retriable, phase } }
```

| Route | Method | Notes |
|---|---|---|
| `/api/preflight` | POST | Haiku, no tools, `max_tokens: 1200`. Returns `ProductCandidate[]`. |
| `/api/extract` | POST, SSE | Multi-roundtrip web_search. Streams `progress` + `done` events. |
| `/api/pricing` | GET | OpenRouter `/models` proxy, cached 24h via Workers Cache API. Fallback price table for ~4 models so cost UI never breaks. |

## Cost discipline (inherited from Prequal)

- `cache_control: ephemeral` on system prompt + final tool def for every call
  → ~10× input-token cost cut across multi-roundtrip web_search loops.
- `UsageTracker` records every call by **requested model id** (not API echo)
  + by phase (`preflight / extraction / escalation`).
- Pricing fetched once per 24h per region; `estimateCostUsd()` runs in the
  Worker so the final package ships with USD stamped in.
- **Escalation, pinned numerically:** Haiku first; escalate to Sonnet 4.6 if
  `< 3 distinct primary-source evidence items after 2 roundtrips` OR
  `> 30% of observed guardrails resolved to unknown`.

## TODOs / deferred

- Persistence: `localStorage` library + JSON export/import. Schema is
  versioned (`CLOSED_SET_VERSION` is already stamped into every package);
  the storage layer itself is not yet wired up.
- `HowItWorks` component explaining the two-pass discipline.
- Per-product extract caching keyed by `sha256(product || deployment || aiShape)`
  so re-renders after a gap-engine code change don't re-bill OpenRouter.
- `partial: true` plumbing for mid-stream extract failures (current implementation always returns `partial: false`).

## Out of scope

- Multi-system / router / swarm topology diagrams. `ControlPlacementMap` is
  fixed-zone deterministic. Real topology may come in v3.
- Auth, multi-user, billing.
- Runtime editing of the guardrail catalogue (closed-set discipline forbids it).
