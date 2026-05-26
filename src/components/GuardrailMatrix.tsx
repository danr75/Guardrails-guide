import {
  CONTROL_SURFACE_LABELS,
  GAP_STATUS_LABELS,
} from '../schemas/guardrails';
import type { GapResult } from '../schemas/package';
import { CATALOGUE_BY_KEY } from '../rules/guardrailCatalogue';

interface Props {
  gaps: GapResult[];
}

const STATUS_PILL: Record<GapResult['status'], string> = {
  present: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  configurable: 'bg-amber-100 text-amber-800 border-amber-300',
  missing: 'bg-rose-100 text-rose-800 border-rose-300',
  disputed: 'bg-violet-100 text-violet-800 border-violet-300',
  not_applicable: 'bg-slate-100 text-slate-700 border-slate-300',
};

const STATUS_RANK: Record<GapResult['status'], number> = {
  disputed: 0,
  missing: 1,
  configurable: 2,
  present: 3,
  not_applicable: 4,
};

export function GuardrailMatrix({ gaps }: Props) {
  const sorted = [...gaps].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  );
  return (
    <section className="card card-pad space-y-2">
      <header>
        <h3 className="text-base font-semibold text-ink-900">Guardrail matrix</h3>
        <p className="text-xs text-ink-500">
          Disputed and missing guardrails sort first. Hover a row for the rationale.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-[680px] w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-ink-600">
              <th className="px-2 py-2 border-b border-ink-300">Guardrail</th>
              <th className="px-2 py-2 border-b border-ink-300">Status</th>
              <th className="px-2 py-2 border-b border-ink-300">Where</th>
              <th className="px-2 py-2 border-b border-ink-300">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => {
              const def = CATALOGUE_BY_KEY[g.key];
              return (
                <tr key={g.key} title={g.rationale}>
                  <td className="px-2 py-1.5 border-b border-ink-300/60 align-top">
                    <div className="text-ink-900 font-medium">{def?.label ?? g.key}</div>
                    <div className="text-[10px] text-ink-500">{def?.threat}</div>
                  </td>
                  <td className="px-2 py-1.5 border-b border-ink-300/60 align-top">
                    <span
                      className={
                        'inline-flex items-center px-2 py-0.5 rounded-md border ' +
                        STATUS_PILL[g.status]
                      }
                    >
                      {GAP_STATUS_LABELS[g.status]}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 border-b border-ink-300/60 align-top">
                    {g.presentAt && g.presentAt.length > 0 ? (
                      <ul className="space-y-0.5">
                        {g.presentAt.map((s) => (
                          <li key={s} className="text-ink-700">
                            {CONTROL_SURFACE_LABELS[s]}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-ink-400 italic">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 border-b border-ink-300/60 align-top">
                    <span className="text-ink-700 tabular-nums">
                      {g.observed?.length ?? 0}
                    </span>
                    {g.observed && g.observed.length > 0 && (
                      <span className="text-[10px] text-ink-500"> obs</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
