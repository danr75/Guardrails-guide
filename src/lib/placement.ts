/**
 * Pure helpers that translate `(gap, validation)` into where a guardrail
 * should be shown on the placement map. Kept separate from the components
 * so the logic can be unit-tested and reused.
 *
 * Mental model:
 *   - The LLM produces a deterministic `GapResult`. The user reviews each
 *     finding in the matrix and records a `ValidationVerdict` plus optional
 *     correction (different surface + their own source).
 *   - `effectivePlacement` combines those two inputs into the chip(s) the
 *     placement map renders.
 */

import {
  ALLOWED_SURFACES,
  SURFACE_IS_EXTERNAL,
  type ControlSurface,
  type GapStatus,
  type GuardrailKey,
} from '../schemas/guardrails';
import type { AssessmentPackage, GapResult } from '../schemas/package';

export type ValidationEntry = NonNullable<
  AssessmentPackage['validations']
>[GuardrailKey];

/**
 * Where this guardrail naturally belongs inside the product — the first
 * non-external surface in its allow-list. Falls back to the first allowed
 * surface for guardrails that are only enforceable externally
 * (e.g. red_team_program → governance_policy).
 */
export function naturalSurfaceFor(key: GuardrailKey): ControlSurface {
  const surfaces = ALLOWED_SURFACES[key];
  const inProduct = surfaces.find((s) => !SURFACE_IS_EXTERNAL[s]);
  return inProduct ?? surfaces[0];
}

export interface EffectivePlacement {
  /** Status the chip should reflect (may differ from gap.status after refute). */
  status: GapStatus;
  /** Surface(s) on which to place chips. */
  surfaces: ControlSurface[];
  /** Visual hint for the chip — none / confirmed / refuted / needs_review. */
  badge: 'none' | 'confirmed' | 'refuted' | 'needs_review';
}

/**
 * Compute where the placement map should put this guardrail's chip(s).
 *
 *  - Missing + unreviewed: natural in-product surface ("should be here, isn't")
 *  - Missing + confirmed: first external compensation ("here's where to add it")
 *  - Refuted with correctedSurface: at the user's surface
 *  - Present / configurable: presentAt (unchanged), with badge when validated
 */
export function effectivePlacement(
  gap: GapResult,
  validation: ValidationEntry | undefined,
): EffectivePlacement {
  const badge = badgeFor(validation);

  // User refuted AND told us where it actually lives → trust them.
  if (validation?.verdict === 'refuted_or_different' && validation.correctedSurface) {
    const s = validation.correctedSurface;
    // If they moved a missing finding onto an in-product surface, treat as
    // "present"; if they moved a present finding onto an external surface,
    // it's still "configurable" at that external surface.
    const status: GapStatus =
      gap.status === 'missing'
        ? SURFACE_IS_EXTERNAL[s]
          ? 'configurable'
          : 'present'
        : gap.status;
    return { status, surfaces: [s], badge };
  }

  if (gap.status === 'missing') {
    if (validation?.verdict === 'confirmed') {
      // User confirmed the gap is real → show the compensation location.
      const ext = gap.compensations?.[0]?.surface ?? 'governance_policy';
      return { status: 'missing', surfaces: [ext], badge };
    }
    // Unreviewed (or needs_review / refuted-without-surface): keep it at the
    // natural in-product surface so it reads "this should be here, isn't".
    return { status: 'missing', surfaces: [naturalSurfaceFor(gap.key)], badge };
  }

  // Present / configurable / disputed: use the surfaces the LLM found.
  const surfaces =
    gap.presentAt && gap.presentAt.length > 0
      ? gap.presentAt
      : [naturalSurfaceFor(gap.key)];
  return { status: gap.status, surfaces, badge };
}

function badgeFor(v: ValidationEntry | undefined): EffectivePlacement['badge'] {
  if (!v) return 'none';
  if (v.verdict === 'confirmed') return 'confirmed';
  if (v.verdict === 'refuted_or_different') return 'refuted';
  return 'needs_review';
}
