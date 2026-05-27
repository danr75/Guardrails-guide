import { GUARDRAIL_CATALOGUE } from '../rules/guardrailCatalogue';
import { CONTROL_SURFACE_LABELS } from '../schemas/guardrails';

interface Props {
  /** Render expanded by default (e.g. when extraction is unavailable). */
  defaultOpen?: boolean;
}

/**
 * Read-only browse of the full closed-set guardrail catalogue. Doesn't call
 * the API, so it works as a fallback when OPENROUTER_API_KEY isn't configured
 * or the worker is otherwise unreachable. Also useful as general reference.
 */
export function CatalogueBrowse({ defaultOpen = false }: Props) {
  return (
    <details className="card card-pad text-xs" open={defaultOpen}>
      <summary className="cursor-pointer flex items-center justify-between gap-3">
        <span className="text-ink-900 font-medium">
          Browse the guardrail catalogue
        </span>
        <span className="text-ink-500">
          {GUARDRAIL_CATALOGUE.length} guardrails — works without an API key
        </span>
      </summary>

      <ul className="mt-3 divide-y divide-ink-200">
        {GUARDRAIL_CATALOGUE.map((def) => (
          <li key={def.key} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-semibold text-ink-900">{def.label}</h4>
              {def.defaultRequired && (
                <span className="text-[10px] uppercase tracking-wider text-rose-700 font-semibold shrink-0">
                  Default-required
                </span>
              )}
            </div>
            <p className="text-ink-700 mt-1">{def.description}</p>
            <p className="text-ink-600 mt-1">
              <span className="font-medium text-ink-700">Threat: </span>
              {def.threat}
            </p>
            {def.standards.length > 0 && (
              <p className="text-ink-500 mt-1">
                <span className="font-medium text-ink-600">Standards: </span>
                {def.standards.join(' · ')}
              </p>
            )}
            {def.externalCompensations.length > 0 && (
              <div className="mt-1">
                <span className="font-medium text-ink-700">
                  External compensations:
                </span>
                <ul className="list-disc pl-5 mt-0.5 space-y-0.5 text-ink-600">
                  {def.externalCompensations.map((c, i) => (
                    <li key={i}>
                      <span className="text-ink-700">{c.control}</span>{' '}
                      <span className="text-ink-500">
                        ({CONTROL_SURFACE_LABELS[c.surface]})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
