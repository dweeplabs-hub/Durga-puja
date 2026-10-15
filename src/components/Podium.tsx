import { Crown, Trophy } from 'lucide-react';
import type { Participant, ProjectorLanguage } from '../types';
import { tx, type TextKey } from '../lib/i18n';
import { Bi } from './Bi';
import { fmt } from './ui';

const TITLES: TextKey[] = ['champion', 'firstRunnerUp', 'secondRunnerUp'];

/** Final championship podium. Participants sharing an unresolved rank appear together. */
export function Podium({ ranked, big = false, language = 'ENGLISH' }: { ranked: Participant[]; big?: boolean; language?: ProjectorLanguage }) {
  const byRank = (r: number) => ranked.filter((p) => p.currentRank === r);
  const slots = [1, 2, 3].map((r) => byRank(r));
  const order = [1, 0, 2]; // 2nd, 1st, 3rd visually
  const heights = big ? ['h-72', 'h-52', 'h-40'] : ['h-44', 'h-32', 'h-24'];
  const colors = [
    'from-amber-300 to-amber-600 text-amber-950',
    'from-slate-200 to-slate-400 text-slate-900',
    'from-orange-400 to-orange-700 text-orange-950',
  ];
  const hasTies = slots.some((s) => s.length > 1);

  return (
    <div className="w-full">
      <div className={`mx-auto flex max-w-5xl items-end justify-center ${big ? 'gap-6' : 'gap-3'}`}>
        {order.map((i, k) => {
          const winners = slots[i];
          return (
            <div key={i} className="animate-rise flex flex-1 flex-col items-center" style={{ animationDelay: `${[0.6, 1.2, 0][k]}s` }}>
              <div className="mb-3 text-center">
                {i === 0 && <Crown className="mx-auto mb-1 text-amber-300 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]" size={big ? 64 : 36} />}
                {winners.length === 0 ? (
                  <p className="text-slate-500">—</p>
                ) : (
                  winners.map((w) => (
                    <div key={w.id}>
                      <p className={`font-extrabold leading-tight ${big ? 'text-4xl' : 'text-xl'}`}>{w.name}</p>
                      <p className={`${big ? 'text-2xl' : 'text-sm'} font-semibold text-amber-200 tabular`}>{fmt(w.rankingBalance)} {tx(language, 'tokens')}</p>
                    </div>
                  ))
                )}
              </div>
              <div className={`flex w-full flex-col items-center justify-start rounded-t-2xl bg-gradient-to-b pt-4 shadow-2xl ${colors[i]} ${heights[i]}`}>
                <Trophy size={big ? 40 : 22} />
                <span className={`font-black ${big ? 'text-6xl' : 'text-3xl'}`}>{i + 1}</span>
                <span className={`mt-1 px-2 text-center font-bold uppercase tracking-widest ${big ? 'text-lg' : 'text-xs'}`}><Bi lang={language} k={TITLES[i]} /></span>
              </div>
            </div>
          );
        })}
      </div>
      {hasTies && <p className="mt-4 text-center text-sm text-rose-300"><Bi lang={language} k="podiumTie" /></p>}
    </div>
  );
}
