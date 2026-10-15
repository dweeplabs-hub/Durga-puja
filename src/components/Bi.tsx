import type { ProjectorLanguage } from '../types';
import { PROJECTOR_TEXT, type TextKey } from '../lib/i18n';

/**
 * Bilingual label. Bengali conjuncts break apart under letter-spacing/uppercase,
 * so the Bengali half always resets tracking and case while English keeps the styling.
 */
export function Bi({ lang, k }: { lang: ProjectorLanguage; k: TextKey | { en: string; bn: string } }) {
  const v = typeof k === 'string' ? PROJECTOR_TEXT[k] : k;
  if (lang !== 'BILINGUAL') return <>{v.en}</>;
  return (
    <>
      <span className="font-bengali normal-case tracking-normal">{v.bn}</span>
      <span className="opacity-60"> · </span>
      {v.en}
    </>
  );
}
