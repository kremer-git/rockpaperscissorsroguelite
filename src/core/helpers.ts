// Small pure helpers shared by upgrades, the engine, intel and the simulator.
import type { GameState, Move, OwnedUpgrade, RoundRecord } from './types';

export function streakFromEnd(hist: RoundRecord[], pred: (r: RoundRecord) => boolean): number {
  let n = 0;
  for (let i = hist.length - 1; i >= 0 && pred(hist[i]); i--) n++;
  return n;
}

/** Consecutive Rock throws immediately before the current round. */
export const rockStreak = (s: GameState) => streakFromEnd(s.history, (r) => r.player === 'R');
/** Consecutive (true) wins immediately before the current round. */
export const winStreak = (s: GameState) => streakFromEnd(s.history, (r) => r.outcome === 'WIN');
/** Consecutive genuine (unsaved) ties immediately before the current round. */
export const tieStreak = (s: GameState) => streakFromEnd(s.history, (r) => r.outcome === 'TIE' && !r.saved && !r.allIn);

export function lastPlayerMove(s: GameState): Move | null {
  return s.history.length ? s.history[s.history.length - 1].player : null;
}

export function num(u: OwnedUpgrade, key: string): number {
  return u.data[key] ?? 0;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
