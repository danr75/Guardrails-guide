import { useState } from 'react';
import { GuardrailsGuideView } from './components/GuardrailsGuideView';
import { ProductPicker } from './components/ProductPicker';

export function App() {
  // RAG is the default pattern until the user (or LLM) picks something else.
  const [patternId, setPatternId] = useState<string>('rag');
  const [productLabel, setProductLabel] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-ink-900">Guardrail Tool</h1>
          <p className="text-sm text-ink-600">
            Map a product or platform to the guardrails it needs.
          </p>
        </header>

        <ProductPicker
          patternId={patternId}
          productLabel={productLabel}
          rationale={rationale}
          onClassified={({ productLabel: label, patternId: id, rationale: r }) => {
            setProductLabel(label);
            setPatternId(id);
            setRationale(r);
          }}
          onReset={() => {
            setProductLabel(null);
            setRationale(null);
          }}
        />

        <GuardrailsGuideView
          patternId={patternId}
          onPatternChange={(id) => {
            setPatternId(id);
            // Manual override — update the banner so it reflects the new pattern.
            // We keep productLabel as-is so the user still sees "you typed X".
            if (productLabel) {
              setRationale('Manual override.');
            }
          }}
        />
      </div>
    </div>
  );
}
