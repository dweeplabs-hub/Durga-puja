import { useState } from 'react';
import { ChevronDown, ChevronUp, Disc3, Drum, Megaphone, Music, OctagonX, Pause, Square, Trophy } from 'lucide-react';
import { useCompetition } from '../store';
import { BGM_ID, audioEngine, formatTime, useAudioSnapshot } from '../audio/engine';
import { readLocalFlag, writeLocalFlag } from '../lib/effects';

const OPEN_KEY = 'wac:soundbar-open';

/** Compact floating DJ dock for the Event Operations view. */
export function MiniSoundbar() {
  const audio = useCompetition((s) => s.data.audio);
  const snap = useAudioSnapshot();
  const [open, setOpen] = useState(() => readLocalFlag(OPEN_KEY, true));
  const toggleOpen = () => {
    setOpen(!open);
    writeLocalFlag(OPEN_KEY, !open);
  };
  const nowPlaying = Object.entries(snap.playing).find(([id]) => id !== BGM_ID);
  const nowSlot = nowPlaying ? audio.slots.find((s) => s.id === nowPlaying[0]) : null;
  const anything = Object.keys(snap.playing).length > 0 || Object.values(snap.sfxActive).some(Boolean);

  const slotBtn = (id: string, label: string, Icon: typeof Megaphone) => {
    const slot = audio.slots.find((s) => s.id === id);
    const playing = Boolean(snap.playing[id]);
    return (
      <button
        type="button"
        onClick={() => audioEngine.toggleSlot(id)}
        title={slot?.hotkey ? `${slot.labelBn} · ${slot.labelEn} (Alt+${slot.hotkey})` : label}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
          playing ? 'bg-emerald-500 text-emerald-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
        }`}
      >
        {playing ? <Square size={13} /> : <Icon size={13} />} {label}
      </button>
    );
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-700 bg-slate-900/95 shadow-2xl shadow-black/50 backdrop-blur">
      <button type="button" onClick={toggleOpen} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Disc3 size={14} className={anything ? 'animate-spin text-emerald-400 [animation-duration:2s]' : 'text-violet-400'} />
        DJ Dock
        {!snap.unlocked && <span className="rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-300">audio locked</span>}
        {nowSlot && nowPlaying && (
          <span className="truncate normal-case tracking-normal text-emerald-300">
            ▶ {nowSlot.labelEn} {formatTime(nowPlaying[1].current)}/{formatTime(nowPlaying[1].duration)}
          </span>
        )}
        <span className="ml-auto">{open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
      </button>
      {open && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-800 px-3 py-2">
          {slotBtn('MAIN_INTRO', 'Intro', Megaphone)}
          {slotBtn('BIDDING_OPEN', 'Bidding Open', Megaphone)}
          <button
            type="button"
            onClick={() => audioEngine.playSfx('DRUMROLL')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${snap.sfxActive.DRUMROLL ? 'bg-amber-400 text-amber-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
          >
            <Drum size={13} /> {audio.sfxLabels.DRUMROLL}
          </button>
          <button
            type="button"
            onClick={() => audioEngine.playSfx('FANFARE')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${snap.sfxActive.FANFARE ? 'bg-amber-400 text-amber-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'}`}
          >
            <Trophy size={13} /> {audio.sfxLabels.FANFARE}
          </button>
          {snap.clips[BGM_ID] && (
            <button type="button" onClick={() => audioEngine.toggleBgm()} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">
              {snap.playing[BGM_ID] ? <Pause size={13} /> : <Music size={13} />} BGM
            </button>
          )}
          <button
            type="button"
            onClick={() => audioEngine.stopAll()}
            className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-500"
            title="Stop all audio (Esc)"
          >
            <OctagonX size={13} /> Stop All
          </button>
        </div>
      )}
    </div>
  );
}
