import type { AudioConfig, AudioSlotConfig, Branding, CompetitionData, EventRound, ParticipantBase, Settings, VoiceSlotId } from '../types';

export const DEFAULT_EVENT_TITLES = [
  'Precision Challenge',
  'Memory Marathon',
  'Speed Puzzle',
  'Balloon Balance',
  'Quiz Blitz',
  'Rangoli Relay',
  'Musical Chairs',
  'Treasure Hunt',
  'Ladoo Toss',
  'Grand Finale Showdown',
];

export function defaultSettings(): Settings {
  return {
    totalEvents: 10,
    startingBalance: 100,
    minStakePerEvent: 0,
    maxStakePerEvent: 50,
    multipliers: { first: 4, second: 3, third: 2, others: 0 },
    placementPoints: { first: 3, second: 2, third: 1 },
    loanSettings: {
      fixedLoanTranche: 20,
      maxTotalLoanPerParticipant: 100,
      repaymentRatePercent: 2,
      repaymentPrecision: 'INTEGER',
      minimumOneTokenDeduction: false,
      deductUnpaidLoanAtFinale: false,
    },
    defaultBiddingSeconds: 120,
  };
}

export function defaultBranding(): Branding {
  return {
    titleBn: 'মজার মহাযুদ্ধ',
    titleEn: 'Mojar Mohajuddho',
    subtitle: "Women's Auction Challenge – Live Bidding & Scoring Arena",
  };
}

/** The 7 built-in Bengali announcement slots, in hotkey order (Alt+1 … Alt+7). */
export const VOICE_SLOT_DEFS: { id: VoiceSlotId; labelBn: string; labelEn: string; autoTrigger: boolean; trigger: string }[] = [
  { id: 'MAIN_INTRO', labelBn: 'মূল ঘোষণা', labelEn: 'Grand Intro & Rules', autoTrigger: false, trigger: 'Manual — play from the Welcome screen (Event 1, Step A)' },
  { id: 'BIDDING_OPEN', labelBn: 'বিডিং শুরু', labelEn: 'Bidding Open', autoTrigger: true, trigger: 'When “Open Bidding” is clicked' },
  { id: 'THIRTY_SEC_LEFT', labelBn: '৩০ সেকেন্ড বাকি', labelEn: '30-Second Warning', autoTrigger: true, trigger: 'When the bidding countdown hits 00:30' },
  { id: 'BIDDING_CLOSED', labelBn: 'বিডিং বন্ধ', labelEn: 'Bidding Locked', autoTrigger: true, trigger: 'When stakes are locked, or the countdown reaches 00:00' },
  { id: 'LEADERBOARD_REVEAL', labelBn: 'ফলাফল ও লিডারবোর্ড', labelEn: 'Results & Leaderboard', autoTrigger: true, trigger: 'When “Publish Results & Update Leaderboard” is clicked' },
  { id: 'LOAN_ISSUED', labelBn: 'টোকেন লোন', labelEn: 'Token Loan Granted', autoTrigger: false, trigger: 'When a participant receives a token loan (optional)' },
  { id: 'CHAMPION_CROWNED', labelBn: 'চ্যাম্পিয়ন ঘোষণা', labelEn: 'Champion Reveal', autoTrigger: true, trigger: 'When final scores are frozen and the podium is revealed' },
];

export function defaultAudioConfig(): AudioConfig {
  const slots: AudioSlotConfig[] = VOICE_SLOT_DEFS.map((d, i) => ({
    id: d.id,
    labelBn: d.labelBn,
    labelEn: d.labelEn,
    hotkey: i + 1,
    autoTrigger: d.autoTrigger,
    mode: 'MP3',
    volume: 1,
    loop: false,
    custom: false,
    script: '',
  }));
  return {
    masterVolume: 0.9,
    bgmVolume: 0.5,
    sfxVolume: 0.8,
    bgmLoop: true,
    duckingEnabled: true,
    autoTriggerMaster: true,
    countdownTicks: true,
    slots,
    sfxLabels: { COIN: 'Coin', TICK: 'Countdown Tick', AIRHORN: 'Airhorn', DRUMROLL: 'Drumroll', FANFARE: 'Victory Fanfare' },
  };
}

/** Fills any missing audio fields (older saves / imported backups) with defaults, keeping custom slots. */
export function normaliseAudioConfig(raw: Partial<AudioConfig> | undefined): AudioConfig {
  const base = defaultAudioConfig();
  if (!raw) return base;
  const saved = Array.isArray(raw.slots) ? raw.slots : [];
  const builtIn = base.slots.map((b) => ({ ...b, ...saved.find((s) => s.id === b.id), custom: false }));
  const custom = saved.filter((s) => s.custom && !builtIn.some((b) => b.id === s.id)).map((s) => ({ ...base.slots[0], ...s, custom: true }));
  return { ...base, ...raw, sfxLabels: { ...base.sfxLabels, ...raw.sfxLabels }, slots: [...builtIn, ...custom] };
}

export function makeEvent(eventNumber: number, settings: Settings): EventRound {
  const name = DEFAULT_EVENT_TITLES[eventNumber - 1] ?? `Challenge ${eventNumber}`;
  return {
    eventNumber,
    title: `Event ${eventNumber}: ${name}`,
    description: '',
    status: 'UPCOMING',
    bids: {},
    participation: {},
    placements: { first: [], second: [], third: [] },
    roundResults: [],
    biddingEndsAt: null,
    biddingDurationSec: settings.defaultBiddingSeconds,
    biddingPausedRemainingMs: null,
    lockedAt: null,
    completedAt: null,
  };
}

export function emptyCompetition(settings: Settings = defaultSettings()): CompetitionData {
  return {
    version: 1,
    branding: defaultBranding(),
    projectorLanguage: 'BILINGUAL',
    audio: defaultAudioConfig(),
    settings,
    rulesLocked: false,
    participants: [],
    events: Array.from({ length: settings.totalEvents }, (_, i) => makeEvent(i + 1, settings)),
    loans: [],
    adjustments: [],
    auditLog: [],
    currentEventNumber: 1,
    scoresFrozen: false,
    showLoanColumnsPublic: true,
  };
}

export function formatParticipantId(n: number): string {
  return `P-${String(n).padStart(2, '0')}`;
}

export function nextParticipantId(participants: ParticipantBase[]): string {
  const max = participants.reduce((m, p) => {
    const n = Number(p.id.replace(/^P-/, ''));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return formatParticipantId(max + 1);
}

export const DEMO_NAMES = [
  'Ananya Sen',
  'Priya Banerjee',
  'Riya Chatterjee',
  'Moumita Das',
  'Sohini Ghosh',
  'Paromita Roy',
  'Tanushree Mukherjee',
  'Ishita Bose',
  'Debolina Sarkar',
  'Rupa Dutta',
  'Kavya Iyer',
  'Nandini Pal',
];

export function uid(prefix = ''): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}-${rnd}`;
}
