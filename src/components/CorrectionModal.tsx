import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { EventRound, PlacementKey, Placements } from '../types';
import { useCompetition } from '../store';
import { computeLedger, placementOf } from '../lib/engine';
import { OpError, correctRound, type RoundCorrection } from '../lib/operations';
import { Button, Field, Modal, NumberInput, inputClass, fmt } from './ui';

/**
 * Audited correction of a locked or completed round. Requires a reason; re-runs the full ledger.
 * Mount it only while open so the draft starts from the event's current values.
 */
export function CorrectionModal({ event, open, onClose }: { event: EventRound; open: boolean; onClose: () => void }) {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const [draft, setDraft] = useState<RoundCorrection>(() => initial(event, data.participants.map((p) => p.id)));
  const [reason, setReason] = useState('');

  const preview = useMemo(() => {
    try {
      const before = computeLedger(data);
      const next = correctRound(data, event.eventNumber, draft, reason.trim() || 'preview');
      const after = computeLedger(next);
      const diffs = after.participants
        .map((p) => ({ p, before: before.participants.find((b) => b.id === p.id)! }))
        .filter((x) => x.before.currentBalance !== x.p.currentBalance || x.before.currentRank !== x.p.currentRank);
      const warnings = after.warnings.filter((w) => w.eventNumber >= event.eventNumber);
      return { diffs, warnings, error: null as string | null };
    } catch (e) {
      return { diffs: [], warnings: [], error: e instanceof OpError ? e.message : String(e) };
    }
  }, [data, draft, event.eventNumber, reason]);

  const setPlace = (id: string, place: PlacementKey | null) => {
    setDraft((d) => {
      const placements: Placements = {
        first: d.placements.first.filter((x) => x !== id),
        second: d.placements.second.filter((x) => x !== id),
        third: d.placements.third.filter((x) => x !== id),
      };
      if (place) placements[place] = [...placements[place], id];
      return { ...d, placements };
    });
  };

  const submit = () => {
    if (!reason.trim()) return;
    if (run((d) => correctRound(d, event.eventNumber, draft, reason), `Event ${event.eventNumber} corrected — ledger recalculated`)) onClose();
  };

  const isCompleted = event.status === 'COMPLETED';

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={`Audited Correction — ${event.title}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="warning" disabled={!reason.trim() || Boolean(preview.error)} onClick={submit}>
            Apply Correction & Recalculate
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <p>
          Corrections are written to the audit log and the entire ledger is replayed from Event 1, so every later round, loan repayment and ranking is
          re-evaluated automatically.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-2 py-2">Participant</th>
              <th className="px-2 py-2">Participating</th>
              <th className="px-2 py-2">Stake</th>
              {isCompleted && <th className="px-2 py-2">Placement</th>}
            </tr>
          </thead>
          <tbody>
            {data.participants.map((p) => {
              const participating = draft.participation[p.id] !== false;
              const place = placementOf({ ...event, placements: draft.placements }, p.id);
              return (
                <tr key={p.id} className="border-t border-slate-800">
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-xs text-slate-500">{p.id}</span> {p.name}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-violet-500"
                      checked={participating}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setDraft((d) => ({ ...d, participation: { ...d.participation, [p.id]: checked } }));
                        if (!checked) setPlace(p.id, null);
                      }}
                    />
                  </td>
                  <td className="w-32 px-2 py-1.5">
                    <NumberInput
                      value={draft.bids[p.id] ?? 0}
                      min={0}
                      disabled={!participating}
                      commitOnChange
                      ariaLabel={`Stake for ${p.name}`}
                      onCommit={(n) => setDraft((d) => ({ ...d, bids: { ...d.bids, [p.id]: n } }))}
                    />
                  </td>
                  {isCompleted && (
                    <td className="px-2 py-1.5">
                      <select
                        className={`${inputClass} w-36`}
                        value={place ?? ''}
                        disabled={!participating}
                        onChange={(e) => setPlace(p.id, (e.target.value || null) as PlacementKey | null)}
                      >
                        <option value="">—</option>
                        <option value="first">1st Place</option>
                        <option value="second">2nd Place</option>
                        <option value="third">3rd Place</option>
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <Field label="Correction reason (required — recorded in the audit log)">
          <textarea className={`${inputClass} min-h-20`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Judges reviewed the video — 2nd and 3rd place were swapped" />
        </Field>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
        <p className="mb-2 font-semibold text-slate-300">Projected effect</p>
        {preview.error ? (
          <p className="text-rose-300">{preview.error}</p>
        ) : preview.diffs.length === 0 ? (
          <p className="text-slate-500">No balance or rank changes.</p>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2">
            {preview.diffs.map(({ p, before }) => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="w-40 truncate">{p.name}</span>
                <span className="tabular text-slate-400">{fmt(before.currentBalance)}</span>
                <ArrowRight size={12} className="text-slate-500" />
                <span className="tabular font-semibold">{fmt(p.currentBalance)}</span>
                <span className="text-xs text-slate-500">
                  (rank {before.currentRank}→{p.currentRank})
                </span>
              </li>
            ))}
          </ul>
        )}
        {preview.warnings.map((w, i) => (
          <p key={i} className="mt-1 text-amber-300">
            ⚠ Event {w.eventNumber}: {w.message}
          </p>
        ))}
      </div>
    </Modal>
  );
}

function initial(event: EventRound, ids: string[]): RoundCorrection {
  const participation: Record<string, boolean> = {};
  const bids: Record<string, number> = {};
  for (const id of ids) {
    participation[id] = event.participation[id] !== false;
    bids[id] = event.bids[id] ?? 0;
  }
  return {
    bids,
    participation,
    placements: { first: [...event.placements.first], second: [...event.placements.second], third: [...event.placements.third] },
  };
}
