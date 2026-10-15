import { useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import type { EventRound, ProjectorLanguage } from '../types';
import { Bi } from './Bi';
import { beep } from '../lib/effects';
import { formatClock, useNow } from './ui';

export function remainingMs(event: EventRound, now: number): number | null {
  if (event.biddingEndsAt) return Math.max(0, event.biddingEndsAt - now);
  if (event.biddingPausedRemainingMs !== null) return event.biddingPausedRemainingMs;
  return null;
}

/** Live bidding countdown with optional audio cues for the last 5 seconds. */
export function Countdown({ event, sound, size = 'md', language = 'ENGLISH' }: { event: EventRound; sound: boolean; size?: 'md' | 'xl'; language?: ProjectorLanguage }) {
  const running = Boolean(event.biddingEndsAt);
  const now = useNow(running, 200);
  const ms = remainingMs(event, now);
  const secs = ms === null ? null : Math.ceil(ms / 1000);
  const lastBeep = useRef<number | null>(null);

  useEffect(() => {
    if (!sound || !running || secs === null) return;
    if (lastBeep.current === secs) return;
    lastBeep.current = secs;
    if (secs === 0) beep(440, 900, 0.3);
    else if (secs <= 5) beep(880, 140, 0.2);
  }, [secs, sound, running]);

  if (ms === null) return null;
  const urgent = secs !== null && secs <= 10;
  const done = ms === 0;
  const pct = event.biddingDurationSec > 0 ? Math.min(100, (ms / (event.biddingDurationSec * 1000)) * 100) : 0;

  if (size === 'xl') {
    return (
      <div className={`flex items-center gap-4 rounded-3xl border-2 px-8 py-4 ${done ? 'border-rose-500 bg-rose-500/20' : urgent ? 'animate-pulse-ring border-rose-500 bg-rose-500/10' : 'border-amber-400/50 bg-amber-400/10'}`}>
        <Timer size={48} className={urgent || done ? 'text-rose-300' : 'text-amber-300'} />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-300"><Bi lang={language} k={done ? 'closed' : running ? 'closesIn' : 'paused'} /></p>
          <p className={`font-mono text-6xl font-black tabular ${urgent || done ? 'text-rose-300' : 'text-amber-200'}`}>{formatClock(ms)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-48">
      <div className="flex items-center gap-2">
        <Timer size={18} className={urgent ? 'text-rose-400' : 'text-amber-300'} />
        <span className={`font-mono text-2xl font-bold tabular ${urgent ? 'text-rose-300' : 'text-amber-200'}`}>{formatClock(ms)}</span>
        <span className="text-xs text-slate-400">{done ? "time's up" : running ? 'remaining' : 'paused'}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full transition-all ${urgent ? 'bg-rose-500' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
