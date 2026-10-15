import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronRight,
  Crown,
  Gavel,
  Lock,
  Megaphone,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Square,
  Trophy,
  Unlock,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { EventRound, EventStatus, Participant } from '../types';
import { useCompetition, useLedger } from '../store';
import { awardGroups, awardOf, computeLedger, maxStakeFor } from '../lib/engine';
import {
  advanceEvent,
  applyBidPresetToAll,
  bidErrors,
  clearAwards,
  freezeScores,
  issueLoan,
  lockBidding,
  openBidding,
  pauseTimer,
  publishResults,
  resetTimer,
  resolvePreset,
  resumeTimer,
  setBid,
  setParticipation,
  setAward,
  startTimer,
  unfreezeScores,
  updateAudio,
  updateEventMeta,
  type BidPreset,
} from '../lib/operations';
import { allowClosedCue, cue, cueBiddingClosed, cueKoriClink } from '../audio/cues';
import { audioEngine, formatTime, useAudioSnapshot } from '../audio/engine';
import { podiumConfetti, roundWinnerConfetti } from '../lib/effects';
import { Badge, Button, Card, Field, Modal, MultiplierBadge, NumberInput, StatusBadge, inputClass, fmt, tierStyle } from './ui';
import { Countdown } from './Countdown';
import { CorrectionModal } from './CorrectionModal';
import { Kori, KoriIcon } from './Kori';

const STEPS: { status: EventStatus; key: string; title: string; subtitle: string; icon: typeof Megaphone }[] = [
  { status: 'UPCOMING', key: 'A', title: 'Announce & Open Bidding', subtitle: 'Set name, rules, timer', icon: Megaphone },
  { status: 'BIDDING_OPEN', key: 'B', title: 'Record & Confirm Stakes', subtitle: 'Bids, loans, lock', icon: Gavel },
  { status: 'IN_PROGRESS', key: 'C', title: 'Conduct Event & Select Winners', subtitle: 'Podium & payouts', icon: Trophy },
  { status: 'COMPLETED', key: 'D', title: 'Round Summary & Next Event', subtitle: 'Review, correct, advance', icon: CheckCircle2 },
];
const ORDER: EventStatus[] = ['UPCOMING', 'BIDDING_OPEN', 'IN_PROGRESS', 'COMPLETED'];

export function EventOperations({ selected, onSelect }: { selected: number; onSelect: (n: number) => void }) {
  const data = useCompetition((s) => s.data);
  const event = data.events.find((e) => e.eventNumber === selected) ?? data.events[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-1.5 lg:sticky lg:top-36 lg:self-start">
        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Events</p>
        {data.events.map((e) => (
          <button
            key={e.eventNumber}
            type="button"
            onClick={() => onSelect(e.eventNumber)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
              e.eventNumber === selected ? 'border-violet-500/60 bg-violet-500/10' : 'border-transparent hover:bg-slate-900'
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                e.status === 'COMPLETED'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : e.eventNumber === data.currentEventNumber
                    ? 'bg-amber-400 text-amber-950'
                    : 'bg-slate-800 text-slate-400'
              }`}
            >
              {e.status === 'COMPLETED' ? <CheckCircle2 size={16} /> : e.eventNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{e.title}</span>
              <span className="text-xs text-slate-500">
                {e.eventNumber === data.currentEventNumber && !data.scoresFrozen ? '● Active · ' : ''}
                {e.status.replace('_', ' ').toLowerCase()}
              </span>
            </span>
          </button>
        ))}
      </aside>

      <div className="min-w-0 space-y-6">
        <Stepper event={event} />
        {data.participants.length === 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            No participants yet. Add them under <b>Participants & Settings</b> or use <b>Load Demo Data</b> in the top bar.
          </div>
        )}
        {event.status === 'UPCOMING' && <StepAnnounce event={event} />}
        {event.status === 'BIDDING_OPEN' && <StepBidding event={event} />}
        {event.status === 'IN_PROGRESS' && <StepConduct event={event} />}
        {event.status === 'COMPLETED' && <StepSummary event={event} onSelect={onSelect} />}
      </div>
    </div>
  );
}

function Stepper({ event }: { event: EventRound }) {
  const idx = ORDER.indexOf(event.status);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{event.title}</h2>
        <StatusBadge status={event.status} />
      </div>
      <ol className="grid gap-2 md:grid-cols-4">
        {STEPS.map((s, i) => {
          const done = i < idx || event.status === 'COMPLETED';
          const active = i === idx && event.status !== 'COMPLETED';
          const Icon = s.icon;
          return (
            <li
              key={s.key}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                active ? 'border-violet-500 bg-violet-500/15' : done ? 'border-emerald-600/40 bg-emerald-500/5' : 'border-slate-800'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  active ? 'bg-violet-600 text-white' : done ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {done ? <CheckCircle2 size={18} /> : <Icon size={18} />}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Step {s.key}</span>
                <span className={`block text-sm font-semibold leading-tight ${active ? 'text-white' : done ? 'text-emerald-200' : 'text-slate-400'}`}>{s.title}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- Step A

function EventMetaEditor({ event }: { event: EventRound }) {
  const run = useCompetition((s) => s.run);
  const [title, setTitle] = useState(event.title);
  const [desc, setDesc] = useState(event.description);
  const [lastKey, setLastKey] = useState(`${event.eventNumber}|${event.title}|${event.description}`);
  const key = `${event.eventNumber}|${event.title}|${event.description}`;
  if (key !== lastKey) {
    setLastKey(key);
    setTitle(event.title);
    setDesc(event.description);
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Event name">
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== event.title && run((d) => updateEventMeta(d, event.eventNumber, { title }))}
        />
      </Field>
      <Field label="Bidding window (countdown)">
        <div className="flex gap-2">
          <NumberInput
            value={event.biddingDurationSec}
            min={0}
            step={15}
            ariaLabel="Bidding window in seconds"
            onCommit={(n) => run((d) => updateEventMeta(d, event.eventNumber, { biddingDurationSec: n }))}
          />
          <span className="self-center text-sm text-slate-500">sec</span>
          {[60, 120, 180].map((s) => (
            <Button key={s} size="sm" variant={event.biddingDurationSec === s ? 'primary' : 'secondary'} onClick={() => run((d) => updateEventMeta(d, event.eventNumber, { biddingDurationSec: s }))}>
              {s / 60}m
            </Button>
          ))}
        </div>
      </Field>
      <div className="md:col-span-2">
        <Field label="Rules / notes shown on the projector">
          <textarea
            className={`${inputClass} min-h-24`}
            value={desc}
            placeholder="Describe how this round is played and judged…"
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc !== event.description && run((d) => updateEventMeta(d, event.eventNumber, { description: desc }))}
          />
        </Field>
      </div>
    </div>
  );
}

function StepAnnounce({ event }: { event: EventRound }) {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const isCurrent = event.eventNumber === data.currentEventNumber && !data.scoresFrozen;
  const showWelcome = isCurrent && event.eventNumber === 1;
  return (
    <>
    {showWelcome && <WelcomeIntro />}
    <Card title="Step A · Announce & Open Bidding" icon={<Megaphone size={18} className="text-violet-400" />}>
      <EventMetaEditor event={event} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
        <p className="text-sm text-slate-400">
          {isCurrent
            ? `Opening bidding locks the competition rules. Kori stakes: ${data.settings.minStakePerEvent}–${data.settings.maxStakePerEvent} koris.`
            : `Event ${data.currentEventNumber} is the active event — you can prepare this event's details in advance.`}
        </p>
        <Button variant="primary" size="lg" disabled={!isCurrent || data.participants.length === 0} onClick={() => run((d) => openBidding(d, event.eventNumber), 'Bidding is open!') && cue('BIDDING_OPEN')}>
          <Unlock size={18} /> Open Bidding
        </Button>
      </div>
    </Card>
    </>
  );
}

/** Pre-event welcome screen with the manual Grand Intro announcement. */
function WelcomeIntro() {
  const branding = useCompetition((s) => s.data.branding);
  const intro = useCompetition((s) => s.data.audio.slots.find((x) => x.id === 'MAIN_INTRO'));
  const snap = useAudioSnapshot();
  const playing = Boolean(snap.playing.MAIN_INTRO);
  const p = snap.playing.MAIN_INTRO;
  const duration = p?.duration || snap.clips.MAIN_INTRO?.duration || 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-900/40 via-violet-900/30 to-slate-900 p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-amber-400/10 blur-3xl" />
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-300">স্বাগতম · Welcome</p>
      <h2 className="font-bengali mt-1 text-3xl font-black text-amber-200">{branding.titleBn || branding.titleEn}</h2>
      {branding.titleBn && <p className="text-lg font-bold text-amber-100/80">{branding.titleEn}</p>}
      <p className="mt-1 text-sm text-slate-300">{branding.subtitle}</p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button variant={playing ? 'danger' : 'warning'} size="lg" onClick={() => audioEngine.toggleSlot('MAIN_INTRO')}>
          {playing ? <Square size={18} /> : <Play size={18} />}
          {playing ? 'Stop Intro' : 'Play Grand Intro · মূল ঘোষণা'}
        </Button>
        <span className="text-sm text-slate-400">
          {snap.clips.MAIN_INTRO
            ? playing
              ? `${formatTime(p?.current)} / ${formatTime(duration)}`
              : `MP3 ready · ${formatTime(duration)}`
            : 'No intro MP3 uploaded yet — plays a fanfare. Upload it in DJ & Soundboard.'}
          {intro?.hotkey ? ` · Alt+${intro.hotkey}` : ''}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Step B


function StepBidding({ event }: { event: EventRound }) {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const ledger = useLedger();
  const ticks = data.audio.countdownTicks;
  const [confirming, setConfirming] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const errors = useMemo(() => bidErrors(data, event.eventNumber), [data, event.eventNumber]);
  const { settings } = data;
  const tranche = settings.loanSettings.fixedLoanTranche;
  const trancheOptions = Array.from(new Set([tranche, 20, 50])).sort((a, b) => a - b);

  const participating = ledger.participants.filter((p) => event.participation[p.id] !== false);
  const pot = participating.reduce((s, p) => s + (event.bids[p.id] ?? 0), 0);
  const errorCount = Object.keys(errors).length;
  const running = Boolean(event.biddingEndsAt);
  const paused = event.biddingPausedRemainingMs !== null;

  return (
    <>
      <Card
        title="Step B · Record & Confirm Stakes"
        icon={<Gavel size={18} className="text-amber-400" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Countdown event={event} sound={false} />
            {!running && !paused && (
              <Button size="sm" variant="warning" onClick={() => run((d) => startTimer(d, event.eventNumber, Date.now())) && allowClosedCue(event.eventNumber)}>
                <Play size={14} /> Start {Math.round(event.biddingDurationSec / 60 * 10) / 10}m timer
              </Button>
            )}
            {running && (
              <Button size="sm" onClick={() => run((d) => pauseTimer(d, event.eventNumber, Date.now()))}>
                <Pause size={14} /> Pause
              </Button>
            )}
            {paused && (
              <Button size="sm" variant="warning" onClick={() => run((d) => resumeTimer(d, event.eventNumber, Date.now()))}>
                <Play size={14} /> Resume
              </Button>
            )}
            {(running || paused) && (
              <Button size="sm" variant="ghost" onClick={() => run((d) => resetTimer(d, event.eventNumber))}>
                <RotateCcw size={14} /> Reset
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              title={ticks ? 'Mute countdown ticks (DJ setting)' : 'Enable countdown ticks (DJ setting)'}
              onClick={() => run((d) => updateAudio(d, { countdownTicks: !ticks }))}
            >
              {ticks ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-400">Set everyone to:</span>
            {(['min', 10, 25, 'max'] as BidPreset[]).map((p) => (
              <Button key={String(p)} size="xs" onClick={() => run((d) => applyBidPresetToAll(d, event.eventNumber, p))}>
                {p === 'min' ? 'Min' : p === 'max' ? 'Max' : p}
              </Button>
            ))}
          </div>
          <Button size="xs" variant="ghost" onClick={() => setShowMeta(!showMeta)}>
            <Pencil size={12} /> {showMeta ? 'Hide' : 'Edit'} event details
          </Button>
        </div>
        {showMeta && (
          <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <EventMetaEditor event={event} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-2 py-2">Participant</th>
                <th className="px-2 py-2 text-right">Current Koris</th>
                <th className="px-2 py-2 text-right">Kori Loan</th>
                <th className="px-2 py-2">Grant Kori Loan</th>
                <th className="px-2 py-2">Plays</th>
                <th className="px-2 py-2">Kori Stake</th>
                <th className="px-2 py-2">Quick bet</th>
              </tr>
            </thead>
            <tbody>
              {ledger.participants.map((p) => (
                <BidRow key={p.id} p={p} event={event} error={errors[p.id]} trancheOptions={trancheOptions} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-800 pt-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <span className="text-slate-400">Playing:</span> <b>{participating.length}</b>/{ledger.participants.length}
            </span>
            <span>
              <span className="text-slate-400">Total pot:</span> <b className="tabular text-amber-300">{fmt(pot)}</b>
            </span>
            {errorCount > 0 && <Badge tone="rose">{errorCount} invalid stake{errorCount > 1 ? 's' : ''}</Badge>}
          </div>
          <Button variant="primary" size="lg" disabled={errorCount > 0} onClick={() => setConfirming(true)}>
            <Lock size={18} /> Confirm All Stakes & Close Bidding
          </Button>
        </div>
      </Card>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Lock stakes for this event?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Keep editing
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (run((d) => lockBidding(d, event.eventNumber), 'Kori stakes locked and deducted')) {
                  setConfirming(false);
                  cueKoriClink();
                  cueBiddingClosed(event.eventNumber);
                }
              }}
            >
              <Lock size={16} /> Lock {fmt(pot)} koris
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          Each confirmed Kori stake is deducted immediately from the participant's koris and can only be changed afterwards through an audited correction.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {participating.map((p) => (
            <li key={p.id} className="flex justify-between gap-2 border-b border-slate-800 py-1">
              <span className="truncate">{p.name}</span>
              <span className="tabular font-semibold">{fmt(event.bids[p.id] ?? 0)}</span>
            </li>
          ))}
        </ul>
        {ledger.participants.length > participating.length && (
          <p className="mt-3 text-xs text-slate-500">Sitting out: {ledger.participants.filter((p) => event.participation[p.id] === false).map((p) => p.name).join(', ')}</p>
        )}
      </Modal>
    </>
  );
}

function BidRow({ p, event, error, trancheOptions }: { p: Participant; event: EventRound; error?: string; trancheOptions: number[] }) {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const { settings } = data;
  const participating = event.participation[p.id] !== false;
  const bid = event.bids[p.id] ?? 0;
  const cap = maxStakeFor(p.currentBalance, settings);
  const headroom = Math.max(0, settings.loanSettings.maxTotalLoanPerParticipant - p.outstandingLoan);
  const low = p.currentBalance <= 0 || p.currentBalance < Math.max(settings.minStakePerEvent, 1);
  const setTo = (preset: BidPreset) => run((d) => setBid(d, event.eventNumber, p.id, resolvePreset(preset, p.currentBalance, settings)));

  return (
    <tr className={`border-t border-slate-800 ${!participating ? 'opacity-50' : ''} ${low ? 'bg-rose-500/5' : ''}`}>
      <td className="px-2 py-2">
        <div className="font-medium">{p.name}</div>
        <div className="font-mono text-xs text-slate-500">{p.id}</div>
      </td>
      <td className={`px-2 py-2 text-right tabular font-semibold ${low ? 'text-rose-300' : ''}`}>
        <Kori n={p.currentBalance} iconClassName={low ? 'text-rose-400' : 'text-amber-400'} />
      </td>
      <td className={`px-2 py-2 text-right tabular ${p.outstandingLoan > 0 ? 'text-rose-300' : 'text-slate-500'}`}>{fmt(p.outstandingLoan)}</td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          {trancheOptions.map((amt) => (
            <Button
              key={amt}
              size="xs"
              variant={low ? 'warning' : 'secondary'}
              disabled={amt > headroom}
              title={amt > headroom ? `Kori Loan limit reached (${headroom} available)` : `Issue a ${amt}-kori loan (কড়ি ধার)`}
              onClick={() => run((d) => issueLoan(d, p.id, amt), `${p.name} received a ${amt}-kori loan`) && (cueKoriClink(), cue('LOAN_ISSUED'))}
            >
              <KoriIcon size={12} />+{amt}
            </Button>
          ))}
        </div>
        {low && <div className="mt-1 text-xs text-rose-300">{p.currentBalance <= 0 ? 'No koris — issue a Kori Loan?' : 'Below Min Kori Stake'}</div>}
      </td>
      <td className="px-2 py-2">
        <input
          type="checkbox"
          className="h-4 w-4 accent-violet-500"
          checked={participating}
          aria-label={`${p.name} participates`}
          onChange={(e) => run((d) => setParticipation(d, event.eventNumber, p.id, e.target.checked))}
        />
      </td>
      <td className="w-36 px-2 py-2">
        <NumberInput
          value={bid}
          min={0}
          max={cap}
          step={settings.loanSettings.repaymentPrecision === 'INTEGER' ? 1 : 0.01}
          invalid={Boolean(error)}
          disabled={!participating}
          ariaLabel={`Stake for ${p.name}`}
          onCommit={(n) => run((d) => setBid(d, event.eventNumber, p.id, n))}
        />
        <div className={`mt-0.5 text-xs ${error ? 'text-rose-300' : 'text-slate-500'}`}>{error ?? `max ${fmt(cap)}`}</div>
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          {(['min', 10, 25, 'max'] as BidPreset[]).map((preset) => (
            <Button key={String(preset)} size="xs" variant="ghost" className="border border-slate-700" disabled={!participating} onClick={() => setTo(preset)}>
              {preset === 'min' ? 'Min' : preset === 'max' ? 'Max' : preset}
            </Button>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- Step C

function StepConduct({ event }: { event: EventRound }) {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const ledger = useLedger();
  const [correcting, setCorrecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const preview = useMemo(() => computeLedger(data, { previewEventNumber: event.eventNumber }), [data, event.eventNumber]);
  const previewResults = preview.roundResults[event.eventNumber] ?? [];
  const pot = previewResults.reduce((s, r) => s + r.stake, 0);
  const tiers = data.settings.payoutTiers;
  const groups = awardGroups(event);
  const awarded = groups.flatMap((g) => g.ids.map((id) => ({ m: g.multiplier, id })));
  // Show the configured tiers plus any legacy multiplier already awarded in this round.
  const tierButtons = [...new Set([...tiers, ...groups.map((g) => g.multiplier)])].sort((a, b) => b - a);

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card
          title="Step C · Conduct Event & Select Winners"
          icon={<Trophy size={18} className="text-sky-400" />}
          actions={
            <>
              <Badge tone="sky">
                <KoriIcon size={12} /> {fmt(pot)} koris locked
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => setCorrecting(true)}>
                <Pencil size={14} /> Audited stake correction
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-slate-400">Stakes are locked and already deducted. Tap a payout multiplier for each finisher (their own stake × the multiplier). Several players can share a multiplier; anyone without one loses their stake.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-2 py-2">Participant</th>
                  <th className="px-2 py-2 text-right">Locked Kori Stake</th>
                  <th className="px-2 py-2 text-right">Current Koris</th>
                  <th className="px-2 py-2">Payout multiplier</th>
                </tr>
              </thead>
              <tbody>
                {ledger.participants.map((p) => {
                  const participating = event.participation[p.id] !== false;
                  const award = awardOf(event, p.id);
                  return (
                    <tr key={p.id} className={`border-t border-slate-800 ${!participating ? 'opacity-40' : ''}`}>
                      <td className="px-2 py-2">
                        <span className="font-medium">{p.name}</span> <span className="font-mono text-xs text-slate-500">{p.id}</span>
                        {!participating && <span className="ml-2 text-xs text-slate-500">(sitting out)</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular font-semibold text-sky-300">
                        <Kori n={participating ? (event.bids[p.id] ?? 0) : 0} iconClassName="text-sky-300" />
                      </td>
                      <td className="px-2 py-2 text-right tabular">
                        <Kori n={p.currentBalance} />
                      </td>
                      <td className="px-2 py-2">
                        {participating ? (
                          <div className="flex gap-1">
                            {tierButtons.map((m) => (
                              <button
                                key={m}
                                type="button"
                                aria-pressed={award === m}
                                aria-label={`Award ${m}x to ${p.name}`}
                                onClick={() => run((d) => setAward(d, event.eventNumber, p.id, award === m ? null : m))}
                                className={`min-w-9 rounded-lg px-1.5 py-1.5 text-sm font-black tabular transition ${
                                  award === m ? `${tierStyle(m, tiers).solid} ring-2` : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                }`}
                              >
                                {m}x
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Ban size={14} className="text-slate-600" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Payout Preview" icon={<Crown size={18} className="text-amber-400" />} className="xl:sticky xl:top-36 xl:self-start">
          {groups.length === 0 && (
            <p className="mb-4 rounded-lg border border-dashed border-slate-700 px-3 py-4 text-center text-sm text-slate-500">No multipliers awarded yet</p>
          )}
          {groups.map(({ multiplier: k, ids }) => (
            <div key={k} className="mb-4">
              <p className={`mb-1 text-sm font-bold ${tierStyle(k, tiers).text}`}>
                <MultiplierBadge m={k} tiers={tiers} /> {ids.length > 1 ? `${ids.length} players` : '1 player'}
              </p>
              {(
                ids.map((id) => {
                  const r = previewResults.find((x) => x.participantId === id);
                  const name = data.participants.find((p) => p.id === id)?.name ?? id;
                  if (!r) return null;
                  return (
                    <div key={id} className="mb-1 rounded-lg bg-slate-950 px-3 py-2 text-xs">
                      <div className="mb-1 flex justify-between text-sm font-semibold">
                        <span>{name}</span>
                        <span className="tabular text-emerald-300">+{fmt(r.netCredited)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 text-slate-400 tabular">
                        <span>Stake</span>
                        <span className="text-right">{fmt(r.stake)}</span>
                        <span>Gross reward</span>
                        <span className="text-right">{fmt(r.grossReward)}</span>
                        <span>Kori Loan repayment ({data.settings.loanSettings.repaymentRatePercent}%)</span>
                        <span className="text-right text-rose-300">−{fmt(r.loanRepaid)}</span>
                        <span>New koris</span>
                        <span className="text-right font-semibold text-white">{fmt(r.balanceAfter)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ))}
          {preview.warnings
            .filter((w) => w.eventNumber === event.eventNumber)
            .map((w, i) => (
              <p key={i} className="mb-2 text-xs text-amber-300">
                ⚠ {w.message}
              </p>
            ))}
          <div className="flex flex-col gap-2 border-t border-slate-800 pt-4">
            <Button variant="success" size="lg" disabled={groups.length === 0} onClick={() => setConfirming(true)}>
              <Trophy size={18} /> Publish Results & Update Leaderboard
            </Button>
            <Button size="sm" variant="ghost" disabled={awarded.length === 0} onClick={() => run((d) => clearAwards(d, event.eventNumber))}>
              Clear selections
            </Button>
          </div>
        </Card>
      </div>

      {correcting && <CorrectionModal event={event} open={correcting} onClose={() => setCorrecting(false)} />}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Publish results?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={() => {
                if (run((d) => publishResults(d, event.eventNumber), `Event ${event.eventNumber} results published`)) {
                  cueKoriClink();
                  cue('LEADERBOARD_REVEAL');
                  setConfirming(false);
                  roundWinnerConfetti();
                }
              }}
            >
              Publish
            </Button>
          </>
        }
      >
        <ul className="space-y-1 text-sm">
          {awarded.map(({ m, id }) => {
            const r = previewResults.find((x) => x.participantId === id);
            return (
              <li key={id} className="flex justify-between gap-3">
                <span className="flex items-center gap-2">
                  <MultiplierBadge m={m} tiers={tiers} /> {data.participants.find((p) => p.id === id)?.name}
                </span>
                <span className="tabular">
                  gross {fmt(r?.grossReward ?? 0)} · net +{fmt(r?.netCredited ?? 0)}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-400">Everyone without a multiplier loses their stake. You can still correct the result later through an audited correction.</p>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- Step D

function StepSummary({ event, onSelect }: { event: EventRound; onSelect: (n: number) => void }) {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const ledger = useLedger();
  const [correcting, setCorrecting] = useState(false);
  const [unfreezing, setUnfreezing] = useState(false);
  const [reason, setReason] = useState('');
  const results = ledger.roundResults[event.eventNumber] ?? [];
  const names = new Map(data.participants.map((p) => [p.id, p.name]));
  const totals = results.reduce(
    (acc, r) => ({ staked: acc.staked + r.stake, won: acc.won + r.grossReward, repaid: acc.repaid + r.loanRepaid, players: acc.players + (r.participated ? 1 : 0) }),
    { staked: 0, won: 0, repaid: 0, players: 0 },
  );
  const isCurrent = event.eventNumber === data.currentEventNumber;
  const isLast = event.eventNumber === data.settings.totalEvents;
  const corrections = data.auditLog.filter((a) => a.type === 'RESULT_CORRECTION' && a.eventNumber === event.eventNumber).length;
  const tiers = data.settings.payoutTiers;
  const groups = awardGroups(event);

  return (
    <>
      <Card
        title="Step D · Round Summary"
        icon={<CheckCircle2 size={18} className="text-emerald-400" />}
        actions={
          <>
            {corrections > 0 && <Badge tone="amber">{corrections} correction{corrections > 1 ? 's' : ''}</Badge>}
            <Button size="sm" variant="warning" disabled={data.scoresFrozen} title={data.scoresFrozen ? 'Unfreeze scores first' : undefined} onClick={() => setCorrecting(true)}>
              <Pencil size={14} /> Edit / Correct Round Result
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.length === 0 && <p className="text-slate-500">No multipliers were awarded this round.</p>}
          {groups.map(({ multiplier: k, ids }) => (
            <div key={k} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <p className={`text-sm font-bold ${tierStyle(k, tiers).text}`}>
                <MultiplierBadge m={k} tiers={tiers} /> payout
              </p>
              {ids.map((id) => {
                const r = results.find((x) => x.participantId === id);
                return (
                  <div key={id} className="mt-1">
                    <p className="text-lg font-bold">{names.get(id)}</p>
                    <p className="text-xs text-slate-400 tabular">
                      stake {fmt(r?.stake ?? 0)} → gross {fmt(r?.grossReward ?? 0)}
                      {r && r.loanRepaid > 0 ? ` (−${fmt(r.loanRepaid)} loan)` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Players" value={totals.players} />
          <Stat label="Total Koris Staked" value={<Kori n={totals.staked} size={18} />} />
          <Stat label="Total Koris Won (gross)" value={<Kori n={totals.won} size={18} />} tone="text-emerald-300" />
          <Stat label="Kori Loans Repaid" value={<Kori n={totals.repaid} size={18} />} tone="text-rose-300" />
        </div>

        <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-slate-300">Round ledger (per participant)</summary>
          <div className="overflow-x-auto p-2">
            <table className="w-full text-xs tabular">
              <thead className="text-left uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-1">Participant</th>
                  <th className="px-2 py-1 text-right">Koris before</th>
                  <th className="px-2 py-1 text-right">Stake</th>
                  <th className="px-2 py-1">Multiplier</th>
                  <th className="px-2 py-1 text-right">Gross</th>
                  <th className="px-2 py-1 text-right">Kori Loan repaid</th>
                  <th className="px-2 py-1 text-right">Net credited</th>
                  <th className="px-2 py-1 text-right">Koris after</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.participantId} className={`border-t border-slate-800 ${!r.participated ? 'text-slate-600' : ''}`}>
                    <td className="px-2 py-1">{names.get(r.participantId)}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.balanceBefore)}</td>
                    <td className="px-2 py-1 text-right">{r.participated ? fmt(r.stake) : '—'}</td>
                    <td className="px-2 py-1">{r.award ? <MultiplierBadge m={r.award} tiers={tiers} /> : ''}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.grossReward)}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.loanRepaid)}</td>
                    <td className="px-2 py-1 text-right">{fmt(r.netCredited)}</td>
                    <td className="px-2 py-1 text-right font-semibold">{fmt(r.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-800 pt-4">
          {data.scoresFrozen ? (
            <>
              <Badge tone="amber">
                <Crown size={12} /> Scores frozen — champions crowned
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => setUnfreezing(true)}>
                Unfreeze for corrections
              </Button>
            </>
          ) : isCurrent && !isLast ? (
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                if (run(advanceEvent)) onSelect(event.eventNumber + 1);
              }}
            >
              Advance to Next Event <ArrowRight size={18} />
            </Button>
          ) : isCurrent && isLast ? (
            <Button
              variant="warning"
              size="lg"
              onClick={() => {
                if (run(freezeScores, 'Scores frozen. Congratulations to the champions!')) {
                  podiumConfetti();
                  cue('CHAMPION_CROWNED');
                }
              }}
            >
              <Crown size={18} /> Freeze Scores & Crown Champions
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => onSelect(data.currentEventNumber)}>
              Go to active event (Event {data.currentEventNumber}) <ChevronRight size={16} />
            </Button>
          )}
        </div>
      </Card>

      {correcting && <CorrectionModal event={event} open={correcting} onClose={() => setCorrecting(false)} />}
      <Modal
        open={unfreezing}
        onClose={() => setUnfreezing(false)}
        title="Unfreeze final scores"
        footer={
          <Button
            variant="danger"
            disabled={!reason.trim()}
            onClick={() => {
              if (run((d) => unfreezeScores(d, reason), 'Scores unfrozen')) {
                setUnfreezing(false);
                setReason('');
              }
            }}
          >
            Unfreeze
          </Button>
        }
      >
        <Field label="Reason (recorded in audit log)">
          <textarea className={`${inputClass} min-h-20`} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}

function Stat({ label, value, tone = 'text-white' }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-2xl font-bold tabular ${tone}`}>{value}</p>
    </div>
  );
}

