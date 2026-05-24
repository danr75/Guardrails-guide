import { useMemo, useState } from 'react';
import {
  GUARDRAILS,
  PATTERNS,
  PRIORITY_META,
  STAGE_META,
  type ArchPattern,
  type Guardrail,
  type Priority,
  type Stage,
} from '../data/guardrailsGuide';

const FLOW_STAGES: Stage[] = ['input', 'retrieval', 'model', 'action', 'output'];

const PRIORITY_ORDER: Priority[] = ['critical', 'recommended', 'optional'];

interface Props {
  patternId: ArchPattern['id'];
  onPatternChange: (id: ArchPattern['id']) => void;
}

export function GuardrailsGuideView({ patternId, onPatternChange }: Props) {
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const pattern = useMemo(
    () => PATTERNS.find((p) => p.id === patternId) ?? PATTERNS[0],
    [patternId],
  );

  const guardrailsByStage = useMemo(() => {
    const map = new Map<Stage, Array<{ g: Guardrail; priority: Priority }>>();
    for (const stage of FLOW_STAGES.concat('cross' as Stage)) map.set(stage, []);
    for (const g of GUARDRAILS) {
      const p = pattern.guardrails[g.id];
      if (!p) continue;
      if (criticalOnly && p !== 'critical') continue;
      map.get(g.stage)?.push({ g, priority: p });
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank ||
          a.g.name.localeCompare(b.g.name),
      );
    }
    return map;
  }, [pattern, criticalOnly]);

  const counts = useMemo(() => {
    const c: Record<Priority, number> = { critical: 0, recommended: 0, optional: 0 };
    for (const [id, prio] of Object.entries(pattern.guardrails)) {
      if (GUARDRAILS.find((g) => g.id === id)) c[prio] += 1;
    }
    return c;
  }, [pattern]);

  return (
    <div className="space-y-4">
      {/* Pattern selector */}
      <section className="card card-pad">
        <header className="mb-3 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-ink-900">
              Guardrails Guide
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Pick an architecture pattern to see which guardrails it needs, where
              they sit in the data flow, and how to prioritise them.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-ink-700 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-ink-900"
              checked={criticalOnly}
              onChange={(e) => setCriticalOnly(e.target.checked)}
            />
            Show critical only
          </label>
        </header>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PATTERNS.map((p) => {
            const active = p.id === patternId;
            return (
              <button
                key={p.id}
                onClick={() => onPatternChange(p.id)}
                className={
                  'text-left rounded-lg border px-3 py-2 transition ' +
                  (active
                    ? 'bg-ink-900 text-white border-ink-900'
                    : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-100')
                }
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div
                  className={
                    'text-[11px] mt-0.5 ' +
                    (active ? 'text-white/80' : 'text-ink-500')
                  }
                >
                  {p.tagline}
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-ink-600 mt-3">{pattern.description}</p>

        <div className="flex items-center gap-2 mt-3 text-[11px]">
          {PRIORITY_ORDER.map((p) => (
            <span
              key={p}
              className={
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-medium ' +
                PRIORITY_META[p].pill
              }
            >
              <span
                className={'inline-block w-1.5 h-1.5 rounded-full ' + PRIORITY_META[p].dot}
              />
              {PRIORITY_META[p].label}
              <span className="tabular-nums">{counts[p]}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Data flow diagram */}
      <section className="card card-pad">
        <header className="mb-3">
          <h4 className="text-sm font-semibold text-ink-900">Data flow</h4>
          <p className="text-xs text-ink-500">
            Each stage shows the guardrails that intercept data at that point. Hover
            a guardrail to highlight where it sits.
          </p>
        </header>

        <div className="overflow-x-auto">
          <div className="min-w-[920px] flex items-stretch gap-2">
            <EndpointNode label="User" />
            <FlowArrow />
            {FLOW_STAGES.map((stage, idx) => {
              const active = pattern.stages.includes(stage);
              const items = guardrailsByStage.get(stage) ?? [];
              return (
                <FlowStage
                  key={stage}
                  stage={stage}
                  active={active}
                  items={items}
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                  trailing={idx < FLOW_STAGES.length - 1}
                />
              );
            })}
            <FlowArrow />
            <EndpointNode label="User" />
          </div>
        </div>

        {/* Cross-cutting band */}
        <CrossCuttingBand
          items={guardrailsByStage.get('cross') ?? []}
          hoveredId={hoveredId}
          onHover={setHoveredId}
        />
      </section>

      {/* Guardrail detail list */}
      <section className="card card-pad">
        <header className="mb-3">
          <h4 className="text-sm font-semibold text-ink-900">
            Guardrails for {pattern.name}
          </h4>
          <p className="text-xs text-ink-500">
            Grouped by priority. Click a stage chip to filter.
          </p>
        </header>

        <div className="space-y-4">
          {PRIORITY_ORDER.map((prio) => {
            const items = GUARDRAILS.map((g) => {
              const p = pattern.guardrails[g.id];
              return p === prio ? g : null;
            }).filter((x): x is Guardrail => x !== null);
            if (items.length === 0) return null;
            return (
              <div key={prio}>
                <div
                  className={
                    'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium mb-2 ' +
                    PRIORITY_META[prio].pill
                  }
                >
                  <span
                    className={
                      'inline-block w-1.5 h-1.5 rounded-full ' +
                      PRIORITY_META[prio].dot
                    }
                  />
                  {PRIORITY_META[prio].label}
                </div>
                <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {items.map((g) => (
                    <li
                      key={g.id}
                      onMouseEnter={() => setHoveredId(g.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={
                        'rounded-md border px-3 py-2 transition ' +
                        (hoveredId === g.id
                          ? 'border-ink-900 shadow-sm'
                          : 'border-ink-300 bg-white')
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-ink-900">
                          {g.name}
                        </div>
                        <span
                          className={
                            'text-[10px] px-1.5 py-0.5 rounded border ' +
                            STAGE_META[g.stage].tone
                          }
                        >
                          {STAGE_META[g.stage].label}
                        </span>
                      </div>
                      <p className="text-xs text-ink-600 mt-1">{g.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison matrix */}
      <section className="card card-pad">
        <header className="mb-3">
          <h4 className="text-sm font-semibold text-ink-900">
            Pattern × guardrail matrix
          </h4>
          <p className="text-xs text-ink-500">
            Compare how priority shifts across patterns. Click a row to switch the
            selected pattern.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white text-left font-semibold text-ink-700 px-2 py-2 border-b border-ink-300">
                  Guardrail
                </th>
                {PATTERNS.map((p) => (
                  <th
                    key={p.id}
                    onClick={() => onPatternChange(p.id)}
                    className={
                      'px-2 py-2 border-b border-ink-300 text-left font-medium cursor-pointer ' +
                      (p.id === patternId ? 'text-ink-900' : 'text-ink-500 hover:text-ink-900')
                    }
                    title={p.name}
                  >
                    <div className="truncate max-w-[110px]">{p.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GUARDRAILS.map((g) => (
                <tr
                  key={g.id}
                  onMouseEnter={() => setHoveredId(g.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={hoveredId === g.id ? 'bg-ink-100' : ''}
                >
                  <td className="sticky left-0 bg-inherit px-2 py-1.5 border-b border-ink-300/60">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          'inline-block w-1.5 h-1.5 rounded-full ' +
                          STAGE_META[g.stage].tone.split(' ')[0].replace('bg-', 'bg-')
                        }
                      />
                      <span className="text-ink-800">{g.name}</span>
                    </div>
                  </td>
                  {PATTERNS.map((p) => {
                    const prio = p.guardrails[g.id];
                    return (
                      <td
                        key={p.id}
                        className="px-2 py-1.5 border-b border-ink-300/60"
                      >
                        {prio ? (
                          <span
                            className={
                              'inline-block w-3 h-3 rounded-full ' +
                              PRIORITY_META[prio].dot
                            }
                            title={`${p.name} · ${PRIORITY_META[prio].label}`}
                          />
                        ) : (
                          <span className="inline-block w-3 h-3 rounded-full border border-ink-300" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Flow building blocks                                                     */
/* ──────────────────────────────────────────────────────────────────────── */

function EndpointNode({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-20 shrink-0">
      <div className="w-12 h-12 rounded-full bg-ink-900 text-white flex items-center justify-center text-xs font-semibold">
        {label.slice(0, 1)}
      </div>
      <div className="text-[11px] text-ink-600 mt-1">{label}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center px-1 shrink-0">
      <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden>
        <path
          d="M0 7 H18 M14 2 L20 7 L14 12"
          stroke="#94a3b8"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function FlowStage({
  stage,
  active,
  items,
  hoveredId,
  onHover,
  trailing,
}: {
  stage: Stage;
  active: boolean;
  items: Array<{ g: Guardrail; priority: Priority }>;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  trailing: boolean;
}) {
  const meta = STAGE_META[stage];
  return (
    <>
      <div
        className={
          'flex-1 min-w-[150px] rounded-lg border px-3 py-3 transition ' +
          (active ? meta.tone : 'bg-slate-50/60 border-dashed border-ink-300 text-ink-400')
        }
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] uppercase tracking-wider font-semibold">
            {meta.label}
          </div>
          {!active && (
            <span className="text-[10px] text-ink-400">not used</span>
          )}
        </div>
        <div
          className={
            'text-[11px] mt-0.5 ' +
            (active ? 'opacity-80' : 'text-ink-400')
          }
        >
          {meta.short}
        </div>

        {active && (
          <ul className="mt-2 space-y-1">
            {items.length === 0 && (
              <li className="text-[11px] text-ink-500 italic">
                No guardrails at this priority
              </li>
            )}
            {items.map(({ g, priority }) => (
              <li
                key={g.id}
                onMouseEnter={() => onHover(g.id)}
                onMouseLeave={() => onHover(null)}
                title={g.why}
                className={
                  'flex items-center gap-1.5 rounded-md bg-white/80 border px-1.5 py-1 cursor-default transition ' +
                  (hoveredId === g.id
                    ? 'border-ink-900 shadow-sm'
                    : 'border-white/0 hover:border-ink-300')
                }
              >
                <span
                  className={
                    'inline-block w-1.5 h-1.5 rounded-full shrink-0 ' +
                    PRIORITY_META[priority].dot
                  }
                />
                <span className="text-[11px] text-ink-800 truncate">
                  {g.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {trailing && <FlowArrow />}
    </>
  );
}

function CrossCuttingBand({
  items,
  hoveredId,
  onHover,
}: {
  items: Array<{ g: Guardrail; priority: Priority }>;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={
        'mt-3 rounded-lg border px-3 py-2 ' + STAGE_META.cross.tone
      }
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wider font-semibold">
          {STAGE_META.cross.label}
        </span>
        <span className="text-[11px] opacity-75">
          Spans the whole pipeline
        </span>
        <span className="flex-1" />
        <ul className="flex flex-wrap gap-1.5 justify-end">
          {items.map(({ g, priority }) => (
            <li
              key={g.id}
              onMouseEnter={() => onHover(g.id)}
              onMouseLeave={() => onHover(null)}
              title={g.why}
              className={
                'inline-flex items-center gap-1.5 rounded-md bg-white/80 border px-2 py-1 cursor-default transition ' +
                (hoveredId === g.id
                  ? 'border-ink-900 shadow-sm'
                  : 'border-white/0 hover:border-ink-300')
              }
            >
              <span
                className={
                  'inline-block w-1.5 h-1.5 rounded-full ' +
                  PRIORITY_META[priority].dot
                }
              />
              <span className="text-[11px] text-ink-800">{g.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
