import type { CompetitionData, EventRound, ParticipantBase, Settings } from '../types';

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
    eventName: "Women's Auction Challenge",
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
