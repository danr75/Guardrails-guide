/**
 * Defensive normalisation of LLM extraction output.
 *
 * Ports Prequal's `normalize.ts` patterns:
 *   - hasUsableQuote / MIN_QUOTE_CHARS = 20 (audit-friendly quote anchoring)
 *   - dedup-keep-conflicts (collapse same-key duplicates, preserve loser as
 *     conflictingClaims so reviewers see both sides)
 *   - `dropped` diagnostic counters
 *
 * Adds (key, surface) validity downgrade unique to this product.
 */

import { highestTrust } from '../../src/evidence/classify';
import {
  EVIDENCE_CATEGORIES,
  type Evidence,
  type EvidenceCategory,
  type TrustLevel,
} from '../../src/schemas/evidence';
import {
  ALLOWED_SURFACES,
  CONTROL_SURFACES,
  GUARDRAIL_KEYS,
  PRESENCE_VALUES,
  type ControlSurface,
  type GuardrailKey,
  type ObservedGuardrail,
  type Presence,
} from '../../src/schemas/guardrails';
import type { ProductIdentity } from '../../src/schemas/package';
import { trustLevelFor } from '../../src/evidence/classify';

const MIN_QUOTE_CHARS = 20;

export interface RawExtraction {
  product?: Partial<ProductIdentity>;
  evidence?: Array<Record<string, unknown>>;
  guardrails?: Array<Record<string, unknown>>;
}

export interface NormalizedExtraction {
  product: Partial<ProductIdentity>;
  evidence: Evidence[];
  observed: ObservedGuardrail[];
  dropped: { evidence: number; guardrails: number };
}

function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function strArr(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

function numberInRange(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !isFinite(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

function hasUsableQuote(raw: Record<string, unknown>): boolean {
  const q = str(raw.quote);
  return typeof q === 'string' && q.length >= MIN_QUOTE_CHARS;
}

function normalizeEvidenceItem(
  raw: Record<string, unknown>,
  idx: number,
): Evidence | null {
  const id = str(raw.id) ?? `e${idx + 1}`;
  if (!isOneOf<EvidenceCategory>(raw.category, EVIDENCE_CATEGORIES)) return null;
  let trustLevel: TrustLevel = trustLevelFor(raw.category);
  // Quote-anchoring: high-trust evidence (very_high / high) earns its rating
  // by quoting verbatim. Without an auditable quote we downgrade to medium so
  // a guardrail can't be "built_in" purely on the strength of the URL classification.
  if ((trustLevel === 'very_high' || trustLevel === 'high') && !hasUsableQuote(raw)) {
    trustLevel = 'medium';
  }
  return {
    id,
    category: raw.category,
    trustLevel,
    url: str(raw.url),
    title: str(raw.title),
    publisher: str(raw.publisher),
    quote: str(raw.quote),
    retrievedAt: str(raw.retrievedAt) ?? new Date().toISOString(),
  };
}

export function normalizeEvidence(
  raw: Array<Record<string, unknown>> | undefined,
): { evidence: Evidence[]; dropped: number } {
  if (!Array.isArray(raw)) return { evidence: [], dropped: 0 };
  const result: Evidence[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  raw.forEach((item, idx) => {
    const e = normalizeEvidenceItem(item, idx);
    if (!e) {
      dropped += 1;
      return;
    }
    if (seen.has(e.id)) {
      dropped += 1;
      return;
    }
    seen.add(e.id);
    result.push(e);
  });
  return { evidence: result, dropped };
}

function presenceRank(p: Presence): number {
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

function normalizeGuardrailItem(
  raw: Record<string, unknown>,
  evidenceById: Map<string, Evidence>,
): ObservedGuardrail | null {
  if (!isOneOf<GuardrailKey>(raw.key, GUARDRAIL_KEYS)) return null;
  if (!isOneOf<Presence>(raw.presence, PRESENCE_VALUES)) return null;
  if (!isOneOf<ControlSurface>(raw.appliedAt, CONTROL_SURFACES)) return null;

  // (key, surface) validity check — downgrade out-of-allowlist combos.
  let appliedAt = raw.appliedAt;
  let presence = raw.presence;
  if (!ALLOWED_SURFACES[raw.key].includes(appliedAt)) {
    presence = 'unknown';
    appliedAt = ALLOWED_SURFACES[raw.key][0] ?? 'vendor_runtime';
  }

  // "built_in" at customer_config is invalid — force to configurable.
  if (presence === 'built_in' && appliedAt === 'customer_config') {
    presence = 'configurable';
  }

  const evidenceIds = strArr(raw.evidenceIds).filter((id) =>
    evidenceById.has(id),
  );

  // "built_in" requires at least one piece of high-or-better-trust evidence
  // with a usable quote. Defensive downgrade if the LLM overclaims.
  if (presence === 'built_in') {
    const supporting = evidenceIds
      .map((id) => evidenceById.get(id)!)
      .filter(Boolean);
    const best = highestTrust(supporting.map((e) => e.trustLevel));
    const trustOk = best === 'very_high' || best === 'high';
    const quoteOk = supporting.some((e) => (e.quote?.length ?? 0) >= MIN_QUOTE_CHARS);
    if (!trustOk || !quoteOk) {
      presence = 'configurable';
    }
  }

  const supporting = evidenceIds
    .map((id) => evidenceById.get(id)!)
    .filter(Boolean);
  const bestEvidenceTrust = highestTrust(supporting.map((e) => e.trustLevel));

  return {
    key: raw.key,
    claim: str(raw.claim) ?? '',
    presence,
    appliedAt,
    evidenceIds,
    bestEvidenceTrust,
    confidence: numberInRange(raw.confidence, 0, 1),
  };
}

export function normalizeGuardrails(
  raw: Array<Record<string, unknown>> | undefined,
  evidence: Evidence[],
): { observed: ObservedGuardrail[]; dropped: number } {
  if (!Array.isArray(raw)) return { observed: [], dropped: 0 };
  const byId = new Map(evidence.map((e) => [e.id, e] as const));
  const result: ObservedGuardrail[] = [];
  let dropped = 0;
  const seenIndex = new Map<GuardrailKey, number>();
  for (const item of raw) {
    const g = normalizeGuardrailItem(item, byId);
    if (!g) {
      dropped += 1;
      continue;
    }
    const prevIdx = seenIndex.get(g.key);
    if (prevIdx === undefined) {
      seenIndex.set(g.key, result.length);
      result.push(g);
      continue;
    }
    const prev = result[prevIdx];
    let winner: ObservedGuardrail;
    let loser: ObservedGuardrail;
    if (presenceRank(g.presence) < presenceRank(prev.presence)) {
      winner = g;
      loser = prev;
    } else {
      winner = prev;
      loser = g;
      dropped += 1;
    }
    const existing = winner.conflictingClaims ?? [];
    const losingClaim = {
      claim: loser.claim,
      presence: loser.presence,
      appliedAt: loser.appliedAt,
    };
    const isDifferent =
      loser.claim !== winner.claim ||
      loser.presence !== winner.presence ||
      loser.appliedAt !== winner.appliedAt;
    result[prevIdx] = isDifferent
      ? { ...winner, conflictingClaims: [...existing, losingClaim] }
      : winner;
  }
  return { observed: result, dropped };
}

export function normalizeExtraction(
  raw: RawExtraction,
): NormalizedExtraction {
  const { evidence, dropped: droppedEv } = normalizeEvidence(raw.evidence);
  const { observed, dropped: droppedGr } = normalizeGuardrails(raw.guardrails, evidence);
  return {
    product: raw.product ?? {},
    evidence,
    observed,
    dropped: { evidence: droppedEv, guardrails: droppedGr },
  };
}

export { MIN_QUOTE_CHARS };
