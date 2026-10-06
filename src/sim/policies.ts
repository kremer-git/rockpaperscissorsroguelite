// Simulated player policies. They only see what a human could see (getIntel),
// and they act through the same engine functions as the UI.
import type { Dist, GameState, Move, UpgradeDef } from '../core/types';
import { MOVES } from '../core/types';
import { beats, idx, outcomeProbs } from '../core/rps';
import { beliefFromIntel, getIntel } from '../core/intel';
import { allInAvailable, effectiveSaveChance, opponentRerollPrice, storeRerollPrice, throwCost, upgradePrice } from '../core/rules';
import { buyLife, buyUpgrade, canBuyLife, eligibleUpgrades, rerollOpponent, rerollStore, rerollableOffers } from '../core/engine';

/** Offers can become unbuyable mid-visit (No Thoughts vs intel). */
const buyable = (s: GameState, id: string) => eligibleUpgrades(s).some((d) => d.id === id);
import { getUpgrade, owned } from '../core/registry';
import { ROUTINE_MAX, routineBonus, routineOf } from '../content/upgrades';
import { getOpponent } from '../core/opponentModel';
import { CONFIG } from '../core/config';
import { nextRandom } from '../core/rng';
import { getCurve } from '../core/intervals';

export interface Decision { move: Move; allIn: boolean }

export interface Policy {
  id: string;
  label: string;
  chooseMove(s: GameState, rnd: () => number): Decision;
  shop(s: GameState, rnd: () => number): void;
}

// ---------- move selection building blocks ----------

function lossAfterSaves(s: GameState, m: Move, d: Dist, allIn = false): number {
  return outcomeProbs(m, d).loss * (1 - effectiveSaveChance(s, m, allIn));
}

function affordable(s: GameState): Move[] {
  const a = MOVES.filter((m) => throwCost(s, m) <= s.currency);
  return a.length ? a : ['R'];
}

/** Minimise loss after saves; break near-ties by win chance, then randomly (humans aren't deterministic). */
function safeMove(s: GameState, d: Dist, rnd: () => number): Move {
  const opts = affordable(s).map((m) => ({ m, loss: lossAfterSaves(s, m, d), win: outcomeProbs(m, d).win }));
  const best = Math.min(...opts.map((o) => o.loss));
  const near = opts.filter((o) => o.loss <= best + 0.02);
  near.sort((a, b) => b.win - a.win);
  const topWin = near[0].win;
  const pool = near.filter((o) => o.win >= topWin - 0.03);
  return pool[Math.floor(rnd() * pool.length)].m;
}

function belief(s: GameState) {
  return beliefFromIntel(getIntel(s, { light: true }));
}

function randomMove(s: GameState, rnd: () => number): Move {
  const a = affordable(s);
  return a[Math.floor(rnd() * a.length)];
}

// ---------- store building blocks ----------

const RARITY_VALUE: Record<string, number> = { common: 1, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 2.8 };

interface ShopPrefs {
  tree: Record<string, number>;
  tags: Record<string, number>;
  ids?: Record<string, number>;
  /** Preferred build order. Listed upgrades outrank everything else, earlier = better. */
  plan?: string[];
  lifeEagerness: number; // 0 never … 1 always when affordable
  reserveFrac: number; // keep this fraction of coins after upgrades (for lives)
  rerollStoreIfBelow: number; // reroll when best offer scores under this
  opponentRerollTiers: string[]; // reroll next opponent if it is in these tiers/ids
}

function upgradeScore(s: GameState, d: UpgradeDef, p: ShopPrefs): number {
  if (p.plan) {
    const i = p.plan.indexOf(d.id);
    if (i >= 0) return 8 - (6 * i) / p.plan.length;
  }
  let sc = RARITY_VALUE[d.rarity] * (p.tree[d.tree] ?? 1);
  let tagSum = 0;
  for (const t of d.tags) tagSum += p.tags[t] ?? 0;
  sc *= 1 + Math.max(-0.9, tagSum) / 3;
  if (p.ids && p.ids[d.id] !== undefined) sc *= p.ids[d.id];
  // synergy: an owned prerequisite-type upgrade makes related ones better
  if (d.tags.includes('prediction') && (owned(s, 'spreadsheet') || owned(s, 'predictive-analytics'))) sc *= 1.2;
  if (d.id === 'spreadsheet' && owned(s, 'predictive-analytics')) sc *= 0.2; // redundant
  if (d.id === 'glass-cannon' && s.owned.some((u) => getUpgrade(u.id).tags.includes('save'))) sc *= 0.5;
  return sc;
}

/** Expected number of losses we would suffer over the next gap (rough, using current belief). */
function expectedLossesNextGap(s: GameState): number {
  const gap = s.store ? nextGap(s) : 1;
  const d: Dist = [1 / 3, 1 / 3, 1 / 3];
  const bestLoss = Math.min(...MOVES.map((m) => lossAfterSaves(s, m, d)));
  // Assume information cuts loss vs a biased opponent by ~35% on average.
  const infoFactor = owned(s, 'predictive-analytics') || owned(s, 'spreadsheet') ? 0.55 : 0.75;
  return gap * bestLoss * infoFactor;
}

/** Length of the stage that starts when we leave this store. */
function nextGap(s: GameState): number {
  return getCurve(s.curveId).gap(s.stage + 1);
}

function genericShop(s: GameState, p: ShopPrefs, rnd: () => number): void {
  if (!s.store) return;
  // 1) Opponent reroll if the next opponent is a known bad matchup.
  const next = getOpponent(s.nextOpponentId);
  if ((p.opponentRerollTiers.includes(next.tier) || p.opponentRerollTiers.includes(next.id)) && nextGap(s) >= 3) {
    const price = opponentRerollPrice(s);
    if (price <= s.currency * 0.5) rerollOpponent(s);
  }
  // 2) Lives first if the next stretch looks deadly.
  const expLoss = expectedLossesNextGap(s);
  const wantLives = p.lifeEagerness > 0 ? Math.min(6, Math.floor(expLoss * p.lifeEagerness + (p.lifeEagerness >= 1 ? 0.5 : 0))) : 0;
  let livesBought = 0;
  const buyLivesUpTo = (n: number, maxFrac: number) => {
    while (s.lives < n) {
      const c = canBuyLife(s);
      if (!c.ok || c.price > s.currency * maxFrac) break;
      buyLife(s); livesBought++;
    }
  };
  if (s.lives === 0 && expLoss > 1.2) buyLivesUpTo(Math.min(1, wantLives), 0.9);

  // 3) Upgrades, best score per coin, optionally rerolling once or twice.
  for (let pass = 0; pass < 3; pass++) {
    let bought = true;
    while (bought) {
      bought = false;
      const offers = s.store.offers.filter((o) => !o.sold && buyable(s, o.upgradeId));
      const scored = offers
        .map((o) => ({ o, d: getUpgrade(o.upgradeId), price: upgradePrice(s, o.upgradeId) }))
        .map((x) => ({ ...x, sc: upgradeScore(s, x.d, p) }))
        .filter((x) => x.sc > 0.6)
        .sort((a, b) => b.sc / Math.sqrt(b.price) - a.sc / Math.sqrt(a.price));
      for (const x of scored) {
        const reserve = s.currency * p.reserveFrac;
        if (x.price <= s.currency - reserve || (x.sc > 3 && x.price <= s.currency)) {
          buyUpgrade(s, x.o.slot);
          bought = true;
          break;
        }
      }
    }
    const best = Math.max(0, ...s.store.offers.filter((o) => !o.sold).map((o) => upgradeScore(s, getUpgrade(o.upgradeId), p)));
    const rp = storeRerollPrice(s);
    if (rerollableOffers(s) > 0 && best < p.rerollStoreIfBelow && rp <= s.currency * 0.15 && s.currency > 40) rerollStore(s);
    else break;
  }
  // 4) Remaining lives.
  buyLivesUpTo(wantLives, 1 - Math.min(0.5, p.reserveFrac));
  void livesBought; void rnd;
}

// ---------- concrete policies ----------

const ALL = { rock: 1, paper: 1, scissors: 1 };

export const POLICIES: Policy[] = [
  {
    id: 'random', label: 'Random Player',
    chooseMove: (s, rnd) => ({ move: randomMove(s, rnd), allIn: false }),
    shop: (s, rnd) => {
      if (!s.store) return;
      for (let i = 0; i < 3; i++) {
        const offers = s.store.offers.filter((o) => !o.sold && buyable(s, o.upgradeId) && upgradePrice(s, o.upgradeId) <= s.currency);
        if (!offers.length || rnd() < 0.3) break;
        buyUpgrade(s, offers[Math.floor(rnd() * offers.length)].slot);
      }
      if (rnd() < 0.3 && canBuyLife(s).ok) buyLife(s);
    },
  },
  {
    id: 'baseline', label: 'Baseline Player',
    chooseMove: (s, rnd) => {
      if (rnd() < 0.1) return { move: randomMove(s, rnd), allIn: false };
      return { move: safeMove(s, belief(s).dist, rnd), allIn: false };
    },
    shop: (s, rnd) => genericShop(s, {
      tree: ALL, tags: { save: 2, info: 1.5, prediction: 2, economy: 1, lives: 0.5, tie: 0, drawback: -1.5 },
      lifeEagerness: 0.6, reserveFrac: 0.25, rerollStoreIfBelow: 0, opponentRerollTiers: [],
    }, rnd),
  },
  {
    id: 'rock', label: 'Rock-Focused',
    chooseMove: (s, rnd) => {
      const b = belief(s);
      const paperRisk = b.dist[idx('P')];
      if (paperRisk > 0.42 && b.certainty >= 0.4) return { move: safeMove(s, b.dist, rnd), allIn: false };
      return { move: 'R', allIn: false };
    },
    shop: (s, rnd) => genericShop(s, {
      tree: { rock: 3, paper: 0.7, scissors: 0.5 }, tags: { save: 2.5, rock: 1.5, tie: 0.5, info: 0.5, drawback: 0 },
      plan: ['thick-skull', 'muscle-memory', 'rocks-are-heavy', 'built-different', 'absolute-unit', 'geological-advantage', 'monolith', 'rock-bottom', 'no-thoughts', 'dig-in', 'do-your-research', 'bedrock', 'stone-cold', 'rock-collection', 'brute-force', 'big-rock-theory'],
      lifeEagerness: 0.7, reserveFrac: 0.2, rerollStoreIfBelow: 1.2, opponentRerollTiers: ['paper-pusher', 'psychologist', 'oracle', 'nash'],
    }, rnd),
  },
  {
    id: 'paper', label: 'Paper-Focused',
    chooseMove: (s, rnd) => {
      const b = belief(s);
      const safe = safeMove(s, b.dist, rnd);
      // Show Your Work: follow the routine when it costs little (the read is weak, or the routine throw is nearly as safe).
      const sw = owned(s, 'show-your-work');
      if (sw && routineBonus(sw) < ROUTINE_MAX) {
        const want = routineOf(sw)[sw.data.step ?? 0];
        if (throwCost(s, want) <= s.currency && lossAfterSaves(s, want, b.dist) <= lossAfterSaves(s, safe, b.dist) + 0.06) return { move: want, allIn: false };
      }
      return { move: safe, allIn: false };
    },
    shop: (s, rnd) => genericShop(s, {
      tree: { rock: 0.6, paper: 3, scissors: 0.6 }, tags: { info: 2.5, prediction: 3, save: 2, economy: 0.5 },
      plan: ['do-your-research', 'predictive-analytics', 'spreadsheet', 'study-session', 'paper-trail', 'due-diligence', 'contingency-plan', 'mastermind', 'read-the-instructions', 'peer-review', 'compound-interest', 'show-your-work', 'cold-read', 'i-have-sources', 'five-year-plan', 'confirmation-bias'],
      lifeEagerness: 0.6, reserveFrac: 0.2, rerollStoreIfBelow: 1.2, opponentRerollTiers: ['nash'],
    }, rnd),
  },
  {
    id: 'scissors', label: 'Scissors-Focused',
    chooseMove: (s, rnd) => {
      const b = belief(s);
      const m = safeMove(s, b.dist, rnd);
      const allIn = allInAvailable(s) && b.certainty >= 0.6 && outcomeProbs(m, b.dist).loss < 0.15 && outcomeProbs(m, b.dist).win > 0.55;
      return { move: m, allIn };
    },
    shop: (s, rnd) => genericShop(s, {
      tree: { rock: 0.5, paper: 0.7, scissors: 3 }, tags: { economy: 2.5, gamble: 1.5, lives: 1.5, save: 1, drawback: 0.5 },
      plan: ['risky-business', 'snip-snip', 'momentum', 'hush-money', 'close-shave', 'sharpening-stone', 'this-seems-fine', 'insurance-fraud', 'go-for-it', 'maximum-effort', 'death-wish', 'double-or-nothing', 'high-stakes', 'just-one-more', 'yolo', 'no-safety-net', 'glass-cannon'],
      lifeEagerness: 1, reserveFrac: 0.3, rerollStoreIfBelow: 1.5, opponentRerollTiers: ['nash'],
    }, rnd),
  },
  {
    id: 'tie', label: 'Tie Economy',
    chooseMove: (s, rnd) => {
      const b = belief(s);
      // Throw what we expect them to throw (to tie) unless it's much riskier than the safe move.
      const pred = (MOVES.slice().sort((a, c) => b.dist[idx(c)] - b.dist[idx(a)]))[0];
      const safe = safeMove(s, b.dist, rnd);
      if (throwCost(s, pred) <= s.currency && lossAfterSaves(s, pred, b.dist) <= lossAfterSaves(s, safe, b.dist) + 0.08) return { move: pred, allIn: false };
      return { move: safe, allIn: false };
    },
    shop: (s, rnd) => genericShop(s, {
      tree: ALL, tags: { tie: 4, save: 2, prediction: 1.5, economy: 1, drawback: -1 },
      plan: ['agree-to-disagree', 'standoff', 'peer-review', 'stone-cold', 'do-your-research', 'spreadsheet', 'predictive-analytics', 'study-session', 'big-rock-theory', 'contingency-plan'],
      ids: { 'risky-business': 0.1 },
      lifeEagerness: 0.7, reserveFrac: 0.2, rerollStoreIfBelow: 1.5, opponentRerollTiers: ['nash'],
    }, rnd),
  },
  {
    id: 'greedy', label: 'Greedy Economy',
    chooseMove: (s, rnd) => {
      const b = belief(s);
      // maximise expected coins, ignoring survival nuance
      let best: Move = 'R', bestEv = -1;
      for (const m of affordable(s)) {
        const o = outcomeProbs(m, b.dist);
        const ev = o.win * 10 + o.tie * 4 - o.loss * 3;
        if (ev > bestEv) { bestEv = ev; best = m; }
      }
      const allIn = allInAvailable(s) && outcomeProbs(best, b.dist).win > 0.5;
      return { move: best, allIn };
    },
    shop: (s, rnd) => genericShop(s, {
      tree: ALL, tags: { economy: 4, gamble: 2, active: 2, save: 0.5, drawback: 1 },
      plan: ['risky-business', 'momentum', 'compound-interest', 'glass-cannon', 'no-safety-net', 'double-or-nothing', 'sharpening-stone', 'i-have-sources', 'go-for-it', 'confirmation-bias', 'brute-force', 'yolo'],
      lifeEagerness: 0.8, reserveFrac: 0.1, rerollStoreIfBelow: 2, opponentRerollTiers: [],
    }, rnd),
  },
  {
    id: 'survival', label: 'Survival / Lives',
    chooseMove: (s, rnd) => ({ move: safeMove(s, belief(s).dist, rnd), allIn: false }),
    shop: (s, rnd) => genericShop(s, {
      tree: ALL, tags: { save: 4, lives: 3, prediction: 2, info: 1, economy: 0, drawback: -3, gamble: -3 },
      plan: ['do-your-research', 'study-session', 'dig-in', 'contingency-plan', 'this-seems-fine', 'maximum-effort', 'spreadsheet', 'due-diligence', 'monolith', 'peer-review', 'hush-money', 'bedrock'],
      lifeEagerness: 1.5, reserveFrac: 0.45, rerollStoreIfBelow: 1, opponentRerollTiers: ['nash', 'oracle'],
    }, rnd),
  },
  {
    id: 'optimizer', label: 'Optimizer',
    chooseMove: (s, rnd) => {
      const b = belief(s);
      const m = safeMove(s, b.dist, rnd);
      const o = outcomeProbs(m, b.dist);
      const allIn = allInAvailable(s) && b.certainty >= 0.8 && o.loss < 0.06 && s.lives > 0;
      return { move: m, allIn };
    },
    shop: (s, rnd) => genericShop(s, {
      tree: ALL, tags: { prediction: 4, save: 3.5, info: 2, economy: 2, lives: 2, charge: 1, drawback: -1 },
      plan: ['do-your-research', 'predictive-analytics', 'spreadsheet', 'study-session', 'contingency-plan', 'mastermind', 'due-diligence', 'read-the-instructions', 'hush-money', 'dig-in', 'maximum-effort', 'momentum', 'risky-business', 'compound-interest', 'this-seems-fine', 'peer-review'],
      ids: { mastermind: 2, 'read-the-instructions': 1.8, 'predictive-analytics': 1.8, 'no-thoughts': 0.3, 'glass-cannon': 0.4, 'absolute-unit': 0.6 },
      lifeEagerness: 1.1, reserveFrac: 0.3, rerollStoreIfBelow: 1.6, opponentRerollTiers: ['nash', 'oracle'],
    }, rnd),
  },
];

export function getPolicy(id: string): Policy {
  const p = POLICIES.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown policy ${id}`);
  return p;
}

export { beats, nextRandom };
