import type {
  AssessmentMetrics,
  AssessmentPackage,
  AssessmentPhase,
  ProductIdentity,
} from '../schemas/package';
import type { AiShape, Deployment } from '../schemas/guardrails';

export interface PreflightProductCandidate {
  name: string;
  vendor: string;
  category: string;
  description: string;
  deploymentOptions: Deployment[];
  aiShapeOptions: AiShape[];
  url?: string;
}

export interface PreflightResponse {
  candidates: PreflightProductCandidate[];
  needsPicker: boolean;
  metrics: AssessmentMetrics;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  retriable: boolean;
  phase: AssessmentPhase;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly phase: AssessmentPhase,
    public readonly status?: number,
    public readonly retriable = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  ok: true;
  data: T;
}
interface ErrEnvelope {
  ok: false;
  error: ApiErrorBody;
}

async function postEnvelope<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Envelope<T> | ErrEnvelope | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // fall through
    }
  }
  if (!parsed || ('ok' in parsed && parsed.ok === false)) {
    const err = (parsed as ErrEnvelope | null)?.error;
    throw new ApiError(
      err?.message ?? `Request to ${path} failed (${res.status})`,
      err?.code ?? 'unknown',
      err?.phase ?? 'preflight',
      res.status,
      err?.retriable ?? false,
    );
  }
  if (!res.ok) {
    throw new ApiError(`HTTP ${res.status}`, 'http_error', 'preflight', res.status);
  }
  return (parsed as Envelope<T>).data;
}

async function getEnvelope<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const text = await res.text();
  let parsed: Envelope<T> | ErrEnvelope | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // fall through
    }
  }
  if (!parsed || ('ok' in parsed && parsed.ok === false)) {
    const err = (parsed as ErrEnvelope | null)?.error;
    throw new ApiError(
      err?.message ?? `Request to ${path} failed (${res.status})`,
      err?.code ?? 'unknown',
      err?.phase ?? 'preflight',
      res.status,
      err?.retriable ?? false,
    );
  }
  return (parsed as Envelope<T>).data;
}

export function preflightQuery(query: string): Promise<PreflightResponse> {
  return postEnvelope<PreflightResponse>('/api/preflight', { query });
}

export interface PricingTable {
  [model: string]: {
    input: number;
    output: number;
    cachedInput?: number;
  };
}

export function fetchPricing(): Promise<PricingTable> {
  return getEnvelope<PricingTable>('/api/pricing');
}

/* ──────────────────────────────────────────────────────────────────────── */
/* SSE consumer for /api/extract                                            */
/* ──────────────────────────────────────────────────────────────────────── */

export type ExtractProgressEvent =
  | { type: 'phase'; phase: AssessmentPhase }
  | { type: 'roundtrip'; n: number; max: number }
  | { type: 'message'; message: string };

export interface ExtractInput {
  query: string;
  product: string;
  vendor: string;
  deployment: Deployment;
  aiShape: AiShape;
}

export interface ExtractHandlers {
  onProgress?: (event: ExtractProgressEvent) => void;
  /** Aborts the connection. */
  signal?: AbortSignal;
}

/**
 * Calls /api/extract (SSE). Resolves with the assembled package (sans gaps —
 * gap analysis runs client-side). Rejects with ApiError on `event: error`.
 */
export async function extractPackage(
  input: ExtractInput,
  handlers: ExtractHandlers = {},
): Promise<Omit<AssessmentPackage, 'gaps'>> {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new ApiError(
      `Extract HTTP ${res.status}: ${text.slice(0, 200)}`,
      'http_error',
      'extraction',
      res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: Omit<AssessmentPackage, 'gaps'> | null = null;
  let error: ApiErrorBody | null = null;

  while (true) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const evt = parseSseChunk(chunk);
      if (!evt) continue;
      if (evt.event === 'progress' && handlers.onProgress) {
        handlers.onProgress(evt.data as ExtractProgressEvent);
      } else if (evt.event === 'done') {
        done = evt.data as Omit<AssessmentPackage, 'gaps'>;
      } else if (evt.event === 'error') {
        error = evt.data as ApiErrorBody;
      }
    }
  }

  if (error) {
    throw new ApiError(error.message, error.code, error.phase, undefined, error.retriable);
  }
  if (!done) {
    throw new ApiError(
      'Stream ended before a "done" event was received.',
      'stream_truncated',
      'extraction',
    );
  }
  return done;
}

function parseSseChunk(chunk: string): { event: string; data: unknown } | null {
  const lines = chunk.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
  for (const rawLine of lines) {
    // Lines may end with \r before the \n we split on (SSE permits \r\n).
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '' || line.startsWith(':')) continue; // blank line / comment
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    // SSE spec: strip exactly one optional leading space, not all whitespace.
    // .trim()-ing would corrupt leading whitespace inside multi-line data
    // payloads' string literals.
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) };
  } catch {
    return null;
  }
}

export type { ProductIdentity };
