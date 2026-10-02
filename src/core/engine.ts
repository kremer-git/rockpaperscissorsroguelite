// The one and only place where rules are applied. UI, simulator and tests all
// drive the game through these functions; none of them re-implement rules.
import type { EngineEvent, GameState, Move, RunMode, OpponentTier, OwnedUpgrade, RoundContext, RoundRecord, StoreOffer, Trigger, UpgradeDef } from './types';
import { MOVES } from './types';
import { CONFIG } from './config';
import { MOVE_NAME, resolve } from './rps';
import { nextRandom, pickWeighted, randomSeed } from './rng';
import { forEachOwned, getUpgrade, owned, UPGRADES } from './registry';
import { getCurve } from './intervals';
import { getOpponent, opponentDistribution, sampleMove, tickOpponentMemory } from './opponentModel';
import { OPPONENTS } from '../content/opponents';
import { allInAvailable, canThrow, effectiveSaveChance, intelFlags, lifePrice, maxLives, opponentRerollPrice, storeRerollPrice, throwCost, upgradePrice } from './rules';
import { computePrediction, emptyIntelMemory, learn, readableTell, roundCue } from './intel';

export const STATE_VERSION = 4;

// ---------------- events (for UI animation / audio; the engine never waits) ----------------
type Listener = (e: EngineEvent) => void;
const listeners = new Set<Listener>();
export function onEngineEvent(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(e: EngineEvent): void {
  if (listeners.size) listeners.forEach((l) => l(e));
}

export class RuleError extends Error {}

// ---------------- run lifecycle ----------------

export interface RunOptions {
  seed?: number;
  curveId?: string;
  startingCurrency?: number;
  mode?: RunMode;
  startingLives?: number;
}

export function createRun(opts: RunOptions = {}): GameState {
  const seed = opts.seed ?? randomSeed();
  const curveId = opts.curveId ?? CONFIG.curve;
  const mode: RunMode = opts.mode ?? 'normal';
  const s: GameState = {
    version: STATE_VERSION,
    seed,
    rngState: seed | 0,
    status: 'playing',
    round: 0,
    stage: 0,
    storesVisited: 0,
    roundsIntoStage: 0,
    currentGap: getCurve(curveId).gap(0),
    currency: opts.startingCurrency ?? CONFIG.startingCurrency,
    lives: opts.startingLives ?? (mode === 'hard' ? 0 : CONFIG.startingLives),
    owned: [],
    opponentId: '',
    nextOpponentId: '',
    opponentMemory: {},
    pendingOpponentMove: null,
    pendingOpponentDist: null,
    history: [],
    stageHistory: [],
    store: null,
    opponentRerollsBought: 0,
    lastTriggers: [],
    causeOfDeath: null,
    stats: {
      wins: 0, ties: 0, losses: 0, saves: 0, currencyEarned: 0, currencySpent: 0, upgradesPurchased: 0,
      livesPurchased: 0, livesConsumed: 0, storeRerolls: 0, opponentRerolls: 0, opponentsDefeated: 0,
      opponentsEncountered: [], longestGapSurvived: 0, moveCounts: { R: 0, P: 0, S: 0 }, allIns: 0,
    },
    curveId,
    mode,
    seenOpponents: [],
    oddsVisible: false,
    debugForceOpponent: null,
    debugLog: [],
    intelMemory: emptyIntelMemory(),
    roundPrediction: null,
    leaked: false,
    ruledOut: null,
    opponentSays: null,
    lastLifePrice: 0,
  };
  // burn a few values so nearby seeds diverge immediately
  for (let i = 0; i < 4; i++) nextRandom(s);
  s.opponentId = pickOpponent(s, 0, []);
  s.nextOpponentId = pickOpponent(s, 1, [s.opponentId]);
  s.stats.opponentsEncountered.push(s.opponentId);
  forEachOwned(s, (d, u) => d.onRunStart?.(s, u));
  emit({ type: 'runStart', state: s });
  startRound(s);
  return s;
}

export function curveGap(s: GameState, stage: number): number {
  return getCurve(s.curveId).gap(stage);
}

const TIER_ORDER: OpponentTier[] = ['easy', 'medium', 'hard', 'elite'];

/**
 * Picks an opponent for `stage`. Everyone appears once before anyone repeats:
 * unseen opponents in the stage's allowed tiers come first; if those tiers are
 * used up, the next harder tier with someone unseen steps in (never easier);
 * once all opponents have appeared, a new cycle starts. Every pick (current,
 * next, and store swaps) counts as "seen" because the player is shown it.
 */
function pickOpponent(s: GameState, stage: number, exclude: string[], keep: string[] = exclude): string {
  const rows = CONFIG.opponentTierWeights;
  const row = rows[Math.min(stage, rows.length - 1)];
  const allowed = TIER_ORDER.filter((t) => (row[t] ?? 0) > 0);
  const avail = OPPONENTS.filter((o) => !exclude.includes(o.id));
  let unseen = avail.filter((o) => !s.seenOpponents.includes(o.id));
  if (!unseen.length) {
    // Everyone has appeared: start a new cycle. Only opponents staying on screen count as seen.
    s.seenOpponents = s.seenOpponents.filter((id) => keep.includes(id));
    unseen = avail.filter((o) => !s.seenOpponents.includes(o.id));
  }
  let pool = unseen.filter((o) => allowed.includes(o.tier));
  let weightOf = (t: string) => row[t] ?? 0;
  if (!pool.length) {
    // Allowed tiers used up this cycle: step up at most ONE tier (so swaps can't drag elites into
    // the early game). If that is used up too, a repeat from the allowed tiers is the lesser evil.
    const maxAllowed = Math.max(...allowed.map((t) => TIER_ORDER.indexOf(t)));
    const next = TIER_ORDER[maxAllowed + 1];
    const stepUp = next ? unseen.filter((o) => o.tier === next) : [];
    if (stepUp.length) { pool = stepUp; weightOf = () => 1; }
    else pool = avail.filter((o) => allowed.includes(o.tier));
    if (!pool.length) pool = avail;
  }
  const tier = pickWeighted(s, TIER_ORDER.filter((t) => pool.some((o) => o.tier === t)), weightOf) ?? pool[0].tier;
  const candidates = pool.filter((o) => o.tier === tier);
  const pick = pickWeighted(s, candidates, (o) => o.weight ?? 1) ?? candidates[0];
  if (!s.seenOpponents.includes(pick.id)) s.seenOpponents.push(pick.id);
  return pick.id;
}

/** Debug/QA: throw away the committed throw and commit a fresh one (e.g. after swapping opponents). */
export function recommitRound(s: GameState): void {
  if (s.status === 'playing') startRound(s);
}

/** Commit the opponent's throw for the coming round (before the player chooses). */
function startRound(s: GameState): void {
  tickOpponentMemory(s);
  forEachOwned(s, (d, u) => d.onRoundStart?.(s, u));
  const { dist } = opponentDistribution(s);
  s.pendingOpponentDist = dist;
  // Always consume one random value so debug forcing doesn't shift the RNG stream.
  const sampled = sampleMove(s, dist);
  s.pendingOpponentMove = s.debugForceOpponent ?? sampled;
  s.debugForceOpponent = null;
  const flags = intelFlags(s);
  s.oddsVisible = flags.trueOdds && !flags.hidden ? nextRandom(s) < flags.trueOddsChance : false;
  s.leaked = flags.leakChance > 0 && !flags.hidden ? nextRandom(s) < flags.leakChance : false;
  s.ruledOut = null;
  if (flags.coldReadChance > 0 && !flags.hidden && !s.leaked && nextRandom(s) < flags.coldReadChance) {
    // Reveal one of the two throws they did NOT lock in (true information, never a lie).
    const others = MOVES.filter((m) => m !== s.pendingOpponentMove);
    s.ruledOut = others[Math.floor(nextRandom(s) * others.length)];
  }
  s.roundPrediction = flags.prediction > 0 && !flags.hidden ? computePrediction(s, flags.prediction as 1 | 2) : null;
  emit({ type: 'roundStart', round: s.round + 1 });
}

export interface PlayOptions {
  allIn?: boolean;
}

export interface RoundResult {
  record: RoundRecord;
  triggers: Trigger[];
  died: boolean;
  enteredStore: boolean;
}

export function playRound(s: GameState, move: Move, opts: PlayOptions = {}): RoundResult {
  if (s.status !== 'playing') throw new RuleError(`Cannot play a round while ${s.status}`);
  if (!MOVES.includes(move)) throw new RuleError(`Invalid move ${move}`);
  if (!canThrow(s, move)) throw new RuleError(`Cannot afford to throw ${MOVE_NAME[move]}`);
  const allIn = !!opts.allIn;
  if (allIn && !allInAvailable(s)) throw new RuleError('ALL-IN requires Double or Nothing');
  if (!s.pendingOpponentMove) startRound(s);
  emit({ type: 'choice', move });

  const cost = throwCost(s, move);
  if (cost > 0) { s.currency -= cost; s.stats.currencySpent += cost; }

  const opponent = s.pendingOpponentMove as Move;
  emit({ type: 'reveal', player: move, opponent });
  const raw = resolve(move, opponent);
  const ctx: RoundContext = {
    state: s, player: move, opponent, rawOutcome: raw, outcome: raw, allIn,
    baseReward: 0, flatBonus: 0, bonusPct: 0, multiplier: 1, saved: false, lifeUsed: false, triggers: [],
  };
  if (cost > 0) ctx.triggers.push({ source: 'core', text: `Throw tax −${cost}` });
  forEachOwned(s, (d, u) => d.onReveal?.(ctx, u));

  let died = false;
  if (ctx.outcome === 'LOSS') {
    s.stats.losses++;
    resolveLoss(ctx);
    if (ctx.outcome === 'LOSS' && !ctx.survived) died = true;
  }

  // Rewards: only genuine wins and ties pay. A saved loss pays nothing — you survived, that's the prize.
  let reward = 0;
  if ((ctx.outcome === 'WIN' || ctx.outcome === 'TIE') && !ctx.saved) {
    ctx.baseReward = ctx.outcome === 'WIN' ? CONFIG.rewards.win : CONFIG.rewards.tie;
    forEachOwned(s, (d, u) => d.onReward?.(ctx, u));
    if (allIn) {
      if (ctx.outcome === 'WIN') { ctx.multiplier *= 3; ctx.triggers.push({ source: 'double-or-nothing', text: 'ALL-IN paid ×3' }); }
      else { ctx.multiplier = 0; ctx.triggers.push({ source: 'double-or-nothing', text: 'ALL-IN tie: pays nothing' }); }
    }
    const bonus = Math.min(CONFIG.maxPayoutBonus, ctx.bonusPct);
    if (ctx.bonusPct > CONFIG.maxPayoutBonus) ctx.triggers.push({ source: 'core', text: `Payout bonus capped at +${Math.round(CONFIG.maxPayoutBonus * 100)}% (Absolutely Balanced™)` });
    reward = Math.max(0, Math.round((ctx.baseReward + ctx.flatBonus) * Math.max(0, 1 + bonus) * ctx.multiplier));
    s.currency += reward;
    s.stats.currencyEarned += reward;
    if (reward > 0) emit({ type: 'currency', amount: reward });
  }
  if (ctx.outcome === 'WIN') { s.stats.wins++; forEachOwned(s, (d, u) => d.onWin?.(ctx, u)); }
  else if (ctx.outcome === 'TIE' && !ctx.saved) { s.stats.ties++; if (!allIn) forEachOwned(s, (d, u) => d.onTie?.(ctx, u)); }
  if (raw === 'LOSS') forEachOwned(s, (d, u) => d.onLoss?.(ctx, u));
  if (allIn) s.stats.allIns++;

  const record: RoundRecord = {
    round: s.round + 1, stage: s.stage, player: move, opponent, rawOutcome: raw, outcome: ctx.outcome,
    saved: ctx.saved, lifeUsed: ctx.lifeUsed, lifeKept: !!ctx.survived && !ctx.lifeUsed, reward, allIn,
    ...(s.opponentSays ? { said: s.opponentSays } : {}),
  };
  learn(s.intelMemory, s.stageHistory, opponent, readableTell(s), roundCue(s));
  s.history.push(record);
  s.stageHistory.push(record);
  s.stats.moveCounts[move]++;
  forEachOwned(s, (d, u) => d.onRoundEnd?.(ctx, u));
  s.round++;
  s.roundsIntoStage++;
  s.lastTriggers = ctx.triggers;
  s.pendingOpponentMove = null;
  s.pendingOpponentDist = null;
  s.roundPrediction = null;
  s.leaked = false;
  s.ruledOut = null;
  s.opponentSays = null;
  emit({ type: 'result', record, triggers: ctx.triggers });

  let enteredStore = false;
  if (died) {
    s.status = 'dead';
    const left = s.currentGap - s.roundsIntoStage;
    const opp = getOpponent(s.opponentId);
    s.causeOfDeath = `${opp.name}’s ${MOVE_NAME[opponent]} beat your ${MOVE_NAME[move]} on round ${s.round}. ` +
      (left > 0 ? `You were ${left} round${left === 1 ? '' : 's'} short of store #${s.storesVisited + 1}.` : `It was the last round before store #${s.storesVisited + 1}.`);
    emit({ type: 'death', cause: s.causeOfDeath });
  } else if (s.roundsIntoStage >= s.currentGap) {
    enterStore(s);
    enteredStore = true;
  } else {
    startRound(s);
  }
  return { record, triggers: ctx.triggers, died, enteredStore };
}

function resolveLoss(ctx: RoundContext): void {
  const s = ctx.state;
  if (!ctx.allIn) {
    const p = effectiveSaveChance(s, ctx.player);
    if (p > 0 && nextRandom(s) < p) {
      markSaved(ctx, `Saved! (${Math.round(p * 100)}% save chance)`);
      return;
    }
    let allowed = true;
    forEachOwned(s, (d, u) => { if (d.canSave && !d.canSave(s, u, ctx.player)) allowed = false; });
    if (allowed) {
      // Free charges first (Monolith, Contingency Plan, Peer Review), paid ones last (Hush Money).
      const chargers = s.owned
        .map((u) => ({ u, d: getUpgrade(u.id) }))
        .filter((x) => x.d.chargeSave)
        .sort((a, b) => (a.d.chargeIsPaid ? 100 : a.d.chargePriority ?? 50) - (b.d.chargeIsPaid ? 100 : b.d.chargePriority ?? 50));
      for (const { u, d } of chargers) {
        if (d.chargeSave!(ctx, u)) { markSaved(ctx, null); return; }
      }
    }
  }
  if (s.lives > 0) {
    let prevented = false;
    forEachOwned(s, (d, u) => { if (!prevented && d.preventLifeLoss?.(ctx, u)) prevented = true; });
    if (!prevented) {
      s.lives--;
      s.stats.livesConsumed++;
      ctx.triggers.push({ source: 'core', text: `Extra Life consumed (${s.lives} left)` });
      forEachOwned(s, (d, u) => d.onLifeConsumed?.(ctx, u));
      emit({ type: 'lifeConsumed', livesLeft: s.lives });
    }
    ctx.lifeUsed = !prevented;
    ctx.survived = true;
  }
}

function markSaved(ctx: RoundContext, text: string | null): void {
  ctx.outcome = 'TIE';
  ctx.saved = true;
  ctx.state.stats.saves++;
  if (text) ctx.triggers.push({ source: 'save', text });
  forEachOwned(ctx.state, (d, u) => d.onSave?.(ctx, u));
  emit({ type: 'save', source: text ?? 'charge' });
}

// ---------------- store ----------------

function rarityWeights(storeIndex: number): Record<string, number> {
  const { early, late, lateAt } = CONFIG.store.rarityWeights;
  const t = Math.max(0, Math.min(1, (storeIndex - 1) / Math.max(1, lateAt - 1)));
  const out: Record<string, number> = {};
  for (const k of Object.keys(early)) out[k] = early[k] + (late[k] - early[k]) * t;
  return out;
}

export function eligibleUpgrades(s: GameState, exclude: string[] = []): UpgradeDef[] {
  return UPGRADES.filter((d) => {
    if (exclude.includes(d.id)) return false;
    const o = owned(s, d.id);
    if (o && o.stacks >= d.maxStacks) return false;
    if (d.requires && !d.requires.some((r) => owned(s, r))) return false;
    // No Thoughts Just Rock hides all intel, so it and intel upgrades exclude each other.
    const isIntel = d.tags.includes('info') || d.tags.includes('prediction');
    if (isIntel && owned(s, 'no-thoughts')) return false;
    if (d.id === 'no-thoughts' && s.owned.some((u) => { const t = getUpgrade(u.id).tags; return t.includes('info') || t.includes('prediction'); })) return false;
    return true;
  });
}

function generateOffers(s: GameState, keep: StoreOffer[] = []): StoreOffer[] {
  const offers: StoreOffer[] = [];
  const taken = keep.map((o) => o.upgradeId);
  const weights = rarityWeights(s.storesVisited);
  const starter = CONFIG.store.firstStoreStarterPack && s.storesVisited === 1 && keep.length === 0 && (s.store?.rerollsThisVisit ?? 0) === 0;
  const starterTrees = ['rock', 'paper', 'scissors'];
  for (let slot = 0; slot < CONFIG.store.slots; slot++) {
    const kept = keep.find((k) => k.slot === slot);
    if (kept) { offers.push(kept); continue; }
    let pool = eligibleUpgrades(s, taken);
    if (!pool.length) break;
    if (starter && slot < starterTrees.length) {
      // The Paper slot of the starter pack is always Do Your Research (cheap onboarding for tendencies).
      const research = starterTrees[slot] === 'paper' ? pool.filter((d) => d.id === 'do-your-research') : [];
      const treePool = research.length ? research : pool.filter((d) => d.tree === starterTrees[slot] && d.rarity === 'common');
      if (treePool.length) pool = treePool;
    }
    const rarity = pickWeighted(s, Object.keys(weights), (r) => (pool.some((d) => d.rarity === r) ? weights[r] : 0));
    const inRarity = pool.filter((d) => d.rarity === rarity);
    const choice = (inRarity.length ? inRarity : pool)[Math.floor(nextRandom(s) * (inRarity.length || pool.length))];
    taken.push(choice.id);
    offers.push({ slot, upgradeId: choice.id, price: 0, sold: false });
  }
  refreshPrices(s, offers);
  return offers;
}

function refreshPrices(s: GameState, offers: StoreOffer[]): void {
  for (const o of offers) if (!o.sold) o.price = upgradePrice(s, o.upgradeId);
}

function enterStore(s: GameState): void {
  s.status = 'store';
  s.storesVisited++;
  s.stats.opponentsDefeated++;
  s.stats.longestGapSurvived = Math.max(s.stats.longestGapSurvived, s.currentGap);
  const triggers: Trigger[] = [];
  forEachOwned(s, (d, u) => d.onStoreEnter?.(s, u, triggers));
  s.store = { offers: [], rerollsThisVisit: 0, lifePurchasedThisVisit: 0 };
  s.store.offers = generateOffers(s);
  s.lastTriggers = [...s.lastTriggers, ...triggers];
  emit({ type: 'storeEnter', storeIndex: s.storesVisited });
  if ([5, 8, 10, 12].includes(s.storesVisited)) emit({ type: 'milestone', text: `Store #${s.storesVisited}` });
}

function requireStore(s: GameState) {
  if (s.status !== 'store' || !s.store) throw new RuleError('Not in a store');
  return s.store;
}

function spend(s: GameState, amount: number): void {
  if (amount > s.currency) throw new RuleError('Not enough coins');
  s.currency -= amount;
  s.stats.currencySpent += amount;
}

export function buyUpgrade(s: GameState, slot: number): UpgradeDef {
  const st = requireStore(s);
  const offer = st.offers.find((o) => o.slot === slot);
  if (!offer || offer.sold) throw new RuleError('Nothing to buy in that slot');
  const def = getUpgrade(offer.upgradeId);
  const have = owned(s, def.id);
  if (have && have.stacks >= def.maxStacks) throw new RuleError('Already at max stacks');
  if (!eligibleUpgrades(s).some((d) => d.id === def.id)) throw new RuleError(`${def.name} can’t be combined with what you already own`);
  const price = upgradePrice(s, def.id);
  spend(s, price);
  offer.sold = true;
  offer.price = price;
  addUpgrade(s, def.id);
  s.stats.upgradesPurchased++;
  refreshPrices(s, st.offers);
  emit({ type: 'purchase', what: def.id });
  return def;
}

/** Adds (or stacks) an upgrade and fires onPurchase. Used by store and debug. */
export function addUpgrade(s: GameState, id: string): OwnedUpgrade {
  const def = getUpgrade(id);
  let u = owned(s, id);
  if (u) u.stacks = Math.min(def.maxStacks, u.stacks + 1);
  else { u = { id, stacks: 1, data: {} }; s.owned.push(u); def.onRunStart?.(s, u); }
  forEachOwned(s, (d, o) => d.onPurchase?.(s, o, id));
  if (id === 'read-the-instructions' && s.status === 'playing') s.oddsVisible = true;
  refreshRoundIntel(s);
  return u;
}

/**
 * Keep this round's read-outs consistent with what is owned right now (used after debug adds/removes).
 * New leaks and cold reads only roll at the next round start; removed sources clear immediately.
 */
export function refreshRoundIntel(s: GameState): void {
  if (s.status !== 'playing' || !s.pendingOpponentMove) return;
  const flags = intelFlags(s);
  if (flags.hidden || flags.leakChance <= 0) s.leaked = false;
  if (flags.hidden || flags.coldReadChance <= 0) s.ruledOut = null;
  if (flags.hidden || !flags.trueOdds) s.oddsVisible = false;
  s.roundPrediction = flags.prediction > 0 && !flags.hidden ? computePrediction(s, flags.prediction as 1 | 2) : null;
}

export function canBuyLife(s: GameState): { ok: boolean; reason?: string; price: number } {
  const price = lifePrice(s);
  if (s.lives >= maxLives(s)) return { ok: false, reason: 'No Safety Net: you can’t buy a life while you hold one', price };
  if (s.currency < price) return { ok: false, reason: 'Not enough coins', price };
  return { ok: true, price };
}

export function buyLife(s: GameState): void {
  const st = requireStore(s);
  const c = canBuyLife(s);
  if (!c.ok) throw new RuleError(c.reason ?? 'Cannot buy');
  spend(s, c.price);
  s.lives++;
  s.lastLifePrice = c.price;
  s.stats.livesPurchased++;
  st.lifePurchasedThisVisit++;
  forEachOwned(s, (d, u) => d.onPurchase?.(s, u, 'life'));
  emit({ type: 'purchase', what: 'life' });
}

/** Number of unsold offers a reroll would replace. Rerolling with none left is refused. */
export function rerollableOffers(s: GameState): number {
  return s.store ? s.store.offers.filter((o) => !o.sold).length : 0;
}

export function rerollStore(s: GameState): void {
  const st = requireStore(s);
  if (rerollableOffers(s) === 0) throw new RuleError('Nothing left to reroll: every offer is sold');
  const price = storeRerollPrice(s);
  spend(s, price);
  st.rerollsThisVisit++;
  s.stats.storeRerolls++;
  const keep = st.offers.filter((o) => o.sold);
  st.offers = generateOffers(s, keep);
  forEachOwned(s, (d, u) => d.onPurchase?.(s, u, 'store-reroll'));
  emit({ type: 'purchase', what: 'store-reroll' });
}

export function rerollOpponent(s: GameState): void {
  requireStore(s);
  const price = opponentRerollPrice(s);
  spend(s, price);
  s.opponentRerollsBought++;
  s.stats.opponentRerolls++;
  // Neither the swapped-out opponent nor the one just beaten stays on screen.
  s.nextOpponentId = pickOpponent(s, s.stage + 1, [s.nextOpponentId, s.opponentId], []);
  forEachOwned(s, (d, u) => d.onPurchase?.(s, u, 'opponent-reroll'));
  emit({ type: 'purchase', what: 'opponent-reroll' });
}

export function leaveStore(s: GameState): void {
  requireStore(s);
  forEachOwned(s, (d, u) => d.onStoreExit?.(s, u));
  s.store = null;
  s.stage++;
  s.currentGap = curveGap(s, s.stage);
  s.roundsIntoStage = 0;
  s.opponentId = s.nextOpponentId;
  s.nextOpponentId = pickOpponent(s, s.stage + 1, [s.opponentId]);
  if (!s.stats.opponentsEncountered.includes(s.opponentId)) s.stats.opponentsEncountered.push(s.opponentId);
  s.stageHistory = [];
  s.intelMemory = emptyIntelMemory();
  s.opponentMemory = {};
  s.lastTriggers = [];
  s.status = 'playing';
  forEachOwned(s, (d, u) => d.onOpponentChange?.(s, u));
  emit({ type: 'storeExit', nextGap: s.currentGap });
  emit({ type: 'opponentChange', opponentId: s.opponentId });
  if (s.currentGap >= 34) emit({ type: 'milestone', text: `Next store: ${s.currentGap} rounds away` });
  startRound(s);
}

// ---------------- validation (save/load, corrupted state defence) ----------------

export function validateState(s: unknown): string[] {
  const errs: string[] = [];
  const g = s as Partial<GameState>;
  if (!g || typeof g !== 'object') return ['not an object'];
  if (g.version !== STATE_VERSION) errs.push('version mismatch');
  if (!['playing', 'store', 'dead'].includes(g.status as string)) errs.push('bad status');
  for (const k of ['round', 'stage', 'currency', 'lives', 'roundsIntoStage', 'currentGap'] as const) {
    const v = g[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errs.push(`bad ${k}`);
  }
  if (!Array.isArray(g.owned)) errs.push('bad owned');
  else for (const u of g.owned) {
    if (!u || typeof u.id !== 'string') { errs.push('bad owned entry'); continue; }
    try { const d = getUpgrade(u.id); if (!(u.stacks >= 1 && u.stacks <= d.maxStacks)) errs.push(`bad stacks for ${u.id}`); } catch { errs.push(`unknown upgrade ${u.id}`); }
  }
  try { getOpponent(g.opponentId as string); getOpponent(g.nextOpponentId as string); } catch { errs.push('unknown opponent'); }
  if (g.status === 'store' && !g.store) errs.push('store status without store');
  if (g.status === 'playing' && !g.pendingOpponentMove) errs.push('no committed opponent move');
  if (!Array.isArray(g.history) || !Array.isArray(g.stageHistory)) errs.push('bad history');
  if (!g.stats || typeof g.stats !== 'object') errs.push('bad stats');
  if (g.mode !== 'normal' && g.mode !== 'hard') errs.push('bad mode');
  if (!Array.isArray(g.seenOpponents)) errs.push('bad seenOpponents');
  if (g.opponentSays !== null && !MOVES.includes(g.opponentSays as Move)) errs.push('bad opponentSays');
  try {
    const od = getOpponent(g.opponentId as string);
    if (od.bluff && g.status === 'playing' && !g.opponentSays) errs.push('bluffer without an announcement');
    const mem = (g.opponentMemory ?? {}) as Record<string, number>;
    if (mem.loopLen !== undefined) {
      if (!(mem.loopLen >= 2 && mem.loopLen <= 8)) errs.push('bad loop length');
      else for (let i = 0; i < mem.loopLen; i++) if (![0, 1, 2].includes(mem[`l${i}`])) errs.push('bad loop sequence');
    }
  } catch { /* unknown opponent already reported */ }
  return errs;
}
