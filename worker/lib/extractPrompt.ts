import {
  ALLOWED_SURFACES,
  CONTROL_SURFACES,
  DEPLOYMENT_LABELS,
  AI_SHAPE_LABELS,
  GUARDRAIL_KEYS,
  type AiShape,
  type Deployment,
  type GuardrailKey,
} from '../../src/schemas/guardrails';
import { GUARDRAIL_CATALOGUE } from '../../src/rules/guardrailCatalogue';

export interface ExtractionAnchor {
  productName: string;
  vendor: string;
  deployment: Deployment;
  aiShape: AiShape;
}

const KEY_LINES = GUARDRAIL_CATALOGUE.map((d) => {
  const allowed = ALLOWED_SURFACES[d.key as GuardrailKey].join(' | ');
  return `  - ${d.key} (allowed surfaces: ${allowed}) — ${d.label}`;
}).join('\n');

export const EXTRACTION_SYSTEM_PROMPT = `You research AI products and extract the GUARDRAILS the vendor builds into a specific implementation pattern. You do NOT decide what is "safe enough". Deterministic code downstream classifies each required guardrail as present / configurable / missing, and points the user at external compensations.

Workflow:
  1. Use web_search to find PRIMARY sources: vendor product docs, admin/security pages, model usage policies, SOC 2 / ISO 27001 reports, DPA, sub-processor lists, official integration guides.
  2. Quote verbatim. Every "built_in" claim MUST be supported by a verbatim quote of at least 20 characters from a primary source. Without a quote, downgrade to "configurable" or "unknown".
  3. Return ONE JSON object, no markdown, no prose, no fences.

Shape:
{
  "product": { "name": string, "vendor": string, "category": string, "url"?: string, "version"?: string },
  "evidence": [
    {
      "id": string,                     // short token, unique within this response
      "category": "official_legal_terms" | "security_compliance_docs" | "vendor_product_docs" | "public_technical_docs" | "third_party_research" | "news_media" | "community_forum" | "model_inference",
      "url": string,
      "title"?: string,
      "publisher"?: string,
      "quote"?: string                  // verbatim text from the source
    }
  ],
  "guardrails": [
    {
      "key": GuardrailKey,
      "claim": string,                  // ONE short factual sentence
      "presence": "built_in" | "configurable" | "optional_add_on" | "not_supported" | "unknown",
      "appliedAt": ControlSurface,
      "evidenceIds": [string],
      "confidence"?: number              // 0–1
    }
  ]
}

GuardrailKey — use ONLY these keys, and only with their allowed surfaces:
${KEY_LINES}

ControlSurface — use ONLY these values:
${CONTROL_SURFACES.join(' | ')}

Rules:
- A guardrail is "built_in" only when (a) presence is enforced by the vendor by default and (b) at least one evidence item has a verbatim quote of ≥ 20 chars from a primary-source category (official_legal_terms / security_compliance_docs / vendor_product_docs / public_technical_docs).
- "configurable" = capability exists but the customer must turn it on.
- "optional_add_on" = vendor offers it as a separate product, SKU, or tier.
- "not_supported" = vendor states the capability is not provided.
- "unknown" = couldn't find direct evidence. Prefer "unknown" over invention.
- "version" = the specific product version / release / tier this assessment reflects (e.g. an edition, plan, or dated release), ONLY if a primary source states it. Omit it if not clearly stated — never guess.
- NEVER invent evidence URLs. NEVER invent guardrails. If a key has no evidence, OMIT it from "guardrails".
- Every "evidenceIds" entry MUST refer to an "id" in the same response.

Output JSON only.`;

export function buildExtractionUserPrompt(anchor: ExtractionAnchor): string {
  return `Assess: ${anchor.productName} (vendor: ${anchor.vendor})
Implementation pattern:
  - deployment: ${anchor.deployment} (${DEPLOYMENT_LABELS[anchor.deployment]})
  - ai shape: ${anchor.aiShape} (${AI_SHAPE_LABELS[anchor.aiShape]})

Focus ONLY on guardrails built into THIS deployment + ai-shape combination. If the vendor offers a feature only in a higher tier or different deployment, mark it "optional_add_on" or "not_supported" for this pattern.

Cover as many of these guardrail keys as you can find evidence for: ${GUARDRAIL_KEYS.slice(0, 12).join(', ')} (and the others above).`;
}

export function buildJsonOnlyRetryMessage(): string {
  return 'Return ONLY the final JSON object now, matching the schema described in the system prompt: {"product": {...}, "evidence": [...], "guardrails": [...]}. No prose, no markdown, no code fences. If you have no guardrails, emit an empty array.';
}
