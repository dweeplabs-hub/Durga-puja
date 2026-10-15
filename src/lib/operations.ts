import type {
  AudioConfig,
  AudioSlotConfig,
  AuditEntry,
  Branding,
  CompetitionData,
  EventRound,
  ParticipantBase,
  PlacementKey,
  Placements,
  ProjectorLanguage,
  Settings,
} from '../types';
import { computeLedger, maxStakeFor, placementOf, validateBid } from './engine';
import { DEMO_NAMES, defaultBranding, defaultSettings, emptyCompetition, makeEvent, nextParticipantId, normaliseAudioConfig, uid } from './defaults';

/** Thrown when an operation violates competition rules; message is shown to the organizer. */
export class OpError extends Error {}

type Data = CompetitionData;

const nowIso = () => new Date().toISOString();

function fail(message: string): never {
  throw new OpError(message);
}

/** Recomputes the ledger and stores per-round result snapshots inside each event (for export). */
export function finalize(d: Data): Data {
  const ledger = computeLedger(d);
  return {
    ...d,
    events: d.events.map((e) => {
      const rr = ledger.roundResults[e.eventNumber] ?? [];
      return e.roundResults === rr ? e : { ...e, roundResults: rr };
    }),
  };
}

function addAudit(d: Data, entry: Omit<AuditEntry, 'id' | 'timestamp'>): Data {
  return { ...d, auditLog: [...d.auditLog, { id: uid('A-'), timestamp: nowIso(), ...entry }] };
}

function getEvent(d: Data, n: number): EventRound {
  return d.events.find((e) => e.eventNumber === n) ?? fail(`Event ${n} does not exist`);
}

function patchEvent(d: Data, n: number, patch: Partial<EventRound> | ((e: EventRound) => Partial<EventRound>)): Data {
  return {
    ...d,
    events: d.events.map((e) => (e.eventNumber === n ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)),
  };
}

function nameOf(d: Data, id: string): string {
  return d.participants.find((p) => p.id === id)?.name ?? id;
}

export function competitionStarted(d: Data): boolean {
  return d.events.some((e) => e.status !== 'UPCOMING') || d.loans.length > 0 || d.adjustments.length > 0;
}

export function settingsLocked(d: Data): boolean {
  return d.rulesLocked || competitionStarted(d);
}

function assertNum(v: number, label: string, min = 0) {
  if (!Number.isFinite(v) || v < min) fail(`${label} must be a number ≥ ${min}`);
}

// ---------------------------------------------------------------- settings

export function updateSettings(d: Data, next: Settings): Data {
  if (settingsLocked(d)) fail('Rules are locked. Unlock them before Round 1 starts to make changes.');
  assertNum(next.totalEvents, 'Total events', 1);
  if (!Number.isInteger(next.totalEvents) || next.totalEvents > 50) fail('Total events must be a whole number between 1 and 50');
  assertNum(next.startingBalance, 'Starting balance');
  assertNum(next.minStakePerEvent, 'Minimum stake');
  assertNum(next.maxStakePerEvent, 'Maximum stake', 1);
  if (next.minStakePerEvent > next.maxStakePerEvent) fail('Minimum stake cannot exceed maximum stake');
  for (const [k, v] of Object.entries(next.multipliers)) assertNum(v, `Multiplier (${k})`);
  for (const [k, v] of Object.entries(next.placementPoints)) assertNum(v, `Points (${k})`);
  assertNum(next.loanSettings.fixedLoanTranche, 'Loan tranche', 1);
  assertNum(next.loanSettings.maxTotalLoanPerParticipant, 'Max loan', 0);
  assertNum(next.loanSettings.repaymentRatePercent, 'Repayment rate');
  if (next.loanSettings.repaymentRatePercent > 100) fail('Repayment rate cannot exceed 100%');
  assertNum(next.defaultBiddingSeconds, 'Bidding window', 0);

  let events = d.events;
  if (next.totalEvents !== d.events.length) {
    events =
      next.totalEvents < d.events.length
        ? d.events.slice(0, next.totalEvents)
        : [...d.events, ...Array.from({ length: next.totalEvents - d.events.length }, (_, i) => makeEvent(d.events.length + i + 1, next))];
  }
  const oldStart = d.settings.startingBalance;
  const participants =
    next.startingBalance !== oldStart
      ? d.participants.map((p) => (p.startingBalance === oldStart ? { ...p, startingBalance: next.startingBalance } : p))
      : d.participants;
  events = events.map((e) =>
    e.status === 'UPCOMING' && e.biddingDurationSec === d.settings.defaultBiddingSeconds ? { ...e, biddingDurationSec: next.defaultBiddingSeconds } : e,
  );
  return { ...d, settings: next, events, participants, currentEventNumber: Math.min(d.currentEventNumber, next.totalEvents) };
}

export function lockRules(d: Data): Data {
  return { ...d, rulesLocked: true };
}

export function unlockRules(d: Data): Data {
  if (competitionStarted(d)) fail('Rules cannot be unlocked once bidding has opened or loans have been issued.');
  return { ...d, rulesLocked: false };
}

export function setShowLoanColumnsPublic(d: Data, show: boolean): Data {
  return { ...d, showLoanColumnsPublic: show };
}

// ---------------------------------------------------------------- branding & audio (editable at any time)

export function updateBranding(d: Data, patch: Partial<Branding>): Data {
  const next = { ...d.branding, ...patch };
  if (!next.titleBn.trim() && !next.titleEn.trim()) fail('Enter a Bengali or English event title');
  return { ...d, branding: next };
}

export function setProjectorLanguage(d: Data, language: ProjectorLanguage): Data {
  return { ...d, projectorLanguage: language };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function updateAudio(d: Data, patch: Partial<Omit<AudioConfig, 'slots'>>): Data {
  const next = { ...d.audio, ...patch };
  next.masterVolume = clamp01(next.masterVolume);
  next.bgmVolume = clamp01(next.bgmVolume);
  next.sfxVolume = clamp01(next.sfxVolume);
  return { ...d, audio: next };
}

export function updateAudioSlot(d: Data, id: string, patch: Partial<Omit<AudioSlotConfig, 'id' | 'custom'>>): Data {
  if (!d.audio.slots.some((s) => s.id === id)) fail('Unknown audio slot');
  if (patch.hotkey !== undefined && patch.hotkey !== null) {
    if (!Number.isInteger(patch.hotkey) || patch.hotkey < 1 || patch.hotkey > 9) fail('Hotkeys run from Alt+1 to Alt+9');
    if (d.audio.slots.some((s) => s.id !== id && s.hotkey === patch.hotkey)) fail(`Alt+${patch.hotkey} is already assigned`);
  }
  if (patch.labelEn !== undefined && !patch.labelEn.trim() && !(patch.labelBn ?? '').trim()) fail('A slot needs a name');
  const volume = patch.volume === undefined ? undefined : clamp01(patch.volume);
  return {
    ...d,
    audio: { ...d.audio, slots: d.audio.slots.map((s) => (s.id === id ? { ...s, ...patch, ...(volume === undefined ? {} : { volume }) } : s)) },
  };
}

export function addCustomAudioSlot(d: Data, labelEn: string, labelBn = ''): Data {
  if (!labelEn.trim() && !labelBn.trim()) fail('Give the new pad a name');
  const used = new Set(d.audio.slots.map((s) => s.hotkey));
  const hotkey = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => !used.has(n)) ?? null;
  const slot: AudioSlotConfig = {
    id: uid('CUSTOM-'),
    labelBn: labelBn.trim(),
    labelEn: labelEn.trim(),
    hotkey,
    autoTrigger: false,
    mode: 'MP3',
    volume: 1,
    loop: false,
    custom: true,
    script: '',
  };
  return { ...d, audio: { ...d.audio, slots: [...d.audio.slots, slot] } };
}

export function removeCustomAudioSlot(d: Data, id: string): Data {
  const slot = d.audio.slots.find((s) => s.id === id) ?? fail('Unknown audio slot');
  if (!slot.custom) fail('Built-in announcement slots cannot be removed (delete the file to reset it)');
  return { ...d, audio: { ...d.audio, slots: d.audio.slots.filter((s) => s.id !== id) } };
}

// ---------------------------------------------------------------- participants

export function addParticipant(d: Data, name: string, startingBalance?: number): Data {
  const trimmed = name.trim();
  if (!trimmed) fail('Participant name is required');
  if (d.participants.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) fail(`"${trimmed}" is already registered`);
  if (d.scoresFrozen) fail('Scores are frozen');
  const bal = startingBalance ?? d.settings.startingBalance;
  assertNum(bal, 'Starting balance');
  const p: ParticipantBase = { id: nextParticipantId(d.participants), name: trimmed, startingBalance: bal, tieBreakOrder: 0 };
  // Late entrants sit out rounds that are already locked, and join an open bidding round with a 0 stake.
  const events = d.events.map((e) => {
    if (e.status === 'IN_PROGRESS' || e.status === 'COMPLETED') return { ...e, participation: { ...e.participation, [p.id]: false }, bids: { ...e.bids, [p.id]: 0 } };
    if (e.status === 'BIDDING_OPEN') return { ...e, participation: { ...e.participation, [p.id]: true }, bids: { ...e.bids, [p.id]: 0 } };
    return e;
  });
  return { ...d, participants: [...d.participants, p], events };
}

export function updateParticipant(d: Data, id: string, patch: Partial<Pick<ParticipantBase, 'name' | 'startingBalance'>>): Data {
  const existing = d.participants.find((p) => p.id === id) ?? fail('Unknown participant');
  if (patch.name !== undefined) {
    const t = patch.name.trim();
    if (!t) fail('Name cannot be empty');
    if (d.participants.some((p) => p.id !== id && p.name.toLowerCase() === t.toLowerCase())) fail(`"${t}" is already registered`);
    patch = { ...patch, name: t };
  }
  if (patch.startingBalance !== undefined) {
    assertNum(patch.startingBalance, 'Starting balance');
    if (patch.startingBalance !== existing.startingBalance && competitionStarted(d)) {
      fail('Starting balances cannot change after the competition has started. Use a manual adjustment instead.');
    }
  }
  return { ...d, participants: d.participants.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function removeParticipant(d: Data, id: string): Data {
  const hasHistory =
    d.loans.some((l) => l.participantId === id) ||
    d.adjustments.some((a) => a.participantId === id) ||
    d.events.some((e) => (e.status === 'IN_PROGRESS' || e.status === 'COMPLETED') && e.participation[id] !== false);
  if (hasHistory) fail('This participant already has ledger history (stakes or loans) and cannot be removed.');
  const strip = <T,>(rec: Record<string, T>) => {
    const { [id]: _omit, ...rest } = rec;
    void _omit;
    return rest;
  };
  return {
    ...d,
    participants: d.participants.filter((p) => p.id !== id),
    events: d.events.map((e) => ({
      ...e,
      bids: strip(e.bids),
      participation: strip(e.participation),
      placements: {
        first: e.placements.first.filter((x) => x !== id),
        second: e.placements.second.filter((x) => x !== id),
        third: e.placements.third.filter((x) => x !== id),
      },
    })),
  };
}

/** Imports a roster of names (and optional starting balances). Skips duplicates. */
export function importRoster(d: Data, rows: { name: string; startingBalance?: number }[]): { data: Data; added: number; skipped: number } {
  let data = d;
  let added = 0;
  let skipped = 0;
  for (const r of rows) {
    try {
      data = addParticipant(data, r.name, r.startingBalance);
      added++;
    } catch {
      skipped++;
    }
  }
  return { data, added, skipped };
}

// ---------------------------------------------------------------- event flow

export function updateEventMeta(d: Data, n: number, patch: Partial<Pick<EventRound, 'title' | 'description' | 'biddingDurationSec'>>): Data {
  getEvent(d, n);
  if (patch.title !== undefined && !patch.title.trim()) fail('Event title cannot be empty');
  if (patch.biddingDurationSec !== undefined) assertNum(patch.biddingDurationSec, 'Bidding window');
  return patchEvent(d, n, patch);
}

export function openBidding(d: Data, n: number): Data {
  const e = getEvent(d, n);
  if (d.scoresFrozen) fail('Scores are frozen');
  if (n !== d.currentEventNumber) fail(`Event ${d.currentEventNumber} is the active event`);
  if (e.status !== 'UPCOMING') fail('Bidding can only be opened for an upcoming event');
  if (d.participants.length === 0) fail('Register participants before opening bidding');
  const ledger = computeLedger(d);
  const bids: Record<string, number> = {};
  const participation: Record<string, boolean> = {};
  for (const p of ledger.participants) {
    const cap = maxStakeFor(p.currentBalance, d.settings);
    bids[p.id] = Math.min(d.settings.minStakePerEvent, cap);
    participation[p.id] = true;
  }
  return { ...patchEvent(d, n, { status: 'BIDDING_OPEN', bids, participation, biddingEndsAt: null, biddingPausedRemainingMs: null }), rulesLocked: true };
}

export function startTimer(d: Data, n: number, nowMs: number, seconds?: number): Data {
  const e = getEvent(d, n);
  if (e.status !== 'BIDDING_OPEN') fail('The countdown runs only while bidding is open');
  const sec = seconds ?? e.biddingDurationSec;
  if (sec <= 0) fail('Set a bidding window longer than 0 seconds');
  return patchEvent(d, n, { biddingEndsAt: nowMs + sec * 1000, biddingPausedRemainingMs: null, biddingDurationSec: sec });
}

export function pauseTimer(d: Data, n: number, nowMs: number): Data {
  const e = getEvent(d, n);
  if (!e.biddingEndsAt) return d;
  return patchEvent(d, n, { biddingEndsAt: null, biddingPausedRemainingMs: Math.max(0, e.biddingEndsAt - nowMs) });
}

export function resumeTimer(d: Data, n: number, nowMs: number): Data {
  const e = getEvent(d, n);
  if (e.biddingPausedRemainingMs === null) return d;
  return patchEvent(d, n, { biddingEndsAt: nowMs + e.biddingPausedRemainingMs, biddingPausedRemainingMs: null });
}

export function resetTimer(d: Data, n: number): Data {
  return patchEvent(d, n, { biddingEndsAt: null, biddingPausedRemainingMs: null });
}

export function setBid(d: Data, n: number, participantId: string, amount: number): Data {
  const e = getEvent(d, n);
  if (e.status !== 'BIDDING_OPEN') fail('Stakes are locked. Use an audited correction to change them.');
  if (!Number.isFinite(amount) || amount < 0) fail('Stake must be a non-negative number');
  return patchEvent(d, n, { bids: { ...e.bids, [participantId]: amount } });
}

export function setParticipation(d: Data, n: number, participantId: string, participating: boolean): Data {
  const e = getEvent(d, n);
  if (e.status !== 'BIDDING_OPEN') fail('Participation can only change while bidding is open');
  return patchEvent(d, n, { participation: { ...e.participation, [participantId]: participating } });
}

export type BidPreset = 'min' | 'max' | number;

export function resolvePreset(preset: BidPreset, balance: number, settings: Settings): number {
  const cap = maxStakeFor(balance, settings);
  if (preset === 'min') return Math.min(settings.minStakePerEvent, cap);
  if (preset === 'max') return cap;
  return Math.min(preset, cap);
}

export function applyBidPresetToAll(d: Data, n: number, preset: BidPreset): Data {
  const e = getEvent(d, n);
  if (e.status !== 'BIDDING_OPEN') fail('Bidding is not open');
  const ledger = computeLedger(d);
  const bids = { ...e.bids };
  for (const p of ledger.participants) {
    if (e.participation[p.id] === false) continue;
    bids[p.id] = resolvePreset(preset, p.currentBalance, d.settings);
  }
  return patchEvent(d, n, { bids });
}

/** Returns validation errors for every participating bid in a BIDDING_OPEN event. */
export function bidErrors(d: Data, n: number): Record<string, string> {
  const e = getEvent(d, n);
  const ledger = computeLedger(d);
  const errors: Record<string, string> = {};
  for (const p of ledger.participants) {
    if (e.participation[p.id] === false) continue;
    const err = validateBid(e.bids[p.id] ?? 0, p.currentBalance, d.settings);
    if (err) errors[p.id] = err;
  }
  return errors;
}

export function lockBidding(d: Data, n: number): Data {
  const e = getEvent(d, n);
  if (e.status !== 'BIDDING_OPEN') fail('Bidding is not open for this event');
  const errors = bidErrors(d, n);
  const ids = Object.keys(errors);
  if (ids.length) fail(`Fix ${ids.length} invalid stake(s): ${ids.map((id) => `${nameOf(d, id)} (${errors[id]})`).join(', ')}`);
  const bids: Record<string, number> = {};
  for (const p of d.participants) bids[p.id] = e.participation[p.id] === false ? 0 : (e.bids[p.id] ?? 0);
  return patchEvent(d, n, { status: 'IN_PROGRESS', bids, lockedAt: nowIso(), biddingEndsAt: null, biddingPausedRemainingMs: null });
}

function withPlacement(placements: Placements, participantId: string, place: PlacementKey | null): Placements {
  const next: Placements = {
    first: placements.first.filter((x) => x !== participantId),
    second: placements.second.filter((x) => x !== participantId),
    third: placements.third.filter((x) => x !== participantId),
  };
  if (place) next[place] = [...next[place], participantId];
  return next;
}

export function setPlacement(d: Data, n: number, participantId: string, place: PlacementKey | null): Data {
  const e = getEvent(d, n);
  if (e.status !== 'IN_PROGRESS') fail('Winners can be selected only while the event is in progress');
  if (e.participation[participantId] === false) fail(`${nameOf(d, participantId)} is not participating in this event`);
  return patchEvent(d, n, { placements: withPlacement(e.placements, participantId, place) });
}

export function clearPlacements(d: Data, n: number): Data {
  const e = getEvent(d, n);
  if (e.status !== 'IN_PROGRESS') fail('Event is not in progress');
  return patchEvent(d, n, { placements: { first: [], second: [], third: [] } });
}

function describePlacements(d: Data, p: Placements): string {
  const fmt = (ids: string[]) => (ids.length ? ids.map((id) => nameOf(d, id)).join(' & ') : '—');
  return `1st: ${fmt(p.first)}; 2nd: ${fmt(p.second)}; 3rd: ${fmt(p.third)}`;
}

export function publishResults(d: Data, n: number): Data {
  const e = getEvent(d, n);
  if (e.status !== 'IN_PROGRESS') fail('Event is not in progress');
  if (e.placements.first.length === 0) fail('Select at least one 1st place winner before publishing');
  let next = patchEvent(d, n, { status: 'COMPLETED', completedAt: nowIso() });
  const ledger = computeLedger(next);
  const rr = ledger.roundResults[n] ?? [];
  const staked = rr.reduce((s, r) => s + r.stake, 0);
  const won = rr.reduce((s, r) => s + r.grossReward, 0);
  const repaid = rr.reduce((s, r) => s + r.loanRepaid, 0);
  next = addAudit(next, {
    type: 'ROUND_COMPLETED',
    eventNumber: n,
    reason: 'Results published',
    details: `${describePlacements(d, e.placements)}. Staked ${staked}, gross rewards ${won}, loans repaid ${repaid}.`,
  });
  return next;
}

export function advanceEvent(d: Data): Data {
  const e = getEvent(d, d.currentEventNumber);
  if (e.status !== 'COMPLETED') fail('Complete the current event first');
  if (d.currentEventNumber >= d.settings.totalEvents) fail('This was the final event. Freeze scores to crown the champions.');
  return { ...d, currentEventNumber: d.currentEventNumber + 1 };
}

export function freezeScores(d: Data): Data {
  const last = getEvent(d, d.settings.totalEvents);
  if (last.status !== 'COMPLETED') fail(`Event ${d.settings.totalEvents} must be completed before freezing scores`);
  if (d.scoresFrozen) return d;
  return addAudit(
    { ...d, scoresFrozen: true },
    { type: 'ROUND_COMPLETED', eventNumber: d.settings.totalEvents, reason: 'Scores frozen & champions crowned', details: 'Final standings locked.' },
  );
}

export function unfreezeScores(d: Data, reason: string): Data {
  if (!reason.trim()) fail('A reason is required to unfreeze scores');
  return addAudit({ ...d, scoresFrozen: false }, { type: 'MANUAL_ADJUSTMENT', reason: reason.trim(), details: 'Scores unfrozen for further corrections.' });
}

export interface RoundCorrection {
  bids: Record<string, number>;
  participation: Record<string, boolean>;
  placements: Placements;
}

export function correctRound(d: Data, n: number, correction: RoundCorrection, reason: string): Data {
  const e = getEvent(d, n);
  if (e.status !== 'IN_PROGRESS' && e.status !== 'COMPLETED') fail('Only locked or completed rounds can be corrected');
  if (!reason.trim()) fail('A correction reason is required for the audit log');
  const seen = new Set<string>();
  for (const ids of [correction.placements.first, correction.placements.second, correction.placements.third]) {
    for (const id of ids) {
      if (seen.has(id)) fail(`${nameOf(d, id)} is assigned to more than one placement`);
      seen.add(id);
      if (correction.participation[id] === false) fail(`${nameOf(d, id)} is placed but marked as not participating`);
    }
  }
  if (e.status === 'COMPLETED' && correction.placements.first.length === 0) fail('A completed round needs at least one 1st place winner');
  for (const [id, b] of Object.entries(correction.bids)) {
    if (!Number.isFinite(b) || b < 0) fail(`Invalid stake for ${nameOf(d, id)}`);
    if (b > d.settings.maxStakePerEvent && correction.participation[id] !== false) fail(`${nameOf(d, id)}'s stake exceeds the max stake of ${d.settings.maxStakePerEvent}`);
  }

  const before = computeLedger(d);
  const bids: Record<string, number> = {};
  for (const p of d.participants) bids[p.id] = correction.participation[p.id] === false ? 0 : (correction.bids[p.id] ?? 0);
  const next = patchEvent(d, n, { bids, participation: { ...correction.participation }, placements: correction.placements });
  const after = computeLedger(next);

  const changes: string[] = [];
  for (const p of d.participants) {
    const ob = e.participation[p.id] === false ? 0 : (e.bids[p.id] ?? 0);
    const nb = bids[p.id];
    if (ob !== nb) changes.push(`${p.name} stake ${ob}→${nb}`);
    if ((e.participation[p.id] !== false) !== (correction.participation[p.id] !== false)) {
      changes.push(`${p.name} ${correction.participation[p.id] === false ? 'withdrawn' : 'reinstated'}`);
    }
    const op = placementOf(e, p.id);
    const np = placementOf({ ...e, placements: correction.placements }, p.id);
    if (op !== np) changes.push(`${p.name} placement ${op ?? 'none'}→${np ?? 'none'}`);
  }
  if (changes.length === 0) fail('No changes were made');
  const balanceDiffs = after.participants
    .map((p) => {
      const b = before.participants.find((x) => x.id === p.id)!;
      return b.currentBalance !== p.currentBalance ? `${p.name} ${b.currentBalance}→${p.currentBalance}` : null;
    })
    .filter(Boolean);
  const newWarnings = after.warnings.filter((w) => !before.warnings.some((x) => x.message === w.message && x.participantId === w.participantId));
  return addAudit(next, {
    type: 'RESULT_CORRECTION',
    eventNumber: n,
    reason: reason.trim(),
    details: `${changes.join('; ')}. Balances recalculated: ${balanceDiffs.length ? balanceDiffs.join(', ') : 'no change'}.${
      newWarnings.length ? ` Warnings: ${newWarnings.map((w) => w.message).join(' ')}` : ''
    }`,
  });
}

// ---------------------------------------------------------------- loans & adjustments

/** The event before whose stake lock a new loan/adjustment takes effect, or null if none remain. */
export function nextLedgerSlot(d: Data): number | null {
  const e = getEvent(d, d.currentEventNumber);
  if (e.status === 'UPCOMING' || e.status === 'BIDDING_OPEN') return e.eventNumber;
  return e.eventNumber + 1 <= d.settings.totalEvents ? e.eventNumber + 1 : null;
}

export function loanHeadroom(d: Data, participantId: string): number {
  const ledger = computeLedger(d);
  const p = ledger.participants.find((x) => x.id === participantId);
  if (!p) return 0;
  return Math.max(0, d.settings.loanSettings.maxTotalLoanPerParticipant - p.outstandingLoan);
}

export function issueLoan(d: Data, participantId: string, amount: number): Data {
  if (d.scoresFrozen) fail('Scores are frozen');
  const p = d.participants.find((x) => x.id === participantId) ?? fail('Unknown participant');
  if (!Number.isFinite(amount) || amount <= 0) fail('Loan amount must be positive');
  const slot = nextLedgerSlot(d);
  if (slot === null) fail('No events remain; loans can only be issued before a bidding lock');
  const headroom = loanHeadroom(d, participantId);
  if (amount > headroom) fail(`${p.name} can borrow at most ${headroom} more tokens (limit ${d.settings.loanSettings.maxTotalLoanPerParticipant} outstanding)`);
  const next: Data = {
    ...d,
    loans: [...d.loans, { id: uid('L-'), participantId, amount, appliesBeforeEvent: slot, timestamp: nowIso() }],
  };
  const ledger = computeLedger(next);
  const after = ledger.participants.find((x) => x.id === participantId)!;
  return addAudit(next, {
    type: 'LOAN_ISSUED',
    eventNumber: slot,
    participantId,
    reason: 'Loan tranche granted',
    details: `${p.name} borrowed ${amount} tokens before Event ${slot}. Outstanding loan now ${after.outstandingLoan}; balance ${after.currentBalance}.`,
  });
}

export function addAdjustment(d: Data, participantId: string, amount: number, reason: string): Data {
  const p = d.participants.find((x) => x.id === participantId) ?? fail('Unknown participant');
  if (!Number.isFinite(amount) || amount === 0) fail('Adjustment amount must be a non-zero number');
  if (!reason.trim()) fail('A reason is required for manual adjustments');
  if (d.scoresFrozen) fail('Unfreeze scores before making adjustments');
  const slot = nextLedgerSlot(d) ?? d.settings.totalEvents + 1;
  const before = computeLedger(d).participants.find((x) => x.id === participantId)!;
  if (before.currentBalance + amount < 0) fail(`${p.name} only has ${before.currentBalance} tokens`);
  const next: Data = {
    ...d,
    adjustments: [...d.adjustments, { id: uid('M-'), participantId, amount, appliesBeforeEvent: slot, reason: reason.trim(), timestamp: nowIso() }],
  };
  return addAudit(next, {
    type: 'MANUAL_ADJUSTMENT',
    participantId,
    eventNumber: slot <= d.settings.totalEvents ? slot : undefined,
    reason: reason.trim(),
    details: `${p.name} balance ${amount > 0 ? '+' : ''}${amount} tokens (${before.currentBalance}→${before.currentBalance + amount}).`,
  });
}

/** Sets the manual tie-break order for a tied group. orderedIds[0] wins the tie-break. */
export function setTieBreakOrder(d: Data, orderedIds: string[], reason: string): Data {
  if (orderedIds.length < 2) fail('Select at least two tied participants');
  if (!reason.trim()) fail('A reason is required for the audit log');
  const pos = new Map(orderedIds.map((id, i) => [id, i + 1]));
  const next = { ...d, participants: d.participants.map((p) => (pos.has(p.id) ? { ...p, tieBreakOrder: pos.get(p.id)! } : p)) };
  return addAudit(next, {
    type: 'MANUAL_ADJUSTMENT',
    reason: reason.trim(),
    details: `Final tie-break challenge order: ${orderedIds.map((id, i) => `${i + 1}. ${nameOf(d, id)}`).join(', ')}.`,
  });
}

export function clearTieBreakOrder(d: Data, ids: string[], reason: string): Data {
  if (!reason.trim()) fail('A reason is required for the audit log');
  const set = new Set(ids);
  return addAudit(
    { ...d, participants: d.participants.map((p) => (set.has(p.id) ? { ...p, tieBreakOrder: 0 } : p)) },
    { type: 'MANUAL_ADJUSTMENT', reason: reason.trim(), details: `Tie-break order cleared for ${ids.map((id) => nameOf(d, id)).join(', ')}.` },
  );
}

// ---------------------------------------------------------------- demo & import

/** Small deterministic PRNG so demo data is reproducible. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemo(simulatedRounds = 0, seed = 2026): Data {
  let d = emptyCompetition(defaultSettings());
  d = { ...d, settings: { ...d.settings, minStakePerEvent: 5 } };
  for (const name of DEMO_NAMES) d = addParticipant(d, name);
  const rand = mulberry32(seed);
  for (let r = 0; r < simulatedRounds && r < d.settings.totalEvents; r++) {
    const n = d.currentEventNumber;
    // Organizer tops up anyone running low before bidding.
    let ledger = computeLedger(d);
    for (const p of ledger.participants) {
      if (p.currentBalance < 15 && loanHeadroom(d, p.id) >= d.settings.loanSettings.fixedLoanTranche) {
        d = issueLoan(d, p.id, d.settings.loanSettings.fixedLoanTranche);
      }
    }
    d = openBidding(d, n);
    ledger = computeLedger(d);
    for (const p of ledger.participants) {
      const cap = maxStakeFor(p.currentBalance, d.settings);
      const steps = Math.floor(cap / 5);
      const bid = Math.max(Math.min(d.settings.minStakePerEvent, cap), 5 * Math.max(1, Math.floor(rand() * steps) + (rand() > 0.6 ? 1 : 0)));
      d = setBid(d, n, p.id, Math.min(cap, bid));
    }
    d = lockBidding(d, n);
    const pool = [...d.participants.map((p) => p.id)];
    const pick = () => pool.splice(Math.floor(rand() * pool.length), 1)[0];
    d = setPlacement(d, n, pick(), 'first');
    d = setPlacement(d, n, pick(), 'second');
    d = setPlacement(d, n, pick(), 'third');
    d = publishResults(d, n);
    if (r < simulatedRounds - 1 && d.currentEventNumber < d.settings.totalEvents) d = advanceEvent(d);
  }
  if (simulatedRounds > 0 && d.currentEventNumber < d.settings.totalEvents) d = advanceEvent(d);
  return finalize(d);
}

/** Validates and normalises an imported JSON backup. */
export function parseBackup(raw: unknown): Data {
  if (!raw || typeof raw !== 'object') fail('Backup file is not a JSON object');
  const obj = raw as Partial<Data> & { data?: unknown };
  const src = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Partial<Data>;
  if (!Array.isArray(src.participants) || !Array.isArray(src.events) || !src.settings) fail('Backup is missing participants, events or settings');
  const base = defaultSettings();
  const { eventName: legacyName, ...savedSettings } = src.settings as Settings & { eventName?: string };
  const settings: Settings = {
    ...base,
    ...savedSettings,
    multipliers: { ...base.multipliers, ...src.settings.multipliers },
    placementPoints: { ...base.placementPoints, ...src.settings.placementPoints },
    loanSettings: { ...base.loanSettings, ...src.settings.loanSettings },
  };
  const events: EventRound[] = src.events.map((e, i) => ({
    ...makeEvent(i + 1, settings),
    ...e,
    placements: { first: e.placements?.first ?? [], second: e.placements?.second ?? [], third: e.placements?.third ?? [] },
    bids: e.bids ?? {},
    participation: e.participation ?? {},
  }));
  if (events.length !== settings.totalEvents) fail('Backup event count does not match its settings');
  const branding = { ...defaultBranding(), ...src.branding };
  if (!src.branding && legacyName && legacyName !== "Women's Auction Challenge" && legacyName !== 'Mojar Mohajuddho') branding.titleEn = legacyName;
  const data: Data = {
    version: 1,
    branding,
    projectorLanguage: src.projectorLanguage === 'ENGLISH' ? 'ENGLISH' : 'BILINGUAL',
    audio: normaliseAudioConfig(src.audio),
    settings,
    rulesLocked: Boolean(src.rulesLocked),
    participants: src.participants.map((p) => ({ ...p, tieBreakOrder: Number(p.tieBreakOrder) || 0, startingBalance: Number(p.startingBalance ?? settings.startingBalance) })),
    events,
    loans: Array.isArray(src.loans) ? src.loans : [],
    adjustments: Array.isArray(src.adjustments) ? src.adjustments : [],
    auditLog: Array.isArray(src.auditLog) ? src.auditLog : [],
    currentEventNumber: Math.min(Math.max(1, Number(src.currentEventNumber) || 1), settings.totalEvents),
    scoresFrozen: Boolean(src.scoresFrozen),
    showLoanColumnsPublic: src.showLoanColumnsPublic !== false,
  };
  return finalize(data);
}
