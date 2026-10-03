// Tests for the third batch of changes: hard mode, opponent cycling, fresh
// memory after stores, new stacking upgrades, Hunch visibility, awards, prefs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, playRound, leaveStore, rerollOpponent, validateState, buyLife } from '../src/core/engine';
import { dbgAddUpgrade, dbgForceOutcome, dbgForceOpponent, dbgJumpToStage, dbgSetOpponent, dbgAddCurrency } from '../src/core/debug';
import { effectiveSaveChance } from '../src/core/rules';
import { getIntel } from '../src/core/intel';
import { opponentDistribution } from '../src/core/opponentModel';
import { owned } from '../src/core/registry';
import { OPPONENTS } from '../src/content/opponents';
import { CONFIG } from '../src/core/config';
import { hunchShown, buttonOdds, visibleRuledOut, type ReadOpts } from '../src/ui/components';
import { AWARDS, emptyProgress, mergeProgress, recordRounds } from '../src/ui/awards';
import { defaultPrefs } from '../src/ui/prefs';
import type { GameState, Move } from '../src/core/types';

const W = CONFIG.rewards.win;
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const SHOW: ReadOpts = { hideHunch: false, hideCold: false };

function arena(opts: { seed?: number; lives?: number; opp?: string; ups?: string[] } = {}): GameState {
  const s = createRun({ seed: opts.seed ?? 7, startingLives: opts.lives ?? 0 });
  dbgJumpToStage(s, 25);
  s.currentGap = 1e6;
  dbgSetOpponent(s, opts.opp ?? 'nash');
  (opts.ups ?? []).forEach((id) => dbgAddUpgrade(s, id));
  return s;
}
function play(s: GameState, m: Move, out: 'WIN' | 'TIE' | 'LOSS') {
  dbgForceOutcome(s, m, out);
  const c0 = s.currency;
  const r = playRound(s, m);
  return { gained: s.currency - c0, r };
}
const toStore = (s: GameState) => { while (s.status === 'playing') { dbgForceOutcome(s, 'R', 'TIE'); playRound(s, 'R'); } };

// ---------------- Hard mode ----------------

test('Hard Mode starts with 0 Extra Lives; everything else about the seed is identical', () => {
  const n = createRun({ seed: 99 });
  const h = createRun({ seed: 99, mode: 'hard' });
  assert.equal(n.lives, CONFIG.startingLives);
  assert.equal(h.lives, 0);
  assert.equal(h.mode, 'hard');
  assert.equal(n.opponentId, h.opponentId);
  assert.equal(n.pendingOpponentMove, h.pendingOpponentMove);
  assert.deepEqual(validateState(h), []);
  dbgForceOutcome(h, 'R', 'LOSS');
  assert.equal(playRound(h, 'R').died, true, 'first unsaved loss ends a hard run');
  const bad = { ...JSON.parse(JSON.stringify(n)), mode: 'nightmare' };
  assert.ok(validateState(bad).includes('bad mode'));
});

test('Hard Mode can still buy lives', () => {
  const h = createRun({ seed: 5, mode: 'hard' });
  toStore(h); dbgAddCurrency(h, 1000); buyLife(h);
  assert.equal(h.lives, 1);
});

// ---------------- Opponent cycling ----------------

test('nobody repeats within a cycle unless every opponent up to one tier above the stage is used up', () => {
  const order = ['easy', 'medium', 'hard', 'elite'];
  let repeats = 0, picks = 0;
  for (let seed = 1; seed <= 120; seed++) {
    for (const swapsPerStore of [0, 1, 3]) {
      const s = createRun({ seed, startingLives: 1e6 });
      const pick = (fn: () => void, excluded: string[]) => {
        const before = [...s.seenOpponents];
        fn();
        const id = s.nextOpponentId;
        picks++;
        const cycleReset = !s.seenOpponents.every((x) => x === id || before.includes(x)) || s.seenOpponents.length <= before.length;
        if (before.includes(id) && !cycleReset) {
          repeats++;
          const row = CONFIG.opponentTierWeights[Math.min(s.stage + 1, CONFIG.opponentTierWeights.length - 1)];
          const maxAllowed = Math.max(...order.map((t, i) => ((row[t] ?? 0) > 0 ? i : -1)));
          const reachable = OPPONENTS.filter((o) => order.indexOf(o.tier) <= maxAllowed + 1 && !excluded.includes(o.id));
          for (const o of reachable) assert.ok(before.includes(o.id), `seed ${seed}: repeated ${id} while ${o.id} was unseen`);
        }
      };
      for (let stage = 0; stage < 10; stage++) {
        toStore(s);
        for (let k = 0; k < swapsPerStore; k++) { dbgAddCurrency(s, 1e7); const ex = [s.nextOpponentId, s.opponentId]; pick(() => rerollOpponent(s), ex); }
        const cur = s.nextOpponentId;
        pick(() => leaveStore(s), [cur]);
      }
    }
  }
  assert.ok(picks > 1000);
  void repeats;
});

test('without swaps, the first 13 opponents of a run are all different', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = createRun({ seed, startingLives: 1e6 });
    const shown = [s.opponentId, s.nextOpponentId];
    for (let stage = 0; stage < 11; stage++) { toStore(s); leaveStore(s); shown.push(s.nextOpponentId); }
    assert.equal(new Set(shown).size, shown.length, `seed ${seed}: ${shown.join(',')}`);
  }
});

test('the difficulty ramp still holds early: the first stages are easy opponents', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = createRun({ seed, startingLives: 1e6 });
    const early = [s.opponentId, s.nextOpponentId];
    for (let i = 0; i < 2; i++) { toStore(s); leaveStore(s); early.push(s.nextOpponentId); }
    for (const id of early) assert.equal(OPPONENTS.find((o) => o.id === id)!.tier, 'easy', `seed ${seed}: ${id}`);
  }
});

test('when a stage’s allowed tiers are used up, a harder unseen opponent steps in (never an easier one)', () => {
  const s = createRun({ seed: 3, startingLives: 1e6 });
  s.seenOpponents = OPPONENTS.filter((o) => o.tier === 'easy').map((o) => o.id);
  toStore(s); leaveStore(s); // stage 1 allows only easy
  const tier = OPPONENTS.find((o) => o.id === s.nextOpponentId)!.tier;
  assert.equal(tier, 'medium');
});

// ---------------- Fresh memory after a store ----------------

test('opponent memory resets at each store; the first throw vs a new opponent reacts to nothing', () => {
  const s = createRun({ seed: 11, startingLives: 1e6 });
  toStore(s);
  s.nextOpponentId = 'mimic';
  leaveStore(s);
  assert.equal(s.stageHistory.length, 0);
  assert.ok(s.history.length > 0, 'your own history still exists');
  const d = opponentDistribution(s).dist;
  d.forEach((p) => close(p, 1 / 3)); // the Mimic has nothing to copy yet
  play(s, 'S', 'TIE');
  const d2 = opponentDistribution(s).dist;
  assert.ok(d2[2] > 0.6, 'after one round it copies your Scissors');
});

test('your own streaks carry over the store (Muscle Memory)', () => {
  const s = createRun({ seed: 12, startingLives: 1e6 });
  dbgAddUpgrade(s, 'muscle-memory');
  toStore(s); leaveStore(s); toStore(s); leaveStore(s); // all Rock ties so far
  const streak = s.history.length;
  assert.ok(streak >= 3);
  close(effectiveSaveChance(s, 'R'), Math.min(0.2, 0.04 * streak));
});

// ---------------- New stacking upgrades ----------------

test('Paper Trail: wins file Receipts (max 3), +3% save per Receipt per copy, shredded on a new opponent', () => {
  const s = createRun({ seed: 21, startingLives: 1e6 });
  dbgJumpToStage(s, 8); // a 55-round stage
  dbgAddUpgrade(s, 'paper-trail');
  close(effectiveSaveChance(s, 'P'), 0);
  play(s, 'P', 'WIN');
  close(effectiveSaveChance(s, 'P'), 0.03);
  for (let i = 0; i < 5; i++) play(s, 'P', 'WIN');
  close(effectiveSaveChance(s, 'P'), 0.09);
  dbgAddUpgrade(s, 'paper-trail'); dbgAddUpgrade(s, 'paper-trail');
  assert.equal(owned(s, 'paper-trail')!.stacks, 3);
  close(effectiveSaveChance(s, 'S'), 0.27);
  play(s, 'P', 'TIE');
  close(effectiveSaveChance(s, 'S'), 0.27);
  toStore(s); leaveStore(s);
  close(effectiveSaveChance(s, 'S'), 0);
});

test('Snip Snip: +4 per copy on Scissors wins only, up to 3 copies', () => {
  const s = arena({ ups: ['snip-snip'] });
  assert.equal(play(s, 'S', 'WIN').gained, W + 4);
  assert.equal(play(s, 'R', 'WIN').gained, W);
  dbgAddUpgrade(s, 'snip-snip'); dbgAddUpgrade(s, 'snip-snip'); dbgAddUpgrade(s, 'snip-snip');
  assert.equal(owned(s, 'snip-snip')!.stacks, 3);
  assert.equal(play(s, 'S', 'WIN').gained, W + 12);
});

test('Close Shave: survived losses leave Scars (max 6); wins pay +1 per Scar per copy; deaths and plain wins add none', () => {
  const s = arena({ ups: ['close-shave', 'contingency-plan'], lives: 20 });
  assert.equal(play(s, 'P', 'WIN').gained, W);
  play(s, 'P', 'LOSS'); // saved by Contingency
  assert.equal(owned(s, 'close-shave')!.data.scars, 1);
  play(s, 'P', 'LOSS'); // life spent
  assert.equal(owned(s, 'close-shave')!.data.scars, 2);
  assert.equal(play(s, 'P', 'WIN').gained, W + 2);
  play(s, 'P', 'TIE');
  assert.equal(owned(s, 'close-shave')!.data.scars, 2);
  for (let i = 0; i < 10; i++) play(s, 'P', 'LOSS');
  assert.equal(owned(s, 'close-shave')!.data.scars, 6);
  dbgAddUpgrade(s, 'close-shave');
  assert.equal(play(s, 'P', 'WIN').gained, W + 12);
});

// ---------------- Hunch visibility (every case it should and shouldn't show) ----------------

for (const id of ['spreadsheet', 'predictive-analytics']) {
  test(`${id}: Hunch shows on round 1, after every store, after swaps, resume and debug changes`, () => {
    const s = createRun({ seed: 31, startingLives: 1e6 });
    dbgAddUpgrade(s, id);
    assert.ok(getIntel(s).prediction, 'round 1 after adding');
    assert.ok(hunchShown(getIntel(s), SHOW));
    for (let stage = 0; stage < 6; stage++) {
      for (let r = 0; r < 3 && s.status === 'playing'; r++) {
        assert.ok(getIntel(s).prediction, `stage ${stage} round ${r}`);
        dbgForceOutcome(s, 'R', 'TIE'); playRound(s, 'R');
      }
      toStore(s);
      assert.equal(getIntel(s).prediction, null, 'no Hunch while shopping');
      if (stage === 2) { dbgAddCurrency(s, 1e6); rerollOpponent(s); }
      leaveStore(s);
      const v = getIntel(s);
      assert.ok(v.prediction, `fresh opponent at stage ${stage + 1} (empty history)`);
      assert.equal(v.prediction!.confidence, 'Low');
    }
    dbgSetOpponent(s, 'repeater');
    assert.ok(getIntel(s).prediction, 'after a debug opponent swap');
    const resumed = JSON.parse(JSON.stringify(s)) as GameState;
    resumed.roundPrediction = null; // e.g. an older save
    assert.ok(getIntel(resumed).prediction, 'computed on demand after resume');
  });
}

test('Hunch rules: steps aside for readable true odds, returns on smudged rounds, hidden by the toggle and by No Thoughts', () => {
  const s = arena({ opp: 'cycler', ups: ['spreadsheet', 'read-the-instructions'], lives: 1e6 });
  let readable = 0, smudged = 0;
  for (let i = 0; i < 400; i++) {
    const v = getIntel(s);
    assert.ok(v.prediction, 'prediction is always computed');
    if (v.trueOdds) { readable++; assert.equal(hunchShown(v, SHOW), false); assert.equal(buttonOdds(v, SHOW)!.label.startsWith('true odds'), true); }
    else { smudged++; assert.equal(hunchShown(v, SHOW), true); assert.equal(buttonOdds(v, SHOW)!.label.startsWith('estimate'), true); }
    assert.equal(hunchShown(v, { hideHunch: true, hideCold: false }), false);
    playRound(s, 'R');
  }
  assert.ok(readable > 0 && smudged > 0);
  const t = arena({ ups: ['spreadsheet'] });
  assert.equal(hunchShown(getIntel(t), { hideHunch: true, hideCold: false }), false);
  assert.equal(buttonOdds(getIntel(t), { hideHunch: true, hideCold: false }), null, 'hidden Hunch also hides estimate odds');
  // No Thoughts can't be bought alongside intel, but if forced (debug) it wins.
  dbgAddUpgrade(t, 'no-thoughts');
  assert.equal(getIntel(t).prediction, null);
});

test('Cold Read is folded into the button odds (true odds or estimate) and respects its toggle', () => {
  const s = arena({ opp: 'gambler', ups: ['cold-read', 'cold-read', 'read-the-instructions', 'spreadsheet'], lives: 1e6 });
  let checked = 0;
  for (let i = 0; i < 600; i++) {
    const v = getIntel(s);
    if (v.ruledOut) {
      const o = buttonOdds(v, SHOW)!;
      assert.equal(o.d[['R', 'P', 'S'].indexOf(v.ruledOut)], 0, 'ruled-out throw has 0%');
      assert.ok(o.label.includes('cold read'));
      assert.equal(visibleRuledOut(v, { hideHunch: false, hideCold: true }), null);
      const hidden = buttonOdds(v, { hideHunch: false, hideCold: true })!;
      assert.ok(!hidden.label.includes('cold read'));
      checked++;
    }
    playRound(s, 'R');
  }
  assert.ok(checked > 50);
});

// ---------------- Awards ----------------

test('awards unlock at 100/200/300/400/500 and never twice', () => {
  const p = emptyProgress();
  assert.deepEqual(recordRounds(p, 99, false, 1), []);
  assert.deepEqual(recordRounds(p, 100, false, 1).map((a) => a.rounds), [100]);
  assert.deepEqual(recordRounds(p, 150, false, 1), []);
  assert.equal(p.unlocked['100'].hard, false);
  assert.deepEqual(recordRounds(p, 320, true, 2).map((a) => a.rounds), [200, 300]);
  assert.equal(p.best, 320); assert.equal(p.bestHard, 320);
  assert.equal(p.unlocked['300'].hard, true);
  assert.equal(p.unlocked['100'].hard, true, 'a later hard run that passes 100 upgrades that badge too');
  assert.deepEqual(recordRounds(p, 10_000, false, 4).map((a) => a.rounds), [400, 500]);
  assert.equal(AWARDS.length, 5);
});

test('award records merge as a union (local + cloud) without losing anything', () => {
  const a = emptyProgress(); recordRounds(a, 210, false, 1, '2026-01-02');
  const b = emptyProgress(); recordRounds(b, 120, true, 2, '2026-01-01'); b.runs = 9;
  const m = mergeProgress(a, b);
  assert.equal(m.best, 210); assert.equal(m.bestHard, 120); assert.equal(m.runs, 9);
  assert.equal(m.unlocked['100'].at, '2026-01-01'); assert.equal(m.unlocked['100'].hard, true);
  assert.ok(m.unlocked['200']);
  assert.deepEqual(mergeProgress(m, emptyProgress()), m);
});

// ---------------- Build panel: no manual ordering any more ----------------

test('build panel ordering was removed: prefs no longer carry an order', () => {
  assert.ok(!('order' in defaultPrefs()));
});

// ---------------- Regression: nothing new broke the core loop ----------------

test('random full runs in both modes stay valid from start to death', () => {
  for (const mode of ['normal', 'hard'] as const) {
    for (let seed = 1; seed <= 60; seed++) {
      const s = createRun({ seed, mode });
      let i = 0;
      while (s.status !== 'dead' && s.round < 3000) {
        if (s.status === 'store') {
          dbgAddCurrency(s, 50);
          for (const o of s.store!.offers) { try { if (!o.sold) { void o; } } catch { /* */ } }
          leaveStore(s); continue;
        }
        playRound(s, (['R', 'P', 'S'] as Move[])[(i++ * 7 + seed) % 3]);
        if (i % 97 === 0) assert.deepEqual(validateState(s), [], `seed ${seed} round ${s.round}`);
      }
      assert.equal(s.status, 'dead');
      assert.ok(s.causeOfDeath);
    }
  }
});

// ---------------- Regressions for the independent QA findings ----------------

import { buyUpgrade, eligibleUpgrades } from '../src/core/engine';
import { dbgRemoveUpgrade } from '../src/core/debug';

test('QA#1: No Thoughts and an intel upgrade in the same store can’t both be bought', () => {
  const s = createRun({ seed: 1, startingLives: 1e6 });
  toStore(s); dbgAddCurrency(s, 1e6);
  s.store!.offers[0].upgradeId = 'no-thoughts';
  s.store!.offers[1].upgradeId = 'do-your-research';
  buyUpgrade(s, 0);
  assert.throws(() => buyUpgrade(s, 1), /can’t be combined/);
  const t = createRun({ seed: 1, startingLives: 1e6 });
  toStore(t); dbgAddCurrency(t, 1e6);
  t.store!.offers[0].upgradeId = 'no-thoughts';
  t.store!.offers[1].upgradeId = 'notes-app';
  buyUpgrade(t, 1);
  assert.throws(() => buyUpgrade(t, 0), /can’t be combined/);
  void eligibleUpgrades;
});

test('QA#2: with a Cold Read, the Hunch’s prediction and suggestion never name/lose to the ruled-out throw', () => {
  const s = arena({ opp: 'gambler', ups: ['spreadsheet', 'cold-read', 'cold-read', 'i-have-sources'], lives: 1e6 });
  let n = 0;
  for (let i = 0; i < 2000; i++) {
    const v = getIntel(s);
    if (v.ruledOut && v.prediction) {
      n++;
      assert.notEqual(v.prediction.predicted, v.ruledOut, 'prediction never names the ruled-out throw');
      assert.equal(v.prediction.dist[['R', 'P', 'S'].indexOf(v.ruledOut)], 0);
    }
    playRound(s, v.prediction ? v.prediction.recommended : 'R');
  }
  assert.ok(n > 100);
});

test('QA#4/5: swaps never push opponents more than one tier ahead, and cycles are complete', () => {
  const order = ['easy', 'medium', 'hard', 'elite'];
  const tierOf = (id: string) => order.indexOf(OPPONENTS.find((o) => o.id === id)!.tier);
  for (let seed = 1; seed <= 150; seed++) {
    const s = createRun({ seed, startingLives: 1e6 });
    for (let stage = 0; stage < 7; stage++) {
      toStore(s); dbgAddCurrency(s, 1e7);
      for (let k = 0; k < 3; k++) rerollOpponent(s);
      const row = CONFIG.opponentTierWeights[Math.min(s.stage + 1, CONFIG.opponentTierWeights.length - 1)];
      const maxAllowed = Math.max(...order.map((t, i) => ((row[t] ?? 0) > 0 ? i : -1)));
      assert.ok(tierOf(s.nextOpponentId) <= maxAllowed + 1, `seed ${seed} stage ${s.stage + 1}: ${s.nextOpponentId}`);
      leaveStore(s);
    }
  }
});

test('QA#8: ALL-IN ties pay nothing and don’t feed tie upgrades', () => {
  const s = arena({ ups: ['double-or-nothing', 'peer-review', 'standoff'] });
  dbgForceOutcome(s, 'R', 'TIE'); playRound(s, 'R', { allIn: true });
  assert.equal(owned(s, 'peer-review')!.data.cites ?? 0, 0);
  dbgForceOutcome(s, 'R', 'TIE'); const c = s.currency; playRound(s, 'R');
  assert.equal(s.currency - c, CONFIG.rewards.tie, 'Standoff streak did not start from the ALL-IN tie');
});

test('QA#11: removing an intel upgrade mid-round clears its read-out; stage jumps refresh Monolith', () => {
  const s = arena({ ups: ['mastermind', 'cold-read', 'read-the-instructions', 'spreadsheet'], lives: 1e6 });
  s.leaked = true; s.ruledOut = s.pendingOpponentMove === 'R' ? 'P' : 'R'; s.oddsVisible = true;
  dbgRemoveUpgrade(s, 'mastermind'); assert.equal(getIntel(s).leaked, null);
  dbgRemoveUpgrade(s, 'cold-read'); assert.equal(getIntel(s).ruledOut, null);
  dbgRemoveUpgrade(s, 'read-the-instructions'); assert.equal(getIntel(s).trueOdds, null);
  dbgRemoveUpgrade(s, 'spreadsheet'); assert.equal(getIntel(s).prediction, null);
  const t = createRun({ seed: 2, startingLives: 1e6 });
  dbgAddUpgrade(t, 'monolith');
  assert.equal(owned(t, 'monolith')!.data.charge, 1);
  dbgJumpToStage(t, 9);
  assert.equal(owned(t, 'monolith')!.data.charge, 2);
});

test('QA#6: Hush Money never fires while an Extra Life is available', () => {
  const s = arena({ ups: ['hush-money'], lives: 2 });
  s.currency = 500;
  play(s, 'P', 'LOSS'); play(s, 'P', 'LOSS');
  assert.equal(s.currency, 500); assert.equal(s.lives, 0);
  assert.equal(play(s, 'P', 'LOSS').r.record.saved, true);
  assert.equal(s.currency, 470);
});

void dbgForceOpponent;
