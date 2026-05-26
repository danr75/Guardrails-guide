import type { Evidence } from './evidence';
import type {
  AiShape,
  ControlSurface,
  Deployment,
  GapStatus,
  GuardrailKey,
  ObservedGuardrail,
  Presence,
} from './guardrails';

export interface ProductIdentity {
  name: string;
  vendor: string;
  category: string;
  url?: string;
  deployment: Deployment;
  aiShape: AiShape;
}

export type AssessmentPhase = 'preflight' | 'extraction' | 'escalation';

export interface ModelUsageBreakdown {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  callCount: number;
}

export interface PhaseUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  callCount: number;
}

export interface AssessmentMetrics {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  callCount: number;
  byModel: Record<string, ModelUsageBreakdown>;
  byPhase?: Partial<Record<AssessmentPhase, PhaseUsage>>;
  estimatedUsd?: number;
  escalated: boolean;
  durationMs: number;
}

/** Deterministic gap-analysis output per required guardrail. */
export interface GapResult {
  key: GuardrailKey;
  status: GapStatus;
  /** When present/configurable, the surface(s) it was found at. */
  presentAt?: ControlSurface[];
  /** What the LLM observed (may be more than one observation if disputed). */
  observed?: Array<{ presence: Presence; appliedAt: ControlSurface; claim: string }>;
  /** Compensation suggestions when status === 'missing'. */
  compensations?: Array<{
    surface: ControlSurface;
    control: string;
    notes?: string;
  }>;
  /** Human-readable one-liner explaining the verdict. */
  rationale: string;
}

/** Portable assessment package — persisted, exportable, re-renderable. */
export interface AssessmentPackage {
  schemaVersion: 1;
  closedSetVersion: string;
  createdAt: string;
  query: string;
  product: ProductIdentity;
  evidence: Evidence[];
  observed: ObservedGuardrail[];
  gaps: GapResult[];
  metrics?: AssessmentMetrics;
  /** Diagnostic counters from normalization. */
  dropped: { evidence: number; guardrails: number };
  /** True if the extraction loop returned partial results (e.g. mid-stream failure). */
  partial: boolean;
}
