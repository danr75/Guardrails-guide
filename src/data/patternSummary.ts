/**
 * Tiny shared summary of the 8 architecture patterns, used by:
 *   - the React app (re-exported from guardrailsGuide.ts)
 *   - the Cloudflare Worker (to keep the LLM classifier prompt in sync)
 *
 * Keep ids in lockstep with PATTERNS in guardrailsGuide.ts.
 */

export interface PatternSummary {
  id: string;
  name: string;
  tagline: string;
}

export const PATTERN_SUMMARY: PatternSummary[] = [
  {
    id: 'single-turn',
    name: 'Single-turn prompt',
    tagline: 'Model + prompt only',
  },
  {
    id: 'rag',
    name: 'Retrieval-Augmented Generation',
    tagline: 'Model + private corpus search',
  },
  {
    id: 'tool-agent',
    name: 'Tool-using agent',
    tagline: 'Model + function calls',
  },
  {
    id: 'react-agent',
    name: 'Multi-step (ReAct) agent',
    tagline: 'Plan · act · observe · loop',
  },
  {
    id: 'multi-agent',
    name: 'Multi-agent orchestration',
    tagline: 'Supervisor + specialist agents',
  },
  {
    id: 'hitl',
    name: 'Human-in-the-loop workflow',
    tagline: 'Agent drafts · human approves',
  },
  {
    id: 'autonomous',
    name: 'Autonomous task agent',
    tagline: 'Long-running, writes to systems',
  },
  {
    id: 'conversational',
    name: 'Conversational assistant w/ memory',
    tagline: 'Persistent session & user state',
  },
];

export const PATTERN_IDS = PATTERN_SUMMARY.map((p) => p.id);
