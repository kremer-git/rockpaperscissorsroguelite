import type { GameState, OwnedUpgrade, UpgradeDef } from './types';
import { UPGRADES, applyRarityCosts } from '../content/upgrades';
import { CONFIG } from './config';

applyRarityCosts(CONFIG.store.rarityCost);

export const UPGRADES_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
export { UPGRADES };

/** Re-apply rarity costs after the simulator changes CONFIG. */
export function refreshCosts(): void {
  applyRarityCosts(CONFIG.store.rarityCost);
}

export function getUpgrade(id: string): UpgradeDef {
  const d = UPGRADES_BY_ID[id];
  if (!d) throw new Error(`Unknown upgrade ${id}`);
  return d;
}

export function forEachOwned(s: GameState, fn: (def: UpgradeDef, u: OwnedUpgrade) => void): void {
  for (const u of s.owned) {
    const def = UPGRADES_BY_ID[u.id];
    if (def) fn(def, u);
  }
}

export function owned(s: GameState, id: string): OwnedUpgrade | undefined {
  return s.owned.find((u) => u.id === id);
}
