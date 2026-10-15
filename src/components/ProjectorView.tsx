import { useEffect, useMemo, useRef, useState } from 'react';
import { Coins, Maximize, Minimize, Trophy, Volume2, VolumeX, X } from 'lucide-react';
import { useCompetition, useLedger } from '../store';
import { podiumConfetti, readLocalFlag, roundWinnerConfetti, writeLocalFlag } from '../lib/effects';
import { LeaderboardTable } from './LeaderboardTable';
import { Podium } from './Podium';
import { Countdown } from './Countdown';
import { PLACE_META, STATUS_LABEL, fmt } from './ui';
import type { PlacementKey } from '../types';

const SOUND_KEY = 'wac:projector-sound';

/**
 * Audience-facing big-screen view. Contains no admin controls; it mirrors the
 * admin window live via BroadcastChannel / storage events.
 */
export function ProjectorView({ onClose }: { onClose?: () => void }) {
  const data = useCompetition((s) => s.data);
  const ledger = useLedger();
  const [sound, setSound] = useState(() => readLocalFlag(SOUND_KEY, false));
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  const current = data.events.find((e) => e.eventNumber === data.currentEventNumber) ?? data.events[0];
  const completed = data.events.filter((e) => e.status === 'COMPLETED');
  const lastCompleted = completed.at(-1);
  const names = useMemo(() => new Map(data.participants.map((p) => [p.id, p.name])), [data.participants]);

  // Celebrate when a new round is published or champions are crowned.
  const prevCompleted = useRef(completed.length);
  const prevFrozen = useRef(data.scoresFrozen);
  useEffect(() => {
    if (data.scoresFrozen && !prevFrozen.current) podiumConfetti();
    else if (completed.length > prevCompleted.current) roundWinnerConfetti();
    prevCompleted.current = completed.length;
    prevFrozen.current = data.scoresFrozen;
  }, [completed.length, data.scoresFrozen]);
  useEffect(() => {
    if (prevFrozen.current) podiumConfetti();
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    document.title = `${data.settings.eventName} — Live Leaderboard`;
  }, [data.settings.eventName]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const showLoans = data.showLoanColumnsPublic;
  const activeStakes = current.status === 'IN_PROGRESS' ? current.bids : null;
  const pot = current.status === 'IN_PROGRESS' ? Object.entries(current.bids).reduce((s, [id, b]) => s + (current.participation[id] === false ? 0 : b), 0) : 0;
  const summaryEvent = current.status === 'COMPLETED' ? current : lastCompleted;
  const summaryResults = summaryEvent ? (ledger.roundResults[summaryEvent.eventNumber] ?? []) : [];

  return (
    <div className="group relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_#3b0764_0%,_#0f0a1e_45%,_#020617_100%)] text-white">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[30rem] w-[30rem] rounded-full bg-fuchsia-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-[30rem] w-[30rem] rounded-full bg-amber-500/10 blur-3xl" />

      {/* Projector-local controls (hidden until hover) */}
      <div className="absolute right-4 top-4 z-20 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
          title={sound ? 'Mute countdown' : 'Enable countdown sound'}
          onClick={() => {
            setSound(!sound);
            writeLocalFlag(SOUND_KEY, !sound);
          }}
        >
          {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </button>
        <button type="button" className="rounded-lg bg-white/10 p-2 hover:bg-white/20" title="Toggle full screen" onClick={toggleFullscreen}>
          {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
        {onClose && (
          <button type="button" className="rounded-lg bg-white/10 p-2 hover:bg-white/20" title="Exit presentation" onClick={onClose}>
            <X size={20} />
          </button>
        )}
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1800px] flex-col px-6 py-6 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-fuchsia-300/80">Live Leaderboard</p>
            <h1 className="bg-gradient-to-r from-amber-200 via-amber-300 to-fuchsia-300 bg-clip-text text-4xl font-black text-transparent lg:text-6xl">
              {data.settings.eventName}
            </h1>
          </div>
          {!data.scoresFrozen && current.status === 'BIDDING_OPEN' && <Countdown event={current} sound={sound} size="xl" />}
          <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-3 text-right">
            {data.scoresFrozen ? (
              <p className="text-2xl font-bold text-amber-300 lg:text-3xl">Final Standings</p>
            ) : (
              <>
                <p className="text-sm uppercase tracking-widest text-slate-400">
                  Event {current.eventNumber} of {data.settings.totalEvents}
                </p>
                <p className="text-2xl font-bold lg:text-3xl">{STATUS_LABEL[current.status]}</p>
              </>
            )}
          </div>
        </header>

        {data.scoresFrozen ? (
          <main className="mt-8 flex flex-1 flex-col gap-10">
            <div className="text-center">
              <p className="text-2xl font-semibold uppercase tracking-[0.5em] text-amber-300">🏆 Championship Podium 🏆</p>
            </div>
            <Podium ranked={ledger.ranked} big />
            <div className="rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur">
              <LeaderboardTable ranked={ledger.ranked} showLoans={showLoans} variant="projector" />
            </div>
          </main>
        ) : (
          <main className="mt-6 grid flex-1 gap-6 xl:grid-cols-[1fr_420px]">
            <div className="rounded-3xl border border-white/10 bg-black/30 p-4 backdrop-blur">
              <LeaderboardTable ranked={ledger.ranked} showLoans={showLoans} variant="projector" activeStakes={activeStakes} activeEventNumber={current.eventNumber} />
            </div>
            <aside className="flex flex-col gap-6">
              <div className="rounded-3xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-6">
                <p className="text-sm uppercase tracking-widest text-fuchsia-300">Now Playing</p>
                <h2 className="mt-1 text-3xl font-extrabold leading-tight">{current.title}</h2>
                {current.description && <p className="mt-3 whitespace-pre-line text-lg text-slate-300">{current.description}</p>}
                {current.status === 'IN_PROGRESS' && (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sky-500/15 px-4 py-3 text-sky-200">
                    <Coins size={28} />
                    <div>
                      <p className="text-sm uppercase tracking-wider">Tokens in play</p>
                      <p className="text-3xl font-black tabular">{fmt(pot)}</p>
                    </div>
                  </div>
                )}
                {current.status === 'BIDDING_OPEN' && <p className="mt-4 text-xl font-semibold text-amber-300">Place your bids now!</p>}
                {current.status === 'UPCOMING' && <p className="mt-4 text-xl text-slate-400">Starting soon…</p>}
              </div>

              {summaryEvent && (
                <div className="rounded-3xl border border-amber-400/30 bg-amber-400/5 p-6">
                  <p className="flex items-center gap-2 text-sm uppercase tracking-widest text-amber-300">
                    <Trophy size={16} /> {summaryEvent.eventNumber === current.eventNumber ? 'Round Winners' : 'Last Round Winners'}
                  </p>
                  <h3 className="mt-1 text-xl font-bold">{summaryEvent.title}</h3>
                  <ul className="mt-4 space-y-3">
                    {(['first', 'second', 'third'] as PlacementKey[]).flatMap((k) =>
                      summaryEvent.placements[k].map((id) => {
                        const r = summaryResults.find((x) => x.participantId === id);
                        return (
                          <li key={`${k}-${id}`} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3">
                            <span className="flex items-center gap-3 text-2xl font-bold">
                              <span>{PLACE_META[k].emoji}</span>
                              {names.get(id) ?? id}
                            </span>
                            <span className="text-xl font-bold text-emerald-300 tabular">+{fmt(r?.grossReward ?? 0)}</span>
                          </li>
                        );
                      }),
                    )}
                  </ul>
                </div>
              )}

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-sm uppercase tracking-widest text-slate-400">Event Progress</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.events.map((e) => (
                    <span
                      key={e.eventNumber}
                      className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                        e.status === 'COMPLETED'
                          ? 'bg-emerald-500 text-emerald-950'
                          : e.eventNumber === current.eventNumber
                            ? 'bg-amber-400 text-amber-950 ring-4 ring-amber-400/30'
                            : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {e.eventNumber}
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-sm text-slate-400">
                  1st ×{data.settings.multipliers.first} · 2nd ×{data.settings.multipliers.second} · 3rd ×{data.settings.multipliers.third} of own stake
                </p>
              </div>
            </aside>
          </main>
        )}
      </div>
    </div>
  );
}
