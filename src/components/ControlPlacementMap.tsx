import {
  CONTROL_SURFACE_LABELS,
  GAP_STATUS_LABELS,
  SURFACE_TO_ZONE,
  type ControlSurface,
  type ControlZone,
  type GuardrailKey,
} from '../schemas/guardrails';
import type { GapResult } from '../schemas/package';
import { CATALOGUE_BY_KEY } from '../rules/guardrailCatalogue';

interface Props {
  gaps: GapResult[];
}

const ZONES: { id: ControlZone; label: string; sub: string }[] = [
  { id: 'user_boundary', label: 'User boundary', sub: 'Browser / client app' },
  { id: 'product_runtime', label: 'Product runtime', sub: 'Vendor-enforced controls' },
  { id: 'product_admin', label: 'Product admin', sub: 'Customer-tunable controls' },
  { id: 'external_controls', label: 'External controls', sub: 'You must deploy' },
];

const STATUS_DOT: Record<GapResult['status'], string> = {
  present: 'bg-emerald-500',
  configurable: 'bg-amber-500',
  missing: 'bg-rose-500',
  disputed: 'bg-violet-500',
  not_applicable: 'bg-slate-400',
};

const STATUS_BORDER: Record<GapResult['status'], string> = {
  present: 'border-emerald-300 bg-emerald-50',
  configurable: 'border-amber-300 bg-amber-50',
  missing: 'border-rose-300 bg-rose-50',
  disputed: 'border-violet-300 bg-violet-50',
  not_applicable: 'border-slate-300 bg-slate-50',
};

interface Chip {
  key: GuardrailKey;
  status: GapResult['status'];
  surface: ControlSurface;
  label: string;
  rationale: string;
}

function placementChips(gaps: GapResult[]): Record<ControlZone, Chip[]> {
  const byZone: Record<ControlZone, Chip[]> = {
    user_boundary: [],
    product_runtime: [],
    product_admin: [],
    external_controls: [],
  };
  for (const g of gaps) {
    const def = CATALOGUE_BY_KEY[g.key];
    const label = def?.label ?? g.key;

    if (g.status === 'missing') {
      // Place by suggested compensation; fall back to external_controls zone.
      const suggestion = g.compensations?.[0]?.surface ?? 'governance_policy';
      byZone[SURFACE_TO_ZONE[suggestion]].push({
        key: g.key,
        status: g.status,
        surface: suggestion,
        label,
        rationale: g.rationale,
      });
      continue;
    }
    const surfaces = g.presentAt && g.presentAt.length > 0 ? g.presentAt : ['vendor_runtime' as ControlSurface];
    for (const s of surfaces) {
      byZone[SURFACE_TO_ZONE[s]].push({
        key: g.key,
        status: g.status,
        surface: s,
        label,
        rationale: g.rationale,
      });
    }
  }
  return byZone;
}

export function ControlPlacementMap({ gaps }: Props) {
  const chips = placementChips(gaps);

  return (
    <details open className="card card-pad">
      <summary className="cursor-pointer">
        <h3 className="inline text-base font-semibold text-ink-900">
          Control placement map
        </h3>
        <p className="text-xs text-ink-500 mt-0.5">
          Where each required guardrail lives. Missing guardrails appear in
          the column where you should add an external control.
        </p>
      </summary>

      <div className="mt-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ZONES.map((z) => (
            <div
              key={z.id}
              className="rounded-lg border border-ink-300 bg-slate-50/60 p-2 min-h-[160px]"
            >
              <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-700">
                {z.label}
              </div>
              <div className="text-[10px] text-ink-500 mb-2">{z.sub}</div>
              <ul className="space-y-1.5">
                {chips[z.id].length === 0 && (
                  <li className="text-[11px] text-ink-400 italic">No guardrails placed.</li>
                )}
                {chips[z.id].map((c, i) => (
                  <li
                    key={`${c.key}-${c.surface}-${i}`}
                    className={
                      'rounded-md border px-2 py-1 ' + STATUS_BORDER[c.status]
                    }
                    title={`${GAP_STATUS_LABELS[c.status]} · ${CONTROL_SURFACE_LABELS[c.surface]} — ${c.rationale}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={'inline-block w-1.5 h-1.5 rounded-full shrink-0 ' + STATUS_DOT[c.status]} />
                      <span className="text-[11px] text-ink-900 font-medium truncate">
                        {c.label}
                      </span>
                    </div>
                    <div className="text-[10px] text-ink-600 truncate">
                      {CONTROL_SURFACE_LABELS[c.surface]}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Legend />
      </div>
    </details>
  );
}

function Legend() {
  const items: Array<{ status: GapResult['status']; label: string }> = [
    { status: 'present', label: 'Present' },
    { status: 'configurable', label: 'Configurable' },
    { status: 'missing', label: 'Missing — add externally' },
    { status: 'disputed', label: 'Disputed' },
  ];
  return (
    <div className="flex flex-wrap gap-3 text-[11px] text-ink-600">
      {items.map((i) => (
        <span key={i.status} className="inline-flex items-center gap-1.5">
          <span className={'inline-block w-1.5 h-1.5 rounded-full ' + STATUS_DOT[i.status]} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
