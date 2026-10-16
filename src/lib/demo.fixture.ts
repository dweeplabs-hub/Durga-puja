// Test-only sample data: 12 participants and optionally simulated rounds. Not used by the app.
import type { CompetitionData } from '../types';
import { computeLedger, maxStakeFor } from './engine';
import { defaultSettings, emptyCompetition } from './defaults';
import { addParticipant, advanceEvent, finalize, issueLoan, loanHeadroom, lockBidding, openBidding, publishResults, setAward, setBid } from './operations';

type Data = CompetitionData;

const DEMO_NAMES = [
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
      if (p.currentBalance < 30 && loanHeadroom(d, p.id) >= d.settings.loanSettings.fixedLoanTranche) {
        d = issueLoan(d, p.id, d.settings.loanSettings.fixedLoanTranche);
      }
    }
    d = openBidding(d, n);
    ledger = computeLedger(d);
    for (const p of ledger.participants) {
      const cap = maxStakeFor(p.currentBalance, d.settings);
      // Bold bidding: most players stake at least half of what they may, often all of it.
      const steps = Math.floor(cap / 5);
      const bid = rand() > 0.55 ? cap : 5 * Math.max(1, Math.ceil(steps / 2) + Math.floor(rand() * (steps / 2 + 1)));
      d = setBid(d, n, p.id, Math.max(Math.min(d.settings.minStakePerEvent, cap), Math.min(cap, bid)));
    }
    d = lockBidding(d, n);
    const pool = [...d.participants.map((p) => p.id)];
    const pick = () => pool.splice(Math.floor(rand() * pool.length), 1)[0];
    // Six finishers get one tier each (6x … 1x); everyone else loses their stake.
    for (const m of d.settings.payoutTiers) d = setAward(d, n, pick(), m);
    d = publishResults(d, n);
    if (r < simulatedRounds - 1 && d.currentEventNumber < d.settings.totalEvents) d = advanceEvent(d);
  }
  if (simulatedRounds > 0 && d.currentEventNumber < d.settings.totalEvents) d = advanceEvent(d);
  return finalize(d);
}

