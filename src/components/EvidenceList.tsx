import {
  EVIDENCE_CATEGORY_LABELS,
  TRUST_LEVEL_LABELS,
  type Evidence,
  type TrustLevel,
} from '../schemas/evidence';

interface Props {
  evidenceIds: string[];
  evidenceById: Map<string, Evidence>;
}

const TRUST_PILL: Record<TrustLevel, string> = {
  very_high: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  low: 'bg-orange-100 text-orange-800 border-orange-300',
  very_low: 'bg-rose-100 text-rose-800 border-rose-300',
};

/**
 * Renders the supporting sources for a verdict: clickable URL, publisher, the
 * verbatim quote, and category + trust-level pills. Ids absent from the map are
 * skipped (a verdict may reference evidence dropped during normalization).
 */
export function EvidenceList({ evidenceIds, evidenceById }: Props) {
  const items = Array.from(new Set(evidenceIds))
    .map((id) => evidenceById.get(id))
    .filter((e): e is Evidence => Boolean(e));

  if (items.length === 0) {
    return (
      <p className="text-[11px] text-ink-400 italic">
        No source evidence recorded for this guardrail.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((e) => (
        <li
          key={e.id}
          className="rounded-md border border-ink-300 bg-white px-2.5 py-2"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={
                'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] ' +
                TRUST_PILL[e.trustLevel]
              }
            >
              {TRUST_LEVEL_LABELS[e.trustLevel]} trust
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-ink-300 bg-slate-50 text-[10px] text-ink-700">
              {EVIDENCE_CATEGORY_LABELS[e.category]}
            </span>
          </div>
          {e.url ? (
            <a
              href={e.url}
              target="_blank"
              rel="noreferrer"
              className="block text-[11px] text-sky-700 hover:underline break-all mt-1"
            >
              {e.title ?? e.url}
            </a>
          ) : (
            e.title && (
              <div className="text-[11px] text-ink-800 mt-1">{e.title}</div>
            )
          )}
          {e.publisher && (
            <div className="text-[10px] text-ink-500">{e.publisher}</div>
          )}
          {e.quote && (
            <blockquote className="mt-1 border-l-2 border-ink-300 pl-2 text-[11px] text-ink-700 italic">
              “{e.quote}”
            </blockquote>
          )}
        </li>
      ))}
    </ul>
  );
}
