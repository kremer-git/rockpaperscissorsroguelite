// What the player is allowed to know. Everything here is derived from visible
// history (or, for "Actually I Read the Instructions", the true odds, which are
// honest probabilities — never the actual locked-in throw, except Mastermind leaks).
import type { Dist, GameState, IntelFlags, IntelMemory, Move, OpponentDef, RoundPrediction, RoundRecord } from './types';
import { MOVES } from './types';
import { beats, idx, normalize, outcomeProbs } from './rps';
import { effectiveSaveChance, intelFlags, throwCost } from './rules';
import { currentMood, getOpponent, relativeTo, shiftFrom } from './opponentModel';

// ---------------- Estimator (Spreadsheet / Predictive Analytics) ----------------

/** What is visible about the CURRENT round before anyone throws (an announcement, a mood badge). */
export interface RoundCue { said?: Move | null; mood?: 0 | 1 | null }
type CtxFn = (h: RoundRecord[], now: RoundCue) => string | null;
const last = (h: RoundRecord[], k = 1) => h[h.length - k];

export const CONTEXTS: Record<string, CtxFn> = {
  u: () => '',
  o1: (h) => (last(h) ? last(h).opponent : null),
  p1: (h) => (last(h) ? last(h).player : null),
  ow: (h) => (last(h) ? last(h).opponent + last(h).rawOutcome : null),
  o2: (h) => (h.length >= 2 ? last(h, 2).opponent : null),
  op: (h) => (last(h) ? last(h).opponent + last(h).player : null),
  pp: (h) => (h.length >= 2 ? last(h, 2).player + last(h).player : null),
  p2: (h) => (h.length >= 2 ? last(h, 2).player : null),
  pf: (h) => (h.length >= 3 ? mostCommonKey(h.slice(-6).map((r) => r.player)) : null), // your recent habit
  ol: (h) => (h.length >= 2 ? leastCommonKey(h.map((r) => r.opponent)) : null), // their least-used throw
  oo: (h) => (h.length >= 2 ? last(h, 2).opponent + last(h).opponent : null), // short loops
  o3: (h) => (h.length >= 3 ? last(h, 3).opponent + last(h, 2).opponent + last(h).opponent : null), // longer loops
  oL: (h) => (h.length >= 4 ? last(h, 4).opponent + last(h, 3).opponent : null), // period-4/5 loops
  mo: (h, n) => (n.mood != null && last(h) ? n.mood + last(h).opponent : null), // mood + their last
  mp: (h, n) => (n.mood != null && last(h) ? n.mood + last(h).player : null), // mood + your last
  sd: (_h, n) => (n.said ? n.said : null), // what they announced
  sr: (h, n) => (n.said && last(h)?.said ? n.said + relativeTo(last(h).player, last(h).said as Move) : null), // announcement + how you answered the last one
};

function mostCommonKey(ms: Move[]): string {
  const c = [0, 0, 0];
  ms.forEach((m) => c[idx(m)]++);
  return MOVES[c.indexOf(Math.max(...c))];
}
function leastCommonKey(ms: Move[]): string {
  const c = [0, 0, 0];
  ms.forEach((m) => c[idx(m)]++);
  return MOVES[c.indexOf(Math.min(...c))];
}

export function emptyIntelMemory(): IntelMemory {
  return { counts: {}, scores: {}, total: 0 };
}

function ctxPrediction(mem: IntelMemory, c: string, key: string | null): Dist {
  const u = mem.counts['u:'] ?? [0, 0, 0];
  const un = u[0] + u[1] + u[2];
  const up: Dist = [(u[0] + 0.5) / (un + 1.5), (u[1] + 0.5) / (un + 1.5), (u[2] + 0.5) / (un + 1.5)];
  if (c === 'u' || key === null) return up;
  const k = mem.counts[`${c}:${key}`] ?? [0, 0, 0];
  const n = k[0] + k[1] + k[2];
  const prior = 1;
  return [(k[0] + prior * up[0]) / (n + prior), (k[1] + prior * up[1]) / (n + prior), (k[2] + prior * up[2]) / (n + prior)];
}

/** Update the estimator after a round (history = stage history BEFORE this round). */
export function learn(mem: IntelMemory, historyBefore: RoundRecord[], actual: Move, tellOf: OpponentDef | null = null, now: RoundCue = {}): void {
  const i = idx(actual);
  if (tellOf) {
    // Score the "what the behaviour description says" model alongside the statistical ones.
    const g = guessFromTell(tellOf, historyBefore, now);
    if (g) mem.scores.tell = 0.8 * (mem.scores.tell ?? 0) + Math.log(g[i]);
  }
  for (const c of Object.keys(CONTEXTS)) {
    const key = CONTEXTS[c](historyBefore, now);
    if (key === null) continue;
    const p = ctxPrediction(mem, c, key);
    mem.scores[c] = 0.8 * (mem.scores[c] ?? 0) + Math.log(p[i]);
    const ck = `${c}:${key}`;
    const arr = mem.counts[ck] ?? (mem.counts[ck] = [0, 0, 0]);
    arr[i]++;
  }
  mem.total++;
}

/**
 * Level 1 (Spreadsheet): overall frequency + "after they threw X" frequency.
 * Level 2 (Predictive Analytics): every context model, weighted by recent accuracy.
 * Either level also folds in the behaviour description when you can read it (Do Your Research / easy opponents).
 */
export function estimate(mem: IntelMemory, hist: RoundRecord[], level: 1 | 2, tellOf: OpponentDef | null = null, now: RoundCue = {}): Dist {
  const tell = tellOf ? guessFromTell(tellOf, hist, now) : null;
  if (level === 1) {
    const a = ctxPrediction(mem, 'u', '');
    // The Spreadsheet keys on the most obvious thing in front of you: an announcement if there is one, else their last throw.
    const b = now.said ? ctxPrediction(mem, 'sd', now.said) : ctxPrediction(mem, 'o1', CONTEXTS.o1(hist, now));
    if (tell) return normalize([(a[0] + b[0] + tell[0]) / 3, (a[1] + b[1] + tell[1]) / 3, (a[2] + b[2] + tell[2]) / 3]);
    return normalize([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  }
  const models: { score: number; p: Dist }[] = Object.keys(CONTEXTS)
    .filter((c) => CONTEXTS[c](hist, now) !== null)
    .map((c) => ({ score: mem.scores[c] ?? 0, p: ctxPrediction(mem, c, CONTEXTS[c](hist, now)) }));
  if (tell) models.push({ score: mem.scores.tell ?? 0, p: tell });
  const best = Math.max(...models.map((m) => m.score));
  const out: Dist = [0, 0, 0];
  let wsum = 0;
  for (const m of models) {
    const w = Math.exp(m.score - best);
    out[0] += w * m.p[0]; out[1] += w * m.p[1]; out[2] += w * m.p[2];
    wsum += w;
  }
  return normalize([out[0] / wsum, out[1] / wsum, out[2] / wsum]);
}

/** The visible cue for the coming round: what they announced, and which mood they're in. */
export function roundCue(s: GameState): RoundCue {
  const o = getOpponent(s.opponentId);
  return { said: s.opponentSays, mood: currentMood(o, s.stageHistory.length).index };
}

/** The opponent whose behaviour description the player can currently read, if any. */
export function readableTell(s: GameState): OpponentDef | null {
  const o = getOpponent(s.opponentId);
  return intelFlags(s).behaviourText ? o : null;
}

/** Throw that minimises loss chance after your saves, breaking ties by win chance. */
export function recommendedMove(s: GameState, d: Dist, allIn = false): Move {
  let best: Move = 'R';
  let bestScore = -Infinity;
  for (const m of MOVES) {
    if (throwCost(s, m) > s.currency) continue;
    const o = outcomeProbs(m, d);
    const lossAfter = o.loss * (1 - effectiveSaveChance(s, m, allIn));
    const score = -lossAfter * 10 + o.win;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

export function computePrediction(s: GameState, level: 1 | 2): RoundPrediction {
  let dist = estimate(s.intelMemory, s.stageHistory, level, readableTell(s), roundCue(s));
  // A Cold Read is real information about this round's throw: the Hunch uses it too.
  if (s.ruledOut) {
    const d: Dist = [...dist] as Dist;
    d[idx(s.ruledOut)] = 0;
    dist = normalize(d);
  }
  const maxp = Math.max(...dist);
  const n = s.stageHistory.length;
  const confidence = n >= 10 && maxp >= 0.6 ? 'High' : n >= 5 && maxp >= 0.45 ? 'Medium' : 'Low';
  const predicted = MOVES[dist.indexOf(maxp)];
  return { dist, predicted, recommended: recommendedMove(s, dist), confidence };
}

// ---------------- Intel view for UI + simulator ----------------

export interface IntelView {
  flags: IntelFlags;
  opponent: OpponentDef;
  showTell: boolean;
  visibleHistory: RoundRecord[];
  frequencies: [number, number, number] | null;
  prediction: RoundPrediction | null;
  trueOdds: Dist | null;
  /** Owns Actually I Read the Instructions but this round's odds are unreadable. */
  oddsUnreadable: boolean;
  leaked: Move | null;
  ruledOut: Move | null;
  /** The opponent's announcement for this round (The Bluffer). Not hidden by research: he says it out loud. */
  said: Move | null;
  /** Current mood (Mood Swings): index and display name. */
  mood: { index: 0 | 1; name: string; roundsLeft: number } | null;
  nextOpponent: OpponentDef | null;
  saveChances: Record<Move, number>;
}

export function getIntel(s: GameState, opts: { light?: boolean } = {}): IntelView {
  const flags = intelFlags(s);
  const opponent = getOpponent(s.opponentId);
  const saveChances = { R: effectiveSaveChance(s, 'R'), P: effectiveSaveChance(s, 'P'), S: effectiveSaveChance(s, 'S') };
  const base: IntelView = {
    flags, opponent, showTell: false, visibleHistory: [], frequencies: null, prediction: null,
    trueOdds: null, oddsUnreadable: false, leaked: null, ruledOut: null, said: null, mood: null, nextOpponent: null, saveChances,
  };
  if (flags.hidden) return base;
  const h = s.stageHistory;
  base.showTell = flags.behaviourText;
  base.visibleHistory = h.slice(-flags.historyWindow);
  if (flags.frequencies) {
    const f: [number, number, number] = [0, 0, 0];
    h.forEach((r) => f[idx(r.opponent)]++);
    base.frequencies = f;
  }
  const live = s.status === 'playing' && !!s.pendingOpponentMove;
  // The Hunch is computed at round start; if it's missing for any reason (old save, mid-round change), compute it now.
  base.prediction = live && flags.prediction > 0 ? (s.roundPrediction ?? computePrediction(s, flags.prediction as 1 | 2)) : null;
  if (live && flags.trueOdds && s.oddsVisible && s.pendingOpponentDist) {
    const d = s.pendingOpponentDist;
    base.trueOdds = [Math.round(d[0] * 20) / 20, Math.round(d[1] * 20) / 20, Math.round(d[2] * 20) / 20];
  }
  base.oddsUnreadable = live && flags.trueOdds && !s.oddsVisible;
  if (live && s.leaked) base.leaked = s.pendingOpponentMove;
  if (live && s.ruledOut) base.ruledOut = s.ruledOut;
  if (live && s.opponentSays) base.said = s.opponentSays;
  const md = currentMood(opponent, h.length);
  if (live && md.index !== null && opponent.moods) {
    const p = opponent.moods.period;
    base.mood = { index: md.index, name: opponent.moods.names[md.index], roundsLeft: p - (h.length % p) };
  }
  if (flags.showNextOpponent) base.nextOpponent = getOpponent(s.nextOpponentId);
  return base;
}

/**
 * The best honest belief about the opponent's next throw given what the
 * player can see. Used by simulator policies; mirrors what a human could infer.
 */
export function beliefFromIntel(v: IntelView): { dist: Dist; certainty: number } {
  const b = rawBelief(v);
  if (v.ruledOut && !v.leaked) {
    const d: Dist = [...b.dist] as Dist;
    d[idx(v.ruledOut)] = 0;
    return { dist: normalize(d), certainty: Math.min(1, b.certainty + 0.15) };
  }
  return b;
}

function rawBelief(v: IntelView): { dist: Dist; certainty: number } {
  const tellGuess = v.showTell ? guessFromTell(v.opponent, v.visibleHistory, { said: v.said, mood: v.mood?.index ?? null }) : null;
  if (v.leaked) {
    const d: Dist = [0, 0, 0];
    d[idx(v.leaked)] = 1;
    return { dist: d, certainty: 1 };
  }
  if (v.trueOdds) return { dist: normalize(v.trueOdds), certainty: 0.9 };
  if (v.prediction) {
    const certainty = v.prediction.confidence === 'High' ? 0.8 : v.prediction.confidence === 'Medium' ? 0.6 : 0.4;
    if (!tellGuess) return { dist: v.prediction.dist, certainty };
    // A sensible person trusts the spreadsheet more as it collects data, and their reading of the tell before that.
    const n = v.visibleHistory.length >= 5 ? Math.max(v.visibleHistory.length, v.frequencies ? v.frequencies[0] + v.frequencies[1] + v.frequencies[2] : 0) : v.visibleHistory.length;
    const w = n / (n + 8);
    const p = v.prediction.dist;
    return { dist: normalize([w * p[0] + (1 - w) * tellGuess[0], w * p[1] + (1 - w) * tellGuess[1], w * p[2] + (1 - w) * tellGuess[2]]), certainty: Math.max(certainty, 0.45) };
  }
  const f = [1, 1, 1];
  v.visibleHistory.forEach((r) => f[idx(r.opponent)]++);
  if (v.frequencies) { f[0] = v.frequencies[0] + 1; f[1] = v.frequencies[1] + 1; f[2] = v.frequencies[2] + 1; }
  const freq = normalize(f as Dist);
  if (tellGuess) {
    return { dist: normalize([0.4 * freq[0] + 0.6 * tellGuess[0], 0.4 * freq[1] + 0.6 * tellGuess[1], 0.4 * freq[2] + 0.6 * tellGuess[2]]), certainty: 0.45 };
  }
  // Raw frequency alone is a trap against adaptive opponents; a sensible person hedges.
  return { dist: normalize([0.5 * freq[0] + 1 / 6, 0.5 * freq[1] + 1 / 6, 0.5 * freq[2] + 1 / 6]), certainty: 0.15 };
}

/**
 * What a person who has READ the behaviour description would guess, using only
 * the visible history. Deliberately rough: "tends to" ≈ 60%.
 */
export function guessFromTell(o: OpponentDef, h: RoundRecord[], now: RoundCue = {}): Dist | null {
  if (o.moods) {
    // Read the badge, then read that mood's habit.
    if (now.mood == null) return null;
    return guessFromTell({ ...o, ...(now.mood === 0 ? o.moods.a : o.moods.b), moods: undefined }, h, now);
  }
  const lean = (m: Move | null): Dist | null => {
    if (!m) return null;
    const d: Dist = [0.2, 0.2, 0.2];
    d[idx(m)] = 0.6;
    return d;
  };
  const l = h[h.length - 1];
  const l2 = h[h.length - 2];
  const fav = o.base[0] > o.base[1] && o.base[0] > o.base[2] ? 'R' : o.base[1] > o.base[0] && o.base[1] > o.base[2] ? 'P' : o.base[2] > o.base[0] && o.base[2] > o.base[1] ? 'S' : null;
  if (fav) return lean(fav as Move);
  if (o.bluff) {
    if (!now.said) return null;
    // Expect the bluff; if you answered his last announcement a certain way, expect him to beat that answer again.
    const d: Dist = [0.1, 0.1, 0.1];
    d[idx(shiftFrom(now.said, 2))] += 0.45;
    if (l?.said) d[idx(shiftFrom(now.said, relativeTo(l.player, l.said) + 1))] += 0.45;
    else d[idx(shiftFrom(now.said, 2))] += 0.2;
    return normalize(d);
  }
  if (o.avoidLoser !== undefined && l) {
    if (l.rawOutcome === 'WIN') { const d: Dist = [0.5, 0.5, 0.5]; d[idx(l.opponent)] = 0; return normalize(d); }
    return lean(l.rawOutcome === 'LOSS' ? l.opponent : beats(l.opponent));
  }
  if (o.loop) {
    // Find the shortest period (2–4) that the visible history repeats, allowing the odd slip.
    let best: { p: number; rate: number } | null = null;
    for (let p = 2; p <= 4; p++) {
      if (h.length < p + 2) continue; // at least two comparisons, so one coincidence isn't a 'loop'
      let match = 0, n = 0;
      for (let i = h.length - 1; i >= p && n < 2 * p + 2; i--, n++) if (h[i].opponent === h[i - p].opponent) match++;
      const rate = match / n;
      if (rate >= 0.75 && (!best || rate > best.rate + 0.1)) best = { p, rate };
    }
    return best ? lean(h[h.length - best.p].opponent) : null;
  }
  if (o.copyPlayer) return lean(l ? l.player : null);
  if (o.counterPlayerLast) return lean(l ? beats(l.player) : null);
  if (o.winStay && o.loseShift && l) return lean(l.rawOutcome === 'WIN' ? beats(l.player) : l.opponent);
  if (o.winShift && o.loseStay && l) return lean(l.rawOutcome === 'WIN' ? l.opponent : beats(l.opponent));
  if (o.repeatOwn) return lean(l ? l.opponent : null);
  if (o.cycle) return lean(l ? beats(l.opponent) : null);
  if (o.mirrorTwoBack) return lean(l2 ? l2.player : null);
  if (o.echoTwoBack) return lean(l2 ? beats(l2.opponent) : null);
  if (o.leastPlayed && h.length >= 2) {
    const c = [0, 0, 0];
    h.forEach((r) => c[idx(r.opponent)]++);
    return lean(MOVES[c.indexOf(Math.min(...c))]);
  }
  if (o.counterPlayerBigram && l && h.length >= 3) {
    const f = [0, 0, 0];
    for (let i = 1; i < h.length; i++) if (h[i - 1].player === l.player) f[idx(h[i].player)]++;
    if (f[0] + f[1] + f[2] >= 2) return lean(beats(MOVES[f.indexOf(Math.max(...f))]));
  }
  if (o.counterPlayerFreq && h.length >= 3) {
    const c = [0, 0, 0];
    h.slice(-o.counterPlayerFreq.window).forEach((r) => c[idx(r.player)]++);
    return lean(beats(MOVES[c.indexOf(Math.max(...c))]));
  }
  if (o.favoritePhase && h.length >= 2) {
    const c = [0, 0, 0];
    h.slice(-4).forEach((r) => c[idx(r.opponent)]++);
    return lean(MOVES[c.indexOf(Math.max(...c))]);
  }
  return null;
}
