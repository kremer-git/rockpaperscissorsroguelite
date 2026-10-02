// Seeded, serialisable RNG (mulberry32). The state lives in GameState so a run
// can be saved, replayed and debugged deterministically.
import type { GameState } from './types';

export function nextRandom(s: GameState): number {
  let t = (s.rngState = (s.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(s: GameState, lo: number, hi: number): number {
  return lo + Math.floor(nextRandom(s) * (hi - lo + 1));
}

export function pickWeighted<T>(s: GameState, items: T[], weight: (t: T) => number): T | undefined {
  const total = items.reduce((a, t) => a + Math.max(0, weight(t)), 0);
  if (total <= 0) return undefined;
  let r = nextRandom(s) * total;
  for (const t of items) {
    r -= Math.max(0, weight(t));
    if (r < 0) return t;
  }
  return items[items.length - 1];
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
