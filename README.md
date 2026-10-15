# মজার মহাযুদ্ধ (Mojar Mohajuddho) — Live Event Management & Scoring

_Women's Auction Challenge – Live Bidding & Scoring Arena_

A single-page React + TypeScript app for running the 10-round Mojar Mohajuddho live: participants, bids, loans, winners, audited corrections, and a synced projector leaderboard.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # ledger engine tests (vitest)
npm run build      # tsc -b && vite build
```

The admin console is at `/`. **Launch Projector View** opens `/#/projector` in a second window. It mirrors every change live through `BroadcastChannel`, with `storage` events as a fallback, and has no admin controls. You can also present full-screen in the same tab.

## How it works

- **Source of truth** (`src/types.ts → CompetitionData`): settings, roster, events (bids, participation, placements), loan log, manual adjustments and the audit log. Zustand saves it to `localStorage` after every change, so refreshing the browser loses nothing.
- **Ledger engine** (`src/lib/engine.ts`): a deterministic replay from Event 1 that applies loans and adjustments, deducts stakes at lock, pays stake × multiplier, takes the automatic loan repayment and awards placement points. Every leaderboard field is derived from it, so correcting a past round re-evaluates everything after it.
- **Operations** (`src/lib/operations.ts`): pure, rule-checked state transitions (open bidding → lock stakes → publish → advance → freeze). The UI only calls these.
- **Ranking**: higher balance → lower outstanding loan → higher performance score, then total rewards → manual tie-break challenge order. The leaderboard shows which tier settled each tie.
- **Loan repayment**: by default `floor(gross × 2%)`, capped at the outstanding principal. A 100-token reward repays 2 and credits 98 (covered by a test). Settings add exact 2-decimal mode, a minimum 1-token deduction, and an option to deduct unpaid loans when scores are frozen.

## DJ & Soundboard

The **DJ & Soundboard** tab, plus a floating dock in Event Operations, runs all event audio from the admin window. The projector stays silent so sound never plays twice.

- **7 Bengali announcement slots**, on hotkeys `Alt+1`–`Alt+7`: Intro, Bidding Open, 30-Second Warning, Bidding Locked, Results, Token Loan, Champion. Each card has the ElevenLabs script to copy, an upload button (also drag-and-drop), play/stop, a scrubber, loop, volume, an auto-play toggle, and a trigger mode: Uploaded MP3 / Built-in Synth / Both / Muted. You can also add custom pads.
- **Auto-triggers:** Open Bidding, the countdown at 00:30 and 00:00, stake lock, Publish Results, a loan being issued, and freezing the final scores.
- **Built-in synth effects** (Web Audio, no files needed): coin, countdown tick (00:10 → 00:01), airhorn, 3-second drumroll, victory fanfare. A slot with no MP3 falls back to these.
- **Background music deck** with automatic ducking: music fades to 15% in 0.3 s when a voice clip starts, and fades back 0.5 s after it ends.
- **Esc** (outside text fields and dialogs) is the panic stop.
- Uploaded audio is stored in the browser's **IndexedDB** and survives refreshes, but it is not included in JSON backups. Upload the MP3s on the laptop that runs the show.

## Data safety

- **Export / Backup**: a full JSON backup, plus CSV files for the leaderboard, the per-round ledger and the audit log.
- **Restore from JSON**: restores a backup in any browser.
- **Roster CSV import**: needs a `Name` column; `Starting Balance` is optional.
- **Load Demo Data**: 12 participants, optionally with 3 simulated rounds. You can also reset results only (the roster is kept) or wipe everything.
