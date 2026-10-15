import { useSyncExternalStore } from 'react';
import type { AudioConfig, AudioMode, SfxId } from '../types';
import { defaultAudioConfig } from '../lib/defaults';
import { deleteClip, getAllClips, putClip, type StoredClip } from './idb';
import { playSfx, scheduleBgmBar, type SynthBgm } from './synth';
import { SLOT_SYNTH, isVoiceSlotId } from './scripts';

export const BGM_ID = 'BGM';
const DUCK_LEVEL = 0.15;
const DUCK_DOWN_SEC = 0.3;
const DUCK_RESTORE_DELAY_MS = 500;
const DUCK_UP_SEC = 0.6;
const MAX_FILE_BYTES = 60 * 1024 * 1024;

export interface ClipInfo {
  name: string;
  size: number;
  type: string;
  duration: number | null;
}

export interface PlayState {
  current: number;
  duration: number;
  paused: boolean;
}

export interface AudioSnapshot {
  /** IndexedDB has been read. */
  ready: boolean;
  /** AudioContext is running (browser autoplay policy satisfied). */
  unlocked: boolean;
  clips: Record<string, ClipInfo>;
  playing: Record<string, PlayState>;
  ducked: boolean;
  /** Short-lived synth effects currently sounding (for pad highlighting). */
  sfxActive: Partial<Record<SfxId, boolean>>;
  /** Built-in festival loop currently playing as background music, if any. */
  synthBgm: SynthBgm | null;
  error: string | null;
}

interface Track {
  el: HTMLAudioElement;
  url: string;
  info: ClipInfo;
  source?: MediaElementAudioSourceNode;
  gain?: GainNode;
}

type Ctor = typeof AudioContext;

/**
 * Single audio engine for the admin window: uploaded voice clips, background
 * music with automatic ducking, and procedural SFX, all routed through one
 * master gain so the PANIC button silences everything at once.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private tracks = new Map<string, Track>();
  private config: AudioConfig = defaultAudioConfig();
  private activeVoices = new Set<string>();
  private restoreTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingVoiceTimers = new Set<ReturnType<typeof setTimeout>>();
  private sfxTimers = new Map<SfxId, ReturnType<typeof setTimeout>>();
  private listeners = new Set<() => void>();
  private raf: number | null = null;
  private lastEmit = 0;
  private snap: AudioSnapshot = { ready: false, unlocked: false, clips: {}, playing: {}, ducked: false, sfxActive: {}, synthBgm: null, error: null };
  private synthBgmBus: GainNode | null = null;
  private synthBgmTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  // ------------------------------------------------------------ lifecycle

  start(config: AudioConfig) {
    this.config = config;
    if (this.started) return;
    this.started = true;
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('pagehide', () => {
      for (const t of this.tracks.values()) URL.revokeObjectURL(t.url);
    });
    getAllClips()
      .then((clips) => {
        for (const c of clips) this.attach(c);
        this.emit({ ready: true });
      })
      .catch((err: Error) => this.emit({ ready: true, error: `Audio storage unavailable: ${err.message}` }));
  }

  /** Lazily builds the Web Audio graph. Returns null if Web Audio is unsupported. */
  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!C) return null;
    const ctx = new C();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.voiceBus = ctx.createGain();
    this.voiceBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.bgmGain = ctx.createGain();
    this.bgmGain.connect(this.master);
    ctx.addEventListener('statechange', () => this.emit({ unlocked: ctx.state === 'running' }));
    this.applyConfig();
    return ctx;
  }

  /** Must run inside a user gesture at least once (browser autoplay policy). */
  unlock() {
    const ctx = this.ensureCtx();
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (ctx?.state === 'running' && !this.snap.unlocked) this.emit({ unlocked: true });
  }

  setConfig(config: AudioConfig) {
    if (config.bgmSource !== this.config.bgmSource) {
      this.stopSynthBgm();
      if (config.bgmSource !== 'FILE') this.tracks.get(BGM_ID)?.el.pause();
    }
    this.config = config;
    this.applyConfig();
  }

  private applyConfig() {
    const c = this.config;
    const ctx = this.ctx;
    if (ctx && this.master && this.sfxBus && this.bgmGain) {
      this.master.gain.setTargetAtTime(c.masterVolume, ctx.currentTime, 0.02);
      this.sfxBus.gain.setTargetAtTime(c.sfxVolume, ctx.currentTime, 0.02);
      if (!this.isDucking()) this.bgmGain.gain.setTargetAtTime(c.bgmVolume, ctx.currentTime, 0.02);
      else this.bgmGain.gain.setTargetAtTime(c.bgmVolume * DUCK_LEVEL, ctx.currentTime, 0.02);
    }
    for (const [id, t] of this.tracks) {
      if (id === BGM_ID) {
        t.el.loop = c.bgmLoop;
        if (!t.gain) t.el.volume = c.masterVolume * c.bgmVolume * (this.isDucking() ? DUCK_LEVEL : 1);
        continue;
      }
      const slot = c.slots.find((s) => s.id === id);
      t.el.loop = slot?.loop ?? false;
      const v = slot?.volume ?? 1;
      if (t.gain && ctx) t.gain.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
      else t.el.volume = Math.min(1, v * c.masterVolume);
    }
  }

  // ------------------------------------------------------------ files

  private attach(clip: StoredClip) {
    this.detach(clip.id);
    const url = URL.createObjectURL(clip.blob);
    const el = new Audio();
    el.preload = 'auto';
    el.src = url;
    const info: ClipInfo = { name: clip.name, size: clip.size, type: clip.type, duration: null };
    const track: Track = { el, url, info };
    this.tracks.set(clip.id, track);
    el.addEventListener('loadedmetadata', () => {
      info.duration = Number.isFinite(el.duration) ? el.duration : null;
      this.emit();
    });
    el.addEventListener('play', () => this.onTrackPlay(clip.id));
    el.addEventListener('pause', () => this.onTrackStop(clip.id));
    el.addEventListener('ended', () => this.onTrackStop(clip.id));
    el.addEventListener('error', () => this.emit({ error: `Could not decode “${clip.name}”. Try an MP3, WAV or OGG file.` }));
    this.applyConfig();
    this.emit();
  }

  private detach(id: string) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.el.pause();
    t.el.removeAttribute('src');
    t.el.load();
    t.source?.disconnect();
    t.gain?.disconnect();
    URL.revokeObjectURL(t.url);
    this.tracks.delete(id);
    this.onTrackStop(id);
  }

  async saveFile(id: string, file: File): Promise<void> {
    const okType = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|m4a|aac|webm|flac)$/i.test(file.name);
    if (!okType) throw new Error(`“${file.name}” is not an audio file`);
    if (file.size > MAX_FILE_BYTES) throw new Error(`“${file.name}” is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    const clip = await putClip(id, file, file.name);
    this.attach(clip);
  }

  async removeFile(id: string): Promise<void> {
    this.detach(id);
    await deleteClip(id);
    this.emit();
  }

  hasFile(id: string) {
    return this.tracks.has(id);
  }

  // ------------------------------------------------------------ routing & playback

  private route(t: Track, id: string) {
    const ctx = this.ensureCtx();
    if (!ctx || t.source) return;
    try {
      t.source = ctx.createMediaElementSource(t.el);
      if (id === BGM_ID) t.source.connect(this.bgmGain!);
      else {
        t.gain = ctx.createGain();
        t.source.connect(t.gain).connect(this.voiceBus!);
      }
      t.el.volume = 1;
      this.applyConfig();
    } catch {
      /* already routed or unsupported: fall back to element volume */
    }
  }

  private async playTrack(id: string): Promise<boolean> {
    const t = this.tracks.get(id);
    if (!t) return false;
    this.unlock();
    this.route(t, id);
    if (id !== BGM_ID) t.el.currentTime = 0;
    try {
      await t.el.play();
      if (this.snap.error) this.emit({ error: null });
      return true;
    } catch (err) {
      const blocked = (err as DOMException)?.name === 'NotAllowedError';
      this.emit({ error: blocked ? 'The browser blocked audio playback — click anywhere on the page once to enable sound.' : `Playback failed: ${(err as Error).message}` });
      return false;
    }
  }

  /** Plays a slot: its uploaded file if present, otherwise the built-in synth fallback. */
  playSlot(id: string): 'file' | 'synth' | 'none' {
    if (this.tracks.has(id)) {
      void this.playTrack(id);
      return 'file';
    }
    return this.playSynthFor(id) ? 'synth' : 'none';
  }

  /** Auto-trigger playback honoring the slot's Uploaded / Synth / Both / Muted mode. */
  playSlotWithMode(id: string, mode: AudioMode) {
    if (mode === 'MUTED') return;
    const hasFile = this.tracks.has(id);
    if (mode === 'MP3') {
      this.playSlot(id);
    } else if (mode === 'SYNTH' || !hasFile) {
      this.playSynthFor(id);
    } else {
      // BOTH: the effect first, then the voice clip over its tail.
      const ms = this.playSynthFor(id);
      const timer = setTimeout(() => {
        this.pendingVoiceTimers.delete(timer);
        void this.playTrack(id);
      }, Math.min(ms, 1500));
      this.pendingVoiceTimers.add(timer);
    }
  }

  toggleSlot(id: string) {
    if (this.snap.playing[id] && !this.snap.playing[id].paused) this.stopSlot(id);
    else this.playSlot(id);
  }

  stopSlot(id: string) {
    const t = this.tracks.get(id);
    if (!t) return;
    t.el.pause();
    if (id !== BGM_ID) t.el.currentTime = 0;
  }

  seek(id: string, seconds: number) {
    const t = this.tracks.get(id);
    if (t && Number.isFinite(seconds)) {
      t.el.currentTime = Math.max(0, Math.min(seconds, t.el.duration || seconds));
      this.emit();
    }
  }

  /** Plays/pauses background music from the configured source (uploaded file or built-in festival loop). */
  toggleBgm() {
    const source = this.config.bgmSource;
    if (source !== 'FILE') {
      if (this.snap.synthBgm) this.stopSynthBgm();
      else this.startSynthBgm(source);
      return;
    }
    this.stopSynthBgm();
    const t = this.tracks.get(BGM_ID);
    if (!t) return;
    if (t.el.paused) void this.playTrack(BGM_ID);
    else t.el.pause();
  }

  /** Look-ahead scheduler: queues festival-loop bars ~1s ahead into a bus feeding the (duckable) BGM gain. */
  private startSynthBgm(kind: SynthBgm) {
    this.unlock();
    const ctx = this.ensureCtx();
    if (!ctx || !this.bgmGain) return;
    this.tracks.get(BGM_ID)?.el.pause();
    this.stopSynthBgm();
    const bus = ctx.createGain();
    bus.connect(this.bgmGain);
    this.synthBgmBus = bus;
    let next = ctx.currentTime + 0.1;
    let bar = 0;
    const pump = () => {
      while (next < ctx.currentTime + 1.2) next += scheduleBgmBar(ctx, bus, kind, next, bar++);
    };
    pump();
    this.synthBgmTimer = setInterval(pump, 250);
    this.emit({ synthBgm: kind });
  }

  private stopSynthBgm() {
    if (this.synthBgmTimer) clearInterval(this.synthBgmTimer);
    this.synthBgmTimer = null;
    const bus = this.synthBgmBus;
    if (bus && this.ctx) {
      bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      setTimeout(() => bus.disconnect(), 400);
    }
    this.synthBgmBus = null;
    if (this.snap.synthBgm) this.emit({ synthBgm: null });
  }

  /** Synth fallback for a slot; returns the total length in ms (0 if none). */
  private playSynthFor(id: string): number {
    if (!isVoiceSlotId(id)) return 0;
    return this.playSequence(SLOT_SYNTH[id]);
  }

  private playSequence(ids: SfxId[]): number {
    let offset = 0;
    for (const sfx of ids) {
      const len = sfx === 'TICK' ? 330 : this.sfxLength(sfx);
      this.playSfx(sfx, { delayMs: offset });
      offset += sfx === 'DRUMROLL' ? 3000 : len * (sfx === 'KORI' ? 0.6 : 1);
    }
    return offset;
  }

  private sfxLength(id: SfxId) {
    const lengths: Record<SfxId, number> = { KORI: 600, BELL: 2800, TICK: 120, AIRHORN: 1400, DRUMROLL: 4500, FANFARE: 2800 };
    return lengths[id];
  }

  playSfx(id: SfxId, opts: { delayMs?: number; accent?: boolean } = {}) {
    this.unlock();
    const ctx = this.ensureCtx();
    if (!ctx || !this.sfxBus) return;
    const when = ctx.currentTime + (opts.delayMs ?? 0) / 1000;
    const len = playSfx(ctx, this.sfxBus, id, { when, accent: opts.accent });
    const prev = this.sfxTimers.get(id);
    if (prev) clearTimeout(prev);
    const startTimer = setTimeout(() => {
      this.emit({ sfxActive: { ...this.snap.sfxActive, [id]: true } });
      this.sfxTimers.set(
        id,
        setTimeout(() => {
          this.sfxTimers.delete(id);
          this.emit({ sfxActive: { ...this.snap.sfxActive, [id]: false } });
        }, len),
      );
    }, opts.delayMs ?? 0);
    this.sfxTimers.set(id, startTimer);
  }

  /** PANIC: silences every voice clip, the BGM and any scheduled synth effects. */
  stopAll() {
    for (const t of this.pendingVoiceTimers) clearTimeout(t);
    this.pendingVoiceTimers.clear();
    for (const [id, t] of this.tracks) {
      t.el.pause();
      if (id !== BGM_ID) t.el.currentTime = 0;
    }
    for (const t of this.sfxTimers.values()) clearTimeout(t);
    this.sfxTimers.clear();
    if (this.ctx && this.sfxBus && this.master) {
      // Scheduled oscillators can't be cancelled individually; swap in a fresh bus.
      const old = this.sfxBus;
      old.gain.cancelScheduledValues(this.ctx.currentTime);
      old.gain.setValueAtTime(0, this.ctx.currentTime);
      setTimeout(() => old.disconnect(), 50);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.config.sfxVolume;
      this.sfxBus.connect(this.master);
    }
    this.activeVoices.clear();
    if (this.restoreTimer) clearTimeout(this.restoreTimer);
    this.restoreTimer = null;
    this.rampBgm(this.config.bgmVolume, 0.05);
    this.stopSynthBgm();
    this.emit({ sfxActive: {}, ducked: false });
  }

  // ------------------------------------------------------------ ducking

  private isDucking() {
    return this.config.duckingEnabled && this.activeVoices.size > 0;
  }

  private rampBgm(target: number, seconds: number) {
    const ctx = this.ctx;
    const t = this.tracks.get(BGM_ID);
    if (ctx && this.bgmGain) {
      const g = this.bgmGain.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(target, now + seconds);
    } else if (t) {
      t.el.volume = Math.min(1, target * this.config.masterVolume);
    }
  }

  private onTrackPlay(id: string) {
    if (id !== BGM_ID) {
      this.activeVoices.add(id);
      if (this.restoreTimer) {
        clearTimeout(this.restoreTimer);
        this.restoreTimer = null;
      }
      if (this.config.duckingEnabled) {
        this.rampBgm(this.config.bgmVolume * DUCK_LEVEL, DUCK_DOWN_SEC);
        this.emit({ ducked: true });
      }
    }
    this.startTicker();
    this.emit();
  }

  private onTrackStop(id: string) {
    if (id !== BGM_ID && this.activeVoices.delete(id) && this.activeVoices.size === 0) {
      if (this.restoreTimer) clearTimeout(this.restoreTimer);
      this.restoreTimer = setTimeout(() => {
        this.restoreTimer = null;
        if (this.activeVoices.size === 0) {
          this.rampBgm(this.config.bgmVolume, DUCK_UP_SEC);
          this.emit({ ducked: false });
        }
      }, DUCK_RESTORE_DELAY_MS);
    }
    this.emit();
  }

  // ------------------------------------------------------------ snapshot store

  private startTicker() {
    if (this.raf !== null) return;
    const loop = (ts: number) => {
      const anyPlaying = [...this.tracks.values()].some((t) => !t.el.paused);
      if (ts - this.lastEmit > 100) this.emit();
      this.raf = anyPlaying ? requestAnimationFrame(loop) : null;
    };
    this.raf = requestAnimationFrame(loop);
  }

  private emit(patch: Partial<AudioSnapshot> = {}) {
    this.lastEmit = performance.now();
    const clips: Record<string, ClipInfo> = {};
    const playing: Record<string, PlayState> = {};
    for (const [id, t] of this.tracks) {
      clips[id] = { ...t.info };
      if (!t.el.paused) playing[id] = { current: t.el.currentTime, duration: t.info.duration ?? t.el.duration ?? 0, paused: false };
    }
    this.snap = { ...this.snap, ...patch, clips, playing };
    for (const l of this.listeners) l();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getSnapshot = () => this.snap;

  /** Current position of a track (for scrubbers), even while paused. */
  position(id: string): number {
    return this.tracks.get(id)?.el.currentTime ?? 0;
  }
}

export const audioEngine = new AudioEngine();

export function useAudioSnapshot(): AudioSnapshot {
  return useSyncExternalStore(audioEngine.subscribe, audioEngine.getSnapshot, audioEngine.getSnapshot);
}

export function formatTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '--:--';
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
