export type EventStatus = 'UPCOMING' | 'BIDDING_OPEN' | 'IN_PROGRESS' | 'COMPLETED';
export type RepaymentPrecision = 'INTEGER' | 'DECIMAL2';
export type AuditType = 'LOAN_ISSUED' | 'ROUND_COMPLETED' | 'RESULT_CORRECTION' | 'MANUAL_ADJUSTMENT';

export interface LoanSettings {
  fixedLoanTranche: number;
  maxTotalLoanPerParticipant: number;
  /** Percentage, e.g. 2 means 2% of gross reward. */
  repaymentRatePercent: number;
  repaymentPrecision: RepaymentPrecision;
  /** Integer mode only: deduct at least 1 kori when reward > 0 and the computed deduction rounds to 0. */
  minimumOneKoriDeduction: boolean;
  deductUnpaidLoanAtFinale: boolean;
}

export interface Settings {
  totalEvents: number;
  startingBalance: number;
  minStakePerEvent: number;
  maxStakePerEvent: number;
  /**
   * Payout multipliers the organizer can award each round, highest first (default 6x…1x).
   * Gross reward = own stake × awarded multiplier; performance points = the multiplier.
   */
  payoutTiers: number[];
  /** Multiplier for participants who receive no award (0 = stake is lost). */
  othersMultiplier: number;
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
  totalKorisStaked: number;
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

export interface RoundResult {
  participantId: string;
  participated: boolean;
  bid: number;
  stake: number;
  /** Multiplier awarded this round, or null if none (paid at the "others" multiplier). */
  award: number | null;
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
  /** participantId → multiplier awarded (e.g. 6 for "6x"). Several participants may share a tier. */
  awards: Record<string, number>;
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

export interface Branding {
  /** Primary title in Bengali, e.g. "মজার মহাযুদ্ধ". */
  titleBn: string;
  /** Primary title in English / romanised, e.g. "Mojar Mohajuddho". */
  titleEn: string;
  subtitle: string;
}

export type ProjectorLanguage = 'BILINGUAL' | 'ENGLISH';

/** Built-in synthesized sound effects. */
export type SfxId = 'KORI' | 'BELL' | 'TICK' | 'AIRHORN' | 'DRUMROLL' | 'FANFARE';

/** Background music: an uploaded file or one of the built-in synthesized festival loops. */
export type BgmSource = 'FILE' | 'DHAK' | 'CHIMES';

/** What an automatic workflow trigger plays for a slot. */
export type AudioMode = 'MP3' | 'SYNTH' | 'BOTH' | 'MUTED';

export type VoiceSlotId =
  | 'MAIN_INTRO'
  | 'BIDDING_OPEN'
  | 'THIRTY_SEC_LEFT'
  | 'BIDDING_CLOSED'
  | 'LEADERBOARD_REVEAL'
  | 'LOAN_ISSUED'
  | 'CHAMPION_CROWNED';

export interface AudioSlotConfig {
  /** One of VoiceSlotId for built-in slots, or "CUSTOM-…" for organizer-added slots. */
  id: string;
  labelBn: string;
  labelEn: string;
  /** Alt+<hotkey> plays the slot. */
  hotkey: number | null;
  /** Auto-play when the matching workflow step happens (ignored for manual-only slots). */
  autoTrigger: boolean;
  mode: AudioMode;
  /** 0–1 */
  volume: number;
  loop: boolean;
  custom: boolean;
  /** Script text for custom slots (built-in slots ship their own ElevenLabs script). */
  script: string;
}

export interface AudioConfig {
  /** 0–1 */
  masterVolume: number;
  bgmVolume: number;
  sfxVolume: number;
  bgmLoop: boolean;
  bgmSource: BgmSource;
  duckingEnabled: boolean;
  /** Play the Kori clink when stakes lock, a loan is issued or rewards are credited. */
  koriClinkFx: boolean;
  /** Global "Auto-Trigger on Event Steps" switch. */
  autoTriggerMaster: boolean;
  /** Tick on each second from 00:10 to 00:01 of the bidding countdown. */
  countdownTicks: boolean;
  slots: AudioSlotConfig[];
  sfxLabels: Record<SfxId, string>;
}

/** The persisted, serialisable source of truth. */
export interface CompetitionData {
  version: 1;
  branding: Branding;
  projectorLanguage: ProjectorLanguage;
  audio: AudioConfig;
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
  /** Show each bid on the projector while bidding is still open (off = sealed bids until stakes lock). */
  showLiveBids: boolean;
}

export interface LedgerResult {
  participants: Participant[];
  /** Participants sorted by rank. */
  ranked: Participant[];
  roundResults: Record<number, RoundResult[]>;
  warnings: LedgerWarning[];
}
