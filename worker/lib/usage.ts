import type {
  AssessmentMetrics,
  AssessmentPhase,
  ModelUsageBreakdown,
  PhaseUsage,
} from '../../src/schemas/package';
import type { ApiMessage, ApiUsage } from './assess';

const PHASES: AssessmentPhase[] = ['preflight', 'extraction', 'escalation'];

export class UsageTracker {
  private start = Date.now();
  private calls = 0;
  private byModel = new Map<string, ModelUsageBreakdown>();
  private byPhase = new Map<AssessmentPhase, PhaseUsage>();
  private phase: AssessmentPhase = 'extraction';

  setPhase(phase: AssessmentPhase): void {
    this.phase = phase;
  }

  record(response: ApiMessage, fallbackModel: string): void {
    this.calls += 1;
    // Use the requested model id as the canonical key so byModel always matches
    // the OpenRouter pricing catalogue (API can echo dated aliases).
    const model =
      fallbackModel && fallbackModel.length > 0
        ? fallbackModel
        : response.model ?? 'unknown';
    const usage: ApiUsage = response.usage ?? {};
    const cur = this.byModel.get(model) ?? emptyBreakdown();
    cur.inputTokens += usage.input_tokens ?? 0;
    cur.outputTokens += usage.output_tokens ?? 0;
    cur.cachedInputTokens += usage.cache_read_input_tokens ?? 0;
    cur.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
    cur.callCount += 1;
    this.byModel.set(model, cur);

    const phaseCur = this.byPhase.get(this.phase) ?? emptyPhaseUsage();
    phaseCur.inputTokens += usage.input_tokens ?? 0;
    phaseCur.outputTokens += usage.output_tokens ?? 0;
    phaseCur.cachedInputTokens += usage.cache_read_input_tokens ?? 0;
    phaseCur.cacheCreationInputTokens += usage.cache_creation_input_tokens ?? 0;
    phaseCur.callCount += 1;
    this.byPhase.set(this.phase, phaseCur);
  }

  snapshot(opts: { escalated: boolean; estimatedUsd?: number }): AssessmentMetrics {
    const byModel: Record<string, ModelUsageBreakdown> = {};
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    let cacheCreationInputTokens = 0;
    for (const [model, b] of this.byModel) {
      byModel[model] = { ...b };
      inputTokens += b.inputTokens;
      outputTokens += b.outputTokens;
      cachedInputTokens += b.cachedInputTokens;
      cacheCreationInputTokens += b.cacheCreationInputTokens;
    }
    const byPhase: Partial<Record<AssessmentPhase, PhaseUsage>> = {};
    for (const p of PHASES) {
      const v = this.byPhase.get(p);
      if (v) byPhase[p] = { ...v };
    }
    return {
      inputTokens,
      outputTokens,
      cachedInputTokens: cachedInputTokens || undefined,
      cacheCreationInputTokens: cacheCreationInputTokens || undefined,
      callCount: this.calls,
      byModel,
      byPhase: Object.keys(byPhase).length > 0 ? byPhase : undefined,
      estimatedUsd: opts.estimatedUsd,
      escalated: opts.escalated,
      durationMs: Date.now() - this.start,
    };
  }
}

function emptyBreakdown(): ModelUsageBreakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    callCount: 0,
  };
}

function emptyPhaseUsage(): PhaseUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    callCount: 0,
  };
}
