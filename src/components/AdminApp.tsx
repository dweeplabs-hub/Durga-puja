import { useEffect, useState } from 'react';
import { CalendarCheck, Disc3, Gavel, Languages, ListOrdered, Landmark, MonitorPlay, Presentation, Users } from 'lucide-react';
import { useCompetition } from '../store';
import { EventOperations } from './EventOperations';
import { LeaderboardView } from './LeaderboardView';
import { LoanDesk } from './LoanDesk';
import { ParticipantsSettings } from './ParticipantsSettings';
import { ProjectorView } from './ProjectorView';
import { DataTools } from './DataTools';
import { KoriIcon } from './Kori';
import { SoundboardView } from './Soundboard';
import { MiniSoundbar } from './MiniSoundbar';
import { useAudioEngine, useAudioHotkeys, useCountdownCues } from '../audio/cues';
import { brandTitle } from '../lib/branding';
import { setProjectorLanguage } from '../lib/operations';
import { Button, STATUS_LABEL } from './ui';

type Tab = 'operations' | 'leaderboard' | 'loans' | 'dj' | 'setup';
const TABS: { id: Tab; label: string; icon: typeof Gavel }[] = [
  { id: 'operations', label: 'Event Operations', icon: Gavel },
  { id: 'leaderboard', label: 'Leaderboard & Master Table', icon: ListOrdered },
  { id: 'loans', label: 'Kori Loan Desk & Audit Log', icon: Landmark },
  { id: 'dj', label: 'DJ & Soundboard', icon: Disc3 },
  { id: 'setup', label: 'Participants & Settings', icon: Users },
];
const TAB_KEY = 'wac:admin-tab';

function initialTab(): Tab {
  try {
    const t = sessionStorage.getItem(TAB_KEY) as Tab | null;
    if (t && TABS.some((x) => x.id === t)) return t;
  } catch {
    /* ignore */
  }
  return 'operations';
}

export function AdminApp() {
  const data = useCompetition((s) => s.data);
  const run = useCompetition((s) => s.run);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selected, setSelected] = useState(data.currentEventNumber);
  const [presenting, setPresenting] = useState(false);

  // Follow the active event when it advances (including from another admin tab).
  const [lastCurrent, setLastCurrent] = useState(data.currentEventNumber);
  if (data.currentEventNumber !== lastCurrent) {
    setLastCurrent(data.currentEventNumber);
    setSelected(data.currentEventNumber);
  }
  if (selected > data.settings.totalEvents) setSelected(data.settings.totalEvents);

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_KEY, tab);
    } catch {
      /* ignore */
    }
  }, [tab]);

  useEffect(() => {
    document.title = `${brandTitle(data.branding)} — Control Center`;
  }, [data.branding]);

  // Audio lives in the admin window only (the projector never plays sound).
  useAudioEngine();
  useAudioHotkeys();
  useCountdownCues();

  const current = data.events.find((e) => e.eventNumber === data.currentEventNumber) ?? data.events[0];

  const launchProjector = () => {
    const url = `${window.location.pathname}${window.location.search}#/projector`;
    const w = window.open(url, 'wac-projector', 'popup,width=1600,height=900');
    if (!w) setPresenting(true);
    else w.focus();
  };

  if (presenting) {
    return (
      <div className="fixed inset-0 z-40 overflow-auto">
        <ProjectorView onClose={() => setPresenting(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="festive-strip" aria-hidden />
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-800 to-fuchsia-600 shadow-lg ring-1 ring-amber-400/40">
              <KoriIcon size={24} filled className="text-amber-950" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight">
                {data.branding.titleBn && <span className="font-bengali">{data.branding.titleBn}</span>}
                {data.branding.titleBn && data.branding.titleEn ? ' ' : ''}
                {data.branding.titleEn && <span className={data.branding.titleBn ? 'text-slate-300' : ''}>{data.branding.titleBn ? `(${data.branding.titleEn})` : data.branding.titleEn}</span>}
              </h1>
              <p className="text-xs text-slate-400">{data.branding.subtitle || 'Admin Control Center'}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setTab('operations');
              setSelected(data.currentEventNumber);
            }}
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold ${
              data.scoresFrozen
                ? 'border-amber-400/50 bg-amber-400/10 text-amber-200'
                : current.status === 'BIDDING_OPEN'
                  ? 'border-amber-400/50 bg-amber-400/10 text-amber-200'
                  : current.status === 'IN_PROGRESS'
                    ? 'border-sky-400/50 bg-sky-400/10 text-sky-200'
                    : current.status === 'COMPLETED'
                      ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                      : 'border-slate-700 bg-slate-900 text-slate-300'
            }`}
          >
            <CalendarCheck size={16} />
            {data.scoresFrozen ? 'Final standings — champions crowned' : `Event ${current.eventNumber} of ${data.settings.totalEvents}: ${STATUS_LABEL[current.status]}`}
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => run((d) => setProjectorLanguage(d, d.projectorLanguage === 'BILINGUAL' ? 'ENGLISH' : 'BILINGUAL'))}
              title="Projector labels"
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs font-semibold"
            >
              <Languages size={14} className="mx-1 text-slate-400" />
              <span className={`rounded-md px-2 py-1 ${data.projectorLanguage === 'BILINGUAL' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>বাংলা + EN</span>
              <span className={`rounded-md px-2 py-1 ${data.projectorLanguage === 'ENGLISH' ? 'bg-violet-600 text-white' : 'text-slate-400'}`}>EN</span>
            </button>
            <Button size="sm" variant="primary" onClick={launchProjector}>
              <MonitorPlay size={14} /> Launch Projector View
            </Button>
            <Button size="sm" variant="ghost" title="Present full-screen in this tab" onClick={() => setPresenting(true)}>
              <Presentation size={14} />
            </Button>
            <DataTools layout="menu" />
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 lg:px-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.id ? 'border-violet-500 text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon size={16} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-6 lg:px-6">
        {tab === 'operations' && (
          <>
            <EventOperations selected={selected} onSelect={setSelected} />
            <MiniSoundbar />
          </>
        )}
        {tab === 'leaderboard' && <LeaderboardView />}
        {tab === 'loans' && <LoanDesk />}
        {tab === 'dj' && <SoundboardView />}
        {tab === 'setup' && <ParticipantsSettings />}
      </main>
    </div>
  );
}
