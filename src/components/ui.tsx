import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { EventStatus } from '../types';
import { useToasts } from '../store';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'warning';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary: 'bg-violet-600 hover:bg-violet-500 text-white shadow-sm shadow-violet-900/40',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-500 text-white',
  warning: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
  ghost: 'hover:bg-slate-800 text-slate-300',
};

const sizeClass: Record<Size, string> = {
  xs: 'px-2 py-1 text-xs gap-1',
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-3 text-base gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ title, icon, actions, children, className = '' }: { title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/70 ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
            {icon}
            {title}
          </h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = 'slate', className = '' }: { children: ReactNode; tone?: 'slate' | 'violet' | 'amber' | 'emerald' | 'rose' | 'sky'; className?: string }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    sky: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  UPCOMING: 'Upcoming',
  BIDDING_OPEN: 'Bidding Open',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const tone = ({ UPCOMING: 'slate', BIDDING_OPEN: 'amber', IN_PROGRESS: 'sky', COMPLETED: 'emerald' } as const)[status];
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`my-8 w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-800 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50';

/** Number input that keeps a local text buffer so partially typed values aren't clobbered. */
export function NumberInput({
  value,
  onCommit,
  min,
  max,
  step = 1,
  disabled,
  className = '',
  invalid,
  commitOnChange = false,
  ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  invalid?: boolean;
  commitOnChange?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);
  const commit = (t: string) => {
    const n = Number(t);
    if (t.trim() !== '' && Number.isFinite(n)) {
      if (n !== value) onCommit(n);
    } else setText(String(value));
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={`${inputClass} tabular ${invalid ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500' : ''} ${className}`}
      value={text}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        setText(e.target.value);
        if (commitOnChange && e.target.value.trim() !== '' && Number.isFinite(Number(e.target.value))) onCommit(Number(e.target.value));
      }}
      onBlur={(e) => {
        setFocused(false);
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-violet-600' : 'bg-slate-700'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-4.5' : 'left-0.5'}`} />
      </button>
      {label && <span className="text-slate-300">{label}</span>}
    </label>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info;
        const tone = t.kind === 'success' ? 'border-emerald-500/40 text-emerald-200' : t.kind === 'error' ? 'border-rose-500/50 text-rose-200' : 'border-sky-500/40 text-sky-200';
        return (
          <div key={t.id} className={`pointer-events-auto flex items-start gap-2 rounded-xl border bg-slate-900/95 px-4 py-3 text-sm shadow-xl ${tone}`}>
            <Icon size={18} className="mt-0.5 shrink-0" />
            <p className="flex-1 text-slate-100">{t.message}</p>
            <button type="button" onClick={() => dismissToast(t.id)} className="text-slate-500 hover:text-white" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Re-renders at the given interval while `active`; returns Date.now(). */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs]);
  return active ? now : Date.now();
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Colours for payout tiers, highest multiplier first (gold → slate). */
const TIER_STYLES = [
  { solid: 'bg-amber-400 text-amber-950 ring-amber-200', text: 'text-amber-300' },
  { solid: 'bg-orange-400 text-orange-950 ring-orange-200', text: 'text-orange-300' },
  { solid: 'bg-red-400 text-red-950 ring-red-200', text: 'text-red-300' },
  { solid: 'bg-sky-400 text-sky-950 ring-sky-200', text: 'text-sky-300' },
  { solid: 'bg-teal-400 text-teal-950 ring-teal-200', text: 'text-teal-300' },
  { solid: 'bg-slate-300 text-slate-900 ring-slate-100', text: 'text-slate-300' },
];

/** Style for a multiplier, by its rank among the configured tiers (multipliers outside the list still get a sensible colour). */
export function tierStyle(multiplier: number, tiers: number[]) {
  const rank = tiers.filter((t) => t > multiplier).length;
  return TIER_STYLES[Math.min(rank, TIER_STYLES.length - 1)];
}

/** Compact "6x" chip for an awarded multiplier. */
export function MultiplierBadge({ m, tiers, className = '' }: { m: number; tiers: number[]; className?: string }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-black tabular ${tierStyle(m, tiers).solid} ${className}`}>{m}x</span>;
}
