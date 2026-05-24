export interface ProductSuggestion {
  name: string;
  vendor: string;
  oneLiner: string;
}

export interface SuggestResponse {
  suggestions: ProductSuggestion[];
}

export interface ClassifyResponse {
  patternId: string;
  rationale: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      // non-JSON body — fall through
    }
  }
  if (!res.ok) {
    const errBody = data as { error?: string; code?: string } | null;
    throw new ApiError(
      errBody?.error || `Request to ${path} failed (${res.status})`,
      res.status,
      errBody?.code,
    );
  }
  return data as T;
}

export function suggestProducts(query: string): Promise<SuggestResponse> {
  return postJson<SuggestResponse>('/api/suggest', { query });
}

export function classifyProduct(product: string): Promise<ClassifyResponse> {
  return postJson<ClassifyResponse>('/api/classify', { product });
}
