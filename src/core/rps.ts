import type { Dist, Move, Outcome } from './types';
import { MOVES } from './types';

/** The move that beats `m`. Rock beats Scissors, Scissors beats Paper, Paper beats Rock. */
export function beats(m: Move): Move {
  return m === 'R' ? 'P' : m === 'P' ? 'S' : 'R';
}
/** The move that `m` beats. */
export function losesTo(m: Move): Move {
  return m === 'R' ? 'S' : m === 'P' ? 'R' : 'P';
}

export function resolve(player: Move, opponent: Move): Outcome {
  if (player === opponent) return 'TIE';
  return beats(opponent) === player ? 'WIN' : 'LOSS';
}

export function idx(m: Move): number {
  return m === 'R' ? 0 : m === 'P' ? 1 : 2;
}

export const MOVE_NAME: Record<Move, string> = { R: 'Rock', P: 'Paper', S: 'Scissors' };

export function normalize(d: Dist): Dist {
  const t = d[0] + d[1] + d[2];
  if (!(t > 0)) return [1 / 3, 1 / 3, 1 / 3];
  return [d[0] / t, d[1] / t, d[2] / t];
}

export function argmax(d: Dist): Move {
  let best = 0;
  for (let i = 1; i < 3; i++) if (d[i] > d[best]) best = i;
  return MOVES[best];
}

/** Probability of each outcome when throwing `m` into distribution `d`. */
export function outcomeProbs(m: Move, d: Dist): { win: number; tie: number; loss: number } {
  return {
    win: d[idx(losesTo(m))],
    tie: d[idx(m)],
    loss: d[idx(beats(m))],
  };
}
