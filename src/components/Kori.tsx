import { useId, type SVGProps } from 'react';
import { fmt } from './ui';

/**
 * Cowrie shell (কড়ি) icon — the traditional currency of village fairs and
 * Lakshmi puja. Drop-in replacement for lucide icons (`size`, `className`).
 */
export function KoriIcon({ size = 24, filled = false, className = '', ...rest }: { size?: number; filled?: boolean } & Omit<SVGProps<SVGSVGElement>, 'ref'>) {
  const gid = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...rest}
    >
      {filled && (
        <defs>
          <radialGradient id={gid} cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#fffbeb" />
            <stop offset="55%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#d97706" />
          </radialGradient>
        </defs>
      )}
      {/* shell body */}
      <path d="M12 2.6c4.3 0 7.4 4.2 7.4 9.4S16.3 21.4 12 21.4 4.6 17.2 4.6 12 7.7 2.6 12 2.6Z" fill={filled ? `url(#${gid})` : 'none'} />
      {/* aperture */}
      <path d="M12 5.4c-.9 2-1.25 4.3-1.25 6.6s.35 4.6 1.25 6.6c.9-2 1.25-4.3 1.25-6.6S12.9 7.4 12 5.4Z" fill={filled ? '#7c2d12' : 'none'} />
      {/* teeth */}
      <path d="M9.5 8.3h1.1M9.1 10.7h1.5M9.1 13.3h1.5M9.5 15.7h1.1M13.4 8.3h1.1M13.4 10.7h1.5M13.4 13.3h1.5M13.4 15.7h1.1" strokeWidth={1.3} />
    </svg>
  );
}

/** Kori amount with a small cowrie badge, e.g. "120 🐚". */
export function Kori({ n, size = 14, className = '', iconClassName = 'text-amber-400' }: { n: number; size?: number; className?: string; iconClassName?: string }) {
  return (
    <span className={`inline-flex items-center justify-end gap-1 whitespace-nowrap ${className}`}>
      {fmt(n)}
      <KoriIcon size={size} className={`shrink-0 ${iconClassName}`} />
    </span>
  );
}
