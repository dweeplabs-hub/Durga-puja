import { useMemo, useState } from 'react';
import { Download, FileClock, HandCoins, Landmark, Search, SlidersHorizontal } from 'lucide-react';
import type { AuditType } from '../types';
import { useCompetition, useLedger } from '../store';
import { addAdjustment, issueLoan, nextLedgerSlot } from '../lib/operations';
import { auditCsv, downloadFile } from '../lib/exporters';
import { cue } from '../audio/cues';
import { Badge, Button, Card, Field, NumberInput, inputClass, fmt } from './ui';

const AUDIT_TONE: Record<AuditType, 'violet' | 'emerald' | 'amber' | 'sky'> = {
  LOAN_ISSUED: 'violet',
  ROUND_COMPLETED: 'emerald',
  RESULT_CORRECTION: 'amber',
  MANUAL_ADJUSTMENT: 'sky',
};

export function LoanDesk() {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const ledger = useLedger();
  const { loanSettings } = data.settings;
  const [pid, setPid] = useState('');
  const [amount, setAmount] = useState(loanSettings.fixedLoanTranche);
  const [adjPid, setAdjPid] = useState('');
  const [adjAmount, setAdjAmount] = useState(0);
  const [adjReason, setAdjReason] = useState('');
  const [filter, setFilter] = useState<AuditType | 'ALL'>('ALL');
  const [query, setQuery] = useState('');

  const slot = nextLedgerSlot(data);
  const selected = ledger.participants.find((p) => p.id === pid);
  const headroom = selected ? Math.max(0, loanSettings.maxTotalLoanPerParticipant - selected.outstandingLoan) : 0;
  const names = useMemo(() => new Map(data.participants.map((p) => [p.id, p.name])), [data.participants]);
  const borrowers = ledger.participants.filter((p) => p.totalLoansTaken > 0);
  const totals = borrowers.reduce((a, p) => ({ issued: a.issued + p.totalLoansTaken, outstanding: a.outstanding + p.outstandingLoan, repaid: a.repaid + p.totalLoanRepaid }), {
    issued: 0,
    outstanding: 0,
    repaid: 0,
  });

  const audit = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...data.auditLog]
      .reverse()
      .filter((a) => filter === 'ALL' || a.type === filter)
      .filter((a) => !q || `${a.reason} ${a.details} ${a.participantId ?? ''} ${names.get(a.participantId ?? '') ?? ''}`.toLowerCase().includes(q));
  }, [data.auditLog, filter, query, names]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Issue Loan" icon={<HandCoins size={18} className="text-violet-400" />}>
          <div className="space-y-4">
            <Field label="Participant">
              <select className={inputClass} value={pid} onChange={(e) => setPid(e.target.value)}>
                <option value="">Select participant…</option>
                {ledger.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name} — balance {fmt(p.currentBalance)}, loan {fmt(p.outstandingLoan)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount" hint={selected ? `Can borrow up to ${fmt(headroom)} more (limit ${loanSettings.maxTotalLoanPerParticipant} outstanding).` : undefined}>
              <div className="flex gap-2">
                {Array.from(new Set([loanSettings.fixedLoanTranche, 20, 50])).sort((a, b) => a - b).map((v) => (
                  <Button key={v} size="sm" variant={amount === v ? 'primary' : 'secondary'} onClick={() => setAmount(v)}>
                    {v}
                  </Button>
                ))}
                <NumberInput value={amount} min={1} commitOnChange onCommit={setAmount} className="w-28" ariaLabel="Custom loan amount" />
              </div>
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-950 px-3 py-2 text-sm">
              <span className="text-slate-400">{slot ? `Credited before Event ${slot}'s stakes are locked.` : 'No events remain — loans are closed.'}</span>
              <Button variant="primary" disabled={!pid || amount <= 0 || amount > headroom || !slot || data.scoresFrozen} onClick={() => run((d) => issueLoan(d, pid, amount), `Loan of ${amount} issued`) && cue('LOAN_ISSUED')}>
                Issue Loan
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Repayment: {loanSettings.repaymentRatePercent}% of every gross reward ({loanSettings.repaymentPrecision === 'INTEGER' ? 'whole tokens, rounded down' : '2 decimals'}
              {loanSettings.repaymentPrecision === 'INTEGER' && loanSettings.minimumOneTokenDeduction ? ', minimum 1 token' : ''}) is deducted automatically until the loan is repaid.
              {loanSettings.deductUnpaidLoanAtFinale ? ' Unpaid principal is subtracted from final balances when scores are frozen.' : ' Unpaid principal counts only as tie-breaker #2.'}
            </p>
          </div>
        </Card>

        <Card title="Manual Balance Adjustment" icon={<SlidersHorizontal size={18} className="text-sky-400" />}>
          <div className="space-y-4">
            <Field label="Participant">
              <select className={inputClass} value={adjPid} onChange={(e) => setAdjPid(e.target.value)}>
                <option value="">Select participant…</option>
                {ledger.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name} — balance {fmt(p.currentBalance)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (+ credit / − debit)">
              <NumberInput value={adjAmount} commitOnChange onCommit={setAdjAmount} ariaLabel="Adjustment amount" />
            </Field>
            <Field label="Reason (required)">
              <input className={inputClass} value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="e.g. Penalty for late arrival" />
            </Field>
            <div className="flex justify-end">
              <Button
                variant="primary"
                disabled={!adjPid || adjAmount === 0 || !adjReason.trim()}
                onClick={() => {
                  if (run((d) => addAdjustment(d, adjPid, adjAmount, adjReason), 'Adjustment recorded')) {
                    setAdjAmount(0);
                    setAdjReason('');
                  }
                }}
              >
                Record Adjustment
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card
        title="Loan Book"
        icon={<Landmark size={18} className="text-amber-400" />}
        actions={
          <div className="flex gap-3 text-xs">
            <Badge>Issued {fmt(totals.issued)}</Badge>
            <Badge tone="rose">Outstanding {fmt(totals.outstanding)}</Badge>
            <Badge tone="emerald">Repaid {fmt(totals.repaid)}</Badge>
          </div>
        }
      >
        {borrowers.length === 0 ? (
          <p className="text-sm text-slate-500">No loans issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-2 py-2">Participant</th>
                  <th className="px-2 py-2 text-right">Total borrowed</th>
                  <th className="px-2 py-2 text-right">Repaid</th>
                  <th className="px-2 py-2 text-right">Outstanding</th>
                  <th className="px-2 py-2 text-right">Headroom</th>
                  <th className="px-2 py-2">Tranches</th>
                </tr>
              </thead>
              <tbody>
                {borrowers.map((p) => (
                  <tr key={p.id} className="border-t border-slate-800">
                    <td className="px-2 py-2">
                      {p.name} <span className="font-mono text-xs text-slate-500">{p.id}</span>
                    </td>
                    <td className="px-2 py-2 text-right">{fmt(p.totalLoansTaken)}</td>
                    <td className="px-2 py-2 text-right text-emerald-300">{fmt(p.totalLoanRepaid)}</td>
                    <td className="px-2 py-2 text-right font-semibold text-rose-300">{fmt(p.outstandingLoan)}</td>
                    <td className="px-2 py-2 text-right text-slate-400">{fmt(Math.max(0, loanSettings.maxTotalLoanPerParticipant - p.outstandingLoan))}</td>
                    <td className="px-2 py-2 text-xs text-slate-400">
                      {data.loans
                        .filter((l) => l.participantId === p.id)
                        .map((l) => `${l.amount} (pre-E${l.appliesBeforeEvent})`)
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Audit & Correction Log"
        icon={<FileClock size={18} className="text-emerald-400" />}
        actions={
          <>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
              <input className={`${inputClass} w-52 pl-8`} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <select className={`${inputClass} w-48`} value={filter} onChange={(e) => setFilter(e.target.value as AuditType | 'ALL')}>
              <option value="ALL">All entries</option>
              <option value="LOAN_ISSUED">Loans issued</option>
              <option value="ROUND_COMPLETED">Rounds completed</option>
              <option value="RESULT_CORRECTION">Result corrections</option>
              <option value="MANUAL_ADJUSTMENT">Manual adjustments</option>
            </select>
            <Button size="sm" onClick={() => downloadFile('audit-log.csv', auditCsv(data), 'text/csv')}>
              <Download size={14} /> CSV
            </Button>
          </>
        }
      >
        {audit.length === 0 ? (
          <p className="text-sm text-slate-500">No audit entries yet.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {audit.map((a) => (
              <li key={a.id} className="grid gap-1 py-3 text-sm md:grid-cols-[170px_190px_1fr]">
                <span className="text-xs text-slate-500 tabular">{new Date(a.timestamp).toLocaleString()}</span>
                <span className="flex flex-wrap items-start gap-1">
                  <Badge tone={AUDIT_TONE[a.type]}>{a.type.replace('_', ' ')}</Badge>
                  {a.eventNumber && <Badge>E{a.eventNumber}</Badge>}
                </span>
                <span>
                  <span className="font-medium text-slate-200">{a.reason}</span>
                  {a.participantId && <span className="text-slate-400"> · {names.get(a.participantId) ?? a.participantId}</span>}
                  <span className="block text-slate-400">{a.details}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
