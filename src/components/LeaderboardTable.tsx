import { Crown, Medal } from 'lucide-react';
import type { Participant } from '../types';
import { TIER_LABEL } from '../lib/engine';
import { Badge, fmt } from './ui';

interface Props {
  ranked: Participant[];
  showLoans: boolean;
  variant: 'admin' | 'projector';
  /** Optional extra column: stake currently locked in the active event. */
  activeStakes?: Record<string, number> | null;
  activeEventNumber?: number;
}

function RankCell({ rank, variant }: { rank: number; variant: Props['variant'] }) {
  const big = variant === 'projector';
  if (rank === 1) return <span className="inline-flex items-center gap-1 font-bold text-amber-300"><Crown size={big ? 26 : 16} />1</span>;
  if (rank === 2) return <span className="inline-flex items-center gap-1 font-bold text-slate-200"><Medal size={big ? 24 : 15} />2</span>;
  if (rank === 3) return <span className="inline-flex items-center gap-1 font-bold text-orange-300"><Medal size={big ? 24 : 15} />3</span>;
  return <span className="font-semibold text-slate-400">{rank}</span>;
}

export function TieBadge({ p }: { p: Participant }) {
  if (!p.inTieGroup) return null;
  if (p.tieBreakTier === 'UNRESOLVED') return <Badge tone="rose">Tied · needs tie-break</Badge>;
  return <Badge tone="violet">Tie → {TIER_LABEL[p.tieBreakTier]}</Badge>;
}

export function LeaderboardTable({ ranked, showLoans, variant, activeStakes, activeEventNumber }: Props) {
  const proj = variant === 'projector';
  const th = proj ? 'px-3 py-3 text-sm lg:text-base' : 'px-3 py-2 text-xs';
  const td = proj ? 'px-3 py-2.5 text-lg lg:text-2xl' : 'px-3 py-2 text-sm';
  const rowTone = (rank: number) =>
    rank === 1 ? 'bg-amber-400/10' : rank === 2 ? 'bg-slate-300/5' : rank === 3 ? 'bg-orange-500/10' : '';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr className={`text-left uppercase tracking-wide ${proj ? 'text-violet-200/80' : 'text-slate-400'}`}>
            <th className={th}>Rank</th>
            <th className={th}>ID</th>
            <th className={th}>Name</th>
            <th className={`${th} text-right`}>Start</th>
            <th className={`${th} text-right`}>Balance</th>
            <th className={`${th} text-right`}>Staked</th>
            <th className={`${th} text-right`}>Rewards</th>
            {showLoans && <th className={`${th} text-right`}>Loan Due</th>}
            {showLoans && <th className={`${th} text-right`}>Repaid</th>}
            <th className={`${th} text-right`}>Events</th>
            {activeStakes && <th className={`${th} text-right text-sky-300`}>At Stake (E{activeEventNumber})</th>}
            {!proj && <th className={`${th} text-right`}>Perf.</th>}
            {!proj && <th className={th}>Tie-break</th>}
          </tr>
        </thead>
        <tbody>
          {ranked.map((p) => (
            <tr key={p.id} className={`${rowTone(p.currentRank)} ${proj ? 'border-b border-white/5' : ''} tabular transition-colors`}>
              <td className={`${td} border-t border-slate-800/70`}>
                <RankCell rank={p.currentRank} variant={variant} />
              </td>
              <td className={`${td} border-t border-slate-800/70 whitespace-nowrap font-mono ${proj ? 'text-base lg:text-lg text-slate-400' : 'text-xs text-slate-500'}`}>{p.id}</td>
              <td className={`${td} border-t border-slate-800/70 font-semibold`}>
                <div className="flex flex-wrap items-center gap-2">
                  {p.name}
                  {proj && p.inTieGroup && p.tieBreakTier !== 'UNRESOLVED' && <span className="text-xs font-normal text-violet-300">(tie → {TIER_LABEL[p.tieBreakTier]})</span>}
                </div>
              </td>
              <td className={`${td} border-t border-slate-800/70 text-right text-slate-400`}>{fmt(p.startingBalance)}</td>
              <td className={`${td} border-t border-slate-800/70 text-right font-bold ${proj ? 'text-amber-200' : 'text-white'}`}>
                {fmt(p.currentBalance)}
                {p.rankingBalance !== p.currentBalance && <span className="block text-xs font-normal text-slate-400">net {fmt(p.rankingBalance)}</span>}
              </td>
              <td className={`${td} border-t border-slate-800/70 text-right text-slate-300`}>{fmt(p.totalTokensStaked)}</td>
              <td className={`${td} border-t border-slate-800/70 text-right text-emerald-300`}>{fmt(p.totalRewardsEarned)}</td>
              {showLoans && <td className={`${td} border-t border-slate-800/70 text-right ${p.outstandingLoan > 0 ? 'text-rose-300' : 'text-slate-500'}`}>{fmt(p.outstandingLoan)}</td>}
              {showLoans && <td className={`${td} border-t border-slate-800/70 text-right text-slate-400`}>{fmt(p.totalLoanRepaid)}</td>}
              <td className={`${td} border-t border-slate-800/70 text-right text-slate-300`}>{p.eventsParticipated}</td>
              {activeStakes && <td className={`${td} border-t border-slate-800/70 text-right text-sky-300`}>{fmt(activeStakes[p.id] ?? 0)}</td>}
              {!proj && <td className={`${td} border-t border-slate-800/70 text-right text-violet-300`}>{p.performanceScore}</td>}
              {!proj && (
                <td className={`${td} border-t border-slate-800/70`}>
                  <TieBadge p={p} />
                  {p.tieBreakOrder > 0 && <span className="ml-1 text-xs text-slate-500">#{p.tieBreakOrder}</span>}
                </td>
              )}
            </tr>
          ))}
          {ranked.length === 0 && (
            <tr>
              <td colSpan={13} className="px-3 py-10 text-center text-slate-500">
                No participants registered yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
