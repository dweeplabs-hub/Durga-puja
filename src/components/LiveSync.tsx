import { useEffect, useState } from 'react';
import { Check, Cloud, CloudOff, Copy, ExternalLink, Laptop, Loader2, MonitorPlay, Radio, Unplug } from 'lucide-react';
import { useCloud, projectorLink, suggestRoomCode, normaliseRoomCode, validRoomCode, CloudError } from '../lib/cloud';
import { cloudSync } from '../lib/cloudRuntime';
import { toast, useCompetition } from '../store';
import { Button, Field, Modal, inputClass } from './ui';

const STATUS_STYLE = {
  live: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  saving: 'border-sky-500/50 bg-sky-500/10 text-sky-200',
  connecting: 'border-sky-500/50 bg-sky-500/10 text-sky-200',
  offline: 'border-amber-500/50 bg-amber-500/10 text-amber-200',
  error: 'border-rose-500/50 bg-rose-500/10 text-rose-200',
  idle: 'border-slate-700 bg-slate-900 text-slate-300',
} as const;

export function syncLabel(status: keyof typeof STATUS_STYLE, role: string): string {
  if (role === 'off') return 'Live Sync';
  return { live: 'Live', saving: 'Saving…', connecting: 'Connecting…', offline: 'Offline', error: 'Sync error', idle: 'Live Sync' }[status];
}

/** Header button + dialog for connecting this laptop to a live room. */
export function LiveSyncButton() {
  const { role, status, code } = useCloud();
  const [open, setOpen] = useState(false);

  // Reconnect automatically after a reload if this laptop was hosting.
  useEffect(() => {
    void cloudSync().resumeHost();
  }, []);

  const Icon = role === 'off' ? Cloud : status === 'offline' || status === 'error' ? CloudOff : status === 'live' ? Radio : Loader2;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Sync with the projector laptop over the internet"
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${STATUS_STYLE[role === 'off' ? 'idle' : status]}`}
      >
        <Icon size={14} className={status === 'saving' || status === 'connecting' ? 'animate-spin' : status === 'live' && role !== 'off' ? 'animate-pulse' : ''} />
        {syncLabel(role === 'off' ? 'idle' : status, role)}
        {role !== 'off' && code && <span className="font-mono text-xs opacity-80">{code}</span>}
      </button>
      {open && <LiveSyncDialog onClose={() => setOpen(false)} />}
      <ChoiceDialog />
    </>
  );
}

function LiveSyncDialog({ onClose }: { onClose: () => void }) {
  const { role, status, code, error, lastSyncedAt, pushConnected } = useCloud();
  const [room, setRoom] = useState(code ?? suggestRoomCode());
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const normalised = normaliseRoomCode(room);

  const connect = async () => {
    setBusy(true);
    try {
      await cloudSync().host(normalised, pin);
      toast.success(`Live Sync on — room ${normalised}`);
    } catch (err) {
      toast.error(err instanceof CloudError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const link = code ? projectorLink(code) : '';

  return (
    <Modal open onClose={onClose} title="Live Sync — run the projector on another laptop" wide>
      {role !== 'host' ? (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
            <li>Choose a room code and a PIN, then press <b>Go Live</b> on this (entry) laptop.</li>
            <li>On the projector laptop, open the projector link shown here (or type the room code on its projector page).</li>
            <li>Every change you make here appears there within about a second. The projector can only view, never edit.</li>
          </ol>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room code" hint="Letters, numbers and dashes. Reuse the same code to reconnect.">
              <input className={`${inputClass} font-mono uppercase`} value={room} onChange={(e) => setRoom(e.target.value)} maxLength={32} />
            </Field>
            <Field label="Organizer PIN" hint="At least 4 characters. Needed to make changes; never shown on the projector.">
              <input className={inputClass} type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="e.g. 2026" autoComplete="off" />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            New room: this laptop's current event is uploaded. Existing room (e.g. a second entry laptop): enter the same code and PIN; if both laptops have different data you'll be asked which to keep.
          </p>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <div className="flex justify-end">
            <Button variant="primary" size="lg" disabled={busy || !validRoomCode(normalised) || pin.length < 4} onClick={() => void connect()}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Radio size={16} />} Go Live
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <span className={`h-3 w-3 rounded-full ${status === 'live' ? 'bg-emerald-400' : status === 'offline' || status === 'error' ? 'bg-amber-400' : 'bg-sky-400'}`} />
            <div className="flex-1">
              <p className="font-semibold">
                {status === 'live' ? 'Live — all changes are online' : status === 'saving' ? 'Saving…' : status === 'offline' ? 'Offline — changes are safe on this laptop and will upload automatically' : status === 'error' ? 'Sync problem' : 'Connecting…'}
              </p>
              <p className="text-xs text-slate-400">
                Room <span className="font-mono text-slate-200">{code}</span>
                {lastSyncedAt ? ` · last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : ''}
                {` · instant updates ${pushConnected ? 'on' : 'reconnecting (checking every 3 s meanwhile)'}`}
              </p>
              {error && <p className="mt-1 text-xs text-amber-300">{error}</p>}
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <MonitorPlay size={16} /> Projector laptop link
            </p>
            <div className="flex flex-wrap gap-2">
              <input readOnly className={`${inputClass} flex-1 font-mono text-xs`} value={link} onFocus={(e) => e.target.select()} />
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(link).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button onClick={() => window.open(link, '_blank')}>
                <ExternalLink size={14} /> Open
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Or open the site on the projector laptop, go to <span className="font-mono">/#/projector</span> and type room <b className="font-mono">{code}</b>.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">
            <p className="flex items-center gap-2 font-semibold text-slate-200">
              <Laptop size={16} /> Second entry laptop?
            </p>
            Open the site there, press Live Sync and enter the same room code and PIN. Avoid editing on both at the same instant — if that happens, the later one is told and shown the online version.
          </div>

          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                cloudSync().stop(true);
                toast.info('Live Sync turned off on this laptop (data stays here and online)');
              }}
            >
              <Unplug size={14} /> Turn off Live Sync
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Asked when this laptop and the online room both have (different) event data. */
function ChoiceDialog() {
  const pending = useCloud((s) => s.pendingChoice);
  const local = useCompetition((s) => s.data);
  if (!pending) return null;
  const remote = pending.remote.data as { participants?: unknown[]; currentEventNumber?: number } | null;
  return (
    <Modal open onClose={() => undefined} title="This room already has an event">
      <p className="text-sm text-slate-300">The online room and this laptop have different data. Which one should both laptops use?</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button type="button" className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-left hover:bg-emerald-500/10" onClick={() => void cloudSync().resolveChoice(true)}>
          <p className="font-semibold text-emerald-200">Use the online event</p>
          <p className="mt-1 text-xs text-slate-400">
            {remote?.participants?.length ?? 0} participants · Event {remote?.currentEventNumber ?? 1}. Replaces this laptop's copy.
          </p>
        </button>
        <button
          type="button"
          className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-left hover:bg-amber-500/10"
          onClick={() => {
            if (window.confirm('Overwrite the online event with this laptop’s data? Other laptops will switch to it.')) void cloudSync().resolveChoice(false);
          }}
        >
          <p className="font-semibold text-amber-200">Use this laptop's event</p>
          <p className="mt-1 text-xs text-slate-400">
            {local.participants.length} participants · Event {local.currentEventNumber}. Overwrites the online copy.
          </p>
        </button>
      </div>
    </Modal>
  );
}
