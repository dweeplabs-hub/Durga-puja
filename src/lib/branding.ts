import type { Branding } from '../types';

/** "মজার মহাযুদ্ধ (Mojar Mohajuddho)" — falls back gracefully if either part is blank. */
export function brandTitle(b: Branding): string {
  const bn = b.titleBn.trim();
  const en = b.titleEn.trim();
  if (bn && en) return `${bn} (${en})`;
  return bn || en;
}
