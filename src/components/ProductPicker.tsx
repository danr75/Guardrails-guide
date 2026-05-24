import { useState, type FormEvent } from 'react';
import {
  ApiError,
  classifyProduct,
  suggestProducts,
  type ProductSuggestion,
} from '../lib/api';
import { PATTERNS } from '../data/guardrailsGuide';

interface Props {
  onClassified: (args: { productLabel: string; patternId: string; rationale: string }) => void;
  /** Currently active product label, if any. Drives the banner. */
  productLabel: string | null;
  /** Rationale returned by classify, shown in the banner. */
  rationale: string | null;
  /** Active patternId (from App). Used to show the pattern name in the banner. */
  patternId: string;
  /** Reset back to "no product picked". */
  onReset: () => void;
}

export function ProductPicker({
  onClassified,
  productLabel,
  rationale,
  patternId,
  onReset,
}: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ProductSuggestion[] | null>(null);
  const [stage, setStage] = useState<'idle' | 'suggesting' | 'classifying'>('idle');
  const [error, setError] = useState<string | null>(null);

  const patternName =
    PATTERNS.find((p) => p.id === patternId)?.name ?? patternId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || stage !== 'idle') return;
    setError(null);
    setSuggestions(null);
    setStage('suggesting');
    try {
      const res = await suggestProducts(q);
      setSuggestions(res.suggestions ?? []);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setStage('idle');
    }
  }

  async function pickProduct(label: string) {
    if (stage !== 'idle') return;
    setError(null);
    setStage('classifying');
    try {
      const res = await classifyProduct(label);
      onClassified({
        productLabel: label,
        patternId: res.patternId,
        rationale: res.rationale,
      });
      setSuggestions(null);
      setQuery('');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setStage('idle');
    }
  }

  const busy = stage !== 'idle';

  return (
    <section className="card card-pad space-y-3">
      <header>
        <h2 className="text-base font-semibold text-ink-900">
          What guardrails do we need for…
        </h2>
        <p className="text-xs text-ink-500 mt-0.5">
          Type a product, platform, or system. An LLM will find matches and pick
          the closest architecture pattern. You can override the pattern below.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          id="product-query"
          name="product-query"
          className="input flex-1"
          placeholder="e.g. Microsoft Copilot, Glean, in-house RAG chatbot"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={busy}
          aria-label="Product or platform name"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !query.trim()}
        >
          {stage === 'suggesting' ? 'Searching…' : 'Find matches'}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-800 text-xs px-3 py-2">
          {error}
        </div>
      )}

      {suggestions && (
        <div className="space-y-2">
          {suggestions.length === 0 ? (
            <p className="text-xs text-ink-500 italic">
              No matches. Try a different term, or pick "use my exact text" below.
            </p>
          ) : (
            <>
              <div className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">
                Suggestions
              </div>
              <ul className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <li key={`${s.vendor}-${s.name}`}>
                    <button
                      onClick={() => pickProduct(`${s.name} (${s.vendor})`)}
                      disabled={busy}
                      className="rounded-md border border-ink-300 bg-white hover:bg-ink-100 px-3 py-1.5 text-left text-xs disabled:opacity-50"
                      title={s.oneLiner}
                    >
                      <div className="text-sm font-medium text-ink-900">
                        {s.name}
                      </div>
                      <div className="text-[11px] text-ink-500">
                        {s.vendor} — {s.oneLiner}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button
            onClick={() => pickProduct(query.trim())}
            disabled={busy || !query.trim()}
            className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900 disabled:opacity-50"
          >
            None of these — use my exact text ("{query.trim()}")
          </button>
        </div>
      )}

      {stage === 'classifying' && (
        <p className="text-xs text-ink-500 italic">Classifying…</p>
      )}

      {productLabel && (
        <div className="rounded-md border border-ink-300 bg-ink-100/60 px-3 py-2 text-xs text-ink-800 flex items-start gap-2 flex-wrap">
          <span>
            Treating <strong>{productLabel}</strong> as{' '}
            <strong>{patternName}</strong>
            {rationale ? ` — ${rationale}` : ''}
          </span>
          <button
            onClick={onReset}
            className="ml-auto text-ink-700 underline underline-offset-2 hover:text-ink-900"
          >
            Change
          </button>
        </div>
      )}
    </section>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 503) return 'LLM not configured. Pattern buttons still work.';
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
