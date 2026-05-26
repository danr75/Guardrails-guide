import type { ControlSurface, GuardrailKey } from '../schemas/guardrails';

/**
 * The closed-set required-guardrail catalogue. Migrated from the v1 stage/why
 * copy with `threat` (what it mitigates), `standards` (NIST AI RMF / OWASP
 * LLM Top 10 / ISO 42001 references), and `externalCompensations` (where the
 * customer can enforce the guardrail outside the product if it isn't built in).
 *
 * Closed-set discipline: adding a key requires a code change. Do not mutate at
 * runtime. When the catalogue grows, bump CLOSED_SET_VERSION in guardrails.ts.
 */

export interface GuardrailRequirementDef {
  key: GuardrailKey;
  label: string;
  description: string;
  /** What the guardrail mitigates. Surfaced in the gap report. */
  threat: string;
  /** Whether this is mandatory by default. */
  defaultRequired: boolean;
  /** Reference standards. */
  standards: string[];
  /** External controls that can substitute when this guardrail is missing. */
  externalCompensations: ReadonlyArray<{
    surface: ControlSurface;
    control: string;
    notes?: string;
  }>;
}

export const GUARDRAIL_CATALOGUE: ReadonlyArray<GuardrailRequirementDef> = [
  {
    key: 'prompt_injection_filter',
    label: 'Prompt-injection filter',
    description: 'Detect adversarial instructions hidden in user input or retrieved content.',
    threat: 'OWASP LLM01 — prompt injection. Untrusted text exfiltrates data or coerces actions.',
    defaultRequired: true,
    standards: ['OWASP LLM Top 10: LLM01', 'NIST AI RMF MS-2.6'],
    externalCompensations: [
      { surface: 'network_edge_proxy', control: 'AI gateway with injection detection (Cloudflare AI Gateway, Lakera Guard).' },
      { surface: 'api_gateway', control: 'API gateway WAF rule scanning request bodies for known injection patterns.' },
    ],
  },
  {
    key: 'output_filter',
    label: 'Output filter',
    description: 'Scan model output for policy-violating, harmful, or unsafe content before it reaches the user.',
    threat: 'Harmful, harassing, or non-compliant content reaching users.',
    defaultRequired: true,
    standards: ['NIST AI RMF MS-1.1, MS-2.6', 'ISO/IEC 42001 §8.2'],
    externalCompensations: [
      { surface: 'network_edge_proxy', control: 'Response-body inspection on the egress proxy.' },
      { surface: 'data_loss_prevention', control: 'DLP rule on the response payload.' },
    ],
  },
  {
    key: 'pii_redaction',
    label: 'PII detection & redaction',
    description: 'Strip or mask personal data before it reaches the model or logs, and from outputs.',
    threat: 'Privacy breach. Regulatory exposure (GDPR / Privacy Act).',
    defaultRequired: true,
    standards: ['ISO/IEC 27701', 'NIST Privacy Framework PR.DS-P'],
    externalCompensations: [
      { surface: 'data_loss_prevention', control: 'DLP gateway redacts PII in both directions (Symantec DLP, Microsoft Purview).' },
      { surface: 'network_edge_proxy', control: 'Egress proxy with PII rewriting (Cloudflare AI Gateway redaction).' },
    ],
  },
  {
    key: 'toxicity_filter',
    label: 'Toxicity / safety filter',
    description: 'Block harmful, harassing, or policy-violating output.',
    threat: 'Reputational harm; downstream harassment exposure.',
    defaultRequired: true,
    standards: ['NIST AI RMF MS-2.6'],
    externalCompensations: [
      { surface: 'network_edge_proxy', control: 'Toxicity classifier on response stream (Perspective API in-line).' },
    ],
  },
  {
    key: 'grounding_required',
    label: 'Grounding / hallucination check',
    description: 'Compare answer to retrieved evidence; flag unsupported claims.',
    threat: 'Hallucination. Confidently-wrong answers cited as fact.',
    defaultRequired: false,
    standards: ['NIST AI RMF MS-2.5'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Mandatory human review of AI outputs for the specific use case.' },
    ],
  },
  {
    key: 'citations_required',
    label: 'Citation enforcement',
    description: 'Require the model to cite the source chunks it used.',
    threat: 'Loss of auditability; users cannot verify claims.',
    defaultRequired: false,
    standards: ['NIST AI RMF MS-2.5'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Acceptable-use policy forbids unattributed AI claims in deliverables.' },
    ],
  },
  {
    key: 'source_allowlist',
    label: 'Source allowlist',
    description: 'Only retrieve from approved corpora; never the open web by default.',
    threat: 'Untrusted content reaching the prompt context (and the user).',
    defaultRequired: true,
    standards: ['ISO/IEC 42001 §8.3'],
    externalCompensations: [
      { surface: 'network_edge_proxy', control: 'Egress allowlist restricting which retrieval URLs the system can reach.' },
    ],
  },
  {
    key: 'tool_use_allowlist',
    label: 'Tool allowlist',
    description: 'Agent can only call a curated, reviewed set of tools.',
    threat: 'Privilege escalation via unrestricted tool catalog.',
    defaultRequired: true,
    standards: ['OWASP LLM Top 10: LLM07'],
    externalCompensations: [
      { surface: 'api_gateway', control: 'API gateway blocks calls to any endpoint not on the explicit tool list.' },
    ],
  },
  {
    key: 'human_in_the_loop',
    label: 'Human-in-the-loop approval',
    description: 'Block high-impact actions until a human approves.',
    threat: 'Irreversible damage from autonomous action.',
    defaultRequired: false,
    standards: ['NIST AI RMF MG-3.1', 'EU AI Act Art. 14'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Business-process approval workflow before AI output is acted on.' },
    ],
  },
  {
    key: 'rate_limit_per_user',
    label: 'Per-user rate limit',
    description: 'Cap requests per user/session to control cost and abuse.',
    threat: 'Cost runaway; account takeover spam.',
    defaultRequired: true,
    standards: ['NIST AI RMF MG-2.3'],
    externalCompensations: [
      { surface: 'api_gateway', control: 'API gateway rate-limit policy keyed on user identity header.' },
    ],
  },
  {
    key: 'rate_limit_per_tenant',
    label: 'Per-tenant rate limit',
    description: 'Cap aggregate usage per tenant.',
    threat: 'One tenant degrading service for others; budget blowout.',
    defaultRequired: true,
    standards: ['ISO/IEC 42001 §9.1'],
    externalCompensations: [
      { surface: 'api_gateway', control: 'Gateway quota per tenant key.' },
    ],
  },
  {
    key: 'egress_url_filter',
    label: 'Egress URL filter',
    description: 'Restrict which external URLs the model/agent can reach.',
    threat: 'Data exfiltration via tool-issued HTTP requests.',
    defaultRequired: true,
    standards: ['OWASP LLM Top 10: LLM02, LLM07'],
    externalCompensations: [
      { surface: 'network_edge_proxy', control: 'Network egress proxy with destination allowlist (Netskope, Zscaler).' },
    ],
  },
  {
    key: 'jailbreak_detection',
    label: 'Jailbreak detection',
    description: 'Detect attempts to coerce the model out of policy (DAN, role-play attacks).',
    threat: 'Bypass of all in-product safety controls.',
    defaultRequired: false,
    standards: ['OWASP LLM Top 10: LLM01'],
    externalCompensations: [
      { surface: 'network_edge_proxy', control: 'AI gateway with jailbreak classifier on requests.' },
    ],
  },
  {
    key: 'hallucination_detector',
    label: 'Hallucination detector',
    description: 'Score outputs for likely fabricated facts before display.',
    threat: 'Same as grounding, but for ungrounded use cases (e.g. brainstorming with safety checks).',
    defaultRequired: false,
    standards: ['NIST AI RMF MS-2.5'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Document-level disclaimer + mandatory human verification.' },
    ],
  },
  {
    key: 'audit_log_completeness',
    label: 'Audit log completeness',
    description: 'Immutable record of input, retrieval, tool calls, output — for review.',
    threat: 'Post-incident investigation impossible; cannot meet regulatory record-keeping duty.',
    defaultRequired: true,
    standards: ['ISO/IEC 27001 A.12.4', 'NIST AI RMF MG-4.1'],
    externalCompensations: [
      { surface: 'siem_or_observability', control: 'SIEM rule capturing AI gateway request/response with retention policy.' },
    ],
  },
  {
    key: 'content_provenance',
    label: 'Content provenance',
    description: 'Mark AI-generated content with verifiable origin metadata (C2PA / similar).',
    threat: 'Downstream confusion between human and AI authorship.',
    defaultRequired: false,
    standards: ['C2PA', 'EU AI Act Art. 50'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Editorial policy requires AI-content labelling in published material.' },
    ],
  },
  {
    key: 'watermarking',
    label: 'Watermarking',
    description: 'Embed model-attributable signal in generated artifacts.',
    threat: 'Misuse of generated media (impersonation, fraud).',
    defaultRequired: false,
    standards: ['NIST AI RMF MG-2.4'],
    externalCompensations: [],
  },
  {
    key: 'data_residency_enforcement',
    label: 'Data residency enforcement',
    description: 'Honour data sovereignty and retention rules end-to-end (AU / EU residency etc.).',
    threat: 'Regulatory breach (GDPR, Privacy Act, IRAP). Government / regulated customer disqualification.',
    defaultRequired: true,
    standards: ['GDPR Art. 44–49', 'Australian Privacy Principles APP 8'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Procurement contract clause requiring in-region processing.' },
    ],
  },
  {
    key: 'encryption_in_transit',
    label: 'Encryption in transit',
    description: 'TLS for all data movement.',
    threat: 'Eavesdropping on prompts / outputs in motion.',
    defaultRequired: true,
    standards: ['ISO/IEC 27001 A.10', 'NIST SP 800-52'],
    externalCompensations: [
      { surface: 'network_edge_proxy', control: 'TLS-terminating proxy enforces encryption to downstream services.' },
    ],
  },
  {
    key: 'encryption_at_rest',
    label: 'Encryption at rest',
    description: 'All stored data (prompts, embeddings, logs) encrypted at rest.',
    threat: 'Cold-storage breach exposes prompt/response history.',
    defaultRequired: true,
    standards: ['ISO/IEC 27001 A.10'],
    externalCompensations: [],
  },
  {
    key: 'tenant_isolation',
    label: 'Tenant isolation',
    description: 'No cross-tenant data leakage (vector DB, cache, logs, model state).',
    threat: 'One customer reading another customer\'s data; training-data leakage.',
    defaultRequired: true,
    standards: ['ISO/IEC 27001 A.13'],
    externalCompensations: [],
  },
  {
    key: 'training_data_optout',
    label: 'Training-data opt-out',
    description: 'Customer data is not used to train the vendor\'s models without explicit consent.',
    threat: 'Confidential or regulated data ending up in someone else\'s model.',
    defaultRequired: true,
    standards: ['EU AI Act Art. 10'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Contractual no-training clause.' },
    ],
  },
  {
    key: 'retention_window',
    label: 'Retention window',
    description: 'Bounded retention for prompts, outputs, logs; deletion on request.',
    threat: 'Indefinite retention violates minimisation; deletion-request failures.',
    defaultRequired: true,
    standards: ['GDPR Art. 5(1)(e), 17', 'Australian Privacy Principles APP 11'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Documented retention schedule + manual purge process.' },
    ],
  },
  {
    key: 'export_redaction',
    label: 'Export redaction',
    description: 'Prevent sensitive data leaving the system in attachments or response payloads.',
    threat: 'Insider exfiltration via legitimate API surface.',
    defaultRequired: false,
    standards: ['ISO/IEC 27001 A.13'],
    externalCompensations: [
      { surface: 'data_loss_prevention', control: 'DLP rule on outbound payloads.' },
    ],
  },
  {
    key: 'model_version_pinning',
    label: 'Model version pinning',
    description: 'Avoid silent regressions when providers update models.',
    threat: 'Behavioural drift without notice; failing eval after a vendor model swap.',
    defaultRequired: false,
    standards: ['NIST AI RMF MG-3.2'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Change-management policy gating model upgrades.' },
    ],
  },
  {
    key: 'red_team_program',
    label: 'Red-team & eval suite',
    description: 'Regression tests against known attacks and quality benchmarks.',
    threat: 'Unknown vulnerabilities, missed regressions.',
    defaultRequired: false,
    standards: ['NIST AI RMF MS-1.1, MG-2.1'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Internal AI red-team programme, separate from vendor testing.' },
    ],
  },
  {
    key: 'abuse_reporting_channel',
    label: 'Abuse reporting channel',
    description: 'Clear path for users / third parties to report misuse.',
    threat: 'Unreported abuse compounding; reputational harm.',
    defaultRequired: false,
    standards: ['EU AI Act Art. 70'],
    externalCompensations: [
      { surface: 'governance_policy', control: 'Internal abuse-reporting form routed to the AI governance owner.' },
    ],
  },
];

export const CATALOGUE_BY_KEY: Record<GuardrailKey, GuardrailRequirementDef> =
  Object.fromEntries(
    GUARDRAIL_CATALOGUE.map((d) => [d.key, d] as const),
  ) as Record<GuardrailKey, GuardrailRequirementDef>;
