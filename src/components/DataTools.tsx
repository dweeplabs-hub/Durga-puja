import { useRef, useState } from 'react';
import { ChevronDown, Download, FileJson, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { useCompetition, useLedger, toast } from '../store';
import { competitionStarted, parseBackup, OpError } from '../lib/operations';
import { emptyCompetition } from '../lib/defaults';
import { exportCsvBundle, exportJson } from '../lib/exporters';
import { Button } from './ui';

function useDataActions() {
  const data = useCompetition((s) => s.data);
  const replaceData = useCompetition((s) => s.replaceData);
  const ledger = useLedger();
  const hasData = data.participants.length > 0 || competitionStarted(data);

  // The DJ setup and branding survive resets: uploaded MP3s live in IndexedDB regardless.
  const keep = { audio: data.audio, branding: data.branding, projectorLanguage: data.projectorLanguage };

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
    resetResults: () => {
      if (!window.confirm('Reset all results, loans and audit history but keep the participant roster and rules?')) return;
      const fresh = emptyCompetition(data.settings);
      replaceData({ ...fresh, ...keep, participants: data.participants.map((p) => ({ ...p, tieBreakOrder: 0 })), showLoanColumnsPublic: data.showLoanColumnsPublic });
      toast.info('Results reset — roster kept');
    },
    resetAll: () => {
      if (!window.confirm('Erase participants, rules, results and the audit log and start from a clean slate? (Branding and the DJ soundboard are kept.)')) return;
      replaceData({ ...emptyCompetition(), ...keep });
      toast.info('Clean slate ready');
    },
  };
}

/** Backup / import / reset controls: backup dropdown in the top bar, full panel (incl. resets) in the settings tab. */
export function DataTools({ layout }: { layout: 'menu' | 'panel' }) {
  const actions = useDataActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<null | 'export'>(null);

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
    </div>
  );
}
