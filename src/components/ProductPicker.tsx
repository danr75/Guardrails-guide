import { useId, useRef, useState, type KeyboardEvent } from 'react';
import type { PreflightProductCandidate } from '../lib/api';
import {
  AI_SHAPE_LABELS,
  DEPLOYMENT_LABELS,
  type AiShape,
  type Deployment,
} from '../schemas/guardrails';

interface Props {
  candidates: PreflightProductCandidate[];
  onSelect: (
    candidate: PreflightProductCandidate,
    deployment: Deployment,
    aiShape: AiShape,
  ) => void;
  onCancel: () => void;
}

export function ProductPicker({ candidates, onSelect, onCancel }: Props) {
  const [activeKey, setActiveKey] = useState<string>(keyFor(candidates[0]));
  const active = candidates.find((c) => keyFor(c) === activeKey) ?? candidates[0];

  const [deployment, setDeployment] = useState<Deployment | undefined>(
    active.deploymentOptions.length === 1 ? active.deploymentOptions[0] : undefined,
  );
  const [aiShape, setAiShape] = useState<AiShape | undefined>(
    active.aiShapeOptions.length === 1 ? active.aiShapeOptions[0] : undefined,
  );

  function switchCandidate(c: PreflightProductCandidate) {
    setActiveKey(keyFor(c));
    setDeployment(c.deploymentOptions.length === 1 ? c.deploymentOptions[0] : undefined);
    setAiShape(c.aiShapeOptions.length === 1 ? c.aiShapeOptions[0] : undefined);
  }

  function confirm() {
    if (!deployment || !aiShape) return;
    onSelect(active, deployment, aiShape);
  }

  const canConfirm = !!deployment && !!aiShape;

  return (
    <section className="card card-pad space-y-3">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-ink-900">Which one did you mean?</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            Pick the candidate and tell us how it's deployed in your environment. Both
            choices change which guardrails are built in.
          </p>
        </div>
        <button onClick={onCancel} className="text-xs text-ink-700 underline">
          Cancel
        </button>
      </header>

      <ul className="space-y-2" aria-label="Candidate products">
        {candidates.map((c) => {
          const isActive = keyFor(c) === activeKey;
          return (
            <li
              key={keyFor(c)}
              className={
                'rounded-lg border transition ' +
                (isActive ? 'border-ink-900 bg-white' : 'border-ink-300 bg-white hover:bg-ink-100')
              }
            >
              <button
                onClick={() => switchCandidate(c)}
                className="w-full text-left px-3 py-2"
                aria-pressed={isActive}
                aria-label={`Select ${c.name} by ${c.vendor}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{c.name}</div>
                    <div className="text-[11px] text-ink-500">
                      {c.vendor} · {c.category}
                    </div>
                  </div>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-ink-700 underline shrink-0"
                    >
                      vendor site
                    </a>
                  )}
                </div>
                {c.description && (
                  <p className="text-xs text-ink-600 mt-1">{c.description}</p>
                )}
              </button>

              {isActive && (
                <div className="px-3 pb-3 space-y-2 border-t border-ink-300/60 mt-1 pt-2">
                  <ChipRow
                    label="Deployment"
                    options={c.deploymentOptions}
                    labels={DEPLOYMENT_LABELS}
                    value={deployment}
                    onChange={(v) => setDeployment(v as Deployment)}
                  />
                  <ChipRow
                    label="AI shape"
                    options={c.aiShapeOptions}
                    labels={AI_SHAPE_LABELS}
                    value={aiShape}
                    onChange={(v) => setAiShape(v as AiShape)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="btn">
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={!canConfirm}
          className="btn btn-primary disabled:opacity-50"
        >
          Assess this
        </button>
      </div>
    </section>
  );
}

function ChipRow<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  labels: Record<T, string>;
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  const groupId = useId();
  const containerRef = useRef<HTMLUListElement>(null);
  // First option is the focus stop when nothing is selected — standard
  // radiogroup behaviour (only one tab stop per group).
  const focusIdx = value === undefined ? 0 : Math.max(0, options.indexOf(value));

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (options.length === 0) return;
    const isArrow =
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown';
    if (!isArrow) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = (focusIdx + dir + options.length) % options.length;
    onChange(options[next]);
    // Move focus to the newly-selected radio.
    const buttons = containerRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]',
    );
    buttons?.[next]?.focus();
  }

  return (
    <div>
      <div
        id={`${groupId}-label`}
        className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold mb-1"
      >
        {label}
      </div>
      <ul
        ref={containerRef}
        role="radiogroup"
        aria-labelledby={`${groupId}-label`}
        className="flex flex-wrap gap-1.5"
        onKeyDown={onKeyDown}
      >
        {options.map((opt, i) => {
          const active = opt === value;
          return (
            <li key={opt}>
              <button
                role="radio"
                aria-checked={active}
                tabIndex={i === focusIdx ? 0 : -1}
                onClick={() => onChange(opt)}
                className={
                  'rounded-md border px-2 py-1 text-xs transition ' +
                  (active
                    ? 'bg-ink-900 text-white border-ink-900'
                    : 'bg-white text-ink-700 border-ink-300 hover:bg-ink-100')
                }
              >
                {labels[opt]}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function keyFor(c: PreflightProductCandidate): string {
  return `${c.vendor}::${c.name}`;
}
