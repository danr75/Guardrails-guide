/**
 * Architecture patterns and the guardrails each one needs.
 *
 * Stages map onto a left-to-right data flow:
 *   user → input → retrieval → model → action → output → user
 *
 * Each guardrail belongs to one stage and has a priority *per pattern*.
 */

export type Stage =
  | 'input'
  | 'retrieval'
  | 'model'
  | 'action'
  | 'output'
  | 'cross';

export type Priority = 'critical' | 'recommended' | 'optional';

export interface Guardrail {
  id: string;
  name: string;
  stage: Stage;
  why: string;
}

export interface ArchPattern {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Which stages are present in the data flow for this pattern. */
  stages: Stage[];
  /** Guardrail id → priority for this pattern. Omitted = not applicable. */
  guardrails: Record<string, Priority>;
}

export const STAGE_META: Record<
  Stage,
  { label: string; short: string; tone: string }
> = {
  input: {
    label: 'Input',
    short: 'User request',
    tone: 'bg-sky-50 border-sky-200 text-sky-900',
  },
  retrieval: {
    label: 'Retrieval',
    short: 'Knowledge / context',
    tone: 'bg-violet-50 border-violet-200 text-violet-900',
  },
  model: {
    label: 'Model',
    short: 'LLM reasoning',
    tone: 'bg-amber-50 border-amber-200 text-amber-900',
  },
  action: {
    label: 'Action',
    short: 'Tools / side-effects',
    tone: 'bg-rose-50 border-rose-200 text-rose-900',
  },
  output: {
    label: 'Output',
    short: 'Response to user',
    tone: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  },
  cross: {
    label: 'Cross-cutting',
    short: 'Always-on controls',
    tone: 'bg-slate-50 border-slate-200 text-slate-900',
  },
};

export const PRIORITY_META: Record<
  Priority,
  { label: string; rank: number; pill: string; dot: string }
> = {
  critical: {
    label: 'Critical',
    rank: 0,
    pill: 'bg-rose-100 text-rose-800 border-rose-300',
    dot: 'bg-rose-500',
  },
  recommended: {
    label: 'Recommended',
    rank: 1,
    pill: 'bg-amber-100 text-amber-800 border-amber-300',
    dot: 'bg-amber-500',
  },
  optional: {
    label: 'Optional',
    rank: 2,
    pill: 'bg-slate-100 text-slate-700 border-slate-300',
    dot: 'bg-slate-400',
  },
};

export const GUARDRAILS: Guardrail[] = [
  // Input layer
  {
    id: 'authn',
    name: 'Identity & authentication',
    stage: 'input',
    why: 'Tie every request to a verified user before anything downstream sees it.',
  },
  {
    id: 'pii-in',
    name: 'PII detection & redaction',
    stage: 'input',
    why: 'Strip or mask personal data before it reaches the model or logs.',
  },
  {
    id: 'prompt-injection',
    name: 'Prompt-injection filter',
    stage: 'input',
    why: 'Detect adversarial instructions hidden in user input or retrieved content.',
  },
  {
    id: 'content-policy-in',
    name: 'Content policy filter (in)',
    stage: 'input',
    why: 'Block disallowed requests (e.g. illegal, unsafe, off-policy).',
  },
  {
    id: 'rate-limit',
    name: 'Rate & cost limits',
    stage: 'input',
    why: 'Cap requests per user/session to control cost and abuse.',
  },

  // Retrieval layer
  {
    id: 'source-allowlist',
    name: 'Source allowlist',
    stage: 'retrieval',
    why: 'Only retrieve from approved corpora; never the open web by default.',
  },
  {
    id: 'doc-acl',
    name: 'Document ACL enforcement',
    stage: 'retrieval',
    why: "Filter retrieved chunks by the requesting user's permissions.",
  },
  {
    id: 'citations',
    name: 'Citation enforcement',
    stage: 'retrieval',
    why: 'Require the model to cite the source chunks it used.',
  },
  {
    id: 'freshness',
    name: 'Freshness / recency check',
    stage: 'retrieval',
    why: 'Reject or flag stale documents for time-sensitive answers.',
  },

  // Model / reasoning
  {
    id: 'system-prompt',
    name: 'Hardened system prompt',
    stage: 'model',
    why: 'Pin role, scope, refusal rules; protect against override.',
  },
  {
    id: 'schema',
    name: 'Output schema validation',
    stage: 'model',
    why: 'Constrain responses to a typed schema so downstream code is safe.',
  },
  {
    id: 'grounding',
    name: 'Grounding / hallucination check',
    stage: 'model',
    why: 'Compare answer to retrieved evidence; flag unsupported claims.',
  },
  {
    id: 'bias',
    name: 'Bias & fairness eval',
    stage: 'model',
    why: 'Run pre-prod and ongoing tests for biased behaviour.',
  },
  {
    id: 'model-pin',
    name: 'Model version pinning',
    stage: 'model',
    why: 'Avoid silent regressions when providers update models.',
  },

  // Action / tool layer
  {
    id: 'tool-allowlist',
    name: 'Tool allowlist',
    stage: 'action',
    why: 'Agent can only call a curated, reviewed set of tools.',
  },
  {
    id: 'scoped-creds',
    name: 'Scoped credentials',
    stage: 'action',
    why: "Each tool uses least-privilege credentials, never the user's session.",
  },
  {
    id: 'dry-run',
    name: 'Dry-run / sandbox',
    stage: 'action',
    why: 'Simulate side-effects before committing for irreversible operations.',
  },
  {
    id: 'human-approval',
    name: 'Human-in-the-loop approval',
    stage: 'action',
    why: 'Block high-impact actions until a human approves.',
  },
  {
    id: 'idempotency',
    name: 'Idempotency keys',
    stage: 'action',
    why: 'Prevent duplicate side-effects on retries or agent loops.',
  },

  // Output layer
  {
    id: 'pii-out',
    name: 'PII egress filter',
    stage: 'output',
    why: 'Stop the model from leaking personal data in its response.',
  },
  {
    id: 'toxicity',
    name: 'Toxicity / safety filter',
    stage: 'output',
    why: 'Block harmful, harassing, or policy-violating output.',
  },
  {
    id: 'ip-filter',
    name: 'IP / copyright filter',
    stage: 'output',
    why: 'Catch verbatim copyrighted or licensed content before it ships.',
  },

  // Cross-cutting
  {
    id: 'audit-log',
    name: 'Audit log',
    stage: 'cross',
    why: 'Immutable record of input, retrieval, tool calls, output — for review.',
  },
  {
    id: 'observability',
    name: 'Observability & telemetry',
    stage: 'cross',
    why: 'Latency, cost, error and quality metrics per request.',
  },
  {
    id: 'eval-suite',
    name: 'Red-team & eval suite',
    stage: 'cross',
    why: 'Regression tests against known attacks and quality benchmarks.',
  },
  {
    id: 'kill-switch',
    name: 'Kill switch',
    stage: 'cross',
    why: 'Disable the agent or specific tools instantly when something goes wrong.',
  },
  {
    id: 'data-residency',
    name: 'Data residency & retention',
    stage: 'cross',
    why: 'Honour AU data sovereignty and retention rules end-to-end.',
  },
];

export const PATTERNS: ArchPattern[] = [
  {
    id: 'single-turn',
    name: 'Single-turn prompt',
    tagline: 'Model + prompt only',
    description:
      'A stateless prompt → response call. Classifiers, summarisers, drafting helpers.',
    stages: ['input', 'model', 'output'],
    guardrails: {
      authn: 'critical',
      'pii-in': 'critical',
      'content-policy-in': 'recommended',
      'rate-limit': 'recommended',
      'system-prompt': 'critical',
      'model-pin': 'recommended',
      bias: 'recommended',
      'pii-out': 'critical',
      toxicity: 'critical',
      'ip-filter': 'optional',
      'audit-log': 'recommended',
      observability: 'recommended',
      'eval-suite': 'recommended',
      'data-residency': 'critical',
    },
  },
  {
    id: 'rag',
    name: 'Retrieval-Augmented Generation',
    tagline: 'Model + private corpus search',
    description:
      'Search a curated knowledge base, inject the top chunks into the prompt. Q&A over policies, manuals, case files.',
    stages: ['input', 'retrieval', 'model', 'output'],
    guardrails: {
      authn: 'critical',
      'pii-in': 'critical',
      'prompt-injection': 'critical',
      'content-policy-in': 'recommended',
      'rate-limit': 'recommended',
      'source-allowlist': 'critical',
      'doc-acl': 'critical',
      citations: 'critical',
      freshness: 'recommended',
      'system-prompt': 'critical',
      grounding: 'critical',
      schema: 'recommended',
      bias: 'recommended',
      'model-pin': 'recommended',
      'pii-out': 'critical',
      toxicity: 'critical',
      'ip-filter': 'recommended',
      'audit-log': 'critical',
      observability: 'recommended',
      'eval-suite': 'recommended',
      'data-residency': 'critical',
    },
  },
  {
    id: 'tool-agent',
    name: 'Tool-using agent',
    tagline: 'Model + function calls',
    description:
      'Model calls a fixed set of internal APIs/functions to read data or perform structured actions.',
    stages: ['input', 'model', 'action', 'output'],
    guardrails: {
      authn: 'critical',
      'pii-in': 'critical',
      'prompt-injection': 'critical',
      'content-policy-in': 'recommended',
      'rate-limit': 'critical',
      'system-prompt': 'critical',
      schema: 'critical',
      grounding: 'recommended',
      'model-pin': 'recommended',
      'tool-allowlist': 'critical',
      'scoped-creds': 'critical',
      'dry-run': 'recommended',
      idempotency: 'recommended',
      'human-approval': 'optional',
      'pii-out': 'critical',
      toxicity: 'recommended',
      'audit-log': 'critical',
      observability: 'critical',
      'eval-suite': 'recommended',
      'kill-switch': 'recommended',
      'data-residency': 'critical',
    },
  },
  {
    id: 'react-agent',
    name: 'Multi-step (ReAct) agent',
    tagline: 'Plan · act · observe · loop',
    description:
      'Agent reasons in steps, calls tools, observes results, replans. Triage, investigation, multi-source research.',
    stages: ['input', 'retrieval', 'model', 'action', 'output'],
    guardrails: {
      authn: 'critical',
      'pii-in': 'critical',
      'prompt-injection': 'critical',
      'content-policy-in': 'recommended',
      'rate-limit': 'critical',
      'source-allowlist': 'critical',
      'doc-acl': 'critical',
      citations: 'recommended',
      'system-prompt': 'critical',
      schema: 'critical',
      grounding: 'critical',
      bias: 'recommended',
      'model-pin': 'recommended',
      'tool-allowlist': 'critical',
      'scoped-creds': 'critical',
      'dry-run': 'recommended',
      idempotency: 'critical',
      'human-approval': 'recommended',
      'pii-out': 'critical',
      toxicity: 'recommended',
      'audit-log': 'critical',
      observability: 'critical',
      'eval-suite': 'critical',
      'kill-switch': 'critical',
      'data-residency': 'critical',
    },
  },
  {
    id: 'multi-agent',
    name: 'Multi-agent orchestration',
    tagline: 'Supervisor + specialist agents',
    description:
      'A coordinator delegates sub-tasks to specialist agents (researcher, writer, reviewer) and assembles the result.',
    stages: ['input', 'retrieval', 'model', 'action', 'output'],
    guardrails: {
      authn: 'critical',
      'pii-in': 'critical',
      'prompt-injection': 'critical',
      'content-policy-in': 'recommended',
      'rate-limit': 'critical',
      'source-allowlist': 'critical',
      'doc-acl': 'critical',
      citations: 'recommended',
      'system-prompt': 'critical',
      schema: 'critical',
      grounding: 'critical',
      bias: 'recommended',
      'model-pin': 'recommended',
      'tool-allowlist': 'critical',
      'scoped-creds': 'critical',
      idempotency: 'critical',
      'human-approval': 'recommended',
      'pii-out': 'critical',
      toxicity: 'recommended',
      'audit-log': 'critical',
      observability: 'critical',
      'eval-suite': 'critical',
      'kill-switch': 'critical',
      'data-residency': 'critical',
    },
  },
  {
    id: 'hitl',
    name: 'Human-in-the-loop workflow',
    tagline: 'Agent drafts · human approves',
    description:
      'Agent prepares a recommendation or action; a human reviews and approves before it goes live. Common for citizen-facing decisions.',
    stages: ['input', 'retrieval', 'model', 'action', 'output'],
    guardrails: {
      authn: 'critical',
      'pii-in': 'critical',
      'prompt-injection': 'critical',
      'content-policy-in': 'recommended',
      'source-allowlist': 'critical',
      'doc-acl': 'critical',
      citations: 'critical',
      'system-prompt': 'critical',
      schema: 'critical',
      grounding: 'critical',
      bias: 'critical',
      'model-pin': 'recommended',
      'tool-allowlist': 'critical',
      'scoped-creds': 'critical',
      'human-approval': 'critical',
      'dry-run': 'recommended',
      idempotency: 'recommended',
      'pii-out': 'critical',
      toxicity: 'recommended',
      'audit-log': 'critical',
      observability: 'recommended',
      'eval-suite': 'recommended',
      'data-residency': 'critical',
    },
  },
  {
    id: 'autonomous',
    name: 'Autonomous task agent',
    tagline: 'Long-running, writes to systems',
    description:
      'Agent operates over hours or days, acting on external systems with limited supervision. Highest risk tier.',
    stages: ['input', 'retrieval', 'model', 'action', 'output'],
    guardrails: {
      authn: 'critical',
      'pii-in': 'critical',
      'prompt-injection': 'critical',
      'content-policy-in': 'critical',
      'rate-limit': 'critical',
      'source-allowlist': 'critical',
      'doc-acl': 'critical',
      citations: 'recommended',
      'system-prompt': 'critical',
      schema: 'critical',
      grounding: 'critical',
      bias: 'critical',
      'model-pin': 'critical',
      'tool-allowlist': 'critical',
      'scoped-creds': 'critical',
      'dry-run': 'critical',
      idempotency: 'critical',
      'human-approval': 'critical',
      'pii-out': 'critical',
      toxicity: 'critical',
      'ip-filter': 'recommended',
      'audit-log': 'critical',
      observability: 'critical',
      'eval-suite': 'critical',
      'kill-switch': 'critical',
      'data-residency': 'critical',
    },
  },
  {
    id: 'conversational',
    name: 'Conversational assistant w/ memory',
    tagline: 'Persistent session & user state',
    description:
      'Chat assistant that remembers prior turns and (optionally) long-term user state across sessions.',
    stages: ['input', 'retrieval', 'model', 'output'],
    guardrails: {
      authn: 'critical',
      'pii-in': 'critical',
      'prompt-injection': 'critical',
      'content-policy-in': 'recommended',
      'rate-limit': 'recommended',
      'source-allowlist': 'recommended',
      'doc-acl': 'critical',
      'system-prompt': 'critical',
      grounding: 'recommended',
      bias: 'recommended',
      'model-pin': 'recommended',
      'pii-out': 'critical',
      toxicity: 'critical',
      'audit-log': 'critical',
      observability: 'recommended',
      'eval-suite': 'recommended',
      'data-residency': 'critical',
    },
  },
];
