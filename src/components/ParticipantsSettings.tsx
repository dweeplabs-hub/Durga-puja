import { useRef, useState } from 'react';
import { Database, Languages, Lock, Settings2, Sparkles, Trash2, Unlock, Upload, UserPlus, Users } from 'lucide-react';
import type { Branding, Settings } from '../types';
import { defaultBranding } from '../lib/defaults';
import { useCompetition, useLedger, toast } from '../store';
import {
  addParticipant,
  competitionStarted,
  importRoster,
  lockRules,
  removeParticipant,
  setProjectorLanguage,
  updateBranding,
  settingsLocked,
  unlockRules,
  updateParticipant,
  updateSettings,
} from '../lib/operations';
import { parseRosterCsv } from '../lib/exporters';
import { Badge, Button, Card, Field, MultiplierBadge, NumberInput, Toggle, inputClass, fmt } from './ui';
import { DataTools } from './DataTools';

export function ParticipantsSettings() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <ParticipantsCard />
      <div className="space-y-6">
        <BrandingCard />
        <SettingsCard />
        <Card title="Data & Backups" icon={<Database size={18} className="text-emerald-400" />}>
          <DataTools layout="panel" />
        </Card>
      </div>
    </div>
  );
}

function ParticipantsCard() {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const ledger = useLedger();
  const [name, setName] = useState('');
  const [bal, setBal] = useState<number>(data.settings.startingBalance);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = competitionStarted(data);

  const add = () => {
    if (run((d) => addParticipant(d, name, bal), `${name.trim()} registered`)) setName('');
  };

  const onRoster = async (file: File) => {
    const rows = parseRosterCsv(await file.text());
    if (!rows.length) return toast.error('No names found in the CSV');
    let added = 0;
    let skipped = 0;
    run((d) => {
      const r = importRoster(d, rows);
      added = r.added;
      skipped = r.skipped;
      return r.data;
    });
    toast.success(`Imported ${added} participant(s)${skipped ? `, skipped ${skipped} duplicate/invalid` : ''}`);
  };

  return (
    <Card
      title={`Participants (${data.participants.length})`}
      icon={<Users size={18} className="text-violet-400" />}
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onRoster(f);
              e.target.value = '';
            }}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()} title="CSV with a 'Name' column and optional 'Starting Koris' column">
            <Upload size={14} /> Import roster CSV
          </Button>
        </>
      }
    >
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div className="min-w-48 flex-1">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Participant name" />
          </Field>
        </div>
        <div className="w-32">
          <Field label="Starting Koris">
            <NumberInput value={bal} min={0} commitOnChange onCommit={setBal} ariaLabel="Starting Koris" />
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          <UserPlus size={16} /> Add
        </Button>
      </form>
      {started && <p className="mb-3 text-xs text-slate-500">The competition has started: late entrants can still be added (they join from the active event), and names remain editable.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr>
              <th className="px-2 py-2">ID</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Start</th>
              <th className="px-2 py-2 text-right">Current Koris</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {ledger.participants.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="px-2 py-1.5 font-mono text-xs text-slate-500">{p.id}</td>
                <td className="px-2 py-1.5">
                  <NameInput value={p.name} onCommit={(v) => run((d) => updateParticipant(d, p.id, { name: v }))} />
                </td>
                <td className="w-28 px-2 py-1.5">
                  <NumberInput value={p.startingBalance} min={0} disabled={started} ariaLabel={`Starting Koris for ${p.name}`} onCommit={(n) => run((d) => updateParticipant(d, p.id, { startingBalance: n }))} />
                </td>
                <td className="px-2 py-1.5 text-right tabular">{fmt(p.currentBalance)}</td>
                <td className="px-2 py-1.5 text-right">
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => {
                      if (window.confirm(`Remove ${p.name}?`)) run((d) => removeParticipant(d, p.id), `${p.name} removed`);
                    }}
                  >
                    <Trash2 size={14} className="text-rose-400" />
                  </Button>
                </td>
              </tr>
            ))}
            {data.participants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-8 text-center text-slate-500">
                  No participants yet — add them above or import a CSV roster.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    setText(value);
  }
  return (
    <input
      className={`${inputClass} py-1`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text !== value ? onCommit(text) : undefined)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function SettingsCard() {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const locked = settingsLocked(data);
  const started = competitionStarted(data);
  const [draft, setDraft] = useState<Settings>(data.settings);
  const [lastSaved, setLastSaved] = useState(data.settings);
  if (data.settings !== lastSaved) {
    setLastSaved(data.settings);
    setDraft(data.settings);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setLoan = <K extends keyof Settings['loanSettings']>(k: K, v: Settings['loanSettings'][K]) => setDraft((d) => ({ ...d, loanSettings: { ...d.loanSettings, [k]: v } }));
  const num = (label: string, value: number, on: (n: number) => void, hint?: string, step = 1) => (
    <Field label={label} hint={hint}>
      <NumberInput value={value} min={0} step={step} disabled={locked} commitOnChange onCommit={on} ariaLabel={label} />
    </Field>
  );

  return (
    <Card
      title="Competition Rules"
      icon={<Settings2 size={18} className="text-amber-400" />}
      actions={
        locked ? (
          <>
            <Badge tone="amber">
              <Lock size={12} /> Locked
            </Badge>
            {!started && (
              <Button size="sm" variant="ghost" onClick={() => run(unlockRules, 'Rules unlocked')}>
                <Unlock size={14} /> Unlock
              </Button>
            )}
          </>
        ) : (
          <Button size="sm" variant="warning" disabled={dirty} title={dirty ? 'Save changes first' : undefined} onClick={() => run(lockRules, 'Rules locked')}>
            <Lock size={14} /> Lock Rules
          </Button>
        )
      }
    >
      {locked && <p className="mb-4 text-xs text-amber-200/80">{started ? 'Rules lock automatically once bidding opens for Event 1 or a Kori Loan is issued.' : 'Unlock to edit.'}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {num('Total events', draft.totalEvents, (n) => set('totalEvents', n))}
        {num('Starting Koris', draft.startingBalance, (n) => set('startingBalance', n), 'খেলার কড়ি — Koris (কড়ি) each participant starts with')}
        {num('Min Kori Stake per event', draft.minStakePerEvent, (n) => set('minStakePerEvent', n))}
        {num('Max Kori Stake per event', draft.maxStakePerEvent, (n) => set('maxStakePerEvent', n), 'Prevents all-in elimination')}
      </div>

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400">Payout multipliers (total returned incl. stake)</p>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field label="Multiplier buttons" hint="Comma-separated, e.g. 6, 5, 4, 3, 2, 1. Points for tie-breaker #3 equal the multiplier awarded.">
          <TiersInput value={draft.payoutTiers} disabled={locked} onChange={(t) => set('payoutTiers', t)} />
        </Field>
        {num('No award ×', draft.othersMultiplier, (n) => set('othersMultiplier', n), '0 = stake is lost', 0.5)}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {[...draft.payoutTiers].sort((a, b) => b - a).map((m) => (
          <MultiplierBadge key={m} m={m} tiers={draft.payoutTiers} />
        ))}
      </div>

      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-slate-400">Loans</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kori Loan tranche (কড়ি ধার)">
          <div className="flex gap-2">
            {[20, 50].map((v) => (
              <Button key={v} size="sm" disabled={locked} variant={draft.loanSettings.fixedLoanTranche === v ? 'primary' : 'secondary'} onClick={() => setLoan('fixedLoanTranche', v)}>
                {v}
              </Button>
            ))}
            <NumberInput value={draft.loanSettings.fixedLoanTranche} min={1} disabled={locked} commitOnChange onCommit={(n) => setLoan('fixedLoanTranche', n)} ariaLabel="Loan tranche" />
          </div>
        </Field>
        {num('Max outstanding Kori Loan / participant', draft.loanSettings.maxTotalLoanPerParticipant, (n) => setLoan('maxTotalLoanPerParticipant', n))}
        {num('Repayment rate (% of gross reward)', draft.loanSettings.repaymentRatePercent, (n) => setLoan('repaymentRatePercent', n), 'e.g. 2 → a 100-kori reward repays 2 and credits 98', 0.5)}
        <Field label="Kori precision">
          <select
            className={inputClass}
            disabled={locked}
            value={draft.loanSettings.repaymentPrecision}
            onChange={(e) => setLoan('repaymentPrecision', e.target.value as Settings['loanSettings']['repaymentPrecision'])}
          >
            <option value="INTEGER">Whole koris (round repayment down)</option>
            <option value="DECIMAL2">2 decimals (exact)</option>
          </select>
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <Toggle
            disabled={locked || draft.loanSettings.repaymentPrecision !== 'INTEGER'}
            checked={draft.loanSettings.minimumOneKoriDeduction}
            onChange={(v) => setLoan('minimumOneKoriDeduction', v)}
            label="Deduct at least 1 kori when a borrower wins anything (whole-kori mode)"
          />
          <Toggle
            disabled={locked}
            checked={draft.loanSettings.deductUnpaidLoanAtFinale}
            onChange={(v) => setLoan('deductUnpaidLoanAtFinale', v)}
            label="Deduct unpaid Kori Loan from final koris when scores are frozen"
          />
        </div>
        {num('Default bidding window (seconds)', draft.defaultBiddingSeconds, (n) => set('defaultBiddingSeconds', n), undefined, 15)}
      </div>

      {!locked && (
        <div className="mt-6 flex justify-end gap-2 border-t border-slate-800 pt-4">
          <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(data.settings)}>
            Discard
          </Button>
          <Button variant="primary" disabled={!dirty} onClick={() => run((d) => updateSettings(d, draft), 'Settings saved')}>
            Save Settings
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Event title & subtitle — editable at any time, even after the rules lock. */
function BrandingCard() {
  const branding = useCompetition((s) => s.data.branding);
  const lang = useCompetition((s) => s.data.projectorLanguage);
  const run = useCompetition((s) => s.run);
  const [draft, setDraft] = useState<Branding>(branding);
  const [last, setLast] = useState(branding);
  if (branding !== last) {
    setLast(branding);
    setDraft(branding);
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(branding);
  return (
    <Card
      title="Event Branding"
      icon={<Sparkles size={18} className="text-fuchsia-400" />}
      actions={
        <div className="flex items-center gap-2 text-xs">
          <Languages size={14} className="text-slate-400" />
          <select className={`${inputClass} w-44 py-1 text-xs`} value={lang} onChange={(e) => run((d) => setProjectorLanguage(d, e.target.value as typeof lang))} aria-label="Projector labels">
            <option value="BILINGUAL">Projector: বাংলা + English</option>
            <option value="ENGLISH">Projector: English only</option>
          </select>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title (বাংলা)">
          <input className={`${inputClass} font-bengali`} value={draft.titleBn} onChange={(e) => setDraft({ ...draft, titleBn: e.target.value })} />
        </Field>
        <Field label="Title (English)">
          <input className={inputClass} value={draft.titleEn} onChange={(e) => setDraft({ ...draft, titleEn: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Subtitle">
            <input className={inputClass} value={draft.subtitle} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDraft(defaultBranding())}>
          Restore official branding
        </Button>
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => run((d) => updateBranding(d, draft), 'Branding updated')}>
          Save
        </Button>
      </div>
    </Card>
  );
}

/** Comma-separated list of payout multipliers; parsed when the field loses focus. */
function TiersInput({ value, onChange, disabled }: { value: number[]; onChange: (t: number[]) => void; disabled?: boolean }) {
  const shown = value.join(', ');
  const [text, setText] = useState(shown);
  const [last, setLast] = useState(shown);
  if (shown !== last) {
    setLast(shown);
    setText(shown);
  }
  return (
    <input
      className={`${inputClass} tabular`}
      value={text}
      disabled={disabled}
      aria-label="Payout multipliers"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const parsed = text
          .split(/[\s,]+/)
          .map((x) => Number(x.replace(/x$/i, '')))
          .filter((n) => Number.isFinite(n) && n > 0);
        const unique = [...new Set(parsed)].sort((a, b) => b - a);
        if (unique.length) onChange(unique);
        else setText(shown);
      }}
    />
  );
}
