// Pure rule queries: prices, save chances, caps. No mutation here, so the UI,
// the simulator and the debug inspector can all ask "what would happen?".
import type { GameState, IntelFlags, Move } from './types';
import { CONFIG } from './config';
import { forEachOwned, getUpgrade, owned } from './registry';

export function effectiveSaveChance(s: GameState, move: Move, allIn = false): number {
  if (allIn) return 0;
  let allowed = true;
  let sum = 0;
  let cap = CONFIG.saveCap;
  let capMult = 1;
  forEachOwned(s, (d, u) => {
    if (d.canSave && !d.canSave(s, u, move)) allowed = false;
    if (d.saveChance) sum += d.saveChance(s, u, move);
    if (d.saveCap) {
      const c = d.saveCap(s, u, move);
      if (c !== undefined) cap = Math.max(cap, c);
    }
    if (d.saveCapMult) capMult *= d.saveCapMult(s, u);
  });
  if (!allowed) return 0;
  cap = Math.min(CONFIG.saveCapCeiling, cap) * capMult;
  return Math.max(0, Math.min(sum, cap));
}

/** Raw (uncapped) save chance, for the debug inspector. */
export function rawSaveChance(s: GameState, move: Move): number {
  let sum = 0;
  forEachOwned(s, (d, u) => { if (d.saveChance) sum += d.saveChance(s, u, move); });
  return sum;
}

export function throwCost(s: GameState, move: Move): number {
  let c = 0;
  forEachOwned(s, (d, u) => { if (d.throwCost) c += d.throwCost(s, u, move); });
  return c;
}

export function canThrow(s: GameState, move: Move): boolean {
  return s.status === 'playing' && s.currency >= throwCost(s, move);
}

export function allInAvailable(s: GameState): boolean {
  let ok = false;
  forEachOwned(s, (d) => { if (d.allowsAllIn) ok = true; });
  return ok;
}

export function maxLives(s: GameState): number {
  let m = Infinity;
  forEachOwned(s, (d, u) => { if (d.maxLives) m = Math.min(m, d.maxLives(s, u)); });
  return m;
}

function mult(s: GameState, key: 'upgradePriceMult' | 'lifePriceMult' | 'opponentRerollMult'): number {
  let m = 1;
  forEachOwned(s, (d, u) => { const f = d[key]; if (f) m *= f(s, u); });
  return m;
}

export function upgradePrice(s: GameState, id: string): number {
  const def = getUpgrade(id);
  const have = owned(s, id)?.stacks ?? 0;
  return Math.max(1, Math.round(def.cost * (1 + 0.5 * have) * mult(s, 'upgradePriceMult')));
}

export function lifePrice(s: GameState): number {
  const base = CONFIG.store.lifeBase * Math.pow(CONFIG.store.lifeGrowth, s.stats.livesPurchased);
  return Math.round(base * mult(s, 'lifePriceMult'));
}

export function storeRerollPrice(s: GameState): number {
  const n = s.store?.rerollsThisVisit ?? 0;
  let free = 0;
  forEachOwned(s, (d, u) => { if (d.freeStoreRerolls) free += d.freeStoreRerolls(s, u); });
  if (n < free) return 0;
  return Math.round(CONFIG.store.rerollBase * Math.pow(CONFIG.store.rerollGrowth, n - free));
}

export function opponentRerollPrice(s: GameState): number {
  const base = CONFIG.store.opponentRerollBase * Math.pow(CONFIG.store.opponentRerollGrowth, s.opponentRerollsBought);
  return Math.round(base * mult(s, 'opponentRerollMult'));
}

export function intelFlags(s: GameState): IntelFlags {
  const f: IntelFlags = {
    hidden: false, historyWindow: 5, behaviourText: false, frequencies: false,
    prediction: 0, trueOdds: false, trueOddsChance: 0, leakChance: 0, coldReadChance: 0, showNextOpponent: false,
  };
  forEachOwned(s, (d, u) => d.intel?.(f, u));
  return f;
}
