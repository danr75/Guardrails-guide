import type {
  ControlSurface,
  GuardrailKey,
  ObservedGuardrail,
} from '../schemas/guardrails';
import type { GapResult } from '../schemas/package';
import {
  GUARDRAIL_CATALOGUE,
  type GuardrailRequirementDef,
} from './guardrailCatalogue';

/**
 * Deterministic gap analysis. Zero LLM cost. Pure function of (catalogue,
 * observed). Inputs in → outputs out; same inputs always produce same outputs
 * (modulo the catalogue itself, which is closed-set).
 */
export function evaluateGuardrails(
  observed: ObservedGuardrail[],
): GapResult[] {
  const byKey = new Map<GuardrailKey, ObservedGuardrail[]>();
  for (const o of observed) {
    const list = byKey.get(o.key) ?? [];
    list.push(o);
    byKey.set(o.key, list);
  }

  return GUARDRAIL_CATALOGUE.filter((def) => def.defaultRequired).map((def) =>
    evaluateOne(def, byKey.get(def.key) ?? []),
  );
}

function evaluateOne(
  def: GuardrailRequirementDef,
  hits: ObservedGuardrail[],
): GapResult {
  // Carry evidenceIds through to the verdict so the UI can trace each
  // observation back to its supporting sources.
  const toObserved = (h: ObservedGuardrail) => ({
    presence: h.presence,
    appliedAt: h.appliedAt,
    claim: h.claim,
    evidenceIds: h.evidenceIds,
  });

  if (hits.length === 0) {
    return {
      key: def.key,
      status: 'missing',
      coverage: 'no_evidence',
      rationale: `No evidence found that ${def.label.toLowerCase()} is provided by the product.`,
      compensations: [...def.externalCompensations],
    };
  }

  // Disputed: conflictingClaims present, OR multiple observations with
  // materially different presences.
  const distinctPresences = new Set(hits.map((h) => h.presence));
  const hasConflictingClaims = hits.some(
    (h) => h.conflictingClaims && h.conflictingClaims.length > 0,
  );
  const presenceConflict =
    distinctPresences.has('built_in') && distinctPresences.has('not_supported');

  if (hasConflictingClaims || presenceConflict) {
    return {
      key: def.key,
      status: 'disputed',
      coverage: 'unknown',
      observed: hits.map(toObserved),
      rationale:
        'Sources disagree about whether this guardrail is provided. Review evidence before relying on it.',
    };
  }

  // Reduce to the strongest observation.
  const strongest = hits.reduce((best, cur) =>
    presenceRank(cur.presence) < presenceRank(best.presence) ? cur : best,
  );

  // Only surface-up observations where the guardrail is actually supported.
  // Including `not_supported` / `unknown` observations would falsely claim the
  // guardrail is "present at" a surface where a source said it isn't.
  const presentAt: ControlSurface[] = Array.from(
    new Set(
      hits
        .filter(
          (h) =>
            h.presence === 'built_in' ||
            h.presence === 'configurable' ||
            h.presence === 'optional_add_on',
        )
        .map((h) => h.appliedAt),
    ),
  );

  // A confident verdict is "determined" unless the supporting observation is
  // itself low-confidence (<0.5), in which case flag it for manual review.
  const coverage: GapResult['coverage'] =
    strongest.confidence !== undefined && strongest.confidence < 0.5
      ? 'unknown'
      : 'determined';

  switch (strongest.presence) {
    case 'built_in':
      return {
        key: def.key,
        status: 'present',
        coverage,
        presentAt,
        observed: hits.map(toObserved),
        rationale: `Built into the product at ${humanList(presentAt)}.`,
      };
    case 'configurable':
      return {
        key: def.key,
        status: 'configurable',
        coverage,
        presentAt,
        observed: hits.map(toObserved),
        rationale: `Capability exists but must be turned on (${humanList(presentAt)}).`,
      };
    case 'optional_add_on':
      return {
        key: def.key,
        status: 'configurable',
        coverage,
        presentAt,
        observed: hits.map(toObserved),
        rationale: 'Offered as an add-on or higher-tier feature. Confirm licensing.',
        compensations: [...def.externalCompensations],
      };
    case 'not_supported':
      return {
        key: def.key,
        status: 'missing',
        coverage,
        observed: hits.map(toObserved),
        rationale: 'The vendor explicitly does not support this guardrail.',
        compensations: [...def.externalCompensations],
      };
    case 'unknown':
    default:
      return {
        key: def.key,
        status: 'missing',
        coverage: 'unknown',
        observed: hits.map(toObserved),
        rationale: 'Could not confirm whether this guardrail is provided.',
        compensations: [...def.externalCompensations],
      };
  }
}

function presenceRank(p: ObservedGuardrail['presence']): number {
  switch (p) {
    case 'built_in':
      return 0;
    case 'configurable':
      return 1;
    case 'optional_add_on':
      return 2;
    case 'not_supported':
      return 3;
    case 'unknown':
      return 4;
  }
}

function humanList(items: ControlSurface[]): string {
  if (items.length === 0) return '—';
  if (items.length === 1) return items[0].replace(/_/g, ' ');
  return items.map((s) => s.replace(/_/g, ' ')).join(', ');
}
