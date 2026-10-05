// One small symbol per power-up, naming its main job (save, payout, intel…). Drawn as simple
// stroke icons so they stay consistent with each other at 14–18px, independent of any artwork.
import type { UpgradeDef } from '../core/types';

export type Mechanic = 'charge' | 'lives' | 'save' | 'tie' | 'info' | 'reroll' | 'risk' | 'streak' | 'scaling' | 'payout';

export const MECHANIC_LABEL: Record<Mechanic, string> = {
  charge: 'Recharging save (once per stretch)',
  lives: 'Extra Lives',
  save: 'Save chance',
  tie: 'Ties',
  info: 'Intel',
  reroll: 'Rerolls',
  risk: 'Risk',
  streak: 'Streaks',
  scaling: 'Grows over the run',
  payout: 'Payout',
};

/** The card's main mechanic, from its tags (first match wins, most specific first). */
export function mechanicOf(d: Pick<UpgradeDef, 'tags'>): Mechanic {
  const t = new Set(d.tags ?? []);
  if (t.has('charge')) return 'charge';
  if (t.has('lives')) return 'lives';
  if (t.has('save') || t.has('counterplay')) return 'save';
  if (t.has('tie')) return 'tie';
  if (t.has('info') || t.has('prediction') || t.has('leak')) return 'info';
  if (t.has('reroll')) return 'reroll';
  if (t.has('gamble') || t.has('desperation')) return 'risk';
  if (t.has('streak')) return 'streak';
  if (t.has('scaling')) return 'scaling';
  return 'payout';
}

// 24×24 stroke paths (round caps/joins), drawn in currentColor.
const PATHS: Record<Mechanic, string> = {
  save: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>',
  payout: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.6-1.2-1.6 0-2.7.9-2.7 2s1 1.6 2.7 2 2.8.9 2.8 2.1-1.2 2-2.8 2c-1.1 0-2.1-.4-2.7-1.2M12 6.5v1.5M12 16v1.5"/>',
  info: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  streak: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.7 3-5.6 3.6-9.3 2.4 1.6 3.4 3.6 3.4 5.4 1-.7 1.7-1.9 1.9-3.1 2 1.9 4.1 4.3 4.1 7.3 0 3.4-2.6 5.9-6.5 5.9z"/>',
  lives: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  risk: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".9" fill="currentColor"/><circle cx="15" cy="15" r=".9" fill="currentColor"/><circle cx="15" cy="9" r=".9" fill="currentColor"/><circle cx="9" cy="15" r=".9" fill="currentColor"/>',
  tie: '<path d="M5 9h14M5 15h14"/>',
  charge: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  reroll: '<path d="M19 8a7.5 7.5 0 0 0-13.3 1M5 16a7.5 7.5 0 0 0 13.3-1"/><path d="M19 3.5V8h-4.5M5 20.5V16h4.5"/>',
  scaling: '<path d="M4 18l5-5 4 3 7-8"/><path d="M15 8h5v5"/>',
};

export function mechanicSvg(m: Mechanic): string {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[m]}</svg>`;
}
