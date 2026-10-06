// Opponent behaviour model. The distribution depends ONLY on the opponent
// definition, the visible stage history and documented upgrade effects.
// It never looks at run length, currency, lives or build strength.
import type { Dist, GameState, OpponentDef, Move } from './types';
import { MOVES } from './types';
import { beats, idx, losesTo, normalize } from './rps';
import { nextRandom, randInt } from './rng';
import { OPPONENTS_BY_ID } from '../content/opponents';
import { forEachOwned } from './registry';

export function getOpponent(id: string): OpponentDef {
  const o = OPPONENTS_BY_ID[id];
  if (!o) throw new Error(`Unknown opponent ${id}`);
  return o;
}

function mostCommon(moves: Move[]): { move: Move; share: number } | null {
  if (!moves.length) return null;
  const c = [0, 0, 0];
  moves.forEach((m) => c[idx(m)]++);
  let best = 0;
  for (let i = 1; i < 3; i++) if (c[i] > c[best]) best = i;
  // tie-break toward the most recent of the tied moves
  const tied = MOVES.filter((_, i) => c[i] === c[best]);
  let move = MOVES[best];
  if (tied.length > 1) {
    for (let k = moves.length - 1; k >= 0; k--) if (tied.includes(moves[k])) { move = moves[k]; break; }
  }
  return { move, share: c[best] / moves.length };
}

/** How a throw relates to an announcement: 0 = same, 1 = beats it, 2 = loses to it. */
export function relativeTo(m: Move, said: Move): 0 | 1 | 2 {
  return ((idx(m) - idx(said) + 3) % 3) as 0 | 1 | 2;
}
export function shiftFrom(said: Move, r: number): Move {
  return MOVES[(idx(said) + r) % 3];
}

/** The Loop's sequence for this encounter (stored in opponentMemory as l0..lN). */
export function loopSequence(s: GameState): Move[] | null {
  const m = s.opponentMemory;
  if (!m.loopLen) return null;
  return Array.from({ length: m.loopLen }, (_, i) => MOVES[m[`l${i}`]]);
}

/** Where John last re-dealt his split, worked out from the visible history alone (0 = start of the encounter). */
export function lastRedeal(h: { rawOutcome: string }[], n: number): number {
  let at = 0;
  if (n <= 0) return 0;
  for (let k = n; k <= h.length; k++) if (at <= k - n && h.slice(k - n, k).every((r) => r.rawOutcome === 'WIN')) at = k;
  return at;
}

/** John's base weights for this encounter (null before his first round, or for anyone else). */
export function shuffledBaseOf(s: GameState, def: OpponentDef): Dist | null {
  const m = s.opponentMemory;
  if (!def.shuffledBase || m.sb0 === undefined) return null;
  return [def.shuffledBase[m.sb0], def.shuffledBase[m.sb1], def.shuffledBase[m.sb2]];
}

/** Advance behaviour that has its own clock (Gambler, Loop, Bluffer). Called once per round start. */
export function tickOpponentMemory(s: GameState): void {
  const def = getOpponent(s.opponentId);
  if (def.loop && !s.opponentMemory.loopLen) {
    // A fresh, memorable sequence each encounter: at least two different throws, and not a plain
    // Rock→Paper→Scissors cycle (that's Otto's thing).
    for (let tries = 0; tries < 50; tries++) {
      const len = randInt(s, def.loop.minLen, def.loop.maxLen);
      const seq = Array.from({ length: len }, () => randInt(s, 0, 2));
      const distinct = new Set(seq).size;
      const plainCycle = len === 3 && distinct === 3 && (seq[1] === (seq[0] + 1) % 3) && (seq[2] === (seq[1] + 1) % 3);
      if (distinct < 2 || plainCycle) continue;
      s.opponentMemory.loopLen = len;
      seq.forEach((v, i) => { s.opponentMemory[`l${i}`] = v; });
      break;
    }
  }
  const h = s.stageHistory;
  const n = def.reshuffleAfterWins ?? 0;
  const beatenAgain = n > 0 && h.length >= n && h.slice(-n).every((r) => r.rawOutcome === 'WIN') && (s.opponentMemory.sbAt ?? -1) <= h.length - n;
  if (def.shuffledBase && (s.opponentMemory.sb0 === undefined || beatenAgain)) {
    if (beatenAgain) s.opponentMemory.sbAt = h.length;
    // Deal the split to the three throws in a random order for this encounter (stored as sb0..sb2 = share index).
    const prev = [0, 1, 2].map((i) => s.opponentMemory[`sb${i}`]).join();
    let order = [0, 1, 2];
    for (let tries = 0; tries < 8; tries++) {
      order = [0, 1, 2];
      for (let i = 2; i > 0; i--) { const j = randInt(s, 0, i); [order[i], order[j]] = [order[j], order[i]]; }
      if (order.join() !== prev) break; // a re-deal always changes something
    }
    order.forEach((v, i) => { s.opponentMemory[`sb${i}`] = v; });
  }
  // Bluffer: announce this round's "throw" (a fair coin among the three; the bluff is in what follows).
  s.opponentSays = def.bluff ? MOVES[randInt(s, 0, 2)] : null;
  if (def.favoritePhase) {
    const m = s.opponentMemory;
    if (!m.left || m.left <= 0) {
      m.fav = randInt(s, 0, 2);
      m.left = randInt(s, def.favoritePhase.minLen, def.favoritePhase.maxLen);
    }
    m.left -= 1;
  }
}

/**
 * Returns the opponent's probability of throwing R, P, S this round, plus the
 * separate reactive/adaptive pieces (useful for the debug inspector).
 */
export function opponentDistribution(s: GameState): { dist: Dist; reactive: Dist; adaptive: Dist } {
  const base0 = getOpponent(s.opponentId);
  return distributionFor(s, currentMood(base0, s.stageHistory.length).def);
}

/** Mood Swings: which behaviour set is active after `n` rounds against this opponent. */
export function currentMood(def: OpponentDef, n: number): { def: OpponentDef; index: 0 | 1 | null } {
  if (!def.moods) return { def, index: null };
  const index = (Math.floor(n / def.moods.period) % 2) as 0 | 1;
  return { def: { ...def, ...(index === 0 ? def.moods.a : def.moods.b), moods: undefined }, index };
}

function distributionFor(s: GameState, def: OpponentDef): { dist: Dist; reactive: Dist; adaptive: Dist } {
  const hist = s.stageHistory;
  const last = hist[hist.length - 1];
  const prev2 = hist[hist.length - 2];
  const b0 = shuffledBaseOf(s, def) ?? def.base;
  const baseSum = b0[0] + b0[1] + b0[2];
  const base: Dist = [b0[0] / baseSum, b0[1] / baseSum, b0[2] / baseSum];
  const reactive: Dist = [0, 0, 0]; // based on the opponent's own throws / results
  const adaptive: Dist = [0, 0, 0]; // based on the PLAYER's throws

  if (last) {
    const oppWon = last.rawOutcome === 'LOSS';
    const oppLost = last.rawOutcome === 'WIN';
    // Hot/Cold Hand use repeatOwn/cycle only as their after-a-tie habit.
    const tieOnly = !!(def.winStay || def.winShift);
    const applies = !tieOnly || last.rawOutcome === 'TIE';
    if (def.repeatOwn && applies) reactive[idx(last.opponent)] += def.repeatOwn;
    if (def.cycle && applies) reactive[idx(beats(last.opponent))] += def.cycle;
    if (def.reverseCycle) reactive[idx(losesTo(last.opponent))] += def.reverseCycle;
    if (def.winStay && oppWon) reactive[idx(last.opponent)] += def.winStay;
    if (def.loseShift && oppLost) reactive[idx(beats(last.player))] += def.loseShift;
    if (def.winShift && oppWon) reactive[idx(beats(last.opponent))] += def.winShift;
    if (def.loseStay && oppLost) reactive[idx(last.opponent)] += def.loseStay;
    if (def.copyPlayer) adaptive[idx(last.player)] += def.copyPlayer;
    if (def.counterPlayerLast) adaptive[idx(beats(last.player))] += def.counterPlayerLast;
  }
  if (prev2) {
    if (def.echoTwoBack) reactive[idx(beats(prev2.opponent))] += def.echoTwoBack;
    if (def.mirrorTwoBack) adaptive[idx(prev2.player)] += def.mirrorTwoBack;
  }
  if (def.counterPlayerFreq) {
    const recent = hist.slice(-def.counterPlayerFreq.window).map((r) => r.player);
    const mc = mostCommon(recent);
    if (mc && recent.length >= 3) {
      // Scales from 0 (you are perfectly mixed) to full weight (two thirds of your throws are one move).
      const strength = Math.max(0, Math.min(1, (mc.share - 1 / 3) / (1 / 3)));
      adaptive[idx(beats(mc.move))] += def.counterPlayerFreq.weight * strength;
    }
  }
  if (def.counterPlayerBigram && last && hist.length >= 4) {
    // What does the player usually throw right after throwing last.player?
    const follow = [0, 0, 0];
    for (let i = 1; i < hist.length; i++) if (hist[i - 1].player === last.player) follow[idx(hist[i].player)]++;
    const n = follow[0] + follow[1] + follow[2];
    if (n >= 2) {
      let b = 0;
      for (let i = 1; i < 3; i++) if (follow[i] > follow[b]) b = i;
      const share = follow[b] / n;
      const strength = Math.max(0, Math.min(1, (share - 1 / 3) / (1 / 3)));
      adaptive[idx(beats(MOVES[b]))] += def.counterPlayerBigram * strength;
    }
  }
  if (def.leastPlayed && hist.length >= 2) {
    const c = [0, 0, 0];
    hist.forEach((r) => c[idx(r.opponent)]++);
    let lo = 0;
    for (let i = 1; i < 3; i++) if (c[i] < c[lo]) lo = i;
    reactive[lo] += def.leastPlayed;
  }
  if (def.favoritePhase && s.opponentMemory.fav !== undefined) {
    reactive[s.opponentMemory.fav] += def.favoritePhase.weight;
  }
  if (def.loop) {
    const seq = loopSequence(s);
    if (seq) reactive[idx(seq[hist.length % seq.length])] += def.loop.weight;
  }
  if (def.bluff && s.opponentSays) {
    const said = s.opponentSays;
    // "I'm throwing Rock." You'd throw Paper to beat it, so he throws Scissors (what beats Paper).
    reactive[idx(losesTo(said))] += def.bluff.bluff;
    reactive[idx(said)] += def.bluff.honest;
    // And he remembers how YOU answered his last announcement, expects the same answer again, and beats it.
    const lr = last?.said ? relativeTo(last.player, last.said) : null;
    if (lr !== null) adaptive[idx(shiftFrom(said, lr + 1))] += def.bluff.read; // reads YOUR answer, so it's adaptive
  }
  if (def.tiltAfterLosses) {
    let streak = 0;
    for (let k = hist.length - 1; k >= 0 && hist[k].rawOutcome === 'WIN'; k--) streak++;
    if (streak >= def.tiltAfterLosses.losses) {
      const fav = base.indexOf(Math.max(...base));
      for (let i = 0; i < 3; i++) if (i !== fav) reactive[i] += def.tiltAfterLosses.weight / 2;
      // and dampen the favourite
      base[fav] *= 0.4;
    }
  }

  // Documented upgrade effects (e.g. Rocks Are Heavy) may dampen adaptive weights.
  let adj: Dist = [...adaptive] as Dist;
  forEachOwned(s, (d, u) => {
    if (d.modifyOpponentAdaptive) adj = d.modifyOpponentAdaptive(s, u, adj);
  });

  const raw: Dist = [base[0] + reactive[0] + adj[0], base[1] + reactive[1] + adj[1], base[2] + reactive[2] + adj[2]];
  const w = normalize(raw);
  const r = def.randomness;
  let dist: Dist = [r + (1 - 3 * r) * w[0], r + (1 - 3 * r) * w[1], r + (1 - 3 * r) * w[2]];
  // Superstitious: the throw that just lost is cursed. This is the one rule that overrides the randomness
  // floor (it's the whole personality); the other two throws keep their floors, so you still can't be sure of a win.
  if (def.avoidLoser !== undefined && last && last.rawOutcome === 'WIN') {
    const d: Dist = [...dist] as Dist;
    d[idx(last.opponent)] *= def.avoidLoser;
    dist = normalize(d);
  }
  return { dist, reactive, adaptive: adj };
}

export function sampleMove(s: GameState, d: Dist): Move {
  const x = nextRandom(s);
  if (x < d[0]) return 'R';
  if (x < d[0] + d[1]) return 'P';
  return 'S';
}
