// Debug / QA helpers. They operate through the same state + engine so they
// exercise real rules. Every call is logged in state.debugLog.
import type { GameState, Move } from './types';
import { addUpgrade, curveGap, leaveStore, playRound, recommitRound, refreshRoundIntel } from './engine';
import { owned, getUpgrade } from './registry';
import { getOpponent, opponentDistribution } from './opponentModel';
import { effectiveSaveChance, rawSaveChance } from './rules';
import { emptyIntelMemory } from './intel';
import { beats } from './rps';

const log = (s: GameState, msg: string) => { s.debugLog.push(`[r${s.round}] ${msg}`); if (s.debugLog.length > 200) s.debugLog.shift(); };

export function dbgAddCurrency(s: GameState, n: number) { s.currency = Math.max(0, s.currency + n); log(s, `currency ${n >= 0 ? '+' : ''}${n}`); }
export function dbgAddLife(s: GameState, n = 1) { s.lives = Math.max(0, s.lives + n); log(s, `lives ${n >= 0 ? '+' : ''}${n}`); }
export function dbgAddUpgrade(s: GameState, id: string) { getUpgrade(id); addUpgrade(s, id); log(s, `add upgrade ${id}`); }
export function dbgRemoveUpgrade(s: GameState, id: string) {
  const u = owned(s, id);
  if (!u) return;
  if (u.stacks > 1) u.stacks--; else s.owned = s.owned.filter((o) => o.id !== id);
  refreshRoundIntel(s);
  log(s, `remove upgrade ${id}`);
}

/** Replace the current opponent (resets stage learning) and re-commit its throw. */
export function dbgSetOpponent(s: GameState, id: string) {
  getOpponent(id);
  s.opponentId = id;
  s.stageHistory = [];
  s.intelMemory = emptyIntelMemory();
  s.opponentMemory = {};
  if (!s.stats.opponentsEncountered.includes(id)) s.stats.opponentsEncountered.push(id);
  recommit(s);
  log(s, `opponent → ${id}`);
}

/** Force the outcome of the next round by choosing what the opponent throws. */
export function dbgForceOutcome(s: GameState, playerMove: Move, outcome: 'WIN' | 'TIE' | 'LOSS') {
  const opp: Move = outcome === 'TIE' ? playerMove : outcome === 'LOSS' ? beats(playerMove) : (beats(beats(playerMove)));
  dbgForceOpponent(s, opp);
  log(s, `forced ${outcome} if you throw ${playerMove}`);
}

export function dbgForceOpponent(s: GameState, m: Move) {
  s.pendingOpponentMove = m;
  // Keep Cold Read honest: it may never name the throw that is actually locked in.
  if (s.ruledOut === m) s.ruledOut = beats(m);
  log(s, `opponent will throw ${m}`);
}

function recommit(s: GameState) {
  // Note: startRound also ticks per-round upgrade state (e.g. Dig In), same as a real new round.
  recommitRound(s);
}

/** Skip N rounds by auto-throwing whatever ties the opponent (no rewards bias beyond ties). */
export function dbgSkipRounds(s: GameState, n: number) {
  for (let i = 0; i < n && s.status === 'playing'; i++) {
    const m = s.pendingOpponentMove as Move;
    playRound(s, m);
  }
  log(s, `skipped ${n} rounds`);
}

export function dbgSkipToStore(s: GameState) {
  if (s.status !== 'playing') return;
  const left = s.currentGap - s.roundsIntoStage;
  dbgSkipRounds(s, left);
}

/** Jump to a stage (for testing long gaps). Leaves the store if needed. */
export function dbgJumpToStage(s: GameState, stage: number) {
  if (s.status === 'store') leaveStore(s);
  s.stage = Math.max(0, stage);
  s.storesVisited = Math.max(s.storesVisited, s.stage);
  s.currentGap = curveGap(s, s.stage);
  s.roundsIntoStage = 0;
  // Stage-length-dependent charges (Monolith) should see the new stretch.
  for (const u of s.owned) getUpgrade(u.id).onOpponentChange?.(s, u);
  log(s, `jumped to stage ${stage} (gap ${s.currentGap})`);
}

export function dbgInspect(s: GameState) {
  const { dist, reactive, adaptive } = s.status === 'playing' ? opponentDistribution(s) : { dist: null, reactive: null, adaptive: null };
  return {
    opponent: s.opponentId,
    committedThrow: s.pendingOpponentMove,
    committedDist: s.pendingOpponentDist,
    recomputedDist: dist,
    reactive, adaptive,
    saveChance: { R: effectiveSaveChance(s, 'R'), P: effectiveSaveChance(s, 'P'), S: effectiveSaveChance(s, 'S') },
    rawSaveChance: { R: rawSaveChance(s, 'R'), P: rawSaveChance(s, 'P'), S: rawSaveChance(s, 'S') },
    owned: s.owned.map((u) => ({ id: u.id, stacks: u.stacks, data: u.data })),
    lastTriggers: s.lastTriggers,
  };
}
