// Runs complete games with a policy and collects metrics.
import type { GameState, Tree } from '../core/types';
import { createRun, leaveStore, playRound } from '../core/engine';
import { getUpgrade } from '../core/registry';
import { getOpponent } from '../core/opponentModel';
import { CONFIG } from '../core/config';
import type { Policy } from './policies';
import { dbgAddUpgrade } from '../core/debug';

export interface RunMetrics {
  seed: number;
  rounds: number;
  stores: number;
  gapAtDeath: number;
  roundsIntoGapAtDeath: number;
  longestGapSurvived: number;
  currencyEarned: number;
  currencySpent: number;
  upgrades: number;
  owned: string[];
  livesPurchased: number;
  livesConsumed: number;
  storeRerolls: number;
  opponentRerolls: number;
  wins: number;
  ties: number;
  losses: number;
  saves: number;
  deathOpponent: string;
  deathTier: string;
  immortal: boolean;
  archetype: string;
  maxCurrency: number;
  maxLivesHeld: number;
}

export function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function classifyBuild(s: GameState): string {
  const trees: Record<Tree, number> = { rock: 0, paper: 0, scissors: 0 };
  let tie = 0, eco = 0, info = 0;
  for (const u of s.owned) {
    const d = getUpgrade(u.id);
    trees[d.tree] += u.stacks;
    if (d.tags.includes('tie')) tie += u.stacks;
    if (d.tags.includes('economy')) eco += u.stacks;
    if (d.tags.includes('info') || d.tags.includes('prediction')) info += u.stacks;
  }
  const total = trees.rock + trees.paper + trees.scissors;
  if (total < 3) return 'undeveloped';
  if (tie >= 3 && tie / total >= 0.35) return 'tie-focused';
  const sorted = (Object.keys(trees) as Tree[]).sort((a, b) => trees[b] - trees[a]);
  const [a, b] = sorted;
  if (trees[a] / total >= 0.6) return `${a}-heavy`;
  if ((trees[a] + trees[b]) / total >= 0.85) return [a, b].sort().join('+');
  return 'three-tree';
}

export interface RunHooks {
  /** Called once after run creation (e.g. to grant upgrades for stress tests). */
  setup?(s: GameState): void;
  /** Called each round before the move (e.g. record scaling values). */
  onRound?(s: GameState): void;
  roundCap?: number;
  mode?: 'normal' | 'hard';
}

export function runOne(policy: Policy, seed: number, curveId?: string, hooks: RunHooks = {}): { m: RunMetrics; s: GameState } {
  const s = createRun({ seed, curveId, mode: hooks.mode });
  const rnd = mulberry(seed ^ 0x9e3779b9);
  hooks.setup?.(s);
  const cap = hooks.roundCap ?? CONFIG.safetyRoundCap;
  let maxCurrency = s.currency, maxLives = s.lives;
  while (s.status !== 'dead' && s.round < cap) {
    if (s.status === 'store') {
      policy.shop(s, rnd);
      leaveStore(s);
      continue;
    }
    hooks.onRound?.(s);
    const d = policy.chooseMove(s, rnd);
    playRound(s, d.move, { allIn: d.allIn });
    if (s.currency > maxCurrency) maxCurrency = s.currency;
    if (s.lives > maxLives) maxLives = s.lives;
  }
  const opp = getOpponent(s.opponentId);
  return {
    s,
    m: {
      seed, rounds: s.round, stores: s.storesVisited, gapAtDeath: s.currentGap, roundsIntoGapAtDeath: s.roundsIntoStage,
      longestGapSurvived: s.stats.longestGapSurvived, currencyEarned: s.stats.currencyEarned, currencySpent: s.stats.currencySpent,
      upgrades: s.owned.reduce((a, u) => a + u.stacks, 0), owned: s.owned.map((u) => u.id),
      livesPurchased: s.stats.livesPurchased, livesConsumed: s.stats.livesConsumed, storeRerolls: s.stats.storeRerolls,
      opponentRerolls: s.stats.opponentRerolls, wins: s.stats.wins, ties: s.stats.ties, losses: s.stats.losses, saves: s.stats.saves,
      deathOpponent: opp.id, deathTier: opp.tier, immortal: s.status !== 'dead', archetype: classifyBuild(s),
      maxCurrency, maxLivesHeld: maxLives,
    },
  };
}

export function runMany(policy: Policy, n: number, seedBase = 1, curveId?: string, hooks: RunHooks = {}): RunMetrics[] {
  const out: RunMetrics[] = [];
  for (let i = 0; i < n; i++) out.push(runOne(policy, seedBase + i * 7919, curveId, hooks).m);
  return out;
}

export function grant(ids: string[]): RunHooks['setup'] {
  return (s) => ids.forEach((id) => dbgAddUpgrade(s, id));
}
