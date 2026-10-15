export type EventStatus = 'UPCOMING' | 'BIDDING_OPEN' | 'IN_PROGRESS' | 'COMPLETED';
export type RepaymentPrecision = 'INTEGER' | 'DECIMAL2';
export type AuditType = 'LOAN_ISSUED' | 'ROUND_COMPLETED' | 'RESULT_CORRECTION' | 'MANUAL_ADJUSTMENT';
export type PlacementKey = 'first' | 'second' | 'third';

export interface Multipliers {
  first: number;
  second: number;
  third: number;
  others: number;
}

export interface PlacementPoints {
  first: number;
  second: number;
  third: number;
}

export interface LoanSettings {
  fixedLoanTranche: number;
  maxTotalLoanPerParticipant: number;
  /** Percentage, e.g. 2 means 2% of gross reward. */
  repaymentRatePercent: number;
  repaymentPrecision: RepaymentPrecision;
  /** Integer mode only: deduct at least 1 token when reward > 0 and the computed deduction rounds to 0. */
  minimumOneTokenDeduction: boolean;
  deductUnpaidLoanAtFinale: boolean;
}

export interface Settings {
  eventName: string;
  totalEvents: number;
  startingBalance: number;
  minStakePerEvent: number;
  maxStakePerEvent: number;
  multipliers: Multipliers;
  placementPoints: PlacementPoints;
  loanSettings: LoanSettings;
  defaultBiddingSeconds: number;
}

/** Stored (source-of-truth) participant record. Ledger fields are derived by the engine. */
export interface ParticipantBase {
  id: string;
  name: string;
  startingBalance: number;
  /** 0 = not set. Lower positive number ranks higher in a final tie-break. */
  tieBreakOrder: number;
}

export type TieBreakTier = 'BALANCE' | 'LOAN' | 'PERFORMANCE' | 'REWARDS' | 'MANUAL' | 'UNRESOLVED' | 'NONE';

/** Fully computed participant record (all leaderboard fields). */
export interface Participant extends ParticipantBase {
  currentBalance: number;
  totalTokensStaked: number;
  totalRewardsEarned: number;
  outstandingLoan: number;
  totalLoanRepaid: number;
  totalLoansTaken: number;
  eventsParticipated: number;
  performanceScore: number;
  manualAdjustments: number;
  /** Balance used for ranking (currentBalance, or net of loan if deductUnpaidLoanAtFinale applies). */
  rankingBalance: number;
  currentRank: number;
  /** Which tie-breaker tier separated this participant from the closest neighbour sharing their balance. */
  tieBreakTier: TieBreakTier;
  /** True if this participant shares a balance with someone else. */
  inTieGroup: boolean;
}

export interface Placements {
  first: string[];
  second: string[];
  third: string[];
}

export interface RoundResult {
  participantId: string;
  participated: boolean;
  bid: number;
  stake: number;
  placement: PlacementKey | null;
  grossReward: number;
  loanRepaid: number;
  netCredited: number;
  points: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface EventRound {
  eventNumber: number;
  title: string;
  description: string;
  status: EventStatus;
  bids: Record<string, number>;
  participation: Record<string, boolean>;
  placements: Placements;
  /** Computed by the engine; persisted copy is a snapshot for exports. */
  roundResults: RoundResult[];
  biddingEndsAt: number | null;
  biddingDurationSec: number;
  biddingPausedRemainingMs: number | null;
  lockedAt: string | null;
  completedAt: string | null;
}

export interface LoanRecord {
  id: string;
  participantId: string;
  amount: number;
  /** The loan is credited before this event's stakes are deducted. */
  appliesBeforeEvent: number;
  timestamp: string;
}

export interface ManualAdjustment {
  id: string;
  participantId: string;
  /** Positive credits, negative debits the current balance. */
  amount: number;
  appliesBeforeEvent: number;
  reason: string;
  timestamp: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  type: AuditType;
  eventNumber?: number;
  participantId?: string;
  reason: string;
  details: string;
}

export interface LedgerWarning {
  eventNumber: number;
  participantId: string;
  message: string;
}

/** The persisted, serialisable source of truth. */
export interface CompetitionData {
  version: 1;
  settings: Settings;
  rulesLocked: boolean;
  participants: ParticipantBase[];
  events: EventRound[];
  loans: LoanRecord[];
  adjustments: ManualAdjustment[];
  auditLog: AuditEntry[];
  currentEventNumber: number;
  scoresFrozen: boolean;
  showLoanColumnsPublic: boolean;
}

export interface LedgerResult {
  participants: Participant[];
  /** Participants sorted by rank. */
  ranked: Participant[];
  roundResults: Record<number, RoundResult[]>;
  warnings: LedgerWarning[];
}
