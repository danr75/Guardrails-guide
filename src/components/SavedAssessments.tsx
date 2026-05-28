import { useRef, useState, type ChangeEvent } from 'react';
import {
  AI_SHAPE_LABELS,
  DEPLOYMENT_LABELS,
  type AiShape,
  type Deployment,
} from '../schemas/guardrails';
import type { AssessmentPackage } from '../schemas/package';
import {
  deleteAssessment,
  exportAssessment,
  importAssessment,
  listSaved,
  loadAssessment,
  type SavedMeta,
} from '../lib/storage';

interface Props {
  onLoad: (pkg: AssessmentPackage) => void;
  /** Bump to force the list to re-read localStorage (e.g. after an auto-save). */
  refreshKey?: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SavedAssessments({ onLoad, refreshKey }: Props) {
  const [tick, setTick] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Re-read on each render keyed by refreshKey + local tick (delete/import).
  void refreshKey;
  void tick;
  const rows: SavedMeta[] = listSaved();

  function refresh() {
    setTick((t) => t + 1);
  }

  function handleExport(meta: SavedMeta) {
    const pkg = loadAssessment(meta.id);
    if (!pkg) return;
    const safeName = meta.productName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadJson(`guardrails-${safeName}.json`, exportAssessment(pkg));
  }

  function handleImport(e: ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { pkg } = importAssessment(String(reader.result));
        onLoad(pkg);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Import failed.');
      }
    };
    reader.readAsText(file);
    // Allow re-importing the same file.
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <details className="card card-pad">
      <summary className="cursor-pointer">
        <h3 className="inline text-base font-semibold text-ink-900">
          Saved assessments
        </h3>
        <p className="text-xs text-ink-500 mt-0.5">
          {rows.length === 0
            ? 'Assessments you run are saved here automatically. Import a JSON file to load one shared with you.'
            : `${rows.length} saved. Load one to re-open it, or export it as JSON to share or back up.`}
        </p>
      </summary>

      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImport}
          />
          {importError && (
            <span className="text-xs text-rose-700">{importError}</span>
          )}
        </div>

        {rows.length > 0 && (
          <ul className="space-y-2">
            {rows.map((m) => (
              <li
                key={m.id}
                className="rounded-md border border-ink-300 bg-white px-3 py-2 flex items-start justify-between gap-3 flex-wrap"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-900">
                    {m.productName}
                    {m.version && (
                      <span className="ml-1.5 text-[10px] font-normal text-ink-500">
                        v{m.version}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-500">
                    {m.vendor} ·{' '}
                    {DEPLOYMENT_LABELS[m.deployment as Deployment] ?? m.deployment}{' '}
                    · {AI_SHAPE_LABELS[m.aiShape as AiShape] ?? m.aiShape}
                  </div>
                  <div className="text-[10px] text-ink-400">
                    {formatDate(m.createdAt)} · catalogue v{m.closedSetVersion}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      const pkg = loadAssessment(m.id);
                      if (pkg) onLoad(pkg);
                    }}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => handleExport(m)}
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      deleteAssessment(m.id);
                      refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
