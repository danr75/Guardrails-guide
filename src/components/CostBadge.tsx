import type { AssessmentMetrics } from '../schemas/package';

interface Props {
  metrics: AssessmentMetrics;
}

export function CostBadge({ metrics }: Props) {
  const usd = metrics.estimatedUsd ?? 0;
  return (
    <details className="card card-pad text-xs">
      <summary className="cursor-pointer flex items-center justify-between gap-4">
        <span className="text-ink-900 font-medium">Run cost & usage</span>
        <span className="text-ink-700 tabular-nums">
          ${usd.toFixed(4)} · {metrics.callCount} calls ·{' '}
          {Math.round(metrics.durationMs / 100) / 10}s
          {metrics.escalated && (
            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
              escalated
            </span>
          )}
        </span>
      </summary>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-700 mb-1">
            By model
          </div>
          <table className="w-full">
            <thead className="text-ink-600">
              <tr>
                <th className="text-left font-medium">Model</th>
                <th className="text-right font-medium">In</th>
                <th className="text-right font-medium">Out</th>
                <th className="text-right font-medium">Cached</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics.byModel).map(([m, b]) => (
                <tr key={m}>
                  <td className="text-ink-800 truncate max-w-[180px]">{m}</td>
                  <td className="text-right tabular-nums">{b.inputTokens}</td>
                  <td className="text-right tabular-nums">{b.outputTokens}</td>
                  <td className="text-right tabular-nums">{b.cachedInputTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {metrics.byPhase && (
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-700 mb-1">
              By phase
            </div>
            <table className="w-full">
              <thead className="text-ink-600">
                <tr>
                  <th className="text-left font-medium">Phase</th>
                  <th className="text-right font-medium">Calls</th>
                  <th className="text-right font-medium">In</th>
                  <th className="text-right font-medium">Out</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.byPhase).map(([p, u]) => (
                  <tr key={p}>
                    <td className="text-ink-800">{p}</td>
                    <td className="text-right tabular-nums">{u.callCount}</td>
                    <td className="text-right tabular-nums">{u.inputTokens}</td>
                    <td className="text-right tabular-nums">{u.outputTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
