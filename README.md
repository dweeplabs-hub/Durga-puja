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

## Kori (কড়ি) theme

The game currency is **Koris (কড়ি)**, the traditional cowrie shell. In Bengali it is **খেলার কড়ি**. Amounts show a small cowrie badge, and loans are **Kori Loans (কড়ি ধার)**. Accents use deep maroon, terracotta and festive gold. Saves and backups from before the Kori theme migrate automatically, with identical rankings and loan math (covered by a test).

## How it works

- **Source of truth** (`src/types.ts → CompetitionData`): settings, roster, events (bids, participation, multiplier awards), loan log, manual adjustments and the audit log. Zustand saves it to `localStorage` after every change, so refreshing the browser loses nothing.
- **Ledger engine** (`src/lib/engine.ts`): a deterministic replay from Event 1 that applies loans and adjustments, deducts stakes at lock, pays stake × the awarded multiplier (**6x, 5x, 4x, 3x, 2x or 1x** by default; players with no award lose their stake), takes the automatic loan repayment and adds performance points equal to the multiplier. Every leaderboard field is derived from it, so correcting a past round re-evaluates everything after it.
- **Operations** (`src/lib/operations.ts`): pure, rule-checked state transitions (open bidding → lock stakes → publish → advance → freeze). The UI only calls these.
- **Ranking**: higher balance → lower outstanding loan → higher performance score, then total rewards → manual tie-break challenge order. The leaderboard shows which tier settled each tie.
- **Kori Loan (কড়ি ধার) repayment**: by default `floor(gross × 2%)`, capped at the outstanding principal. A 100-kori reward repays 2 and credits 98 (covered by a test). Settings add exact 2-decimal mode, a minimum 1-kori deduction, and an option to deduct unpaid loans when scores are frozen.

## DJ & Soundboard

The **DJ & Soundboard** tab, plus a floating dock in Event Operations, runs all event audio from the admin window. The projector stays silent so sound never plays twice.

- **7 Bengali announcement slots**, on hotkeys `Alt+1`–`Alt+7`: Intro, Bidding Open, 30-Second Warning, Bidding Locked, Results, Kori Loan, Champion. Each card has the ElevenLabs script to copy, an upload button (also drag-and-drop), play/stop, a scrubber, loop, volume, an auto-play toggle, and a trigger mode: Uploaded MP3 / Built-in Synth / Both / Muted. You can also add custom pads.
- **Auto-triggers:** Open Bidding, the countdown at 00:30 and 00:00, stake lock, Publish Results, a loan being issued, and freezing the final scores.
- **Built-in synth effects** (Web Audio, no files needed): Kori clink, temple bell, countdown tick (00:10 → 00:01), airhorn, 3-second drumroll, victory fanfare. A slot with no MP3 falls back to these.
- **Kori clink:** cowrie shells rattling into a wooden bowl. It plays when stakes lock, a Kori Loan is issued, and rewards are credited. It has its own on/off switch.
- **Built-in festival background music:** a dhak & kansor puja groove (ঢাকের তাল) or soft temple chimes (ঘণ্টার সুর). Both loop with no upload and duck under voice clips like an uploaded track.
- **Background music deck** with automatic ducking: music fades to 15% in 0.3 s when a voice clip starts, and fades back 0.5 s after it ends.
- **Esc** (outside text fields and dialogs) is the panic stop.
- Uploaded audio is stored in the browser's **IndexedDB** and survives refreshes, but it is not included in JSON backups. Upload the MP3s on the laptop that runs the show.

## Live Sync (projector on a different laptop)

1. **Entry laptop:** press **Live Sync** in the header and choose a room code and an organizer PIN, then press **Go Live**.
2. **Projector laptop:** open the projector link shown in the dialog (`…/#/projector?room=CODE`), or open `/#/projector` and type the room code.
3. Every change on the entry laptop appears on the projector, pushed over Supabase Realtime. A cheap revision check every 3 s covers any gap. The projector is read-only.

- **Where the data lives:** the `mojar_rooms` table in the SMSA Supabase project. Saves go through PIN-checked Postgres functions (`mojar_open_room`, `mojar_save`) with optimistic concurrency. The publishable key can read rooms but can't write them or read PIN hashes (`mojar_room_secrets`).
- **Offline:** each laptop keeps its own local copy. If the internet drops, the entry laptop keeps working and uploads automatically when it's back.
- **Two entry laptops:** both can use the same room code and PIN. If both save at the same instant, the later one is warned and shown the online version.
- **Uploaded MP3s** are not synced; they stay on the laptop that plays the sound.

## Data safety

- **Export / Backup**: a full JSON backup, plus CSV files for the leaderboard, the per-round ledger and the audit log.
- **Restore from JSON**: restores a backup in any browser.
- **Roster CSV import**: needs a `Name` column; `Starting Balance` is optional.
- **Resets** (Participants & Settings → Data & Backups): reset results only (the roster is kept) or wipe everything for a clean slate.
