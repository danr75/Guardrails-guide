import {
  AI_SHAPES,
  DEPLOYMENTS,
  type AiShape,
  type Deployment,
} from '../../src/schemas/guardrails';
import { callApi, extractJson } from './assess';
import type { UsageTracker } from './usage';

export interface ProductCandidate {
  name: string;
  vendor: string;
  category: string;
  description: string;
  deploymentOptions: Deployment[];
  aiShapeOptions: AiShape[];
  url?: string;
}

const PREFLIGHT_MAX_TOKENS = 1200;

export const PREFLIGHT_SYSTEM_PROMPT = `You disambiguate AI product queries before a deeper guardrail assessment. You do NOT make trust decisions and you do NOT use any tools. Use your own knowledge to identify plausible matches.

For the user's query, return up to 4 candidate products. If only one product clearly matches, return one candidate.

For each candidate list:
  - "deploymentOptions": ONE OR MORE of: "saas_multitenant", "saas_dedicated", "self_hosted", "api_endpoint", "embedded_sdk".
  - "aiShapeOptions": ONE OR MORE of: "chat_assistant", "agent_with_tools", "rag_grounded", "fine_tuned", "generative".

These two axes are orthogonal. Microsoft 365 Copilot, for example, ships as ["saas_multitenant"] × ["chat_assistant","agent_with_tools","rag_grounded"]. Include every option that materially changes which guardrails are built in.

Return ONE JSON object, no markdown, no prose:
{
  "candidates": [
    {
      "name": string,
      "vendor": string,
      "category": string,
      "description": string,
      "deploymentOptions": [string, ...],
      "aiShapeOptions": [string, ...],
      "url"?: string
    }
  ]
}

Rules:
- Keep "description" to one short factual sentence.
- Never invent vendors or products.
- If you cannot identify any candidate, return {"candidates": []}.
- Output JSON only.`;

export interface PreflightOptions {
  apiKey: string;
  model: string;
  usage?: UsageTracker;
}

export async function preflight(
  query: string,
  opts: PreflightOptions,
): Promise<ProductCandidate[]> {
  const response = await callApi(
    [{ role: 'user', content: `Query: "${query}"` }],
    {
      apiKey: opts.apiKey,
      model: opts.model,
      maxTokens: PREFLIGHT_MAX_TOKENS,
      systemPrompt: PREFLIGHT_SYSTEM_PROMPT,
      cachePrompt: true,
    },
  );
  opts.usage?.record(response, opts.model);

  const text = (response.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => (b.text as string).trim())
    .filter(Boolean)
    .join('\n');

  if (!text) return [];
  try {
    const parsed = JSON.parse(extractJson(text)) as {
      candidates?: Array<Record<string, unknown>>;
    };
    return normalizeCandidates(parsed.candidates ?? []);
  } catch {
    return [];
  }
}

export function normalizeCandidates(
  raw: Array<Record<string, unknown>>,
): ProductCandidate[] {
  const out: ProductCandidate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = str(item.name);
    const vendor = str(item.vendor);
    if (!name || !vendor) continue;
    const deploymentOptions = filterEnum<Deployment>(item.deploymentOptions, DEPLOYMENTS);
    const aiShapeOptions = filterEnum<AiShape>(item.aiShapeOptions, AI_SHAPES);
    // If the LLM mis-spelled or invented an enum value, fall back to the full
    // closed set so the user can disambiguate via the picker — better than
    // silently dropping an otherwise-valid candidate (name+vendor were good).
    const finalDeploymentOptions =
      deploymentOptions.length > 0 ? deploymentOptions : [...DEPLOYMENTS];
    const finalAiShapeOptions =
      aiShapeOptions.length > 0 ? aiShapeOptions : [...AI_SHAPES];
    out.push({
      name,
      vendor,
      category: str(item.category) ?? 'AI product',
      description: str(item.description) ?? '',
      deploymentOptions: finalDeploymentOptions,
      aiShapeOptions: finalAiShapeOptions,
      url: str(item.url),
    });
    if (out.length >= 4) break;
  }
  return out;
}

function filterEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    if (!(allowed as readonly string[]).includes(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v as T);
  }
  return out;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Picker is needed when the preflight returned more than one candidate, OR
 * when the single candidate has multiple deployment options OR multiple
 * ai-shape options.
 */
export function needsPicker(candidates: ProductCandidate[]): boolean {
  if (candidates.length === 0) return false;
  if (candidates.length > 1) return true;
  const c = candidates[0];
  return c.deploymentOptions.length > 1 || c.aiShapeOptions.length > 1;
}

export function defaultSelection(
  candidates: ProductCandidate[],
): { candidate: ProductCandidate; deployment: Deployment; aiShape: AiShape } | null {
  if (candidates.length === 0) return null;
  const candidate = candidates[0];
  return {
    candidate,
    deployment: candidate.deploymentOptions[0],
    aiShape: candidate.aiShapeOptions[0],
  };
}
