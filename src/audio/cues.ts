import { useEffect, useRef, useState } from 'react';
import type { VoiceSlotId } from '../types';
import { useCompetition } from '../store';
import { audioEngine } from './engine';

/**
 * Fires a workflow audio cue (e.g. "Open Bidding" clicked). Respects the global
 * auto-trigger switch, the slot's own toggle and its Uploaded / Synth / Both / Muted mode.
 */
export function cue(slotId: VoiceSlotId) {
  const cfg = useCompetition.getState().data.audio;
  if (!cfg.autoTriggerMaster) return;
  const slot = cfg.slots.find((s) => s.id === slotId);
  if (!slot || !slot.autoTrigger) return;
  audioEngine.playSlotWithMode(slotId, slot.mode);
}

/**
 * The Kori clink — cowries rattling into a bowl — for moments when koris change
 * hands: stakes locked, a Kori loan issued, rewards credited.
 */
export function cueKoriClink() {
  const cfg = useCompetition.getState().data.audio;
  if (cfg.autoTriggerMaster && cfg.koriClinkFx) audioEngine.playSfx('KORI');
}

/** Events whose "bidding closed" announcement already played (timer hit 00:00), so locking doesn't repeat it. */
const closedAnnounced = new Set<number>();

/** Re-arms the "bidding closed" cue when a countdown is (re)started. */
export function allowClosedCue(eventNumber: number) {
  closedAnnounced.delete(eventNumber);
}

export function cueBiddingClosed(eventNumber: number) {
  if (closedAnnounced.has(eventNumber)) return;
  closedAnnounced.add(eventNumber);
  cue('BIDDING_CLOSED');
}

/**
 * Only one admin tab should drive timer-based cues. Web Locks gives us a
 * leader election for free; browsers without it just act as leader.
 */
function useIsAudioLeader(): boolean {
  const [leader, setLeader] = useState(() => typeof navigator === 'undefined' || !('locks' in navigator));
  useEffect(() => {
    if (!('locks' in navigator)) return;
    let release: (() => void) | null = null;
    let cancelled = false;
    void navigator.locks
      .request('mojar-mohajuddho-audio-host', () => {
        if (cancelled) return Promise.resolve();
        setLeader(true);
        return new Promise<void>((resolve) => (release = resolve));
      })
      .catch(() => setLeader(true));
    return () => {
      cancelled = true;
      release?.();
    };
  }, []);
  return leader;
}

/** Watches the active event's bidding countdown and fires the 30s warning, 10…1 ticks and 00:00 cue. */
export function useCountdownCues() {
  const data = useCompetition((s) => s.data);
  const leader = useIsAudioLeader();
  const event = data.events.find((e) => e.eventNumber === data.currentEventNumber);
  const endsAt = event?.status === 'BIDDING_OPEN' ? event.biddingEndsAt : null;
  const eventNumber = event?.eventNumber ?? 0;
  const prevSecs = useRef<number | null>(null);

  useEffect(() => {
    prevSecs.current = null;
    if (!leader || !endsAt) return;
    const check = () => {
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      const prev = prevSecs.current;
      prevSecs.current = secs;
      if (prev === null || secs >= prev) return; // only fire when crossing a boundary, never on mount
      const cfg = useCompetition.getState().data.audio;
      if (prev > 30 && secs <= 30 && secs > 0) cue('THIRTY_SEC_LEFT');
      if (cfg.autoTriggerMaster && cfg.countdownTicks && secs >= 1 && secs <= 10) audioEngine.playSfx('TICK', { accent: secs === 1 });
      if (secs === 0) cueBiddingClosed(eventNumber);
    };
    check();
    const t = setInterval(check, 100);
    return () => clearInterval(t);
  }, [leader, endsAt, eventNumber]);
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Alt+1…Alt+9 play announcement slots, Escape stops all audio (ignored while typing or in a dialog). */
export function useAudioHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') {
        if (document.querySelector('[role="dialog"]')) return;
        audioEngine.stopAll();
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const m = /^Digit([1-9])$/.exec(e.code);
      if (!m) return;
      const slot = useCompetition.getState().data.audio.slots.find((s) => s.hotkey === Number(m[1]));
      if (!slot) return;
      e.preventDefault();
      audioEngine.toggleSlot(slot.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Starts the engine for this (admin) window and keeps its config in sync with the store. */
export function useAudioEngine() {
  const audio = useCompetition((s) => s.data.audio);
  useEffect(() => {
    audioEngine.start(audio);
    audioEngine.setConfig(audio);
  }, [audio]);
}
