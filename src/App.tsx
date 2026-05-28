import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  extractPackage,
  preflightQuery,
  type ExtractProgressEvent,
  type PreflightProductCandidate,
} from './lib/api';
import {
  AI_SHAPE_LABELS,
  CLOSED_SET_VERSION,
  DEPLOYMENT_LABELS,
  type AiShape,
  type Deployment,
  type GuardrailKey,
  type ValidationVerdict,
} from './schemas/guardrails';
import type { AssessmentPackage } from './schemas/package';
import { evaluateGuardrails } from './rules/engine';
import { isStale, saveAssessment } from './lib/storage';
import { ProductPicker } from './components/ProductPicker';
import { ExtractionProgress } from './components/ExtractionProgress';
import { ControlPlacementMap } from './components/ControlPlacementMap';
import { GuardrailMatrix } from './components/GuardrailMatrix';
import { GapReport } from './components/GapReport';
import { CoveragePanel } from './components/CoveragePanel';
import { CostBadge } from './components/CostBadge';
import { CatalogueBrowse } from './components/CatalogueBrowse';
import { SavedAssessments } from './components/SavedAssessments';

type Status =
  | { kind: 'idle' }
  | { kind: 'preflighting' }
  | { kind: 'picking'; candidates: PreflightProductCandidate[] }
  | { kind: 'extracting'; progress: ExtractProgressEvent[]; startedAt: number }
  | { kind: 'done'; pkg: AssessmentPackage }
  | { kind: 'error'; message: string; code?: string };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function App() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Bumped on save/delete so the saved-assessments list re-reads localStorage.
  const [savedVersion, setSavedVersion] = useState(0);
  // Shown when a loaded/imported package predated the current catalogue and its
  // gaps were recomputed.
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  // Tracks the currently-active extract so a second submission (or a reset)
  // aborts the prior stream and prevents its stale handlers from overwriting
  // newer UI state.
  const abortRef = useRef<AbortController | null>(null);

  // Persist whenever we land on (or edit) a completed assessment. Validation
  // edits produce a new pkg object, so verdicts are re-saved automatically.
  useEffect(() => {
    if (status.kind !== 'done') return;
    if (saveAssessment(status.pkg)) setSavedVersion((v) => v + 1);
  }, [status]);

  // Warn before refresh / navigation while an extract is in flight — losing
  // the SSE stream means the worker keeps burning tokens with no UI to receive
  // the result. The worker-side AbortSignal stops that cost bleed, but
  // discouraging the refresh in the first place is the better UX.
  useEffect(() => {
    if (status.kind !== 'preflighting' && status.kind !== 'extracting') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status.kind]);

  async function handleQuerySubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadWarning(null);
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
      setStatus({ kind: 'error', message: messageFor(err), code: codeFor(err) });
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
    setLoadWarning(null);
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
      setStatus({ kind: 'error', message: messageFor(err), code: codeFor(err) });
    }
  }

  // Records the user's own verdict on a guardrail. Kept separate from the
  // deterministic gap status; auto-save persists it.
  function setValidation(
    key: GuardrailKey,
    verdict: ValidationVerdict,
    note?: string,
  ) {
    setStatus((s) => {
      if (s.kind !== 'done') return s;
      const validations = {
        ...(s.pkg.validations ?? {}),
        [key]: { verdict, note, validatedAt: new Date().toISOString() },
      };
      return { kind: 'done', pkg: { ...s.pkg, validations } };
    });
  }

  // Re-open a saved or imported assessment. If it predates the current
  // catalogue, recompute its gaps so the verdicts reflect today's rules.
  function loadPkg(pkg: AssessmentPackage) {
    abortRef.current?.abort();
    abortRef.current = null;
    if (isStale(pkg)) {
      const gaps = evaluateGuardrails(pkg.observed);
      setLoadWarning(
        `This assessment was captured against guardrail catalogue v${pkg.closedSetVersion}. Gaps were recomputed against the current v${CLOSED_SET_VERSION}; evidence and observations are unchanged.`,
      );
      setStatus({
        kind: 'done',
        pkg: { ...pkg, gaps, closedSetVersion: CLOSED_SET_VERSION },
      });
    } else {
      setLoadWarning(null);
      setStatus({ kind: 'done', pkg });
    }
  }

  function reset() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadWarning(null);
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
            onCancel={reset}
          />
        )}

        {status.kind === 'error' && (
          <>
            <section className="card card-pad">
              <div className="rounded-md border border-rose-300 bg-rose-50 text-rose-800 text-sm px-3 py-2">
                {status.message}
              </div>
              <button onClick={reset} className="btn mt-3">
                Try again
              </button>
            </section>
            {status.code === 'no_key' && <CatalogueBrowse defaultOpen />}
          </>
        )}

        {status.kind === 'done' && (
          <>
            <section className="card card-pad">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-base font-semibold text-ink-900">
                    {status.pkg.product.name}
                    {status.pkg.product.version && (
                      <span className="ml-2 align-middle inline-flex items-center px-1.5 py-0.5 rounded border border-ink-300 bg-slate-50 text-[11px] font-normal text-ink-600">
                        v{status.pkg.product.version}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-ink-500">
                    {status.pkg.product.vendor} ·{' '}
                    {DEPLOYMENT_LABELS[status.pkg.product.deployment]} ·{' '}
                    {AI_SHAPE_LABELS[status.pkg.product.aiShape]}
                  </p>
                  <p className="text-[11px] text-ink-400 mt-0.5">
                    Assessed on {formatDate(status.pkg.createdAt)} · catalogue v
                    {status.pkg.closedSetVersion} · version:{' '}
                    {status.pkg.product.version ?? 'unspecified'}
                  </p>
                </div>
                <button onClick={reset} className="btn">
                  Start over
                </button>
              </div>
              {loadWarning && (
                <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs px-3 py-2">
                  {loadWarning}
                </div>
              )}
            </section>
            <ControlPlacementMap gaps={status.pkg.gaps} />
            <GapReport gaps={status.pkg.gaps} />
            <CoveragePanel gaps={status.pkg.gaps} />
            <GuardrailMatrix
              gaps={status.pkg.gaps}
              evidenceById={
                new Map(status.pkg.evidence.map((e) => [e.id, e]))
              }
              validations={status.pkg.validations}
              onValidate={setValidation}
            />
            {status.pkg.metrics && <CostBadge metrics={status.pkg.metrics} />}
          </>
        )}

        <SavedAssessments onLoad={loadPkg} refreshKey={savedVersion} />
        <CatalogueBrowse />
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

function codeFor(err: unknown): string | undefined {
  return err instanceof ApiError ? err.code : undefined;
}
