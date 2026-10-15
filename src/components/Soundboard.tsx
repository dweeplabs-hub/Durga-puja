import { useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Disc3,
  Drum,
  FileAudio,
  Megaphone,
  Music,
  OctagonX,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Trophy,
  Upload,
  Volume2,
  Coins,
} from 'lucide-react';
import type { AudioMode, AudioSlotConfig, SfxId } from '../types';
import { useCompetition, toast } from '../store';
import { BGM_ID, audioEngine, formatTime, useAudioSnapshot, type AudioSnapshot } from '../audio/engine';
import { VOICE_SCRIPTS, isVoiceSlotId } from '../audio/scripts';
import { SFX_IDS } from '../audio/synth';
import { VOICE_SLOT_DEFS } from '../lib/defaults';
import { addCustomAudioSlot, removeCustomAudioSlot, updateAudio, updateAudioSlot } from '../lib/operations';
import { Badge, Button, Card, Field, Toggle, inputClass } from './ui';

// ---------------------------------------------------------------- shared bits

export const SFX_ICON: Record<SfxId, typeof Coins> = { COIN: Coins, TICK: Timer, AIRHORN: Megaphone, DRUMROLL: Drum, FANFARE: Trophy };

/** Range slider that previews live and commits to the store when released. */
export function VolumeSlider({ label, value, onCommit, onPreview, icon }: { label: string; value: number; onCommit: (v: number) => void; onPreview?: (v: number) => void; icon?: ReactNode }) {
  const [local, setLocal] = useState<number | null>(null);
  const shown = local ?? value;
  const commit = () => {
    if (local !== null && local !== value) onCommit(local);
    setLocal(null);
  };
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="tabular text-slate-300">{Math.round(shown * 100)}%</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(shown * 100)}
        aria-label={label}
        className="w-full accent-violet-500"
        onChange={(e) => {
          const v = Number(e.target.value) / 100;
          setLocal(v);
          onPreview?.(v);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

function Waveform({ active }: { active: boolean }) {
  return (
    <span className="flex h-5 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-1 rounded-full ${active ? 'animate-eq bg-emerald-400' : 'bg-slate-700'}`}
          style={{ height: active ? undefined : `${30 + ((i * 37) % 50)}%`, animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </span>
  );
}

/** Drag-and-drop / file-picker target that stores the file in IndexedDB for a slot. */
function ClipDropZone({ slotId, label, compact = false }: { slotId: string; label: string; compact?: boolean }) {
  const snap = useAudioSnapshot();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const clip = snap.clips[slotId];

  const save = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await audioEngine.saveFile(slotId, file);
      toast.success(`${label}: “${file.name}” saved to this browser`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void save(e.dataTransfer.files[0]);
      }}
      className={`flex items-center gap-2 rounded-lg border border-dashed px-3 ${compact ? 'py-1.5' : 'py-2.5'} text-xs transition-colors ${
        over ? 'border-violet-400 bg-violet-500/10' : 'border-slate-700 bg-slate-950/60'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          void save(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <FileAudio size={16} className={clip ? 'text-emerald-400' : 'text-slate-500'} />
      <span className="min-w-0 flex-1 truncate text-slate-400" title={clip?.name}>
        {busy ? 'Saving…' : clip ? `${clip.name} · ${(clip.size / 1024 / 1024).toFixed(1)} MB` : 'Drop an MP3/WAV/OGG here'}
      </span>
      <Button size="xs" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload size={12} /> {clip ? 'Replace' : 'Upload'}
      </Button>
      {clip && (
        <Button
          size="xs"
          variant="ghost"
          aria-label={`Delete file for ${label}`}
          onClick={() => {
            void audioEngine.removeFile(slotId).then(
              () => toast.info(`${label}: file removed`),
              (err: Error) => toast.error(err.message),
            );
          }}
        >
          <Trash2 size={12} className="text-rose-400" />
        </Button>
      )}
    </div>
  );
}

/** Progress scrubber + "01:18 / 01:24" counter for a stored clip. */
function Scrubber({ slotId, snap }: { slotId: string; snap: AudioSnapshot }) {
  const clip = snap.clips[slotId];
  const play = snap.playing[slotId];
  const duration = play?.duration || clip?.duration || 0;
  const current = play ? play.current : audioEngine.position(slotId);
  if (!clip) return null;
  return (
    <div>
      <input
        type="range"
        min={0}
        max={Math.max(duration, 0.1)}
        step={0.1}
        value={Math.min(current, duration || 0)}
        aria-label="Seek"
        className="w-full accent-emerald-500"
        onChange={(e) => audioEngine.seek(slotId, Number(e.target.value))}
      />
      <div className="flex justify-between text-xs text-slate-400 tabular">
        <span>
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <span>−{formatTime(Math.max(0, duration - current))}</span>
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  return (
    <Button
      size="xs"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => toast.success('Script copied — paste it into ElevenLabs'),
          () => toast.error('Clipboard blocked — select the text and copy manually'),
        );
      }}
    >
      <Copy size={12} /> Copy
    </Button>
  );
}

// ---------------------------------------------------------------- voice slot card

const MODE_LABEL: Record<AudioMode, string> = {
  MP3: 'Uploaded MP3',
  SYNTH: 'Built-in Synth SFX',
  BOTH: 'Both (SFX + voice)',
  MUTED: 'Muted',
};

function VoiceSlotCard({ slot }: { slot: AudioSlotConfig }) {
  const run = useCompetition((s) => s.run);
  const snap = useAudioSnapshot();
  const [editing, setEditing] = useState(false);
  const builtIn = isVoiceSlotId(slot.id);
  const def = VOICE_SLOT_DEFS.find((d) => d.id === slot.id);
  const manualOnly = slot.id === 'MAIN_INTRO' || slot.custom;
  const hasFile = Boolean(snap.clips[slot.id]);
  const playing = Boolean(snap.playing[slot.id]);
  const script = builtIn ? VOICE_SCRIPTS[slot.id as keyof typeof VOICE_SCRIPTS] : null;
  const patch = (p: Partial<AudioSlotConfig>) => run((d) => updateAudioSlot(d, slot.id, p));

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border p-4 transition-colors ${playing ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {slot.hotkey && <kbd className="rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">Alt+{slot.hotkey}</kbd>}
            {hasFile ? <Badge tone="emerald">MP3 Loaded</Badge> : builtIn ? <Badge tone="amber">Using Synth Fallback</Badge> : <Badge>No file</Badge>}
          </div>
          {editing ? (
            <div className="mt-2 grid gap-2">
              <input className={inputClass} defaultValue={slot.labelBn} placeholder="বাংলা নাম" onBlur={(e) => e.target.value !== slot.labelBn && patch({ labelBn: e.target.value })} />
              <input className={inputClass} defaultValue={slot.labelEn} placeholder="English name" onBlur={(e) => e.target.value !== slot.labelEn && patch({ labelEn: e.target.value })} />
              <select className={inputClass} value={slot.hotkey ?? ''} onChange={(e) => patch({ hotkey: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No hotkey</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>
                    Alt+{n}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <h3 className="mt-1.5 text-lg font-bold leading-tight">{slot.labelBn || slot.labelEn}</h3>
              {slot.labelBn && <p className="text-sm text-slate-400">{slot.labelEn}</p>}
            </>
          )}
          {builtIn && <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-600">{slot.id}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Waveform active={playing} />
          <Button size="xs" variant="ghost" aria-label="Edit names and hotkey" onClick={() => setEditing(!editing)}>
            <Pencil size={12} />
          </Button>
          {slot.custom && (
            <Button
              size="xs"
              variant="ghost"
              aria-label="Remove pad"
              onClick={() => {
                if (!window.confirm(`Remove the “${slot.labelEn || slot.labelBn}” pad and its file?`)) return;
                void audioEngine.removeFile(slot.id).finally(() => run((d) => removeCustomAudioSlot(d, slot.id), 'Pad removed'));
              }}
            >
              <Trash2 size={12} className="text-rose-400" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant={playing ? 'danger' : 'success'}
          size="lg"
          className="w-28 shrink-0"
          disabled={!hasFile && !builtIn}
          onClick={() => audioEngine.toggleSlot(slot.id)}
        >
          {playing ? <Square size={18} /> : <Play size={18} />} {playing ? 'Stop' : 'Play'}
        </Button>
        <div className="min-w-0 flex-1">
          {hasFile ? <Scrubber slotId={slot.id} snap={snap} /> : <p className="text-xs text-slate-500">{builtIn ? 'Plays the built-in synth effect until an MP3 is uploaded.' : 'Upload a file to use this pad.'}</p>}
        </div>
      </div>

      <ClipDropZone slotId={slot.id} label={slot.labelEn || slot.labelBn} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col items-start gap-2">
          <Toggle
            checked={slot.autoTrigger && !manualOnly}
            disabled={manualOnly}
            onChange={(v) => patch({ autoTrigger: v })}
            label={manualOnly ? 'Manual trigger only' : 'Auto-play on step transition'}
          />
          <Toggle checked={slot.loop} onChange={(v) => patch({ loop: v })} label={<span className="inline-flex items-center gap-1"><Repeat size={12} /> Loop</span>} />
        </div>
        <div className="space-y-2">
          {!manualOnly && (
            <select className={`${inputClass} py-1.5 text-xs`} value={slot.mode} aria-label="Auto-trigger plays" onChange={(e) => patch({ mode: e.target.value as AudioMode })}>
              {(Object.keys(MODE_LABEL) as AudioMode[]).map((m) => (
                <option key={m} value={m}>
                  On trigger: {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          )}
          <VolumeSlider label="Clip volume" value={slot.volume} onCommit={(v) => patch({ volume: v })} />
        </div>
      </div>
      {def && <p className="text-xs text-slate-500">Trigger: {def.trigger}</p>}

      <details className="group rounded-lg border border-slate-800 bg-slate-950/60">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium text-slate-300">
          View Bengali Script
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-slate-800 p-3">
          {script ? (
            <>
              <p className="text-xs text-slate-500">{script.direction}</p>
              <p className="font-bengali whitespace-pre-line text-sm leading-relaxed text-slate-200">{script.text}</p>
              <CopyButton text={script.text} />
            </>
          ) : (
            <>
              <textarea
                className={`${inputClass} font-bengali min-h-24`}
                defaultValue={slot.script}
                placeholder="এখানে বাংলা স্ক্রিপ্ট লিখুন…"
                onBlur={(e) => e.target.value !== slot.script && patch({ script: e.target.value })}
              />
              {slot.script && <CopyButton text={slot.script} />}
            </>
          )}
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- tab

export function AudioUnlockBanner() {
  const snap = useAudioSnapshot();
  if (snap.unlocked && !snap.error) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      <AlertTriangle size={16} />
      <span className="flex-1">{snap.error ?? 'Browsers keep sound off until you interact with the page. Click below once before the show starts.'}</span>
      {!snap.unlocked && (
        <Button size="sm" variant="warning" onClick={() => audioEngine.unlock()}>
          <Volume2 size={14} /> Enable audio
        </Button>
      )}
    </div>
  );
}

export function SoundboardView() {
  const audio = useCompetition((s) => s.data.audio);
  const run = useCompetition((s) => s.run);
  const snap = useAudioSnapshot();
  const [newEn, setNewEn] = useState('');
  const [newBn, setNewBn] = useState('');
  const [renaming, setRenaming] = useState(false);
  const preview = (patch: Partial<typeof audio>) => audioEngine.setConfig({ ...audio, ...patch });
  const bgmClip = snap.clips[BGM_ID];
  const bgmPlaying = Boolean(snap.playing[BGM_ID]);

  return (
    <div className="space-y-6">
      <AudioUnlockBanner />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Card title="Master Audio Controls" icon={<Disc3 size={18} className="text-violet-400" />}>
          <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <VolumeSlider label="Master volume" icon={<Volume2 size={12} />} value={audio.masterVolume} onPreview={(v) => preview({ masterVolume: v })} onCommit={(v) => run((d) => updateAudio(d, { masterVolume: v }))} />
              <VolumeSlider label="Background music" icon={<Music size={12} />} value={audio.bgmVolume} onPreview={(v) => preview({ bgmVolume: v })} onCommit={(v) => run((d) => updateAudio(d, { bgmVolume: v }))} />
              <VolumeSlider label="Sound effects" icon={<Sparkles size={12} />} value={audio.sfxVolume} onPreview={(v) => preview({ sfxVolume: v })} onCommit={(v) => run((d) => updateAudio(d, { sfxVolume: v }))} />
              <div className="grid gap-2 pt-1 sm:grid-cols-2">
                <Toggle checked={audio.autoTriggerMaster} onChange={(v) => run((d) => updateAudio(d, { autoTriggerMaster: v }))} label="Auto-Trigger on Event Steps" />
                <Toggle checked={audio.duckingEnabled} onChange={(v) => run((d) => updateAudio(d, { duckingEnabled: v }))} label="Auto-duck BGM under voice" />
                <Toggle checked={audio.countdownTicks} onChange={(v) => run((d) => updateAudio(d, { countdownTicks: v }))} label="Countdown ticks 00:10 → 00:01" />
              </div>
            </div>
            <button
              type="button"
              onClick={() => audioEngine.stopAll()}
              className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-rose-400 bg-rose-600 px-6 py-4 text-center font-black uppercase tracking-wide text-white shadow-lg shadow-rose-900/50 transition hover:bg-rose-500 active:scale-95 sm:w-44"
            >
              <OctagonX size={40} />
              Panic Stop All Audio
              <span className="text-xs font-semibold opacity-80">(Esc)</span>
            </button>
          </div>
        </Card>

        <Card
          title="Background Music Deck"
          icon={<Music size={18} className="text-sky-400" />}
          actions={snap.ducked && bgmPlaying ? <Badge tone="sky">Ducked to 15% under voice</Badge> : bgmPlaying ? <Badge tone="emerald">Playing</Badge> : null}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant={bgmPlaying ? 'secondary' : 'success'} size="lg" className="w-32" disabled={!bgmClip} onClick={() => audioEngine.toggleBgm()}>
                {bgmPlaying ? <Pause size={18} /> : <Play size={18} />} {bgmPlaying ? 'Pause' : 'Play'}
              </Button>
              <div className="min-w-0 flex-1">{bgmClip ? <Scrubber slotId={BGM_ID} snap={snap} /> : <p className="text-sm text-slate-500">Upload an upbeat instrumental loop to play between rounds.</p>}</div>
              <Waveform active={bgmPlaying} />
            </div>
            <ClipDropZone slotId={BGM_ID} label="Background music" />
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <VolumeSlider label="BGM volume" value={audio.bgmVolume} onPreview={(v) => preview({ bgmVolume: v })} onCommit={(v) => run((d) => updateAudio(d, { bgmVolume: v }))} />
              <Toggle checked={audio.bgmLoop} onChange={(v) => run((d) => updateAudio(d, { bgmLoop: v }))} label="Loop" />
            </div>
            <p className="text-xs text-slate-500">
              When a voice clip starts, the music fades to 15% in 0.3 s, then fades back up 0.5 s after the clip ends.
            </p>
          </div>
        </Card>
      </div>

      <Card
        title="Instant SFX Pads"
        icon={<Sparkles size={18} className="text-amber-400" />}
        actions={
          <Button size="xs" variant="ghost" onClick={() => setRenaming(!renaming)}>
            <Pencil size={12} /> {renaming ? 'Done' : 'Rename pads'}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SFX_IDS.map((id) => {
            const Icon = SFX_ICON[id];
            const active = snap.sfxActive[id];
            return renaming ? (
              <input
                key={id}
                className={inputClass}
                defaultValue={audio.sfxLabels[id]}
                aria-label={`Name for ${id}`}
                onBlur={(e) => e.target.value.trim() && e.target.value !== audio.sfxLabels[id] && run((d) => updateAudio(d, { sfxLabels: { ...d.audio.sfxLabels, [id]: e.target.value.trim() } }))}
              />
            ) : (
              <button
                key={id}
                type="button"
                onClick={() => audioEngine.playSfx(id, { accent: false })}
                className={`flex h-28 flex-col items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition active:scale-95 ${
                  active ? 'border-amber-300 bg-amber-400/20 text-amber-100 shadow-lg shadow-amber-900/40' : 'border-slate-700 bg-slate-800/80 hover:border-amber-400/60 hover:bg-slate-800'
                }`}
              >
                <Icon size={30} className={active ? 'text-amber-300' : 'text-slate-300'} />
                {audio.sfxLabels[id]}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-500">Made by the browser's own synthesizer, so they work with no uploads, even offline.</p>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Bengali Voice Announcements</h2>
            <p className="text-sm text-slate-400">Generate each MP3 in ElevenLabs from its script, then drop it on the card. Files are kept in this browser (IndexedDB) and survive refreshes.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {audio.slots.map((slot) => (
            <VoiceSlotCard key={slot.id} slot={slot} />
          ))}
          <div className="flex flex-col justify-center gap-3 rounded-2xl border border-dashed border-slate-700 p-4">
            <p className="flex items-center gap-2 font-semibold text-slate-300">
              <Plus size={16} /> Add a custom pad
            </p>
            <Field label="English name">
              <input className={inputClass} value={newEn} onChange={(e) => setNewEn(e.target.value)} placeholder="e.g. Sponsor shout-out" />
            </Field>
            <Field label="বাংলা নাম (optional)">
              <input className={`${inputClass} font-bengali`} value={newBn} onChange={(e) => setNewBn(e.target.value)} placeholder="যেমন: স্পনসর ঘোষণা" />
            </Field>
            <Button
              variant="primary"
              disabled={!newEn.trim() && !newBn.trim()}
              onClick={() => {
                if (run((d) => addCustomAudioSlot(d, newEn, newBn), 'Custom pad added')) {
                  setNewEn('');
                  setNewBn('');
                }
              }}
            >
              <Plus size={14} /> Add pad
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
