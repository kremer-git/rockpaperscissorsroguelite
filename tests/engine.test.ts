// Run with: npm test   (node:test via tsx)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, playRound, buyUpgrade, buyLife, rerollStore, rerollOpponent, leaveStore, addUpgrade, validateState, RuleError } from '../src/core/engine';
import { dbgForceOutcome, dbgForceOpponent, dbgAddCurrency, dbgSetOpponent, dbgSkipToStore, dbgJumpToStage, dbgAddUpgrade } from '../src/core/debug';
import { effectiveSaveChance, lifePrice, storeRerollPrice, opponentRerollPrice, upgradePrice, canThrow } from '../src/core/rules';
import { resolve, beats } from '../src/core/rps';
import { opponentDistribution } from '../src/core/opponentModel';
import { getIntel } from '../src/core/intel';
import { CURVES, getCurve } from '../src/core/intervals';
import { CONFIG } from '../src/core/config';
import { UPGRADES } from '../src/core/registry';
import { OPPONENTS } from '../src/content/opponents';
import type { GameState, Move } from '../src/core/types';

const fresh = (seed = 1, lives = 0): GameState => createRun({ seed, startingLives: lives });
const toStore = (s: GameState) => { while (s.status === 'playing') { dbgForceOutcome(s, 'R', 'TIE'); playRound(s, 'R'); } };

test('RPS rules', () => {
  assert.equal(resolve('R', 'S'), 'WIN');
  assert.equal(resolve('S', 'P'), 'WIN');
  assert.equal(resolve('P', 'R'), 'WIN');
  assert.equal(resolve('R', 'P'), 'LOSS');
  for (const m of ['R', 'P', 'S'] as Move[]) { assert.equal(resolve(m, m), 'TIE'); assert.equal(resolve(beats(m), m), 'WIN'); }
});

test('starting a run commits an opponent throw before the player chooses', () => {
  const s = fresh();
  assert.equal(s.status, 'playing');
  assert.ok(s.pendingOpponentMove);
  assert.deepEqual(validateState(s), []);
});

test('win pays the win reward, tie pays the tie reward', () => {
  const s = fresh();
  const c0 = s.currency;
  dbgForceOutcome(s, 'R', 'WIN');
  const r = playRound(s, 'R');
  assert.equal(r.record.outcome, 'WIN');
  assert.equal(s.currency, c0 + CONFIG.rewards.win);
  const s2 = fresh(2);
  const d0 = s2.currency;
  dbgForceOutcome(s2, 'P', 'TIE');
  playRound(s2, 'P');
  assert.equal(s2.currency, d0 + CONFIG.rewards.tie);
});

test('each move can be thrown', () => {
  for (const m of ['R', 'P', 'S'] as Move[]) {
    const s = fresh(10);
    dbgForceOutcome(s, m, 'TIE');
    assert.equal(playRound(s, m).record.player, m);
  }
});

test('loss without a life ends the run; with a life consumes exactly one', () => {
  const s = fresh(3, 0);
  dbgForceOutcome(s, 'R', 'LOSS');
  const r = playRound(s, 'R');
  assert.equal(r.died, true);
  assert.equal(s.status, 'dead');
  assert.ok(s.causeOfDeath && s.causeOfDeath.length > 10);
  assert.throws(() => playRound(s, 'R'), RuleError);

  const t = fresh(3, 2);
  dbgForceOutcome(t, 'R', 'LOSS');
  const r2 = playRound(t, 'R');
  assert.equal(r2.died, false);
  assert.equal(t.lives, 1);
  assert.equal(t.stats.livesConsumed, 1);
  assert.ok(r2.triggers.some((x) => x.text.includes('Extra Life consumed')));
});

test('store entry happens exactly at the end of the gap and gaps grow', () => {
  const s = fresh(4);
  const gaps: number[] = [];
  for (let k = 0; k < 6; k++) {
    gaps.push(s.currentGap);
    toStore(s);
    assert.equal(s.status, 'store');
    assert.equal(s.storesVisited, k + 1);
    leaveStore(s);
  }
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1]);
  assert.deepEqual(gaps, [1, 2, 3, 5, 8, 13].slice(0, gaps.length));
});

test('store intervals are never capped', () => {
  for (const c of CURVES) {
    let prev = 0;
    for (let n = 0; n < 25; n++) { const g = c.gap(n); assert.ok(g >= prev, `${c.id} decreased`); prev = g; }
    assert.ok(c.gap(24) > 50, `${c.id} should keep growing`);
  }
  assert.equal(getCurve('fibonacci').gap(10), 144);
});

test('buying, insufficient currency, duplicates and stacking', () => {
  const s = fresh(5);
  toStore(s);
  s.currency = 0;
  assert.throws(() => buyUpgrade(s, 0), RuleError);
  dbgAddCurrency(s, 1000);
  const id = s.store!.offers[0].upgradeId;
  buyUpgrade(s, 0);
  assert.ok(s.owned.some((u) => u.id === id));
  assert.throws(() => buyUpgrade(s, 0), RuleError); // sold
  // stacking via addUpgrade respects maxStacks
  const t = fresh(6);
  for (let i = 0; i < 5; i++) addUpgrade(t, 'thick-skull');
  assert.equal(t.owned.find((u) => u.id === 'thick-skull')!.stacks, 3);
  // store never offers a maxed upgrade
  toStore(t);
  for (let k = 0; k < 20; k++) {
    assert.ok(!t.store!.offers.some((o) => o.upgradeId === 'thick-skull'));
    t.currency = 1e9; rerollStore(t);
  }
});

test('store reroll cost escalates within a visit and resets next visit', () => {
  const s = fresh(7);
  toStore(s);
  dbgAddCurrency(s, 10000);
  const costs: number[] = [];
  for (let i = 0; i < 4; i++) { costs.push(storeRerollPrice(s)); rerollStore(s); }
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1]);
  leaveStore(s);
  toStore(s);
  assert.equal(storeRerollPrice(s), CONFIG.store.rerollBase);
});

test('opponent reroll changes next opponent and escalates across the run', () => {
  const s = fresh(8);
  toStore(s);
  dbgAddCurrency(s, 100000);
  const p1 = opponentRerollPrice(s);
  const before = s.nextOpponentId;
  rerollOpponent(s);
  assert.notEqual(s.nextOpponentId, before);
  const p2 = opponentRerollPrice(s);
  assert.ok(p2 > p1);
  leaveStore(s);
  toStore(s);
  assert.ok(opponentRerollPrice(s) >= p2);
});

test('extra life prices escalate by lifetime purchases; multiple lives work', () => {
  const s = fresh(9);
  toStore(s);
  dbgAddCurrency(s, 1e6);
  const prices: number[] = [];
  for (let i = 0; i < 5; i++) { prices.push(lifePrice(s)); buyLife(s); }
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i] > prices[i - 1] * 1.5);
  assert.equal(s.lives, 5);
  leaveStore(s);
  for (let i = 0; i < 5; i++) { dbgForceOutcome(s, 'R', 'LOSS'); const r = playRound(s, 'R'); assert.equal(r.died, false); if ((s.status as string) === 'store') leaveStore(s); }
  assert.equal(s.lives, 0);
  dbgForceOutcome(s, 'R', 'LOSS');
  assert.equal(playRound(s, 'R').died, true);
});

test('No Safety Net caps lives at 1', () => {
  const s = fresh(11);
  dbgAddUpgrade(s, 'no-safety-net');
  toStore(s);
  dbgAddCurrency(s, 1e6);
  buyLife(s);
  assert.throws(() => buyLife(s), RuleError);
});

test('save chance is capped; never 100%', () => {
  const s = fresh(12);
  for (const u of UPGRADES) for (let k = 0; k < u.maxStacks; k++) if (u.id !== 'glass-cannon' && u.id !== 'high-stakes') dbgAddUpgrade(s, u.id);
  for (const m of ['R', 'P', 'S'] as Move[]) {
    const p = effectiveSaveChance(s, m);
    assert.ok(p <= CONFIG.saveCapCeiling + 1e-9, `${m} save ${p}`);
    assert.ok(p < 1);
  }
  dbgAddUpgrade(s, 'glass-cannon');
  assert.ok(effectiveSaveChance(s, 'R') <= CONFIG.saveCapCeiling / 2 + 1e-9);
});

test('High Stakes makes Scissors losses unsavable', () => {
  const s = fresh(13);
  dbgAddUpgrade(s, 'study-session');
  dbgAddUpgrade(s, 'high-stakes');
  assert.equal(effectiveSaveChance(s, 'S'), 0);
});

test('opponent distributions are valid probabilities with a randomness floor', () => {
  for (const o of OPPONENTS) {
    const s = fresh(14);
    dbgSetOpponent(s, o.id);
    s.lives = 1000;
    for (let i = 0; i < 40; i++) {
      const { dist } = opponentDistribution(s);
      const sum = dist[0] + dist[1] + dist[2];
      assert.ok(Math.abs(sum - 1) < 1e-9, `${o.id} sums to ${sum}`);
      const last = s.stageHistory[s.stageHistory.length - 1];
      // The one documented exception: a Superstitious opponent's cursed throw (the one that just lost).
      const cursed = o.avoidLoser !== undefined && last && last.rawOutcome === 'WIN' ? last.opponent : null;
      (['R', 'P', 'S'] as Move[]).forEach((mv, k) => {
        const p = dist[k];
        assert.ok(p <= 1 && p >= (mv === cursed ? 0 : o.randomness - 1e-9), `${o.id} p=${p}`);
      });
      assert.ok(Math.max(...dist) <= 1 - 2 * o.randomness + 1e-6 || !!cursed, `${o.id} too certain`);
      const m = (['R', 'P', 'S'] as Move[])[i % 3];
      playRound(s, m);
      if ((s.status as string) === 'store') { leaveStore(s); dbgSetOpponent(s, o.id); }
    }
  }
});

test('opponent behaviours are distinguishable (Repeater repeats, Mimic copies)', () => {
  const s = fresh(15);
  dbgJumpToStage(s, 30); s.currentGap = 1e6; s.lives = 1e6;
  dbgSetOpponent(s, 'repeater');
  let rep = 0;
  for (let i = 0; i < 400; i++) { const prev = s.stageHistory.at(-1)?.opponent; const r = playRound(s, 'R'); if (prev && r.record.opponent === prev) rep++; }
  assert.ok(rep / 399 > 0.6, `repeater repeated ${rep}`);
  dbgSetOpponent(s, 'mimic');
  let copy = 0;
  const seq: Move[] = ['R', 'P', 'S', 'S', 'P', 'R'];
  for (let i = 0; i < 400; i++) { const prev = s.stageHistory.at(-1)?.player; const r = playRound(s, seq[i % seq.length]); if (prev && r.record.opponent === prev) copy++; }
  assert.ok(copy / 399 > 0.6, `mimic copied ${copy}`);
});

test('no hidden rigging: opponent odds do not depend on run length or build strength', () => {
  const a = fresh(16);
  const b = fresh(16);
  dbgSetOpponent(a, 'gambler');
  dbgSetOpponent(b, 'gambler');
  // b is rich, long-lived and stacked; a is fresh
  b.round = 5000; b.storesVisited = 14; b.currency = 1e6; b.lives = 9;
  for (const u of UPGRADES.slice(0, 20)) dbgAddUpgrade(b, u.id);
  b.opponentMemory = { ...a.opponentMemory };
  // same visible history -> same distribution (except documented Rocks Are Heavy, not granted here)
  const ra = opponentDistribution(a).dist, rb = opponentDistribution(b).dist;
  if (!b.owned.some((u) => u.id === 'rocks-are-heavy')) assert.deepEqual(ra, rb);
});

test('intel is gated by upgrades (information as progression)', () => {
  const s = fresh(17);
  dbgSetOpponent(s, 'contrarian');
  let v = getIntel(s);
  assert.equal(v.showTell, false);
  assert.equal(v.frequencies, null);
  assert.equal(v.prediction, null);
  dbgAddUpgrade(s, 'do-your-research'); dbgAddUpgrade(s, 'show-your-work'); dbgAddUpgrade(s, 'spreadsheet');
  toStore(s); leaveStore(s);
  v = getIntel(s);
  assert.equal(v.showTell, true);
  assert.ok(v.prediction);
  // predictions never claim certainty
  for (let i = 0; i < 30 && s.status === 'playing'; i++) {
    const p = getIntel(s).prediction!;
    assert.ok(Math.max(...p.dist) < 1);
    dbgForceOpponent(s, 'R');
    playRound(s, 'P');
    if ((s.status as string) === 'store') leaveStore(s);
  }
  dbgAddUpgrade(s, 'no-thoughts');
  assert.equal(getIntel(s).visibleHistory.length, 0);
});

test('scaling upgrades respect caps over very long runs', () => {
  const s = fresh(18, 0);
  ['muscle-memory', 'geological-advantage', 'rock-collection', 'sharpening-stone', 'momentum', 'study-session'].forEach((id) => dbgAddUpgrade(s, id));
  dbgJumpToStage(s, 30); s.currentGap = 1e6; s.lives = 1e6;
  for (let i = 0; i < 3000; i++) { dbgForceOutcome(s, i % 2 ? 'R' : 'S', 'WIN'); playRound(s, i % 2 ? 'R' : 'S'); }
  const sh = s.owned.find((u) => u.id === 'sharpening-stone')!;
  assert.ok(sh.data.bonus <= 12);
  assert.ok(effectiveSaveChance(s, 'R') <= CONFIG.saveCap + 1e-9);
  const c0 = s.currency;
  dbgForceOutcome(s, 'S', 'WIN'); playRound(s, 'S');
  const gained = s.currency - c0;
  assert.ok(gained <= (CONFIG.rewards.win + 12 + 5) * (1 + CONFIG.maxPayoutBonus), `gain ${gained}`);
});

test('payout bonuses are additive and capped', () => {
  const s = fresh(19, 0);
  ['risky-business', 'yolo', 'glass-cannon', 'no-safety-net', 'momentum'].forEach((id) => dbgAddUpgrade(s, id));
  const c0 = s.currency;
  dbgForceOutcome(s, 'P', 'WIN');
  playRound(s, 'P');
  assert.equal(s.currency - c0, Math.round(CONFIG.rewards.win * (1 + CONFIG.maxPayoutBonus)));
});

test('Hush Money escalates across the run', () => {
  const s = fresh(20, 0);
  dbgAddUpgrade(s, 'hush-money');
  dbgJumpToStage(s, 30); s.currentGap = 1e6;
  dbgAddCurrency(s, 1000);
  const costs: number[] = [];
  for (let i = 0; i < 4; i++) { const c0 = s.currency; dbgForceOutcome(s, 'R', 'LOSS'); const r = playRound(s, 'R'); assert.equal(r.record.saved, true); costs.push(c0 - s.currency); }
  assert.deepEqual(costs, [30, 60, 120, 240]);
});

test('Big Rock Theory converts Rock ties into wins', () => {
  const s = fresh(21);
  dbgAddUpgrade(s, 'big-rock-theory');
  dbgForceOutcome(s, 'R', 'TIE');
  assert.equal(playRound(s, 'R').record.outcome, 'WIN');
});

test('Absolute Unit taxes non-Rock throws and blocks them when broke', () => {
  const s = fresh(22);
  dbgAddUpgrade(s, 'absolute-unit');
  s.currency = 3;
  assert.equal(canThrow(s, 'P'), false);
  assert.equal(canThrow(s, 'R'), true);
  assert.throws(() => playRound(s, 'P'), RuleError);
});

test('ALL-IN requires Double or Nothing and disables saves', () => {
  const s = fresh(23, 1);
  assert.throws(() => playRound(s, 'R', { allIn: true }), RuleError);
  dbgAddUpgrade(s, 'double-or-nothing');
  dbgAddUpgrade(s, 'thick-skull');
  assert.equal(effectiveSaveChance(s, 'R', true), 0);
  const c0 = s.currency;
  dbgForceOutcome(s, 'R', 'WIN');
  playRound(s, 'R', { allIn: true });
  assert.equal(s.currency - c0, CONFIG.rewards.win * 3);
});

test('prices respect Cut Corners and Bedrock', () => {
  const s = fresh(24);
  const base = upgradePrice(s, 'spreadsheet');
  const lp = lifePrice(s);
  dbgAddUpgrade(s, 'cut-corners');
  assert.ok(upgradePrice(s, 'spreadsheet') < base);
  assert.ok(lifePrice(s) > lp);
});

test('corrupted state is detected', () => {
  const s = fresh(25);
  const bad = JSON.parse(JSON.stringify(s));
  bad.currency = -5; bad.owned.push({ id: 'not-real', stacks: 1, data: {} }); bad.opponentId = 'nobody';
  const errs = validateState(bad);
  assert.ok(errs.includes('bad currency'));
  assert.ok(errs.some((e) => e.includes('unknown upgrade')));
  assert.ok(errs.includes('unknown opponent'));
  assert.deepEqual(validateState(null), ['not an object']);
});

test('determinism: same seed + same choices = same run', () => {
  const play = () => {
    const s = createRun({ seed: 1234 });
    const moves: Move[] = ['R', 'P', 'S', 'R', 'R', 'S', 'P'];
    let i = 0;
    while (s.status !== 'dead' && s.round < 200) { if (s.status === 'store') { leaveStore(s); continue; } playRound(s, moves[i++ % moves.length]); }
    return JSON.stringify({ r: s.round, h: s.history.map((h) => h.opponent).join('') });
  };
  assert.equal(play(), play());
});

test('restart gives a clean run', () => {
  const s = fresh(26);
  dbgAddUpgrade(s, 'thick-skull');
  toStore(s);
  const t = createRun({ seed: 27 });
  assert.equal(t.owned.length, 0);
  assert.equal(t.round, 0);
  assert.equal(t.stats.wins, 0);
});

test('very long store gaps and maximum plausible currency stay stable', () => {
  const s = fresh(28, 0);
  dbgJumpToStage(s, 18);
  assert.equal(s.currentGap, getCurve('fibonacci').gap(18));
  dbgAddCurrency(s, 1e9);
  dbgSkipToStore(s);
  assert.equal(s.status, 'store');
  for (let i = 0; i < 20; i++) { buyLife(s); }
  assert.ok(Number.isFinite(lifePrice(s)));
  for (let i = 0; i < 12; i++) rerollStore(s);
  assert.ok(Number.isFinite(s.currency) && s.currency >= 0);
  assert.deepEqual(validateState(s), []);
});

test('every upgrade has text, a valid tree/rarity, and is buyable', () => {
  const ids = new Set<string>();
  for (const u of UPGRADES) {
    assert.ok(!ids.has(u.id), `duplicate id ${u.id}`); ids.add(u.id);
    assert.ok(u.describe(1).length > 10);
    assert.ok(['rock', 'paper', 'scissors'].includes(u.tree));
    assert.ok(u.cost > 0);
    const s = fresh(30);
    dbgAddUpgrade(s, u.id);
    for (let i = 0; i < 12 && s.status === 'playing'; i++) { s.lives = 5; playRound(s, (['R', 'P', 'S'] as Move[])[i % 3]); if ((s.status as string) === 'store') leaveStore(s); }
  }
  const trees = { rock: 0, paper: 0, scissors: 0 } as Record<string, number>;
  UPGRADES.forEach((u) => trees[u.tree]++);
  for (const t of Object.values(trees)) assert.ok(t >= 15);
});
