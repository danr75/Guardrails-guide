import {
  CONTROL_SURFACE_LABELS,
  type ControlSurface,
} from '../schemas/guardrails';
import type { GapResult } from '../schemas/package';
import { CATALOGUE_BY_KEY } from '../rules/guardrailCatalogue';

interface Props {
  gaps: GapResult[];
}

interface Bucket {
  surface: ControlSurface;
  items: Array<{ gap: GapResult; control: string; notes?: string }>;
}

function groupByCompensation(gaps: GapResult[]): Bucket[] {
  const missing = gaps.filter((g) => g.status === 'missing');
  const map = new Map<ControlSurface, Bucket['items']>();
  for (const g of missing) {
    const comps = g.compensations ?? [];
    if (comps.length === 0) {
      const arr = map.get('governance_policy') ?? [];
      arr.push({
        gap: g,
        control: 'Document the gap in your AI risk register. No standard external control covers this.',
      });
      map.set('governance_policy', arr);
      continue;
    }
    for (const c of comps) {
      const arr = map.get(c.surface) ?? [];
      arr.push({ gap: g, control: c.control, notes: c.notes });
      map.set(c.surface, arr);
    }
  }
  return Array.from(map.entries()).map(([surface, items]) => ({ surface, items }));
}

export function GapReport({ gaps }: Props) {
  const buckets = groupByCompensation(gaps);
  const missingCount = gaps.filter((g) => g.status === 'missing').length;

  return (
    <details open className="card card-pad">
      <summary className="cursor-pointer">
        <h3 className="inline text-base font-semibold text-ink-900">Gap report</h3>
        <p className="text-xs text-ink-500 mt-0.5">
          {missingCount === 0
            ? 'No required guardrails are missing.'
            : `${missingCount} required guardrail${missingCount === 1 ? '' : 's'} not provided by the product — group by where to enforce externally.`}
        </p>
      </summary>

      <div className="mt-3 space-y-3">
        {buckets.length === 0 ? (
          <p className="text-xs text-ink-500 italic">Nothing to report.</p>
        ) : (
          <ul className="space-y-3">
            {buckets.map((b) => (
              <li key={b.surface}>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-700">
                  {CONTROL_SURFACE_LABELS[b.surface]}
                </div>
                <ul className="mt-1 space-y-1.5">
                  {b.items.map((item, i) => {
                    const def = CATALOGUE_BY_KEY[item.gap.key];
                    return (
                      <li
                        key={`${item.gap.key}-${i}`}
                        className="rounded-md border border-ink-300 bg-white px-3 py-2"
                      >
                        <div className="text-sm font-medium text-ink-900">
                          {def?.label ?? item.gap.key}
                        </div>
                        <p className="text-[11px] text-ink-600 mt-0.5">{def?.threat}</p>
                        <p className="text-xs text-ink-800 mt-1">
                          <strong>Add:</strong> {item.control}
                        </p>
                        {item.notes && (
                          <p className="text-[11px] text-ink-500 mt-0.5">{item.notes}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
