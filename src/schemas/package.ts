import type { Evidence } from './evidence';
import type {
  AiShape,
  ControlSurface,
  Deployment,
  GapStatus,
  GuardrailKey,
  ObservedGuardrail,
  Presence,
  ValidationVerdict,
} from './guardrails';

export interface ProductIdentity {
  name: string;
  vendor: string;
  category: string;
  url?: string;
  deployment: Deployment;
  aiShape: AiShape;
  /** Specific version / release / tier the assessment reflects, if stated. */
  version?: string;
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
  /**
   * Whether the tool could actually determine a verdict, vs. defaulting to
   * `missing` for lack of information. `no_evidence` = nothing was found at all;
   * `unknown` = sources mentioned it but couldn't confirm; `determined` = a
   * confident verdict. Used to flag coverage gaps for manual validation.
   */
  coverage?: 'determined' | 'no_evidence' | 'unknown';
  /** What the LLM observed (may be more than one observation if disputed). */
  observed?: Array<{
    presence: Presence;
    appliedAt: ControlSurface;
    claim: string;
    evidenceIds: string[];
  }>;
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
  /**
   * The user's own validation verdicts, keyed by guardrail. Parallel to `gaps`
   * — the deterministic gap status stays immutable; this records the human
   * review on top of it (and may disagree with the tool).
   */
  validations?: Partial<
    Record<
      GuardrailKey,
      {
        verdict: ValidationVerdict;
        note?: string;
        /**
         * When verdict is `refuted_or_different`, the surface where the
         * user says the guardrail actually lives. Drives the placement map.
         */
        correctedSurface?: ControlSurface;
        /** Optional URL the user provides to back up their correction. */
        sourceUrl?: string;
        validatedAt: string;
      }
    >
  >;
  metrics?: AssessmentMetrics;
  /** Diagnostic counters from normalization. */
  dropped: { evidence: number; guardrails: number };
  /** True if the extraction loop returned partial results (e.g. mid-stream failure). */
  partial: boolean;
}
