import type { ExtractProgressEvent } from '../lib/api';

interface Props {
  events: ExtractProgressEvent[];
  startedAt: number | null;
}

export function ExtractionProgress({ events, startedAt }: Props) {
  const last = events[events.length - 1];
  const roundtrip = [...events]
    .reverse()
    .find((e): e is Extract<ExtractProgressEvent, { type: 'roundtrip' }> => e.type === 'roundtrip');
  const phase = [...events]
    .reverse()
    .find((e): e is Extract<ExtractProgressEvent, { type: 'phase' }> => e.type === 'phase');
  const elapsedSec = startedAt
    ? Math.round((Date.now() - startedAt) / 1000)
    : 0;

  return (
    <section className="card card-pad space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-ink-900">Researching…</h3>
        <span className="text-xs text-ink-500 tabular-nums">{elapsedSec}s</span>
      </div>
      <p className="text-xs text-ink-600">
        The worker is using web search to read vendor docs and security pages.
        This typically takes 30–120 seconds.
      </p>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <Chip label="Phase" value={phase?.phase ?? 'extraction'} />
        {roundtrip && (
          <Chip label="Roundtrip" value={`${roundtrip.n} / ${roundtrip.max}`} />
        )}
        {last && last.type === 'message' && (
          <Chip label="Status" value={last.message} />
        )}
      </div>
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-ink-300 bg-white px-2 py-1">
      <span className="text-ink-500">{label}</span>
      <span className="text-ink-900 font-medium">{value}</span>
    </span>
  );
}
