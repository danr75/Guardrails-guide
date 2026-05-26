/**
 * Closed-set types for the guardrail assessment.
 *
 * The LLM is constrained to emit only these keys; deterministic code applies
 * the rules. Closed-set discipline = audit-friendly + replayable + no drift.
 */

import type { TrustLevel } from './evidence';

/* ──────────────────────────────────────────────────────────────────────── */
/* Deployment × AI shape (two orthogonal axes; product picker forces one    */
/* of each).                                                                */
/* ──────────────────────────────────────────────────────────────────────── */

export const DEPLOYMENTS = [
  'saas_multitenant',
  'saas_dedicated',
  'self_hosted',
  'api_endpoint',
  'embedded_sdk',
] as const;
export type Deployment = (typeof DEPLOYMENTS)[number];

export const DEPLOYMENT_LABELS: Record<Deployment, string> = {
  saas_multitenant: 'SaaS (multi-tenant)',
  saas_dedicated: 'SaaS (dedicated tenant)',
  self_hosted: 'Self-hosted',
  api_endpoint: 'API / model endpoint',
  embedded_sdk: 'Embedded library / SDK',
};

export const AI_SHAPES = [
  'chat_assistant',
  'agent_with_tools',
  'rag_grounded',
  'fine_tuned',
  'generative',
] as const;
export type AiShape = (typeof AI_SHAPES)[number];

export const AI_SHAPE_LABELS: Record<AiShape, string> = {
  chat_assistant: 'Chat assistant',
  agent_with_tools: 'Agent with tools',
  rag_grounded: 'RAG / grounded',
  fine_tuned: 'Fine-tuned / customer-trained',
  generative: 'Generative (images / video / code)',
};

/* ──────────────────────────────────────────────────────────────────────── */
/* Closed-set guardrail keys.                                               */
/* ──────────────────────────────────────────────────────────────────────── */

export const GUARDRAIL_KEYS = [
  'prompt_injection_filter',
  'content_policy_input',
  'output_filter',
  'pii_redaction',
  'toxicity_filter',
  'grounding_required',
  'citations_required',
  'freshness_check',
  'source_allowlist',
  'doc_acl',
  'schema_validation',
  'tool_use_allowlist',
  'scoped_credentials',
  'human_in_the_loop',
  'kill_switch',
  'rate_limit_per_user',
  'rate_limit_per_tenant',
  'egress_url_filter',
  'jailbreak_detection',
  'hallucination_detector',
  'audit_log_completeness',
  'content_provenance',
  'watermarking',
  'data_residency_enforcement',
  'encryption_in_transit',
  'encryption_at_rest',
  'tenant_isolation',
  'training_data_optout',
  'retention_window',
  'export_redaction',
  'model_version_pinning',
  'red_team_program',
  'bias_eval',
  'abuse_reporting_channel',
] as const;
export type GuardrailKey = (typeof GUARDRAIL_KEYS)[number];

/* ──────────────────────────────────────────────────────────────────────── */
/* ControlSurface — where a guardrail acts. Single axis; merges Prequal's   */
/* `appliedAt` and the external `controlPoint` lists which were duplicate   */
/* expressions of the same concept.                                         */
/* ──────────────────────────────────────────────────────────────────────── */

export const CONTROL_SURFACES = [
  // In-product
  'vendor_runtime',
  'vendor_admin_console',
  'customer_config',
  'client_application',
  // External (customer-deployed compensation)
  'network_edge_proxy',
  'identity_provider',
  'data_loss_prevention',
  'siem_or_observability',
  'api_gateway',
  'governance_policy',
] as const;
export type ControlSurface = (typeof CONTROL_SURFACES)[number];

export const CONTROL_SURFACE_LABELS: Record<ControlSurface, string> = {
  vendor_runtime: 'Vendor runtime',
  vendor_admin_console: 'Vendor admin console',
  customer_config: 'Customer config',
  client_application: 'Client application',
  network_edge_proxy: 'Network-edge / egress proxy',
  identity_provider: 'Identity provider',
  data_loss_prevention: 'Data loss prevention',
  siem_or_observability: 'SIEM / observability',
  api_gateway: 'API gateway',
  governance_policy: 'Governance / policy',
};

/** Group the placement-map renderer uses for its four columns. */
export type ControlZone =
  | 'user_boundary'
  | 'product_runtime'
  | 'product_admin'
  | 'external_controls';

export const SURFACE_TO_ZONE: Record<ControlSurface, ControlZone> = {
  client_application: 'user_boundary',
  vendor_runtime: 'product_runtime',
  vendor_admin_console: 'product_admin',
  customer_config: 'product_admin',
  network_edge_proxy: 'external_controls',
  identity_provider: 'external_controls',
  data_loss_prevention: 'external_controls',
  siem_or_observability: 'external_controls',
  api_gateway: 'external_controls',
  governance_policy: 'external_controls',
};

/** True if this surface is something the customer must deploy themselves. */
export const SURFACE_IS_EXTERNAL: Record<ControlSurface, boolean> = {
  vendor_runtime: false,
  vendor_admin_console: false,
  customer_config: false,
  client_application: false,
  network_edge_proxy: true,
  identity_provider: true,
  data_loss_prevention: true,
  siem_or_observability: true,
  api_gateway: true,
  governance_policy: true,
};

/* ──────────────────────────────────────────────────────────────────────── */
/* Presence — what the LLM observed for a guardrail.                        */
/* GapStatus — what deterministic code concluded.                           */
/* ──────────────────────────────────────────────────────────────────────── */

export const PRESENCE_VALUES = [
  'built_in',
  'configurable',
  'optional_add_on',
  'not_supported',
  'unknown',
] as const;
export type Presence = (typeof PRESENCE_VALUES)[number];

export const PRESENCE_LABELS: Record<Presence, string> = {
  built_in: 'Built in',
  configurable: 'Configurable',
  optional_add_on: 'Optional add-on',
  not_supported: 'Not supported',
  unknown: 'Unknown',
};

export const GAP_STATUSES = [
  'present',
  'configurable',
  'missing',
  'disputed',
  'not_applicable',
] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];

export const GAP_STATUS_LABELS: Record<GapStatus, string> = {
  present: 'Present',
  configurable: 'Configurable',
  missing: 'Missing',
  disputed: 'Disputed',
  not_applicable: 'Not applicable',
};

/* ──────────────────────────────────────────────────────────────────────── */
/* The observed-guardrail shape emitted by the LLM and normalized in code.  */
/* ──────────────────────────────────────────────────────────────────────── */

export interface ObservedGuardrail {
  key: GuardrailKey;
  claim: string;
  presence: Presence;
  appliedAt: ControlSurface;
  evidenceIds: string[];
  bestEvidenceTrust: TrustLevel | null;
  confidence?: number;
  conflictingClaims?: Array<{
    claim: string;
    presence: Presence;
    appliedAt: ControlSurface;
  }>;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* (GuardrailKey × ControlSurface) validity table.                          */
/*                                                                          */
/* Encodes which scopes are meaningful for each guardrail. Normalization    */
/* downgrades extraction emissions outside the allow-list to `unknown` and  */
/* counts them in the `dropped` diagnostic.                                 */
/*                                                                          */
/* Reasoning recorded inline; revisit when the closed-set version bumps.    */
/* ──────────────────────────────────────────────────────────────────────── */

type SurfaceAllow = Record<GuardrailKey, ReadonlyArray<ControlSurface>>;

const ALL_IN_PRODUCT: ReadonlyArray<ControlSurface> = [
  'vendor_runtime',
  'vendor_admin_console',
  'customer_config',
  'client_application',
];

export const ALLOWED_SURFACES: SurfaceAllow = {
  prompt_injection_filter: ['vendor_runtime', 'network_edge_proxy', 'api_gateway'],
  content_policy_input: ['vendor_runtime', 'network_edge_proxy', 'data_loss_prevention', 'api_gateway'],
  output_filter: ['vendor_runtime', 'network_edge_proxy', 'data_loss_prevention'],
  pii_redaction: ['vendor_runtime', 'customer_config', 'data_loss_prevention', 'network_edge_proxy'],
  toxicity_filter: ['vendor_runtime', 'network_edge_proxy'],
  grounding_required: ['vendor_runtime', 'customer_config'],
  citations_required: ['vendor_runtime', 'customer_config'],
  freshness_check: ['vendor_runtime', 'customer_config'],
  source_allowlist: ['vendor_runtime', 'customer_config', 'network_edge_proxy'],
  doc_acl: ['vendor_runtime', 'customer_config', 'identity_provider', 'governance_policy'],
  schema_validation: ['vendor_runtime', 'customer_config', 'client_application', 'api_gateway'],
  tool_use_allowlist: ['vendor_runtime', 'customer_config'],
  scoped_credentials: ['vendor_runtime', 'customer_config', 'identity_provider', 'governance_policy'],
  human_in_the_loop: ['vendor_runtime', 'customer_config', 'governance_policy'],
  kill_switch: ['vendor_admin_console', 'customer_config', 'api_gateway', 'governance_policy'],
  rate_limit_per_user: ['vendor_runtime', 'api_gateway'],
  rate_limit_per_tenant: ['vendor_runtime', 'vendor_admin_console', 'api_gateway'],
  egress_url_filter: ['network_edge_proxy', 'vendor_runtime'],
  jailbreak_detection: ['vendor_runtime', 'network_edge_proxy'],
  hallucination_detector: ['vendor_runtime', 'customer_config'],
  audit_log_completeness: ['vendor_runtime', 'vendor_admin_console', 'siem_or_observability'],
  content_provenance: ['vendor_runtime', 'client_application'],
  watermarking: ['vendor_runtime'],
  data_residency_enforcement: ['vendor_runtime', 'vendor_admin_console', 'governance_policy'],
  encryption_in_transit: ['vendor_runtime', 'network_edge_proxy'],
  encryption_at_rest: ['vendor_runtime'],
  tenant_isolation: ['vendor_runtime'],
  training_data_optout: ['vendor_admin_console', 'governance_policy'],
  retention_window: ['vendor_runtime', 'vendor_admin_console', 'governance_policy'],
  export_redaction: ['vendor_runtime', 'data_loss_prevention'],
  model_version_pinning: ['vendor_admin_console', 'customer_config'],
  red_team_program: ['governance_policy'],
  bias_eval: ['vendor_runtime', 'governance_policy'],
  abuse_reporting_channel: ['vendor_runtime', 'client_application', 'governance_policy'],
};

export function isSurfaceAllowed(
  key: GuardrailKey,
  surface: ControlSurface,
): boolean {
  return ALLOWED_SURFACES[key]?.includes(surface) ?? false;
}

/** Convenience helper used by the catalogue authoring (kept for future use). */
export const ALL_IN_PRODUCT_SURFACES = ALL_IN_PRODUCT;

/** Closed-set version stamped into every persisted assessment payload. */
export const CLOSED_SET_VERSION = '1.1.0';
