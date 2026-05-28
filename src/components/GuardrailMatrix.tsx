import {
  CONTROL_SURFACE_LABELS,
  GAP_STATUS_LABELS,
  VALIDATION_VERDICTS,
  VALIDATION_VERDICT_LABELS,
  type GuardrailKey,
  type ValidationVerdict,
} from '../schemas/guardrails';
import type { Evidence } from '../schemas/evidence';
import type { AssessmentPackage, GapResult } from '../schemas/package';
import { CATALOGUE_BY_KEY } from '../rules/guardrailCatalogue';
import { EvidenceList } from './EvidenceList';

interface Props {
  gaps: GapResult[];
  evidenceById: Map<string, Evidence>;
  validations?: AssessmentPackage['validations'];
  onValidate?: (key: GuardrailKey, verdict: ValidationVerdict, note?: string) => void;
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

const VERDICT_PILL: Record<ValidationVerdict, string> = {
  confirmed: 'bg-emerald-600 text-white border-emerald-600',
  refuted_or_different: 'bg-rose-600 text-white border-rose-600',
  needs_review: 'bg-amber-500 text-white border-amber-500',
};

export function GuardrailMatrix({
  gaps,
  evidenceById,
  validations,
  onValidate,
}: Props) {
  const sorted = [...gaps].sort(
    (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status],
  );
  return (
    <details open className="card card-pad">
      <summary className="cursor-pointer">
        <h3 className="inline text-base font-semibold text-ink-900">Guardrail matrix</h3>
        <p className="text-xs text-ink-500 mt-0.5">
          Disputed and missing guardrails sort first. Expand the Sources column to
          see where each verdict came from, then record your own verdict.
        </p>
      </summary>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[820px] w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="text-left text-ink-600">
              <th className="px-2 py-2 border-b border-ink-300">Guardrail</th>
              <th className="px-2 py-2 border-b border-ink-300">Tool status</th>
              <th className="px-2 py-2 border-b border-ink-300">Your verdict</th>
              <th className="px-2 py-2 border-b border-ink-300">Where</th>
              <th className="px-2 py-2 border-b border-ink-300">Sources</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => {
              const def = CATALOGUE_BY_KEY[g.key];
              const ids = Array.from(
                new Set((g.observed ?? []).flatMap((o) => o.evidenceIds)),
              );
              const sourceCount = new Set(
                ids.filter((id) => evidenceById.has(id)),
              ).size;
              const obsCount = g.observed?.length ?? 0;
              const current = validations?.[g.key];
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
                    {g.coverage && g.coverage !== 'determined' && (
                      <div className="text-[10px] text-amber-700 mt-0.5">
                        {g.coverage === 'no_evidence'
                          ? 'no evidence'
                          : 'unconfirmed'}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 border-b border-ink-300/60 align-top">
                    <div className="flex flex-col gap-1">
                      {VALIDATION_VERDICTS.map((v) => {
                        const active = current?.verdict === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            disabled={!onValidate}
                            onClick={() => onValidate?.(g.key, v, current?.note)}
                            className={
                              'text-[10px] px-1.5 py-0.5 rounded border text-left transition-colors disabled:opacity-50 ' +
                              (active
                                ? VERDICT_PILL[v]
                                : 'bg-white text-ink-600 border-ink-300 hover:bg-slate-50')
                            }
                          >
                            {VALIDATION_VERDICT_LABELS[v]}
                          </button>
                        );
                      })}
                    </div>
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
                  <td className="px-2 py-1.5 border-b border-ink-300/60 align-top min-w-[220px]">
                    <details>
                      <summary className="cursor-pointer text-ink-700 tabular-nums">
                        {sourceCount} source{sourceCount === 1 ? '' : 's'}
                        <span className="text-[10px] text-ink-500"> · {obsCount} obs</span>
                      </summary>
                      <div className="mt-2 space-y-2">
                        <EvidenceList evidenceIds={ids} evidenceById={evidenceById} />
                        {onValidate && (
                          <input
                            className="input w-full text-[11px]"
                            placeholder="Validation note (optional)…"
                            defaultValue={current?.note ?? ''}
                            onBlur={(e) => {
                              const note = e.target.value.trim() || undefined;
                              if (note === current?.note) return;
                              // A note with no prior verdict implies the user is
                              // flagging the item for review.
                              onValidate(g.key, current?.verdict ?? 'needs_review', note);
                            }}
                          />
                        )}
                        {current?.note && !onValidate && (
                          <p className="text-[11px] text-ink-600 italic">
                            Note: {current.note}
                          </p>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
