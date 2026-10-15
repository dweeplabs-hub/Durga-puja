import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Crown, Download, Eye, EyeOff, ListOrdered, Scale, Table2 } from 'lucide-react';
import type { Participant } from '../types';
import { useCompetition, useLedger } from '../store';
import { automaticTieGroups, unresolvedTieGroups } from '../lib/engine';
import { clearTieBreakOrder, setShowLoanColumnsPublic, setTieBreakOrder } from '../lib/operations';
import { downloadFile, leaderboardCsv } from '../lib/exporters';
import { LeaderboardTable } from './LeaderboardTable';
import { Podium } from './Podium';
import { Badge, Button, Card, Field, Modal, PLACE_META, Toggle, inputClass, fmt } from './ui';

export function LeaderboardView() {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const ledger = useLedger();
  const [resolving, setResolving] = useState(false);
  const autoGroups = useMemo(() => automaticTieGroups(ledger.ranked), [ledger.ranked]);
  const unresolved = useMemo(() => unresolvedTieGroups(ledger.ranked), [ledger.ranked]);
  const anyCompleted = data.events.some((e) => e.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      {data.scoresFrozen && (
        <Card title="Final Championship Podium" icon={<Crown size={18} className="text-amber-400" />}>
          <Podium ranked={ledger.ranked} />
        </Card>
      )}

      <Card
        title="Full Leaderboard"
        icon={<ListOrdered size={18} className="text-violet-400" />}
        actions={
          <>
            <Toggle
              checked={data.showLoanColumnsPublic}
              onChange={(v) => run((d) => setShowLoanColumnsPublic(d, v))}
              label={
                <span className="inline-flex items-center gap-1">
                  {data.showLoanColumnsPublic ? <Eye size={14} /> : <EyeOff size={14} />} Show Loan Columns on Public Board
                </span>
              }
            />
            <Button size="sm" variant={unresolved.length && anyCompleted ? 'warning' : 'secondary'} disabled={autoGroups.length === 0} onClick={() => setResolving(true)}>
              <Scale size={14} /> Resolve Tie{unresolved.length ? ` (${unresolved.length})` : ''}
            </Button>
            <Button size="sm" onClick={() => downloadFile('leaderboard.csv', leaderboardCsv(ledger), 'text/csv')}>
              <Download size={14} /> CSV
            </Button>
          </>
        }
      >
        <LeaderboardTable ranked={ledger.ranked} showLoans variant="admin" />
        <div className="mt-4 grid gap-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400 md:grid-cols-4">
          <p>
            <b className="text-slate-200">1.</b> Higher current balance{data.settings.loanSettings.deductUnpaidLoanAtFinale ? ' (net of unpaid loan once scores are frozen)' : ''}
          </p>
          <p>
            <b className="text-slate-200">2.</b> Lower outstanding loan
          </p>
          <p>
            <b className="text-slate-200">3.</b> Higher performance score (1st={data.settings.placementPoints.first}, 2nd={data.settings.placementPoints.second}, 3rd=
            {data.settings.placementPoints.third}), then total rewards
          </p>
          <p>
            <b className="text-slate-200">4.</b> Final tie-break challenge order (set via “Resolve Tie”)
          </p>
        </div>
        {ledger.warnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            {ledger.warnings.map((w, i) => (
              <p key={i}>
                ⚠ Event {w.eventNumber} · {data.participants.find((p) => p.id === w.participantId)?.name ?? w.participantId}: {w.message}
              </p>
            ))}
          </div>
        )}
      </Card>

      <MasterTable />

      {resolving && <ResolveTieModal groups={autoGroups} onClose={() => setResolving(false)} />}
    </div>
  );
}

function MasterTable() {
  const data = useCompetition((s) => s.data);
  const ledger = useLedger();
  return (
    <Card title="Master Table · Event-by-Event Ledger" icon={<Table2 size={18} className="text-sky-400" />}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="text-left uppercase text-slate-500">
              <th className="sticky left-0 bg-slate-900 px-2 py-2">Participant</th>
              {data.events.map((e) => (
                <th key={e.eventNumber} className="px-2 py-2 text-center" title={e.title}>
                  E{e.eventNumber}
                </th>
              ))}
              <th className="px-2 py-2 text-right">Balance</th>
              <th className="px-2 py-2 text-right">Rank</th>
            </tr>
          </thead>
          <tbody>
            {ledger.ranked.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="sticky left-0 bg-slate-900 px-2 py-1.5 font-medium whitespace-nowrap">{p.name}</td>
                {data.events.map((e) => {
                  const r = ledger.roundResults[e.eventNumber]?.find((x) => x.participantId === p.id);
                  if (!r) return <td key={e.eventNumber} className="px-2 py-1.5 text-center text-slate-700">·</td>;
                  if (!r.participated) return <td key={e.eventNumber} className="px-2 py-1.5 text-center text-slate-600">—</td>;
                  const delta = r.balanceAfter - r.balanceBefore;
                  const pending = e.status === 'IN_PROGRESS';
                  return (
                    <td key={e.eventNumber} className="px-2 py-1.5 text-center" title={`Stake ${r.stake}, gross ${r.grossReward}, loan repaid ${r.loanRepaid}`}>
                      <div className="text-slate-400">
                        {r.placement && PLACE_META[r.placement].emoji} {fmt(r.stake)}
                      </div>
                      <div className={pending ? 'text-sky-300' : delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-rose-300' : 'text-slate-500'}>
                        {pending ? 'locked' : `${delta > 0 ? '+' : ''}${fmt(delta)}`}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right font-semibold">{fmt(p.currentBalance)}</td>
                <td className="px-2 py-1.5 text-right">{p.currentRank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Each cell shows the stake (top) and net balance change for the round (bottom). Hover for details.</p>
    </Card>
  );
}

function ResolveTieModal({ groups, onClose }: { groups: Participant[][]; onClose: () => void }) {
  const run = useCompetition((s) => s.run);
  const [groupIdx, setGroupIdx] = useState(0);
  const group = groups[Math.min(groupIdx, groups.length - 1)] ?? [];
  const [order, setOrder] = useState<string[]>(() => group.map((p) => p.id));
  const [reason, setReason] = useState('Final tie-break challenge result');
  const names = new Map(group.map((p) => [p.id, p.name]));

  const pick = (i: number) => {
    setGroupIdx(i);
    setOrder(groups[i].map((p) => p.id));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Resolve Tie — Final Tie-Break Challenge"
      footer={
        <>
          <Button variant="ghost" onClick={() => run((d) => clearTieBreakOrder(d, order, reason || 'Tie-break order cleared')) && onClose()}>
            Clear order
          </Button>
          <Button variant="primary" disabled={!reason.trim()} onClick={() => run((d) => setTieBreakOrder(d, order, reason), 'Tie-break order saved') && onClose()}>
            Save Order
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-400">
        These participants are level on balance, loan, performance and rewards. Hold a tie-break challenge and arrange them in finishing order (top = higher rank).
      </p>
      {groups.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {groups.map((g, i) => (
            <Button key={i} size="xs" variant={i === groupIdx ? 'primary' : 'secondary'} onClick={() => pick(i)}>
              Rank {g[0].currentRank} · {g.length} tied ({fmt(g[0].rankingBalance)})
            </Button>
          ))}
        </div>
      )}
      <ol className="space-y-2">
        {order.map((id, i) => (
          <li key={id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
            <Badge tone="violet">#{i + 1}</Badge>
            <span className="flex-1 font-medium">{names.get(id)}</span>
            <Button size="xs" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
              <ArrowUp size={14} />
            </Button>
            <Button size="xs" variant="ghost" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
              <ArrowDown size={14} />
            </Button>
          </li>
        ))}
      </ol>
      <div className="mt-4">
        <Field label="Audit reason">
          <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
