import confetti from 'canvas-confetti';

export function roundWinnerConfetti() {
  const end = Date.now() + 1200;
  const colors = ['#f59e0b', '#a855f7', '#ec4899', '#22d3ee'];
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 5, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export function podiumConfetti() {
  const end = Date.now() + 4000;
  const colors = ['#fbbf24', '#fde68a', '#e5e7eb', '#d97706', '#c084fc'];
  (function frame() {
    confetti({ particleCount: 7, angle: 60, spread: 75, origin: { x: 0, y: 0.6 }, colors });
    confetti({ particleCount: 7, angle: 120, spread: 75, origin: { x: 1, y: 0.6 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  setTimeout(() => confetti({ particleCount: 200, spread: 160, startVelocity: 45, origin: { y: 0.35 }, colors }), 400);
}

let audioCtx: AudioContext | null = null;

/** Short synthesized beep (no audio assets needed). */
export function beep(frequency = 880, durationMs = 150, volume = 0.2) {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durationMs / 1000 + 0.02);
  } catch {
    /* audio is best-effort */
  }
}

export function readLocalFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

export function writeLocalFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}
