import { useRef, useState } from 'react';
import { ChevronDown, Download, FileJson, FileSpreadsheet, FlaskConical, RotateCcw, Upload, Users } from 'lucide-react';
import { useCompetition, useLedger, toast } from '../store';
import { buildDemo, competitionStarted, parseBackup, OpError } from '../lib/operations';
import { emptyCompetition } from '../lib/defaults';
import { exportCsvBundle, exportJson } from '../lib/exporters';
import { Button } from './ui';

function useDataActions() {
  const data = useCompetition((s) => s.data);
  const replaceData = useCompetition((s) => s.replaceData);
  const ledger = useLedger();
  const hasData = data.participants.length > 0 || competitionStarted(data);

  const guard = (message: string) => !hasData || window.confirm(`${message}\n\nTip: export a JSON backup first. Continue?`);

  return {
    exportJson: () => exportJson(data),
    exportCsv: () => exportCsvBundle(data, ledger),
    importJson: async (file: File) => {
      try {
        const parsed = parseBackup(JSON.parse(await file.text()));
        if (!guard('Importing will replace ALL current event data.')) return;
        replaceData(parsed);
        toast.success(`Backup restored: ${parsed.participants.length} participants, event ${parsed.currentEventNumber}`);
      } catch (e) {
        toast.error(e instanceof OpError ? e.message : `Could not read backup: ${(e as Error).message}`);
      }
    },
    loadDemo: (rounds: number) => {
      if (!guard('Loading demo data will replace ALL current event data.')) return;
      replaceData(buildDemo(rounds));
      toast.success(rounds ? `Demo loaded with ${rounds} simulated rounds` : 'Demo loaded: 12 participants ready for Event 1');
    },
    resetResults: () => {
      if (!window.confirm('Reset all results, loans and audit history but keep the participant roster and rules?')) return;
      const fresh = emptyCompetition(data.settings);
      replaceData({ ...fresh, participants: data.participants.map((p) => ({ ...p, tieBreakOrder: 0 })), showLoanColumnsPublic: data.showLoanColumnsPublic });
      toast.info('Results reset — roster kept');
    },
    resetAll: () => {
      if (!window.confirm('Erase EVERYTHING (participants, rules, results, audit log) and start from a clean slate?')) return;
      replaceData(emptyCompetition());
      toast.info('Clean slate ready');
    },
  };
}

/** Backup / import / demo / reset controls, rendered as a dropdown (top bar) or a panel (settings tab). */
export function DataTools({ layout }: { layout: 'menu' | 'panel' }) {
  const actions = useDataActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<null | 'export' | 'demo'>(null);

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".json,application/json"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void actions.importJson(f);
        e.target.value = '';
      }}
    />
  );

  if (layout === 'panel') {
    return (
      <div className="space-y-4">
        {fileInput}
        <div className="flex flex-wrap gap-2">
          <Button onClick={actions.exportJson}>
            <FileJson size={16} /> Export JSON backup
          </Button>
          <Button onClick={actions.exportCsv}>
            <FileSpreadsheet size={16} /> Export CSV (leaderboard, ledger, audit)
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Restore JSON backup
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => actions.loadDemo(0)}>
            <Users size={16} /> Load demo (12 participants)
          </Button>
          <Button onClick={() => actions.loadDemo(3)}>
            <FlaskConical size={16} /> Demo + 3 simulated rounds
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          <Button variant="ghost" onClick={actions.resetResults}>
            <RotateCcw size={16} /> Reset results (keep roster)
          </Button>
          <Button variant="danger" onClick={actions.resetAll}>
            Clean slate
          </Button>
        </div>
        <p className="text-xs text-slate-500">All changes are saved automatically in this browser (localStorage) and synced live to any open projector window.</p>
      </div>
    );
  }

  const item = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-800';
  return (
    <div className="flex gap-2">
      {fileInput}
      <div className="relative">
        <Button size="sm" onClick={() => setOpen(open === 'export' ? null : 'export')}>
          <Download size={14} /> Export / Backup <ChevronDown size={14} />
        </Button>
        {open === 'export' && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(null)} />
            <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
              <button type="button" className={item} onClick={() => (actions.exportJson(), setOpen(null))}>
                <FileJson size={16} /> Download JSON backup
              </button>
              <button type="button" className={item} onClick={() => (actions.exportCsv(), setOpen(null))}>
                <FileSpreadsheet size={16} /> Download CSV files
              </button>
              <button type="button" className={item} onClick={() => (fileRef.current?.click(), setOpen(null))}>
                <Upload size={16} /> Restore from JSON…
              </button>
            </div>
          </>
        )}
      </div>
      <div className="relative">
        <Button size="sm" onClick={() => setOpen(open === 'demo' ? null : 'demo')}>
          <FlaskConical size={14} /> Load Demo Data <ChevronDown size={14} />
        </Button>
        {open === 'demo' && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(null)} />
            <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
              <button type="button" className={item} onClick={() => (actions.loadDemo(0), setOpen(null))}>
                <Users size={16} /> 12 participants, ready for Event 1
              </button>
              <button type="button" className={item} onClick={() => (actions.loadDemo(3), setOpen(null))}>
                <FlaskConical size={16} /> 12 participants + 3 simulated rounds
              </button>
              <div className="my-1 border-t border-slate-800" />
              <button type="button" className={`${item} text-amber-300`} onClick={() => (actions.resetResults(), setOpen(null))}>
                <RotateCcw size={16} /> Reset results (keep roster)
              </button>
              <button type="button" className={`${item} text-rose-300`} onClick={() => (actions.resetAll(), setOpen(null))}>
                <RotateCcw size={16} /> Clean slate
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
