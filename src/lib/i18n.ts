import type { EventStatus, ProjectorLanguage } from '../types';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Converts ASCII digits to Bengali numerals. */
export function bnNum(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

/** Projector strings: English with a Bengali counterpart. */
export const PROJECTOR_TEXT = {
  liveLeaderboard: { en: 'Live Leaderboard', bn: 'লাইভ লিডারবোর্ড' },
  finalStandings: { en: 'Final Standings', bn: 'চূড়ান্ত ফলাফল' },
  championshipPodium: { en: 'Championship Podium', bn: 'চ্যাম্পিয়নশিপ পোডিয়াম' },
  nowPlaying: { en: 'Now Playing', bn: 'এখন চলছে' },
  korisInPlay: { en: 'Koris in play', bn: 'বাজিতে খেলার কড়ি' },
  placeBids: { en: 'Place your bids now!', bn: 'এখনই বাজি ধরুন!' },
  startingSoon: { en: 'Starting soon…', bn: 'শীঘ্রই শুরু…' },
  roundWinners: { en: 'Round Winners', bn: 'রাউন্ডের বিজয়ী' },
  lastRoundWinners: { en: 'Last Round Winners', bn: 'গত রাউন্ডের বিজয়ী' },
  eventProgress: { en: 'Event Progress', bn: 'ইভেন্টের অগ্রগতি' },
  closesIn: { en: 'Bidding closes in', bn: 'বিডিং বন্ধ হতে বাকি' },
  closed: { en: 'Bidding closed', bn: 'বিডিং বন্ধ' },
  paused: { en: 'Countdown paused', bn: 'কাউন্টডাউন থেমে আছে' },
  rank: { en: 'Rank', bn: 'স্থান' },
  id: { en: 'ID', bn: 'আইডি' },
  name: { en: 'Name', bn: 'নাম' },
  start: { en: 'Starting Koris', bn: 'শুরুর কড়ি' },
  balance: { en: 'Current Koris', bn: 'বর্তমান কড়ি' },
  staked: { en: 'Koris Staked', bn: 'বাজির কড়ি' },
  rewards: { en: 'Rewards', bn: 'পুরস্কার' },
  loanDue: { en: 'Kori Loan Due', bn: 'কড়ি ধার বাকি' },
  repaid: { en: 'Loan Repaid', bn: 'ধার শোধ' },
  events: { en: 'Events', bn: 'ইভেন্ট' },
  atStake: { en: 'Koris at Stake', bn: 'বাজিতে কড়ি' },
  champion: { en: 'Champion', bn: 'চ্যাম্পিয়ন' },
  firstRunnerUp: { en: 'First Runner-Up', bn: 'প্রথম রানার্স-আপ' },
  secondRunnerUp: { en: 'Second Runner-Up', bn: 'দ্বিতীয় রানার্স-আপ' },
  koris: { en: 'Koris', bn: 'কড়ি' },
  podiumTie: { en: 'Some podium positions are tied — resolve with a final tie-break challenge.', bn: 'কিছু স্থানে টাই — টাই-ব্রেক চ্যালেঞ্জে নিষ্পত্তি হবে।' },
} as const;

export type TextKey = keyof typeof PROJECTOR_TEXT;

export const STATUS_TEXT: Record<EventStatus, { en: string; bn: string }> = {
  UPCOMING: { en: 'Upcoming', bn: 'আসন্ন' },
  BIDDING_OPEN: { en: 'Bidding Open', bn: 'বিডিং চলছে' },
  IN_PROGRESS: { en: 'In Progress', bn: 'খেলা চলছে' },
  COMPLETED: { en: 'Completed', bn: 'সম্পন্ন' },
};

/** "Bengali · English" in bilingual mode, English alone otherwise. */
export function tx(lang: ProjectorLanguage, key: TextKey | { en: string; bn: string }): string {
  const v = typeof key === 'string' ? PROJECTOR_TEXT[key] : key;
  return lang === 'BILINGUAL' ? `${v.bn} · ${v.en}` : v.en;
}
