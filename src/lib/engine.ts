import type {
  CompetitionData,
  EventRound,
  LedgerResult,
  LedgerWarning,
  LoanSettings,
  Participant,
  PlacementKey,
  RoundResult,
  Settings,
  TieBreakTier,
} from '../types';

/** Round to 2 decimal places, avoiding binary floating point artefacts. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Normalise a token amount to the configured precision. */
export function normaliseTokens(n: number, settings: Settings): number {
  return settings.loanSettings.repaymentPrecision === 'INTEGER' ? Math.round(n) : round2(n);
}

/**
 * Automatic loan repayment deducted from a gross event reward.
 *
 * INTEGER mode: floor(gross * rate%), optionally at least 1 token when gross > 0.
 * DECIMAL2 mode: gross * rate% rounded to 2 decimals.
 * The result is always capped at the outstanding loan principal.
 */
export function computeLoanRepayment(grossReward: number, outstandingLoan: number, loan: LoanSettings): number {
  if (grossReward <= 0 || outstandingLoan <= 0) return 0;
  const raw = (grossReward * loan.repaymentRatePercent) / 100;
  let deduction: number;
  if (loan.repaymentPrecision === 'INTEGER') {
    deduction = Math.floor(raw + 1e-9);
    if (deduction === 0 && raw > 0 && loan.minimumOneTokenDeduction) deduction = 1;
  } else {
    deduction = round2(raw);
  }
  return round2(Math.min(outstandingLoan, Math.max(0, deduction)));
}

export function multiplierFor(placement: PlacementKey | null, settings: Settings): number {
  if (placement === 'first') return settings.multipliers.first;
  if (placement === 'second') return settings.multipliers.second;
  if (placement === 'third') return settings.multipliers.third;
  return settings.multipliers.others;
}

export function pointsFor(placement: PlacementKey | null, settings: Settings): number {
  if (placement === 'first') return settings.placementPoints.first;
  if (placement === 'second') return settings.placementPoints.second;
  if (placement === 'third') return settings.placementPoints.third;
  return 0;
}

/** Highest placement a participant holds in an event (guards against accidental double assignment). */
export function placementOf(event: EventRound, participantId: string): PlacementKey | null {
  if (event.placements.first.includes(participantId)) return 'first';
  if (event.placements.second.includes(participantId)) return 'second';
  if (event.placements.third.includes(participantId)) return 'third';
  return null;
}

export function isParticipating(event: EventRound, participantId: string): boolean {
  return event.participation[participantId] !== false;
}

interface Acc {
  balance: number;
  staked: number;
  rewards: number;
  loan: number;
  repaid: number;
  loansTaken: number;
  events: number;
  points: number;
  adjustments: number;
}

export interface LedgerOptions {
  /** Treat this IN_PROGRESS event as COMPLETED (used for live payout previews). */
  previewEventNumber?: number;
}

/**
 * Deterministic ledger recalculation engine.
 *
 * Replays every loan, manual adjustment, stake lock and published result from
 * Event 1 through the last event, so editing any past round cleanly
 * re-evaluates every downstream balance.
 */
export function computeLedger(data: CompetitionData, options: LedgerOptions = {}): LedgerResult {
  const { settings } = data;
  const prec = (n: number) => normaliseTokens(n, settings);
  const warnings: LedgerWarning[] = [];
  const accs = new Map<string, Acc>();
  for (const p of data.participants) {
    accs.set(p.id, {
      balance: p.startingBalance,
      staked: 0,
      rewards: 0,
      loan: 0,
      repaid: 0,
      loansTaken: 0,
      events: 0,
      points: 0,
      adjustments: 0,
    });
  }

  type Op =
    | { kind: 'loan'; at: number; seq: number; participantId: string; amount: number }
    | { kind: 'adj'; at: number; seq: number; participantId: string; amount: number };
  const ops: Op[] = [
    ...data.loans.map((l, i) => ({ kind: 'loan' as const, at: l.appliesBeforeEvent, seq: i, participantId: l.participantId, amount: l.amount })),
    ...data.adjustments.map((a, i) => ({
      kind: 'adj' as const,
      at: a.appliesBeforeEvent,
      seq: data.loans.length + i,
      participantId: a.participantId,
      amount: a.amount,
    })),
  ].sort((a, b) => a.at - b.at || a.seq - b.seq);
  let opIndex = 0;

  const applyOpsUpTo = (eventNumber: number) => {
    while (opIndex < ops.length && ops[opIndex].at <= eventNumber) {
      const op = ops[opIndex++];
      const acc = accs.get(op.participantId);
      if (!acc) continue;
      if (op.kind === 'loan') {
        acc.balance = prec(acc.balance + op.amount);
        acc.loan = prec(acc.loan + op.amount);
        acc.loansTaken = prec(acc.loansTaken + op.amount);
      } else {
        acc.balance = prec(acc.balance + op.amount);
        acc.adjustments = prec(acc.adjustments + op.amount);
        if (acc.balance < 0) {
          warnings.push({ eventNumber: op.at, participantId: op.participantId, message: 'Manual adjustment drove balance below zero; clamped to 0.' });
          acc.balance = 0;
        }
      }
    }
  };

  const roundResults: Record<number, RoundResult[]> = {};
  const events = [...data.events].sort((a, b) => a.eventNumber - b.eventNumber);

  for (const event of events) {
    applyOpsUpTo(event.eventNumber);
    const settles = event.status === 'COMPLETED' || (event.status === 'IN_PROGRESS' && options.previewEventNumber === event.eventNumber);
    const locked = event.status === 'IN_PROGRESS' || event.status === 'COMPLETED';
    if (!locked) continue;

    for (const ids of Object.values(event.placements)) {
      for (const id of ids as string[]) {
        if (accs.has(id) && !isParticipating(event, id)) {
          warnings.push({ eventNumber: event.eventNumber, participantId: id, message: 'Placed participant was marked as not participating; placement ignored.' });
        }
      }
    }

    const results: RoundResult[] = [];
    for (const p of data.participants) {
      const acc = accs.get(p.id)!;
      const participated = isParticipating(event, p.id);
      const bid = participated ? Math.max(0, event.bids[p.id] ?? 0) : 0;
      const balanceBefore = acc.balance;
      let stake = bid;
      if (stake > acc.balance) {
        stake = Math.max(0, acc.balance);
        warnings.push({
          eventNumber: event.eventNumber,
          participantId: p.id,
          message: `Recorded stake ${bid} exceeds available balance ${balanceBefore}; stake clamped to ${stake}.`,
        });
      }
      stake = prec(stake);
      acc.balance = prec(acc.balance - stake);
      acc.staked = prec(acc.staked + stake);

      let placement: PlacementKey | null = null;
      let grossReward = 0;
      let loanRepaid = 0;
      let netCredited = 0;
      let points = 0;
      if (settles && participated) {
        placement = placementOf(event, p.id);
        grossReward = prec(stake * multiplierFor(placement, settings));
        loanRepaid = computeLoanRepayment(grossReward, acc.loan, settings.loanSettings);
        netCredited = prec(grossReward - loanRepaid);
        points = pointsFor(placement, settings);
        acc.loan = prec(acc.loan - loanRepaid);
        acc.repaid = prec(acc.repaid + loanRepaid);
        acc.balance = prec(acc.balance + netCredited);
        acc.rewards = prec(acc.rewards + grossReward);
        acc.points += points;
        acc.events += 1;
      }
      results.push({
        participantId: p.id,
        participated,
        bid,
        stake,
        placement,
        grossReward,
        loanRepaid,
        netCredited,
        points,
        balanceBefore,
        balanceAfter: acc.balance,
      });
    }
    roundResults[event.eventNumber] = results;
  }
  applyOpsUpTo(Number.POSITIVE_INFINITY);

  const deductAtFinale = data.scoresFrozen && settings.loanSettings.deductUnpaidLoanAtFinale;
  const participants: Participant[] = data.participants.map((p) => {
    const acc = accs.get(p.id)!;
    return {
      ...p,
      currentBalance: acc.balance,
      totalTokensStaked: acc.staked,
      totalRewardsEarned: acc.rewards,
      outstandingLoan: acc.loan,
      totalLoanRepaid: acc.repaid,
      totalLoansTaken: acc.loansTaken,
      eventsParticipated: acc.events,
      performanceScore: acc.points,
      manualAdjustments: acc.adjustments,
      rankingBalance: deductAtFinale ? prec(acc.balance - acc.loan) : acc.balance,
      currentRank: 0,
      tieBreakTier: 'NONE',
      inTieGroup: false,
    };
  });

  const ranked = rankParticipants(participants);
  const byId = new Map(ranked.map((r) => [r.id, r]));
  return { participants: participants.map((p) => byId.get(p.id)!), ranked, roundResults, warnings };
}

const manualKey = (p: Participant) => (p.tieBreakOrder > 0 ? p.tieBreakOrder : Number.POSITIVE_INFINITY);

/** Returns the tier that separates a and b, or 'UNRESOLVED' if they are completely tied. */
export function separatingTier(a: Participant, b: Participant): TieBreakTier {
  if (a.rankingBalance !== b.rankingBalance) return 'BALANCE';
  if (a.outstandingLoan !== b.outstandingLoan) return 'LOAN';
  if (a.performanceScore !== b.performanceScore) return 'PERFORMANCE';
  if (a.totalRewardsEarned !== b.totalRewardsEarned) return 'REWARDS';
  if (manualKey(a) !== manualKey(b)) return 'MANUAL';
  return 'UNRESOLVED';
}

/** 4-tier comparator: balance desc → loan asc → performance desc (rewards desc) → manual tie-break order asc. */
export function compareParticipants(a: Participant, b: Participant): number {
  return (
    b.rankingBalance - a.rankingBalance ||
    a.outstandingLoan - b.outstandingLoan ||
    b.performanceScore - a.performanceScore ||
    b.totalRewardsEarned - a.totalRewardsEarned ||
    manualKey(a) - manualKey(b)
  );
}

const TIER_DEPTH: Record<TieBreakTier, number> = { NONE: 0, BALANCE: 0, LOAN: 1, PERFORMANCE: 2, REWARDS: 3, MANUAL: 4, UNRESOLVED: 5 };

export function rankParticipants(participants: Participant[]): Participant[] {
  const sorted = [...participants].sort((a, b) => compareParticipants(a, b) || a.id.localeCompare(b.id));
  const out = sorted.map((p) => ({ ...p }));
  for (let i = 0; i < out.length; i++) {
    const cur = out[i];
    const prev = i > 0 ? out[i - 1] : null;
    if (prev && separatingTier(prev, cur) === 'UNRESOLVED') cur.currentRank = prev.currentRank;
    else cur.currentRank = i + 1;

    let tier: TieBreakTier = 'NONE';
    for (const n of [prev, out[i + 1]]) {
      if (!n || n.rankingBalance !== cur.rankingBalance) continue;
      const t = separatingTier(n, cur);
      if (TIER_DEPTH[t] > TIER_DEPTH[tier]) tier = t;
    }
    cur.tieBreakTier = tier;
    cur.inTieGroup = tier !== 'NONE';
  }
  return out;
}

/** Groups of participants that remain completely tied after all automatic tiers (need a manual tie-break). */
export function unresolvedTieGroups(ranked: Participant[]): Participant[][] {
  const groups: Participant[][] = [];
  let current: Participant[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const p = ranked[i];
    if (current.length && separatingTier(current[current.length - 1], p) === 'UNRESOLVED') current.push(p);
    else {
      if (current.length > 1) groups.push(current);
      current = [p];
    }
  }
  if (current.length > 1) groups.push(current);
  return groups;
}

/** Groups tied on every automatic tier (ignoring manual order) – candidates for a tie-break challenge. */
export function automaticTieGroups(ranked: Participant[]): Participant[][] {
  const autoTied = (a: Participant, b: Participant) => {
    const t = separatingTier(a, b);
    return t === 'MANUAL' || t === 'UNRESOLVED';
  };
  const groups: Participant[][] = [];
  let current: Participant[] = [];
  for (const p of ranked) {
    if (current.length && autoTied(current[current.length - 1], p)) current.push(p);
    else {
      if (current.length > 1) groups.push(current);
      current = [p];
    }
  }
  if (current.length > 1) groups.push(current);
  return groups;
}

export const TIER_LABEL: Record<TieBreakTier, string> = {
  NONE: '—',
  BALANCE: 'Balance',
  LOAN: 'Lower loan',
  PERFORMANCE: 'Performance',
  REWARDS: 'Total rewards',
  MANUAL: 'Tie-break challenge',
  UNRESOLVED: 'Unresolved tie',
};

/** Maximum stake a participant may place given a balance. */
export function maxStakeFor(balance: number, settings: Settings): number {
  return Math.max(0, Math.min(balance, settings.maxStakePerEvent));
}

/** Validates a bid; returns an error message or null. */
export function validateBid(bid: number, balance: number, settings: Settings): string | null {
  if (!Number.isFinite(bid) || bid < 0) return 'Stake must be a non-negative number';
  if (settings.loanSettings.repaymentPrecision === 'INTEGER' && !Number.isInteger(bid)) return 'Whole tokens only';
  const cap = maxStakeFor(balance, settings);
  if (bid > cap) return bid > settings.maxStakePerEvent ? `Max stake is ${settings.maxStakePerEvent}` : `Only ${balance} available`;
  // If a participant cannot afford the minimum, any amount up to their cap (including 0) is accepted.
  if (bid < settings.minStakePerEvent && cap >= settings.minStakePerEvent) return `Min stake is ${settings.minStakePerEvent}`;
  return null;
}
