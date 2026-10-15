import type { CompetitionData, LedgerResult } from '../types';

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

export function exportJson(data: CompetitionData) {
  const payload = { app: 'womens-auction-challenge', exportedAt: new Date().toISOString(), data };
  downloadFile(`auction-backup-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

export function leaderboardCsv(ledger: LedgerResult): string {
  return toCsv([
    [
      'Current Rank',
      'Participant ID',
      'Name',
      'Starting Koris',
      'Current Koris',
      'Total Koris Staked',
      'Total Rewards (Koris)',
      'Outstanding Kori Loan',
      'Total Kori Loan Repaid',
      'Events Participated',
      'Performance Score',
      'Tie-Break Order',
      'Resolved By',
    ],
    ...ledger.ranked.map((p) => [
      p.currentRank,
      p.id,
      p.name,
      p.startingBalance,
      p.currentBalance,
      p.totalKorisStaked,
      p.totalRewardsEarned,
      p.outstandingLoan,
      p.totalLoanRepaid,
      p.eventsParticipated,
      p.performanceScore,
      p.tieBreakOrder || '',
      p.tieBreakTier,
    ]),
  ]);
}

export function roundLedgerCsv(data: CompetitionData, ledger: LedgerResult): string {
  const names = new Map(data.participants.map((p) => [p.id, p.name]));
  const rows: unknown[][] = [
    ['Event', 'Title', 'Status', 'Participant ID', 'Name', 'Participated', 'Kori Stake', 'Placement', 'Gross Reward (Koris)', 'Kori Loan Repaid', 'Net Koris Credited', 'Koris Before', 'Koris After'],
  ];
  for (const e of data.events) {
    for (const r of ledger.roundResults[e.eventNumber] ?? []) {
      rows.push([e.eventNumber, e.title, e.status, r.participantId, names.get(r.participantId), r.participated ? 'Yes' : 'No', r.stake, r.placement ?? '', r.grossReward, r.loanRepaid, r.netCredited, r.balanceBefore, r.balanceAfter]);
    }
  }
  return toCsv(rows);
}

export function auditCsv(data: CompetitionData): string {
  return toCsv([
    ['ID', 'Timestamp', 'Type', 'Event', 'Participant', 'Reason', 'Details'],
    ...data.auditLog.map((a) => [a.id, a.timestamp, a.type, a.eventNumber ?? '', a.participantId ?? '', a.reason, a.details]),
  ]);
}

export function exportCsvBundle(data: CompetitionData, ledger: LedgerResult) {
  const s = stamp();
  downloadFile(`auction-leaderboard-${s}.csv`, leaderboardCsv(ledger), 'text/csv');
  setTimeout(() => downloadFile(`auction-round-ledger-${s}.csv`, roundLedgerCsv(data, ledger), 'text/csv'), 250);
  setTimeout(() => downloadFile(`auction-audit-log-${s}.csv`, auditCsv(data), 'text/csv'), 500);
}

/** Minimal RFC4180 CSV parser. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Reads a roster CSV: either a "Name[,Starting Koris]" header (legacy "Starting Balance" also works) or plain names. */
export function parseRosterCsv(text: string): { name: string; startingBalance?: number }[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h === 'name' || h === 'participant' || h === 'participant name');
  const balIdx = header.findIndex((h) => h.includes('starting'));
  const body = nameIdx >= 0 ? rows.slice(1) : rows;
  const ni = nameIdx >= 0 ? nameIdx : 0;
  return body
    .map((r) => {
      const bal = balIdx >= 0 ? Number(r[balIdx]) : NaN;
      return { name: (r[ni] ?? '').trim(), startingBalance: Number.isFinite(bal) && r[balIdx]?.trim() !== '' ? bal : undefined };
    })
    .filter((r) => r.name);
}
