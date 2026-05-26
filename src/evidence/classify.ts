import {
  TRUST_LEVELS,
  type EvidenceCategory,
  type TrustLevel,
} from '../schemas/evidence';

export const CATEGORY_TRUST: Record<EvidenceCategory, TrustLevel> = {
  official_legal_terms: 'very_high',
  security_compliance_docs: 'very_high',
  vendor_product_docs: 'high',
  public_technical_docs: 'high',
  third_party_research: 'medium',
  news_media: 'low',
  community_forum: 'very_low',
  model_inference: 'very_low',
};

export function trustLevelFor(category: EvidenceCategory): TrustLevel {
  return CATEGORY_TRUST[category];
}

/** Returns the highest (best) trust level in the list, or null if empty. */
export function highestTrust(levels: TrustLevel[]): TrustLevel | null {
  let best: TrustLevel | null = null;
  let bestIndex: number = TRUST_LEVELS.length;
  for (const lvl of levels) {
    const idx = TRUST_LEVELS.indexOf(lvl);
    if (idx >= 0 && idx < bestIndex) {
      bestIndex = idx;
      best = lvl;
    }
  }
  return best;
}

export function isAtLeast(level: TrustLevel | null, threshold: TrustLevel): boolean {
  if (!level) return false;
  return TRUST_LEVELS.indexOf(level) <= TRUST_LEVELS.indexOf(threshold);
}
