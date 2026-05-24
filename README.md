# Guardrail Tool

Type a product or platform name → an LLM finds matching products and classifies
the one you pick into one of 8 AI architecture patterns → the page shows the
guardrails that pattern needs, where they sit in the data flow, and how to
prioritise them.

The data layer (8 patterns × 25 guardrails) is the same one used in the
internal `digitalnsw` Guardrails Guide; only the entry point is new.

## Stack

- **Frontend:** Vite + React 18 + TypeScript + Tailwind
- **Backend:** A single Cloudflare Worker (`worker/index.ts`) that proxies
  OpenRouter and also serves the built SPA via the `[assets]` binding.
- **LLM:** OpenRouter — model name and API key live in env vars; no UI for
  either.

## Local dev

```bash
npm install

# Copy the example env file, then set your OpenRouter key in .dev.vars
cp .env.example .dev.vars
# edit .dev.vars and set OPENROUTER_API_KEY=sk-or-...

# In two terminals:
npm run worker   # wrangler dev on :8787 (handles /api/*)
npm run dev      # vite on :5173, proxies /api → :8787
```

Open <http://localhost:5173>.

Without `OPENROUTER_API_KEY`, the API returns 503 and the UI shows a clean
error banner — the 8 pattern buttons still work as a manual fallback.

## Deploy

```bash
npx wrangler secret put OPENROUTER_API_KEY    # one-time
npm run deploy                                 # builds + deploys worker
```

`npm run deploy` runs `vite build` then `wrangler deploy`. The Worker serves
`dist/` via its `[assets]` binding and handles `/api/*` itself, so it's a
single deployable.

## How classification works

`worker/index.ts` exposes two routes:

| Route             | Input             | Output                                          |
|-------------------|-------------------|-------------------------------------------------|
| `POST /api/suggest`  | `{ query }`       | `{ suggestions: [{ name, vendor, oneLiner }] }` |
| `POST /api/classify` | `{ product }`     | `{ patternId, rationale }`                      |

Both call OpenRouter with `response_format: json_object` and validate the
result. `classify` validates `patternId` against the 8 known ids and falls
back to `single-turn` if the model returns something unrecognised.

To avoid drift, the worker imports the pattern list from
`src/data/patternSummary.ts`, which is also re-exported into the React app.

## Out of scope

No persistence, no auth, no editing of patterns/guardrails, no analytics.
