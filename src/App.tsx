import { useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  extractPackage,
  preflightQuery,
  type ExtractProgressEvent,
  type PreflightProductCandidate,
} from './lib/api';
import type { AiShape, Deployment } from './schemas/guardrails';
import type { AssessmentPackage } from './schemas/package';
import { evaluateGuardrails } from './rules/engine';
import { ProductPicker } from './components/ProductPicker';
import { ExtractionProgress } from './components/ExtractionProgress';
import { ControlPlacementMap } from './components/ControlPlacementMap';
import { GuardrailMatrix } from './components/GuardrailMatrix';
import { GapReport } from './components/GapReport';
import { CostBadge } from './components/CostBadge';

type Status =
  | { kind: 'idle' }
  | { kind: 'preflighting' }
  | { kind: 'picking'; candidates: PreflightProductCandidate[] }
  | { kind: 'extracting'; progress: ExtractProgressEvent[]; startedAt: number }
  | { kind: 'done'; pkg: AssessmentPackage }
  | { kind: 'error'; message: string };

export function App() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Tracks the currently-active extract so a second submission (or a reset)
  // aborts the prior stream and prevents its stale handlers from overwriting
  // newer UI state.
  const abortRef = useRef<AbortController | null>(null);

  async function handleQuerySubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: 'preflighting' });
    try {
      const res = await preflightQuery(q);
      if (res.candidates.length === 0) {
        setStatus({
          kind: 'error',
          message: 'No matching products found. Try a different name.',
        });
        return;
      }
      if (!res.needsPicker) {
        const c = res.candidates[0];
        await runExtract(q, c, c.deploymentOptions[0], c.aiShapeOptions[0]);
      } else {
        setStatus({ kind: 'picking', candidates: res.candidates });
      }
    } catch (err) {
      setStatus({ kind: 'error', message: messageFor(err) });
    }
  }

  async function runExtract(
    q: string,
    candidate: PreflightProductCandidate,
    deployment: Deployment,
    aiShape: AiShape,
  ) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    const events: ExtractProgressEvent[] = [];
    setStatus({ kind: 'extracting', progress: events, startedAt });
    try {
      const pkgWithoutGaps = await extractPackage(
        {
          query: q,
          product: candidate.name,
          vendor: candidate.vendor,
          deployment,
          aiShape,
        },
        {
          signal: controller.signal,
          onProgress: (e) => {
            if (controller.signal.aborted) return;
            events.push(e);
            setStatus({ kind: 'extracting', progress: [...events], startedAt });
          },
        },
      );
      if (controller.signal.aborted) return;
      const gaps = evaluateGuardrails(pkgWithoutGaps.observed);
      const pkg: AssessmentPackage = { ...pkgWithoutGaps, gaps };
      setStatus({ kind: 'done', pkg });
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus({ kind: 'error', message: messageFor(err) });
    }
  }

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: 'idle' });
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-ink-900">Guardrail Tool</h1>
          <p className="text-sm text-ink-600">
            Type a product. We identify the implementation pattern, extract the
            guardrails the vendor builds in for that pattern, and tell you which
            controls you must add externally.
          </p>
        </header>

        <section className="card card-pad space-y-2">
          <form onSubmit={handleQuerySubmit} className="flex gap-2">
            <input
              id="query"
              name="query"
              className="input flex-1"
              placeholder="e.g. Microsoft 365 Copilot, Glean, in-house RAG chatbot"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={
                status.kind === 'preflighting' || status.kind === 'extracting'
              }
              aria-label="Product or platform name"
            />
            <button
              type="submit"
              className="btn btn-primary disabled:opacity-50"
              disabled={
                !query.trim() ||
                status.kind === 'preflighting' ||
                status.kind === 'extracting'
              }
            >
              {status.kind === 'preflighting' ? 'Looking up…' : 'Assess'}
            </button>
          </form>
        </section>

        {status.kind === 'picking' && (
          <ProductPicker
            candidates={status.candidates}
            onSelect={(c, d, a) => runExtract(query, c, d, a)}
            onCancel={reset}
          />
        )}

        {status.kind === 'extracting' && (
          <ExtractionProgress
            events={status.progress}
            startedAt={status.startedAt}
          />
        )}

        {status.kind === 'error' && (
          <section className="card card-pad">
            <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-800 text-sm px-3 py-2">
              {status.message}
            </div>
            <button onClick={reset} className="btn mt-3">
              Try again
            </button>
          </section>
        )}

        {status.kind === 'done' && (
          <>
            <section className="card card-pad">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold text-ink-900">
                    {status.pkg.product.name}
                  </h2>
                  <p className="text-xs text-ink-500">
                    {status.pkg.product.vendor} · {status.pkg.product.deployment} ·{' '}
                    {status.pkg.product.aiShape}
                  </p>
                </div>
                <button onClick={reset} className="btn">
                  Start over
                </button>
              </div>
            </section>
            <ControlPlacementMap gaps={status.pkg.gaps} />
            <GapReport gaps={status.pkg.gaps} />
            <GuardrailMatrix gaps={status.pkg.gaps} />
            {status.pkg.metrics && <CostBadge metrics={status.pkg.metrics} />}
          </>
        )}
      </div>
    </div>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'no_key')
      return 'OpenRouter API key not configured on the server.';
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
