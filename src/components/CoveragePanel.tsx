import type { GapResult } from '../schemas/package';
import { CATALOGUE_BY_KEY } from '../rules/guardrailCatalogue';

interface Props {
  gaps: GapResult[];
}

/**
 * Surfaces what the tool could NOT determine — distinct from guardrails the
 * product genuinely lacks (those live in the Gap report). These are the blind
 * spots the user should verify manually: nothing found at all, or sources that
 * mentioned a control without confirming it.
 */
export function CoveragePanel({ gaps }: Props) {
  const noEvidence = gaps.filter((g) => g.coverage === 'no_evidence');
  const unconfirmed = gaps.filter((g) => g.coverage === 'unknown');
  const total = noEvidence.length + unconfirmed.length;

  return (
    <details open className="card card-pad">
      <summary className="cursor-pointer">
        <h3 className="inline text-base font-semibold text-ink-900">
          Coverage check
        </h3>
        <p className="text-xs text-ink-500 mt-0.5">
          {total === 0
            ? 'Every required guardrail reached a confident verdict.'
            : `${total} guardrail${total === 1 ? '' : 's'} the tool could not confirm — verify ${total === 1 ? 'it' : 'these'} manually before trusting the result.`}
        </p>
      </summary>

      {total > 0 && (
        <div className="mt-3 space-y-3">
          <Group
            title="No evidence found"
            hint="Nothing turned up for these — they may exist but were not surfaced, or may genuinely be absent."
            items={noEvidence}
          />
          <Group
            title="Found but unconfirmed"
            hint="Sources mentioned these but the evidence was inconclusive or low-confidence."
            items={unconfirmed}
          />
        </div>
      )}
    </details>
  );
}

function Group({
  title,
  hint,
  items,
}: {
  title: string;
  hint: string;
  items: GapResult[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-700">
        {title} ({items.length})
      </div>
      <p className="text-[11px] text-ink-500 mb-1">{hint}</p>
      <ul className="space-y-1.5">
        {items.map((g) => {
          const def = CATALOGUE_BY_KEY[g.key];
          return (
            <li
              key={g.key}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2"
            >
              <div className="text-sm font-medium text-ink-900">
                {def?.label ?? g.key}
              </div>
              <p className="text-[11px] text-ink-600 mt-0.5">{def?.threat}</p>
              <p className="text-[11px] text-amber-800 mt-1">
                Check the vendor's docs directly, then record your verdict in the
                guardrail matrix.
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
