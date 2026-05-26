export const EVIDENCE_CATEGORIES = [
  'official_legal_terms',
  'security_compliance_docs',
  'vendor_product_docs',
  'public_technical_docs',
  'third_party_research',
  'news_media',
  'community_forum',
  'model_inference',
] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const EVIDENCE_CATEGORY_LABELS: Record<EvidenceCategory, string> = {
  official_legal_terms: 'Official legal terms',
  security_compliance_docs: 'Security / compliance documentation',
  vendor_product_docs: 'Vendor product documentation',
  public_technical_docs: 'Public technical documentation',
  third_party_research: 'Third-party security research',
  news_media: 'News / media',
  community_forum: 'Community / forum content',
  model_inference: 'Model inference',
};

export const TRUST_LEVELS = [
  'very_high',
  'high',
  'medium',
  'low',
  'very_low',
] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  very_high: 'Very high',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  very_low: 'Very low',
};

export interface Evidence {
  id: string;
  category: EvidenceCategory;
  trustLevel: TrustLevel;
  url?: string;
  title?: string;
  publisher?: string;
  retrievedAt?: string;
  quote?: string;
  notes?: string;
}
