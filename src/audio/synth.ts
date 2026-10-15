import type { SfxId } from '../types';

/**
 * Procedural game-show sound effects built on the Web Audio API — no files needed.
 * Each function schedules its sound on `out` and returns the effect length in ms.
 */

let noiseBuffer: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const len = ctx.sampleRate * 1;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

function env(ctx: AudioContext, out: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, freq: number, t: number, peak: number, attack: number, decay: number) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.connect(env(ctx, out, t, peak, attack, decay));
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

/**
 * One cowrie click: a short hollow "tok" — a band-passed noise transient for the
 * ceramic contact plus a quickly damped low resonance for the wooden bowl.
 */
function shellClick(ctx: AudioContext, out: AudioNode, t: number, peak: number, pitch: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = pitch * 3.1;
  bp.Q.value = 6;
  src.connect(bp).connect(env(ctx, out, t, peak, 0.0015, 0.035));
  src.start(t, Math.random() * 0.8);
  src.stop(t + 0.06);
  // hollow body resonance (two inharmonic partials, like a small ceramic shell)
  tone(ctx, out, 'sine', pitch, t, peak * 0.55, 0.002, 0.09);
  tone(ctx, out, 'triangle', pitch * 2.37, t, peak * 0.2, 0.001, 0.05);
}

/**
 * "Kori clink": a handful of cowrie shells rattling together and settling into
 * a wooden bowl — soft, organic and woody rather than metallic.
 */
function koriClink(ctx: AudioContext, out: AudioNode, t: number): number {
  const shells = 7;
  let at = 0;
  for (let i = 0; i < shells; i++) {
    const settle = i / (shells - 1);
    const pitch = 820 + Math.random() * 520;
    shellClick(ctx, out, t + at, 0.32 - settle * 0.16 + Math.random() * 0.06, pitch);
    // occasional double-touch as two shells bounce
    if (Math.random() < 0.35) shellClick(ctx, out, t + at + 0.012 + Math.random() * 0.01, 0.12, pitch * 1.18);
    at += 0.035 + Math.random() * 0.045 + settle * 0.03;
  }
  // final soft knock of the bowl
  tone(ctx, out, 'sine', 210, t + at, 0.18, 0.004, 0.22);
  return Math.round((at + 0.3) * 1000);
}

/** Temple bell (ঘণ্টা): inharmonic bell partials with a long shimmering decay. */
function bell(ctx: AudioContext, out: AudioNode, t: number, base = 523.25, peak = 0.22, decay = 2.6): number {
  const partials: [number, number, number][] = [
    [0.5, 0.5, 1.1],
    [1, 1, 1],
    [2.0, 0.55, 0.75],
    [2.76, 0.4, 0.55],
    [5.4, 0.22, 0.3],
    [8.93, 0.1, 0.18],
  ];
  for (const [ratio, amp, len] of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = base * ratio;
    osc.detune.value = (Math.random() - 0.5) * 6;
    osc.connect(env(ctx, out, t, peak * amp, 0.003, decay * len));
    osc.start(t);
    osc.stop(t + decay * len + 0.1);
  }
  return Math.round(decay * 1100);
}

/** Short rhythmic countdown tick; `accent` is used for the final second. */
function tick(ctx: AudioContext, out: AudioNode, t: number, accent = false): number {
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 600;
  hp.connect(out);
  tone(ctx, hp, 'square', accent ? 1760 : 1046.5, t, 0.28, 0.002, 0.07);
  tone(ctx, hp, 'sine', accent ? 3520 : 2093, t, 0.12, 0.001, 0.03);
  return 120;
}

/** Deep game-show air horn: stacked, detuned sawtooth blasts. */
function airhorn(ctx: AudioContext, out: AudioNode, t: number): number {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.linearRampToValueAtTime(2400, t + 0.08);
  lp.frequency.linearRampToValueAtTime(1600, t + 1.2);
  lp.Q.value = 2;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
  master.gain.setValueAtTime(0.5, t + 1.05);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
  lp.connect(master).connect(out);
  for (const base of [146.8, 220, 293.7]) {
    for (const detune of [-14, 0, 11]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * 0.94, t);
      osc.frequency.exponentialRampToValueAtTime(base, t + 0.09);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.11;
      osc.connect(g).connect(lp);
      osc.start(t);
      osc.stop(t + 1.4);
    }
  }
  return 1400;
}

function snareHit(ctx: AudioContext, out: AudioNode, t: number, peak: number, decay = 0.07) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 0.8;
  src.connect(bp).connect(env(ctx, out, t, peak, 0.002, decay));
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.05);
  tone(ctx, out, 'triangle', 190, t, peak * 0.35, 0.002, decay * 0.7);
}

/** 3-second accelerating, crescendoing snare roll ending in a cymbal-ish crash. */
function drumroll(ctx: AudioContext, out: AudioNode, t: number): number {
  const dur = 3;
  let at = 0;
  while (at < dur) {
    const p = at / dur;
    snareHit(ctx, out, t + at, 0.05 + p * 0.35);
    at += 0.055 - p * 0.022;
  }
  // final accent + crash
  snareHit(ctx, out, t + dur, 0.7, 0.15);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  src.connect(hp).connect(env(ctx, out, t + dur, 0.35, 0.005, 1.4));
  src.start(t + dur);
  src.stop(t + dur + 1.5);
  return (dur + 1.5) * 1000;
}

function brass(ctx: AudioContext, out: AudioNode, freq: number, t: number, len: number, peak: number) {
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.5;
  lp.frequency.setValueAtTime(freq * 1.5, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 6, t + 0.06);
  lp.frequency.exponentialRampToValueAtTime(freq * 3, t + len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
  g.gain.setValueAtTime(peak * 0.8, t + Math.max(0.05, len - 0.08));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.15);
  lp.connect(g).connect(out);
  for (const detune of [-6, 6]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    osc.connect(lp);
    osc.start(t);
    osc.stop(t + len + 0.2);
  }
}

/** Bright major-chord fanfare: pickup triplet then a sustained C-major chord. */
function fanfare(ctx: AudioContext, out: AudioNode, t: number): number {
  const G4 = 392,
    C5 = 523.25,
    E5 = 659.25,
    G5 = 783.99,
    C6 = 1046.5;
  const notes: [number, number, number][] = [
    [G4, 0, 0.13],
    [G4, 0.15, 0.13],
    [G4, 0.3, 0.13],
    [C5, 0.45, 0.35],
    [G4, 0.82, 0.16],
    [C5, 1.0, 0.16],
  ];
  for (const [f, at, len] of notes) brass(ctx, out, f, t + at, len, 0.16);
  for (const f of [C5, E5, G5, C6]) brass(ctx, out, f, t + 1.2, 1.3, 0.11);
  snareHit(ctx, out, t + 1.2, 0.3, 0.2);
  return 2800;
}

export function playSfx(ctx: AudioContext, out: AudioNode, id: SfxId, opts: { when?: number; accent?: boolean } = {}): number {
  const t = Math.max(ctx.currentTime, opts.when ?? ctx.currentTime) + 0.01;
  switch (id) {
    case 'KORI':
      return koriClink(ctx, out, t);
    case 'BELL':
      return bell(ctx, out, t);
    case 'TICK':
      return tick(ctx, out, t, opts.accent);
    case 'AIRHORN':
      return airhorn(ctx, out, t);
    case 'DRUMROLL':
      return drumroll(ctx, out, t);
    case 'FANFARE':
      return fanfare(ctx, out, t);
  }
}

export const SFX_IDS: SfxId[] = ['KORI', 'BELL', 'TICK', 'AIRHORN', 'DRUMROLL', 'FANFARE'];

// ---------------------------------------------------------------- built-in festival background loops

export type SynthBgm = 'DHAK' | 'CHIMES';

/** A dhak (ঢাক) hit: pitched membrane thump with a slapped skin transient. */
function dhakHit(ctx: AudioContext, out: AudioNode, t: number, peak: number, low = true) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const f = low ? 92 : 168;
  osc.frequency.setValueAtTime(f * 1.6, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  osc.connect(env(ctx, out, t, peak, 0.003, low ? 0.32 : 0.16));
  osc.start(t);
  osc.stop(t + 0.4);
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = low ? 700 : 1500;
  bp.Q.value = 1.2;
  src.connect(bp).connect(env(ctx, out, t, peak * 0.35, 0.001, 0.05));
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.08);
}

/** Thin kansor (কাঁসর) gong tap that marks the beat in puja processions. */
function kansor(ctx: AudioContext, out: AudioNode, t: number, peak: number) {
  for (const [f, a] of [
    [1180, 1],
    [1732, 0.6],
    [2640, 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = f;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    osc.connect(hp).connect(env(ctx, out, t, peak * a * 0.25, 0.002, 0.18));
    osc.start(t);
    osc.stop(t + 0.25);
  }
}

/**
 * Schedules one bar of a festival loop starting at `t` and returns its length in seconds.
 * DHAK: a 16-step dhak & kansor groove (~112 bpm). CHIMES: soft pentatonic temple-bell chimes.
 */
export function scheduleBgmBar(ctx: AudioContext, out: AudioNode, kind: SynthBgm, t: number, bar: number): number {
  if (kind === 'DHAK') {
    const step = 60 / 112 / 4;
    // dha . . na | dha . na . | dha . . na | dha na dha .   (accent on 1, variation every 4th bar)
    const pattern = bar % 4 === 3 ? 'L..hL.h.L.hhLhLh' : 'L..hL.h.L..hL.h.';
    for (let i = 0; i < 16; i++) {
      const c = pattern[i];
      if (c === 'L') dhakHit(ctx, out, t + i * step, i === 0 ? 0.55 : 0.4, true);
      if (c === 'h') dhakHit(ctx, out, t + i * step, 0.28, false);
      if (i % 4 === 2) kansor(ctx, out, t + i * step, i === 2 ? 0.5 : 0.35);
    }
    return step * 16;
  }
  // CHIMES: Bhupali-like pentatonic (Sa Re Ga Pa Dha), gentle random walk.
  const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
  const len = 4;
  let at = 0.05;
  let idx = (bar * 2) % scale.length;
  while (at < len - 0.3) {
    idx = Math.max(0, Math.min(scale.length - 1, idx + Math.round((Math.random() - 0.5) * 3)));
    bell(ctx, out, t + at, scale[idx], 0.06 + Math.random() * 0.03, 2.2);
    at += 0.5 + Math.random() * 0.6;
  }
  return len;
}
