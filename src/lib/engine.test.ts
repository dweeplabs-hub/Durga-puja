import { describe, expect, it } from 'vitest';
import { computeLedger, computeLoanRepayment, unresolvedTieGroups, validateBid } from './engine';
import { defaultSettings, emptyCompetition } from './defaults';
import {
  addParticipant,
  advanceEvent,
  buildDemo,
  correctRound,
  issueLoan,
  lockBidding,
  openBidding,
  parseBackup,
  publishResults,
  setBid,
  setAward,
  setTieBreakOrder,
  OpError,
} from './operations';
import type { CompetitionData } from '../types';

function setup(names = ['Alice', 'Bina', 'Chitra', 'Dia']): CompetitionData {
  let d = emptyCompetition(defaultSettings());
  for (const n of names) d = addParticipant(d, n);
  return d;
}

const byName = (d: CompetitionData, name: string) => computeLedger(d).participants.find((p) => p.name === name)!;

describe('loan repayment', () => {
  it('a 100-token reward deducts 2 tokens toward the loan and credits 98 tokens', () => {
    const s = defaultSettings();
    const repaid = computeLoanRepayment(100, 20, s.loanSettings);
    expect(repaid).toBe(2);
    expect(100 - repaid).toBe(98);
  });

  it('caps repayment at outstanding loan and supports minimum-one and decimal modes', () => {
    const s = defaultSettings().loanSettings;
    expect(computeLoanRepayment(200, 1, s)).toBe(1);
    expect(computeLoanRepayment(30, 20, s)).toBe(0);
    expect(computeLoanRepayment(30, 20, { ...s, minimumOneKoriDeduction: true })).toBe(1);
    expect(computeLoanRepayment(30, 20, { ...s, repaymentPrecision: 'DECIMAL2' })).toBe(0.6);
    expect(computeLoanRepayment(100, 0, s)).toBe(0);
  });

  it('end-to-end: 25-token stake won at 1st place (100 gross) with a loan credits 98', () => {
    let d = setup();
    const alice = d.participants[0].id;
    d = issueLoan(d, alice, 20); // balance 120, loan 20
    d = openBidding(d, 1);
    d = setBid(d, 1, alice, 25);
    d = lockBidding(d, 1);
    expect(byName(d, 'Alice').currentBalance).toBe(95);
    d = setAward(d, 1, alice, 4);
    d = publishResults(d, 1);
    const a = byName(d, 'Alice');
    const rr = computeLedger(d).roundResults[1].find((r) => r.participantId === alice)!;
    expect(rr.grossReward).toBe(100);
    expect(rr.loanRepaid).toBe(2);
    expect(rr.netCredited).toBe(98);
    expect(a.currentBalance).toBe(95 + 98);
    expect(a.outstandingLoan).toBe(18);
    expect(a.totalLoanRepaid).toBe(2);
    expect(a.totalRewardsEarned).toBe(100);
    expect(a.performanceScore).toBe(4); // points = multiplier awarded
    expect(a.eventsParticipated).toBe(1);
  });
});

describe('round payouts & ledger recalculation', () => {
  function playRound1(): CompetitionData {
    let d = setup();
    const [a, b, c, dd] = d.participants.map((p) => p.id);
    d = openBidding(d, 1);
    d = setBid(d, 1, a, 10);
    d = setBid(d, 1, b, 20);
    d = setBid(d, 1, c, 30);
    d = setBid(d, 1, dd, 50);
    d = lockBidding(d, 1);
    d = setAward(d, 1, a, 4);
    d = setAward(d, 1, b, 3);
    d = setAward(d, 1, c, 2);
    return publishResults(d, 1);
  }

  it('applies 4x / 3x / 2x / 0x multipliers on own stake', () => {
    const d = playRound1();
    expect(byName(d, 'Alice').currentBalance).toBe(100 - 10 + 40);
    expect(byName(d, 'Bina').currentBalance).toBe(100 - 20 + 60);
    expect(byName(d, 'Chitra').currentBalance).toBe(100 - 30 + 60);
    expect(byName(d, 'Dia').currentBalance).toBe(50);
    expect(byName(d, 'Dia').totalKorisStaked).toBe(50);
    expect(byName(d, 'Dia').eventsParticipated).toBe(1);
  });

  it('re-evaluates downstream rounds after a correction', () => {
    let d = playRound1();
    const [a, b, c, dd] = d.participants.map((p) => p.id);
    d = advanceEvent(d);
    d = openBidding(d, 2);
    d = setBid(d, 2, dd, 50); // Dia all-in on her remaining 50
    d = lockBidding(d, 2);
    d = setAward(d, 2, dd, 4);
    d = publishResults(d, 2);
    expect(byName(d, 'Dia').currentBalance).toBe(200);

    const e1 = d.events[0];
    d = correctRound(
      d,
      1,
      { bids: e1.bids, participation: e1.participation, awards: { [dd]: 4, [b]: 3, [c]: 2 } },
      'Judges reviewed footage',
    );
    // Round 1: Dia wins 200 -> 250; round 2: stakes 50 -> 200 + 200 = 400
    expect(byName(d, 'Dia').currentBalance).toBe(400);
    expect(byName(d, 'Alice').currentBalance).toBe(90);
    expect(d.auditLog.at(-1)?.type).toBe('RESULT_CORRECTION');
    expect(() => correctRound(d, 1, { bids: e1.bids, participation: e1.participation, awards: { [a]: 4 } }, '')).toThrow(OpError);
  });

  it('supports dead heats (multiple winners in one place)', () => {
    let d = setup();
    const [a, b] = d.participants.map((p) => p.id);
    d = openBidding(d, 1);
    d = setBid(d, 1, a, 10);
    d = setBid(d, 1, b, 10);
    d = lockBidding(d, 1);
    d = setAward(d, 1, a, 4);
    d = setAward(d, 1, b, 4);
    d = publishResults(d, 1);
    expect(byName(d, 'Alice').currentBalance).toBe(130);
    expect(byName(d, 'Bina').currentBalance).toBe(130);
  });
});

describe('bidding rules', () => {
  it('enforces max stake cap and available balance, allows zero-balance entry', () => {
    const s = { ...defaultSettings(), minStakePerEvent: 5 };
    expect(validateBid(60, 100, s)).toMatch(/Max Kori Stake/);
    expect(validateBid(30, 20, s)).toMatch(/koris available/);
    expect(validateBid(0, 100, s)).toMatch(/Min Kori Stake/);
    expect(validateBid(0, 0, s)).toBeNull();
    expect(validateBid(3, 3, s)).toBeNull();
    expect(validateBid(25, 100, s)).toBeNull();
  });

  it('rejects loans beyond the per-participant limit', () => {
    let d = setup(['Alice']);
    const a = d.participants[0].id;
    d = issueLoan(d, a, 50);
    d = issueLoan(d, a, 50);
    expect(() => issueLoan(d, a, 20)).toThrow(/at most 0/);
  });
});

describe('ranking & tie-breakers', () => {
  it('orders by balance, then lower loan, then performance, then manual order', () => {
    let d = setup();
    const [a, b, c, dd] = d.participants.map((p) => p.id);
    d = issueLoan(d, a, 20); // A: 120 bal, 20 loan
    d = openBidding(d, 1);
    d = setBid(d, 1, a, 20); // A -> 100 after lock, loses
    d = setBid(d, 1, b, 0);
    d = setBid(d, 1, c, 0);
    d = setBid(d, 1, dd, 0);
    d = lockBidding(d, 1);
    d = setAward(d, 1, c, 4); // C gets points but 0 reward
    d = publishResults(d, 1);
    let ranked = computeLedger(d).ranked;
    // All at 100 balance; A has loan -> last. C has 3 points -> first. B & D fully tied.
    expect(ranked[0].id).toBe(c);
    expect(ranked[0].tieBreakTier).toBe('PERFORMANCE');
    expect(ranked.at(-1)!.id).toBe(a);
    expect(ranked.at(-1)!.tieBreakTier).toBe('LOAN');
    expect(unresolvedTieGroups(ranked).map((g) => g.map((p) => p.id).sort())).toEqual([[b, dd].sort()]);
    expect(ranked[1].currentRank).toBe(ranked[2].currentRank);

    d = setTieBreakOrder(d, [dd, b], 'Tie-break challenge: Dia won');
    ranked = computeLedger(d).ranked;
    expect(ranked[1].id).toBe(dd);
    expect(ranked[1].tieBreakTier).toBe('MANUAL');
    expect(ranked.map((p) => p.currentRank)).toEqual([1, 2, 3, 4]);
  });
});

describe('demo & backup', () => {
  it('builds a simulated competition and round-trips through JSON', () => {
    const d = buildDemo(3);
    expect(d.participants).toHaveLength(12);
    expect(d.events.filter((e) => e.status === 'COMPLETED')).toHaveLength(3);
    expect(d.currentEventNumber).toBe(4);
    const restored = parseBackup(JSON.parse(JSON.stringify(d)));
    expect(computeLedger(restored).ranked.map((p) => p.id)).toEqual(computeLedger(d).ranked.map((p) => p.id));
  });
});

describe('branding & audio config', () => {
  it('migrates an older backup: name moves into branding, audio defaults are filled', async () => {
    const { parseBackup: parse, addCustomAudioSlot, updateAudioSlot, removeCustomAudioSlot } = await import('./operations');
    const legacy = JSON.parse(JSON.stringify(setup())) as Record<string, unknown>;
    delete legacy.branding;
    delete legacy.audio;
    delete legacy.projectorLanguage;
    (legacy.settings as Record<string, unknown>).eventName = 'Mojar Mohajuddho';
    const d = parse(legacy);
    expect(d.branding.titleBn).toBe('মজার মহাযুদ্ধ');
    expect(d.branding.titleEn).toBe('Mojar Mohajuddho');
    expect('eventName' in d.settings).toBe(false);
    expect(d.projectorLanguage).toBe('BILINGUAL');
    expect(d.audio.slots.map((s) => s.id)).toEqual([
      'MAIN_INTRO',
      'BIDDING_OPEN',
      'THIRTY_SEC_LEFT',
      'BIDDING_CLOSED',
      'LEADERBOARD_REVEAL',
      'LOAN_ISSUED',
      'CHAMPION_CROWNED',
    ]);
    expect(d.audio.slots.map((s) => s.hotkey)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    // Custom pads take the next free hotkey, hotkeys stay unique, built-ins can't be removed.
    let e = addCustomAudioSlot(d, 'Sponsor', 'স্পনসর');
    const custom = e.audio.slots.at(-1)!;
    expect(custom.hotkey).toBe(8);
    expect(() => updateAudioSlot(e, custom.id, { hotkey: 1 })).toThrow(/already assigned/);
    expect(() => removeCustomAudioSlot(e, 'MAIN_INTRO')).toThrow(OpError);
    e = removeCustomAudioSlot(e, custom.id);
    expect(e.audio.slots).toHaveLength(7);
    // Custom pads round-trip through a backup.
    const withPad = addCustomAudioSlot(d, 'Sponsor');
    expect(parse(JSON.parse(JSON.stringify(withPad))).audio.slots).toHaveLength(8);
  });
});

describe('Kori theme migration', () => {
  it('a token-era backup loads with identical rankings, balances and loan math', async () => {
    const { parseBackup: parse, buildDemo: demo } = await import('./operations');
    const { computeLedger: ledgerOf } = await import('./engine');
    // A played competition with loans, using the min-1 deduction rule so the renamed flag matters.
    const modern = demo(6);
    modern.settings.loanSettings.minimumOneKoriDeduction = true;

    // Re-shape it the way a pre-Kori save looked.
    const legacy = JSON.parse(JSON.stringify(modern));
    const ls = legacy.settings.loanSettings;
    ls.minimumOneTokenDeduction = ls.minimumOneKoriDeduction;
    delete ls.minimumOneKoriDeduction;
    legacy.audio.sfxLabels = { COIN: 'Coin', TICK: 'Countdown Tick', AIRHORN: 'Airhorn', DRUMROLL: 'Drumroll', FANFARE: 'Victory Fanfare' };
    legacy.audio.slots.find((s: { id: string }) => s.id === 'LOAN_ISSUED').labelEn = 'Token Loan Granted';
    delete legacy.audio.bgmSource;
    delete legacy.audio.koriClinkFx;

    const migrated = parse(legacy);
    expect(migrated.settings.loanSettings.minimumOneKoriDeduction).toBe(true);
    expect('minimumOneTokenDeduction' in migrated.settings.loanSettings).toBe(false);
    expect(migrated.audio.sfxLabels.KORI).toBe('Kori Clink');
    expect('COIN' in migrated.audio.sfxLabels).toBe(false);
    expect(migrated.audio.slots.find((s) => s.id === 'LOAN_ISSUED')!.labelEn).toBe('Kori Loan Granted');
    expect(migrated.audio.bgmSource).toBe('FILE');
    expect(migrated.audio.koriClinkFx).toBe(true);

    const pick = (d: CompetitionData) =>
      computeLedger(d).ranked.map((p) => [p.id, p.currentRank, p.currentBalance, p.totalKorisStaked, p.outstandingLoan, p.totalLoanRepaid, p.totalRewardsEarned]);
    expect(pick(migrated)).toEqual(pick(modern));
    expect(ledgerOf(migrated).ranked.some((p) => p.totalLoanRepaid > 0 || p.outstandingLoan > 0)).toBe(true);
  });
});

describe('6x … 1x multiplier awards', () => {
  it('pays own stake × the awarded multiplier, scores points = multiplier, others lose their stake', () => {
    let d = setup(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(d.settings.payoutTiers).toEqual([6, 5, 4, 3, 2, 1]);
    const ids = d.participants.map((p) => p.id);
    d = openBidding(d, 1);
    for (const id of ids) d = setBid(d, 1, id, 10);
    d = lockBidding(d, 1);
    [6, 5, 4, 3, 2, 1].forEach((m, i) => (d = setAward(d, 1, ids[i], m)));
    d = publishResults(d, 1);
    const l = computeLedger(d);
    const bal = (id: string) => l.participants.find((p) => p.id === id)!;
    expect(ids.map((id) => bal(id).currentBalance)).toEqual([150, 140, 130, 120, 110, 100, 90]);
    expect(ids.map((id) => bal(id).performanceScore)).toEqual([6, 5, 4, 3, 2, 1, 0]);
    expect(l.roundResults[1].map((r) => r.award)).toEqual([6, 5, 4, 3, 2, 1, null]);
    // Several players can share a tier; clicking the same tier again clears it.
    expect(() => publishResults(setAward(lockBidding(openBidding(advanceEvent(d), 2), 2), 2, ids[0], null), 2)).toThrow(/Award at least one/);
  });

  it('migrates old 1st/2nd/3rd placements to awards that keep past payouts identical', async () => {
    const { parseBackup: parse } = await import('./operations');
    let d = setup();
    const [a, b, c] = d.participants.map((p) => p.id);
    d = openBidding(d, 1);
    for (const id of [a, b, c]) d = setBid(d, 1, id, 10);
    d = lockBidding(d, 1);
    d = setAward(d, 1, a, 4);
    d = setAward(d, 1, b, 3);
    d = setAward(d, 1, c, 2);
    d = publishResults(d, 1);
    const expected = computeLedger(d).participants.map((p) => [p.id, p.currentBalance, p.totalRewardsEarned]);

    // Shape it like a pre-v5 save: fixed placements + multipliers/placementPoints in settings.
    const legacy = JSON.parse(JSON.stringify(d));
    delete legacy.settings.payoutTiers;
    delete legacy.settings.othersMultiplier;
    legacy.settings.multipliers = { first: 4, second: 3, third: 2, others: 0 };
    legacy.settings.placementPoints = { first: 3, second: 2, third: 1 };
    for (const e of legacy.events) {
      e.placements = { first: [], second: [], third: [] };
      delete e.awards;
    }
    legacy.events[0].placements = { first: [a], second: [b], third: [c] };

    const migrated = parse(legacy);
    expect(migrated.events[0].awards).toEqual({ [a]: 4, [b]: 3, [c]: 2 });
    expect('placements' in migrated.events[0]).toBe(false);
    expect('multipliers' in migrated.settings).toBe(false);
    expect(migrated.settings.payoutTiers).toEqual([6, 5, 4, 3, 2, 1]);
    expect(computeLedger(migrated).participants.map((p) => [p.id, p.currentBalance, p.totalRewardsEarned])).toEqual(expected);
  });
});
