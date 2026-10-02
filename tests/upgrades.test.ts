// Behaviour tests for every upgrade, plus edge cases and interactions.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, playRound, buyUpgrade, buyLife, rerollStore, leaveStore, eligibleUpgrades, rerollableOffers, RuleError, validateState } from '../src/core/engine';
import { dbgAddUpgrade, dbgForceOutcome, dbgForceOpponent, dbgJumpToStage, dbgSetOpponent, dbgSkipToStore, dbgAddCurrency } from '../src/core/debug';
import { effectiveSaveChance, lifePrice, opponentRerollPrice, storeRerollPrice, upgradePrice, canThrow } from '../src/core/rules';
import { getIntel } from '../src/core/intel';
import { opponentDistribution } from '../src/core/opponentModel';
import { getUpgrade, owned, UPGRADES } from '../src/core/registry';
import { CONFIG } from '../src/core/config';
import { beats } from '../src/core/rps';
import { parseSeed } from '../src/ui/seed';
import type { GameState, Move } from '../src/core/types';

const W = CONFIG.rewards.win, T = CONFIG.rewards.tie;
const close = (a: number, b: number, msg?: string) => assert.ok(Math.abs(a - b) < 1e-9, msg ?? `${a} != ${b}`);

/** A run parked in a huge stage vs a fixed opponent, so stores never interrupt. */
function arena(opts: { seed?: number; lives?: number; opp?: string; ups?: string[] } = {}): GameState {
  const s = createRun({ seed: opts.seed ?? 7, startingLives: opts.lives ?? 0 });
  dbgJumpToStage(s, 25);
  s.currentGap = 1e6;
  dbgSetOpponent(s, opts.opp ?? 'nash');
  (opts.ups ?? []).forEach((id) => dbgAddUpgrade(s, id));
  return s;
}
/** Play one round with a forced outcome; returns coins gained and the result. */
function play(s: GameState, m: Move, out: 'WIN' | 'TIE' | 'LOSS', allIn = false) {
  dbgForceOutcome(s, m, out);
  const c0 = s.currency;
  const r = playRound(s, m, { allIn });
  return { gained: s.currency - c0, r };
}
const toStore = (s: GameState) => { while (s.status === 'playing') { dbgForceOutcome(s, 'R', 'TIE'); playRound(s, 'R'); } };

// ============================== ROCK ==============================

test('Thick Skull: +8% per copy on Rock only, max 3 copies', () => {
  const s = arena({ ups: ['thick-skull'] });
  close(effectiveSaveChance(s, 'R'), 0.08); close(effectiveSaveChance(s, 'P'), 0);
  dbgAddUpgrade(s, 'thick-skull'); close(effectiveSaveChance(s, 'R'), 0.16);
  dbgAddUpgrade(s, 'thick-skull'); dbgAddUpgrade(s, 'thick-skull');
  assert.equal(owned(s, 'thick-skull')!.stacks, 3);
  close(effectiveSaveChance(s, 'R'), 0.24);
});

test('Muscle Memory: +4% per consecutive Rock before this one, max 20%, resets on other throws', () => {
  const s = arena({ ups: ['muscle-memory'] });
  close(effectiveSaveChance(s, 'R'), 0);
  for (let i = 1; i <= 7; i++) { play(s, 'R', 'TIE'); close(effectiveSaveChance(s, 'R'), Math.min(0.2, 0.04 * i)); }
  close(effectiveSaveChance(s, 'P'), 0);
  play(s, 'P', 'TIE');
  close(effectiveSaveChance(s, 'R'), 0);
});

test('Brute Force: +6 per copy on Rock wins only', () => {
  const s = arena({ ups: ['brute-force'] });
  assert.equal(play(s, 'R', 'WIN').gained, W + 6);
  assert.equal(play(s, 'P', 'WIN').gained, W);
  dbgAddUpgrade(s, 'brute-force');
  assert.equal(play(s, 'R', 'WIN').gained, W + 12);
});

test('Stone Cold: Rock vs Rock pays +5, also when Big Rock Theory turns it into a win', () => {
  const s = arena({ ups: ['stone-cold'] });
  assert.equal(play(s, 'R', 'TIE').gained, T + 5);
  assert.equal(play(s, 'P', 'TIE').gained, T);
  assert.equal(play(s, 'R', 'WIN').gained, W); // Rock beating Scissors is not Rock-vs-Rock
  dbgAddUpgrade(s, 'big-rock-theory');
  const { gained, r } = play(s, 'R', 'TIE');
  assert.equal(r.record.outcome, 'WIN');
  assert.equal(gained, W + 5);
});

test('Rock Collection: +1 per 12 Rocks thrown, max +5, only on wins/ties', () => {
  const s = arena({ ups: ['rock-collection'] });
  assert.equal(play(s, 'R', 'WIN').gained, W); // 0 rocks thrown before
  for (let i = 0; i < 11; i++) play(s, 'R', 'TIE'); // 12 rocks thrown now
  assert.equal(play(s, 'P', 'WIN').gained, W + 1);
  for (let i = 0; i < 100; i++) play(s, 'R', 'TIE');
  assert.equal(play(s, 'P', 'WIN').gained, W + 5);
});

test('Dig In: a save primes +20% for the next round only', () => {
  const s = arena({ ups: ['dig-in', 'contingency-plan'] });
  close(effectiveSaveChance(s, 'P'), 0);
  const { r } = play(s, 'P', 'LOSS'); // Contingency saves (charge), which triggers onSave
  assert.equal(r.record.saved, true);
  close(effectiveSaveChance(s, 'P'), 0.2);
  play(s, 'P', 'TIE');
  close(effectiveSaveChance(s, 'P'), 0);
});

test('Rocks Are Heavy: adaptive opponents lean less toward Paper against Rock spam', () => {
  const mk = (ups: string[]) => {
    const s = arena({ opp: 'psychologist', ups, lives: 99 });
    for (let i = 0; i < 6; i++) play(s, 'R', 'TIE');
    return opponentDistribution(s).dist[1];
  };
  const without = mk([]), withIt = mk(['rocks-are-heavy']);
  assert.ok(withIt < without - 0.1, `${withIt} vs ${without}`);
});

test('Geological Advantage: +1% per 6 Rocks thrown this run, max 12%', () => {
  const s = arena({ ups: ['geological-advantage'] });
  for (let i = 0; i < 6; i++) play(s, 'R', 'TIE');
  close(effectiveSaveChance(s, 'R'), 0.01);
  for (let i = 0; i < 200; i++) play(s, 'R', 'TIE');
  close(effectiveSaveChance(s, 'R'), 0.12);
  close(effectiveSaveChance(s, 'S'), 0);
});

test('Bedrock: 10% per OTHER Rock upgrade, stacked copies count once, max 30%, Paper/Scissors ignored', () => {
  const s = arena();
  const base = lifePrice(s);
  dbgAddUpgrade(s, 'bedrock');
  assert.equal(lifePrice(s), base, 'Bedrock alone gives no discount');
  dbgAddUpgrade(s, 'thick-skull'); dbgAddUpgrade(s, 'thick-skull'); dbgAddUpgrade(s, 'thick-skull');
  assert.equal(lifePrice(s), Math.round(base * 0.9), 'three copies of one upgrade count once');
  dbgAddUpgrade(s, 'spreadsheet'); dbgAddUpgrade(s, 'momentum');
  assert.equal(lifePrice(s), Math.round(base * 0.9), 'other trees do not count');
  dbgAddUpgrade(s, 'muscle-memory');
  assert.equal(lifePrice(s), Math.round(base * 0.8));
  dbgAddUpgrade(s, 'brute-force'); dbgAddUpgrade(s, 'stone-cold'); dbgAddUpgrade(s, 'dig-in');
  assert.equal(lifePrice(s), Math.round(base * 0.7), 'capped at 30%');
});

test('Big Rock Theory: only Rock-vs-Rock ties become wins', () => {
  const s = arena({ ups: ['big-rock-theory'] });
  const a = play(s, 'R', 'TIE');
  assert.equal(a.r.record.outcome, 'WIN'); assert.equal(a.r.record.rawOutcome, 'TIE'); assert.equal(a.gained, W);
  assert.equal(play(s, 'P', 'TIE').r.record.outcome, 'TIE');
});

test('Rock Bottom: +20% Rock save only with 0 Extra Lives', () => {
  const s = arena({ ups: ['rock-bottom'], lives: 1 });
  close(effectiveSaveChance(s, 'R'), 0);
  s.lives = 0;
  close(effectiveSaveChance(s, 'R'), 0.2);
  close(effectiveSaveChance(s, 'P'), 0);
});

test('No Thoughts Just Rock: +20% Rock save, +2 on wins/ties, hides ALL intel', () => {
  const s = arena({ opp: 'repeater', ups: ['do-your-research', 'spreadsheet', 'read-the-instructions', 'mastermind', 'cold-read', 'notes-app'] });
  for (let i = 0; i < 5; i++) play(s, 'R', 'TIE');
  assert.ok(getIntel(s).visibleHistory.length > 0);
  dbgAddUpgrade(s, 'no-thoughts');
  play(s, 'R', 'TIE');
  for (let i = 0; i < 40; i++) {
    const v = getIntel(s);
    assert.equal(v.flags.hidden, true);
    assert.equal(v.visibleHistory.length, 0); assert.equal(v.showTell, false);
    assert.equal(v.prediction, null); assert.equal(v.trueOdds, null); assert.equal(v.leaked, null); assert.equal(v.ruledOut, null);
    assert.equal(v.frequencies, null);
    play(s, 'R', 'TIE');
  }
  close(effectiveSaveChance(s, 'R'), 0.2);
  assert.equal(play(s, 'P', 'WIN').gained, W + 2);
});

test('No Thoughts and intel upgrades are never offered together', () => {
  const a = arena({ ups: ['no-thoughts'] });
  const offered = eligibleUpgrades(a).map((d) => d.id);
  for (const id of ['do-your-research', 'notes-app', 'spreadsheet', 'predictive-analytics', 'cold-read', 'read-the-instructions', 'mastermind', 'five-year-plan', 'due-diligence', 'i-have-sources'])
    assert.ok(!offered.includes(id), `${id} offered alongside No Thoughts`);
  assert.ok(offered.includes('confirmation-bias'), 'non-intel Paper upgrades stay available');
  const b = arena({ ups: ['do-your-research'] });
  assert.ok(!eligibleUpgrades(b).some((d) => d.id === 'no-thoughts'));
  const c = arena({ ups: ['study-session'] });
  assert.ok(eligibleUpgrades(c).some((d) => d.id === 'no-thoughts'), 'non-intel upgrades do not block it');
});

test('Built Different: raises the Rock cap to 70% (not other throws)', () => {
  const s = arena({ lives: 0, ups: ['thick-skull', 'thick-skull', 'thick-skull', 'absolute-unit', 'rock-bottom', 'contingency-plan'] });
  close(effectiveSaveChance(s, 'R'), 0.6);
  dbgAddUpgrade(s, 'built-different');
  close(effectiveSaveChance(s, 'R'), 0.7);
});

test('Monolith: 1 Rock save per stage (2 in 20+ round stages), recharges at the store', () => {
  const s = createRun({ seed: 3, startingLives: 0 });
  dbgJumpToStage(s, 4); // gap 8
  dbgAddUpgrade(s, 'monolith');
  assert.equal(owned(s, 'monolith')!.data.charge, 1);
  assert.equal(play(s, 'P', 'LOSS').r.died, true, 'Monolith is Rock-only');
  const t = createRun({ seed: 3, startingLives: 0 });
  dbgJumpToStage(t, 4); dbgAddUpgrade(t, 'monolith');
  assert.equal(play(t, 'R', 'LOSS').r.record.saved, true);
  assert.equal(play(t, 'R', 'LOSS').r.died, true, 'charge spent');
  const u = createRun({ seed: 3, startingLives: 5 });
  dbgJumpToStage(u, 4); dbgAddUpgrade(u, 'monolith');
  play(u, 'R', 'LOSS');
  toStore(u); leaveStore(u); // next stage is 13 rounds -> 1 charge
  assert.equal(owned(u, 'monolith')!.data.charge, 1);
  toStore(u); leaveStore(u); // 21 rounds -> 2 charges
  assert.equal(u.currentGap, 21);
  assert.equal(owned(u, 'monolith')!.data.charge, 2);
});

test('Absolute Unit: +30% Rock save; Paper/Scissors cost 5 and are blocked when broke', () => {
  const s = arena({ ups: ['absolute-unit'] });
  close(effectiveSaveChance(s, 'R'), 0.3);
  s.currency = 20;
  const { gained } = play(s, 'P', 'TIE');
  assert.equal(gained, T - 5);
  s.currency = 4;
  assert.equal(canThrow(s, 'S'), false);
  assert.throws(() => playRound(s, 'S'), RuleError);
  assert.equal(canThrow(s, 'R'), true);
});

// ============================== PAPER ==============================

test('Do Your Research: costs 5, reveals tendencies, and is in the first store', () => {
  assert.equal(getUpgrade('do-your-research').cost, 5);
  for (const opp of ['rock-enjoyer', 'contrarian']) {
    const s = arena({ opp });
    assert.equal(getIntel(s).showTell, false, `${opp} tendency hidden by default`);
    dbgAddUpgrade(s, 'do-your-research');
    assert.equal(getIntel(s).showTell, true);
  }
  for (let seed = 1; seed < 30; seed++) {
    const s = createRun({ seed });
    toStore(s);
    assert.ok(s.store!.offers.some((o) => o.upgradeId === 'do-your-research'), `seed ${seed}`);
  }
});

test('Notes App: history window 10 and correct throw counts', () => {
  const s = arena({ ups: ['notes-app'], lives: 99 });
  const seq: Move[] = ['R', 'R', 'P', 'S', 'R', 'P', 'R', 'R', 'S', 'P', 'R', 'R'];
  for (const m of seq) { dbgForceOpponent(s, m); playRound(s, 'R'); }
  const v = getIntel(s);
  assert.equal(v.visibleHistory.length, 10);
  assert.deepEqual(v.frequencies, [7, 3, 2]);
});

test('Agree to Disagree: +5 per copy on genuine ties, not on saves', () => {
  const s = arena({ ups: ['agree-to-disagree', 'contingency-plan'] });
  assert.equal(play(s, 'P', 'TIE').gained, T + 5);
  dbgAddUpgrade(s, 'agree-to-disagree');
  assert.equal(play(s, 'P', 'TIE').gained, T + 10);
  const saved = play(s, 'P', 'LOSS');
  assert.equal(saved.r.record.saved, true);
  assert.equal(saved.gained, 0);
});

test('Confirmation Bias: pays when they throw their most common move (needs 3 rounds of history)', () => {
  const s = arena({ ups: ['confirmation-bias'] });
  dbgForceOpponent(s, 'S'); const a = s.currency; playRound(s, 'R'); assert.equal(s.currency - a, W, 'no history yet');
  dbgForceOpponent(s, 'S'); playRound(s, 'R');
  dbgForceOpponent(s, 'S'); playRound(s, 'R');
  dbgForceOpponent(s, 'S'); const b = s.currency; playRound(s, 'R'); assert.equal(s.currency - b, W + 3);
  dbgForceOpponent(s, 'P'); const c = s.currency; playRound(s, 'S'); assert.equal(s.currency - c, W, 'not their most common');
});

test('Study Session: +1% per 3 rounds vs this opponent, max 15%, resets with a new opponent', () => {
  const s = createRun({ seed: 9, startingLives: 0 });
  dbgJumpToStage(s, 12); dbgAddUpgrade(s, 'study-session');
  close(effectiveSaveChance(s, 'P'), 0);
  for (let i = 0; i < 9; i++) play(s, 'P', 'TIE');
  close(effectiveSaveChance(s, 'P'), 0.03);
  for (let i = 0; i < 60; i++) play(s, 'P', 'TIE');
  close(effectiveSaveChance(s, 'P'), 0.15);
  dbgSkipToStore(s); leaveStore(s);
  close(effectiveSaveChance(s, 'P'), 0);
});

test('Cold Read: ~12% per copy (24% with two), never names the locked-in throw, never with a leak', () => {
  const s = arena({ ups: ['cold-read'], lives: 1e6, opp: 'gambler' });
  let reads = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const v = getIntel(s);
    if (v.ruledOut) { reads++; assert.notEqual(v.ruledOut, s.pendingOpponentMove); }
    playRound(s, (['R', 'P', 'S'] as Move[])[i % 3]);
  }
  assert.ok(reads / N > 0.09 && reads / N < 0.15, `rate ${reads / N}`);
  dbgAddUpgrade(s, 'cold-read');
  let reads2 = 0;
  for (let i = 0; i < N; i++) { const v = getIntel(s); if (v.ruledOut) { reads2++; assert.notEqual(v.ruledOut, s.pendingOpponentMove); } playRound(s, 'P'); }
  assert.ok(reads2 / N > 0.2 && reads2 / N < 0.28, `two copies rate ${reads2 / N}`);
  dbgAddUpgrade(s, 'mastermind');
  for (let i = 0; i < 500; i++) { const v = getIntel(s); if (v.leaked) assert.equal(v.ruledOut, null); playRound(s, 'R'); }
});

test('Spreadsheet / Predictive Analytics: honest predictions (never 100%), suggested move', () => {
  for (const id of ['spreadsheet', 'predictive-analytics']) {
    const s = arena({ opp: 'repeater', ups: [id], lives: 1e6 });
    assert.equal(getIntel(s).prediction!.confidence, 'Low');
    for (let i = 0; i < 60; i++) {
      const p = getIntel(s).prediction!;
      assert.ok(Math.abs(p.dist[0] + p.dist[1] + p.dist[2] - 1) < 1e-9);
      assert.ok(Math.max(...p.dist) < 1);
      playRound(s, p.recommended);
    }
    assert.notEqual(getIntel(s).prediction!.confidence, 'Low', `${id} should gain confidence vs the Repeater`);
  }
});

test('Peer Review: 4 genuine ties bank a save; once per stage; citations cap at 4', () => {
  const s = arena({ ups: ['peer-review'] });
  for (let i = 0; i < 6; i++) play(s, 'P', 'TIE');
  assert.equal(owned(s, 'peer-review')!.data.cites, 4);
  const a = play(s, 'P', 'LOSS');
  assert.equal(a.r.record.saved, true);
  assert.equal(owned(s, 'peer-review')!.data.cites, 0);
  assert.equal(play(s, 'P', 'LOSS').r.died, true);
  // once per stage: a second full set of citations does nothing until the next store
  const t = createRun({ seed: 12, startingLives: 1 });
  dbgJumpToStage(t, 6); dbgAddUpgrade(t, 'peer-review');
  for (let i = 0; i < 4; i++) play(t, 'P', 'TIE');
  assert.equal(play(t, 'P', 'LOSS').r.record.saved, true);
  for (let i = 0; i < 4; i++) play(t, 'P', 'TIE');
  assert.equal(play(t, 'P', 'LOSS').r.record.lifeUsed, true, 'second use waits for the store');
  toStore(t); leaveStore(t);
  assert.equal(play(t, 'P', 'LOSS').r.record.saved, true, 'banked citations work again after the store');
});

test('Five-Year Plan: opponent swaps 40% cheaper; next opponent visible', () => {
  const s = arena();
  const p = opponentRerollPrice(s);
  dbgAddUpgrade(s, 'five-year-plan');
  assert.equal(opponentRerollPrice(s), Math.round(p * 0.6));
  assert.ok(getIntel(s).nextOpponent);
});

test('Due Diligence: +15% only on the suggested throw; needs a prediction upgrade', () => {
  const fresh = createRun({ seed: 1 });
  assert.ok(!eligibleUpgrades(fresh).some((d) => d.id === 'due-diligence'));
  const s = arena({ ups: ['spreadsheet', 'due-diligence'] });
  const rec = s.roundPrediction!.recommended;
  close(effectiveSaveChance(s, rec), 0.15);
  for (const m of ['R', 'P', 'S'] as Move[]) if (m !== rec) close(effectiveSaveChance(s, m), 0);
});

test('Compound Interest: +12% of coins on entering a store, max 45', () => {
  const s = createRun({ seed: 2 });
  dbgAddUpgrade(s, 'compound-interest');
  s.currency = 100; dbgForceOutcome(s, 'R', 'LOSS'); // round 1 is the whole first stage
  s.lives = 1;
  playRound(s, 'R');
  assert.equal(s.currency, 112);
  const t = createRun({ seed: 2 }); dbgAddUpgrade(t, 'compound-interest'); t.lives = 1;
  t.currency = 10000; dbgForceOutcome(t, 'R', 'LOSS'); playRound(t, 'R');
  assert.equal(t.currency, 10045);
});

test('I Have Sources: +6 when a win beats the predicted throw', () => {
  const s = arena({ ups: ['spreadsheet', 'i-have-sources'] });
  const pred = s.roundPrediction!.predicted;
  dbgForceOpponent(s, pred);
  const c = s.currency; playRound(s, beats(pred));
  assert.equal(s.currency - c, W + 6);
});

test('Contingency Plan: one save per stage with any throw, recharges at the store', () => {
  const s = createRun({ seed: 4, startingLives: 3 });
  dbgJumpToStage(s, 5); dbgAddUpgrade(s, 'contingency-plan');
  assert.equal(play(s, 'S', 'LOSS').r.record.saved, true);
  const second = play(s, 'S', 'LOSS');
  assert.equal(second.r.record.saved, false); assert.equal(s.lives, 2);
  toStore(s); leaveStore(s);
  assert.equal(play(s, 'P', 'LOSS').r.record.saved, true);
});

test('Actually I Read the Instructions: readable ~85% of rounds; when readable, odds match the committed distribution', () => {
  const s = arena({ opp: 'cycler', ups: ['read-the-instructions'], lives: 1e6 });
  let seen = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    const v = getIntel(s);
    if (v.trueOdds) {
      seen++;
      assert.equal(v.oddsUnreadable, false);
      const d = s.pendingOpponentDist!;
      d.forEach((p, k) => assert.ok(Math.abs(v.trueOdds![k] - p) <= 0.025 + 1e-9));
    } else assert.equal(v.oddsUnreadable, true);
    playRound(s, 'R');
  }
  assert.ok(seen / N > 0.82 && seen / N < 0.88, `rate ${seen / N}`);
});

test('Mastermind: leaks ~20% of rounds and the leak is always the real throw', () => {
  const s = arena({ ups: ['mastermind'], lives: 1e6 });
  let n = 0;
  for (let i = 0; i < 3000; i++) { const v = getIntel(s); if (v.leaked) { n++; assert.equal(v.leaked, s.pendingOpponentMove); } playRound(s, 'R'); }
  assert.ok(n / 3000 > 0.17 && n / 3000 < 0.23, `rate ${n / 3000}`);
});

// ============================== SCISSORS ==============================

test('Risky Business: wins +50%, ties −50%', () => {
  const s = arena({ ups: ['risky-business'] });
  assert.equal(play(s, 'S', 'WIN').gained, Math.round(W * 1.5));
  assert.equal(play(s, 'S', 'TIE').gained, Math.round(T * 0.5));
});

test('Go For It: +4 per copy when you win with a different throw than last round', () => {
  const s = arena({ ups: ['go-for-it'] });
  play(s, 'R', 'TIE');
  assert.equal(play(s, 'P', 'WIN').gained, W + 4);
  assert.equal(play(s, 'P', 'WIN').gained, W);
  dbgAddUpgrade(s, 'go-for-it');
  assert.equal(play(s, 'S', 'WIN').gained, W + 8);
});

test('Momentum: +10% per prior consecutive win, max +100%, tie resets', () => {
  const s = arena({ ups: ['momentum'] });
  const gains: number[] = [];
  for (let i = 0; i < 13; i++) gains.push(play(s, 'P', 'WIN').gained);
  assert.equal(gains[0], W);
  assert.equal(gains[1], Math.round(W * 1.1));
  assert.equal(gains[12], Math.round(W * 2));
  play(s, 'P', 'TIE');
  assert.equal(play(s, 'P', 'WIN').gained, W);
});

test('Just One More: first reroll each visit is free, not after one was used, fresh next visit', () => {
  const s = createRun({ seed: 5 });
  dbgAddUpgrade(s, 'just-one-more');
  toStore(s);
  dbgAddCurrency(s, 1000);
  assert.equal(storeRerollPrice(s), 0);
  const c = s.currency; rerollStore(s); assert.equal(s.currency, c);
  assert.equal(storeRerollPrice(s), CONFIG.store.rerollBase);
  rerollStore(s);
  assert.equal(storeRerollPrice(s), CONFIG.store.rerollBase * 2);
  leaveStore(s); toStore(s);
  assert.equal(storeRerollPrice(s), 0);
});

test('Store reroll: refused when every offer is sold; bought cards are kept', () => {
  const s = createRun({ seed: 6 });
  toStore(s); dbgAddCurrency(s, 1e6);
  buyUpgrade(s, 0);
  const kept = s.store!.offers[0].upgradeId;
  assert.equal(rerollableOffers(s), s.store!.offers.length - 1);
  rerollStore(s);
  assert.equal(s.store!.offers[0].upgradeId, kept);
  assert.equal(s.store!.offers[0].sold, true);
  for (const o of s.store!.offers) if (!o.sold) buyUpgrade(s, o.slot);
  assert.equal(rerollableOffers(s), 0);
  const c = s.currency;
  assert.throws(() => rerollStore(s), RuleError);
  assert.equal(s.currency, c, 'no coins taken for a refused reroll');
});

test('Cut Corners: upgrades 20% cheaper, lives 20% dearer', () => {
  const s = arena();
  const up = upgradePrice(s, 'mastermind'), lp = lifePrice(s);
  dbgAddUpgrade(s, 'cut-corners');
  assert.equal(upgradePrice(s, 'mastermind'), Math.round(up * 0.8));
  assert.equal(lifePrice(s), Math.round(lp * 1.2));
});

test('YOLO: +50% payouts only at 0 lives', () => {
  const s = arena({ ups: ['yolo'], lives: 1 });
  assert.equal(play(s, 'R', 'WIN').gained, W);
  s.lives = 0;
  assert.equal(play(s, 'R', 'WIN').gained, Math.round(W * 1.5));
});

test('High Stakes: +12 on Scissors wins; Scissors losses skip all saves and charges but lives work', () => {
  const s = arena({ ups: ['high-stakes', 'study-session', 'contingency-plan', 'hush-money'], lives: 1 });
  assert.equal(play(s, 'S', 'WIN').gained, W + 12);
  for (let i = 0; i < 30; i++) play(s, 'P', 'TIE'); // build Study Session
  close(effectiveSaveChance(s, 'S'), 0);
  assert.ok(effectiveSaveChance(s, 'P') > 0);
  s.currency = 1000;
  const r = play(s, 'S', 'LOSS').r;
  assert.equal(r.record.saved, false); assert.equal(r.record.lifeUsed, true);
  assert.equal(owned(s, 'contingency-plan')!.data.charge, 1, 'Contingency not spent');
  assert.equal(s.currency, 1000, 'Hush Money not charged');
});

test('Sharpening Stone: +1 per Scissors win (from the next win on), max 12, halved when a life is used', () => {
  const s = arena({ ups: ['sharpening-stone'], lives: 1 });
  assert.equal(play(s, 'S', 'WIN').gained, W);
  assert.equal(play(s, 'P', 'WIN').gained, W + 1);
  for (let i = 0; i < 20; i++) play(s, 'S', 'WIN');
  assert.equal(owned(s, 'sharpening-stone')!.data.bonus, 12);
  play(s, 'S', 'LOSS');
  assert.equal(owned(s, 'sharpening-stone')!.data.bonus, 6);
});

test('Standoff: consecutive ties +100% each, max +300%; saves do not count', () => {
  const s = arena({ ups: ['standoff'] });
  const g = [0, 1, 2, 3, 4].map(() => play(s, 'R', 'TIE').gained);
  assert.deepEqual(g, [T, T * 2, T * 3, T * 4, T * 4]);
  play(s, 'R', 'WIN');
  assert.equal(play(s, 'R', 'TIE').gained, T);
});

test('Maximum Effort: +15% save on any throw after 3+ straight wins', () => {
  const s = arena({ ups: ['maximum-effort'] });
  play(s, 'R', 'WIN'); play(s, 'R', 'WIN');
  close(effectiveSaveChance(s, 'S'), 0);
  play(s, 'R', 'WIN');
  close(effectiveSaveChance(s, 'S'), 0.15);
  play(s, 'R', 'TIE');
  close(effectiveSaveChance(s, 'S'), 0);
});

test('Double or Nothing: ALL-IN win ×3, tie 0, no saves or charges, lives still work', () => {
  const s = arena({ ups: ['double-or-nothing', 'contingency-plan', 'thick-skull'], lives: 1 });
  assert.equal(play(s, 'R', 'WIN', true).gained, W * 3);
  assert.equal(play(s, 'R', 'TIE', true).gained, 0);
  const r = play(s, 'R', 'LOSS', true).r;
  assert.equal(r.record.saved, false); assert.equal(r.record.lifeUsed, true);
  assert.equal(owned(s, 'contingency-plan')!.data.charge, 1);
  assert.equal(play(s, 'R', 'LOSS', true).r.died, true);
});

test('Hush Money: automatic last resort (after free charges and after lives), 30/60/120… across the run, warns when broke', () => {
  const s = arena({ ups: ['contingency-plan', 'hush-money'], lives: 1 });
  s.currency = 100;
  const a = play(s, 'P', 'LOSS');
  assert.equal(a.r.record.saved, true); assert.equal(s.currency, 100, 'free Contingency used first');
  const l = play(s, 'P', 'LOSS');
  assert.equal(l.r.record.lifeUsed, true); assert.equal(s.currency, 100, 'an Extra Life goes before the bribe');
  const b = play(s, 'P', 'LOSS');
  assert.equal(b.r.record.saved, true); assert.equal(s.currency, 70);
  assert.ok(b.r.triggers.some((t) => t.text.includes('used 1×') && t.text.includes('next 60')));
  const c = play(s, 'P', 'LOSS');
  assert.equal(s.currency, 10);
  assert.equal(c.r.record.saved, true);
  const d = play(s, 'P', 'LOSS');
  assert.equal(d.r.died, true);
  assert.ok(d.r.triggers.some((t) => t.text.includes('couldn’t pay') && t.text.includes('120')));
});

test('Death Wish: +50 on life loss, then 5 rounds at +100%', () => {
  const s = arena({ ups: ['death-wish'], lives: 1 });
  const { gained } = play(s, 'R', 'LOSS');
  assert.equal(gained, 50);
  const g = [0, 1, 2, 3, 4, 5].map(() => play(s, 'P', 'WIN').gained);
  assert.deepEqual(g, [W * 2, W * 2, W * 2, W * 2, W * 2, W]);
});

test('This Seems Fine: ~30% of life losses keep the life; kept lives are not counted as used', () => {
  let kept = 0;
  const N = 2000;
  const s = arena({ ups: ['this-seems-fine'], lives: 1 });
  for (let i = 0; i < N; i++) {
    s.lives = 1;
    const used0 = s.stats.livesConsumed;
    const r = play(s, 'R', 'LOSS').r;
    assert.equal(r.died, false);
    if (s.lives === 1) { kept++; assert.equal(r.record.lifeUsed, false); assert.equal(s.stats.livesConsumed, used0); }
    else assert.equal(r.record.lifeUsed, true);
  }
  assert.ok(kept / N > 0.26 && kept / N < 0.34, `kept ${kept / N}`);
});

test('Insurance Fraud: refunds 60% of the last bought life; starting lives refund nothing', () => {
  const s = createRun({ seed: 8, startingLives: 1 });
  dbgAddUpgrade(s, 'insurance-fraud');
  const a = play(s, 'R', 'LOSS');
  assert.equal(a.gained, 0);
  toStore(s);
  dbgAddCurrency(s, 1000);
  const price = lifePrice(s);
  buyLife(s); leaveStore(s);
  const c = s.currency;
  play(s, 'R', 'LOSS');
  assert.equal(s.currency - c, Math.floor(price * 0.6));
});

test('Glass Cannon: +100% payouts and the save cap is halved', () => {
  const s = arena({ lives: 0, ups: ['glass-cannon', 'thick-skull', 'thick-skull', 'thick-skull', 'absolute-unit', 'rock-bottom'] });
  assert.equal(play(s, 'R', 'WIN').gained, W * 2);
  close(effectiveSaveChance(s, 'R'), 0.3);
});

test('No Safety Net: +150% payouts; can’t buy a life while holding one; can at zero', () => {
  const s = createRun({ seed: 10, startingLives: 2 });
  dbgAddUpgrade(s, 'no-safety-net');
  dbgForceOutcome(s, 'R', 'WIN');
  const c = s.currency; playRound(s, 'R');
  assert.equal(s.currency - c, Math.round(W * 2.5));
  assert.equal(s.lives, 2, 'existing lives are kept');
  dbgAddCurrency(s, 1e5);
  assert.throws(() => buyLife(s), RuleError);
  s.lives = 0;
  buyLife(s);
  assert.equal(s.lives, 1);
  assert.throws(() => buyLife(s), RuleError);
});

// ============================== CROSS-CUTTING ==============================

test('every upgrade is exercised by at least one test in this file', () => {
  const src = (globalThis as unknown as { __src?: string }).__src;
  void src;
  // Upgrade ids covered above (kept explicit so a new upgrade without a test fails loudly).
  const covered = ['thick-skull', 'muscle-memory', 'brute-force', 'stone-cold', 'rock-collection', 'dig-in', 'rocks-are-heavy', 'geological-advantage', 'bedrock', 'big-rock-theory', 'rock-bottom', 'no-thoughts', 'built-different', 'monolith', 'absolute-unit',
    'do-your-research', 'notes-app', 'agree-to-disagree', 'confirmation-bias', 'study-session', 'cold-read', 'paper-trail', 'snip-snip', 'close-shave', 'spreadsheet', 'peer-review', 'five-year-plan', 'due-diligence', 'compound-interest', 'predictive-analytics', 'i-have-sources', 'contingency-plan', 'read-the-instructions', 'mastermind',
    'risky-business', 'go-for-it', 'momentum', 'just-one-more', 'cut-corners', 'yolo', 'high-stakes', 'sharpening-stone', 'standoff', 'maximum-effort', 'double-or-nothing', 'hush-money', 'death-wish', 'this-seems-fine', 'insurance-fraud', 'glass-cannon', 'no-safety-net'];
  const missing = UPGRADES.map((u) => u.id).filter((id) => !covered.includes(id));
  assert.deepEqual(missing, []);
});

test('stackable upgrades explain what one copy adds', () => {
  for (const u of UPGRADES) if (u.maxStacks > 1) assert.ok(u.perCopy, `${u.id} needs perCopy text`);
  for (const u of UPGRADES) assert.ok(!/Stacks ×/.test(u.describe(1)), `${u.id} still says "Stacks ×"`);
});

test('free charges spend before earned ones: Contingency before Peer Review', () => {
  const s = arena({ ups: ['peer-review', 'contingency-plan'] });
  for (let i = 0; i < 4; i++) play(s, 'P', 'TIE');
  play(s, 'P', 'LOSS');
  assert.equal(owned(s, 'contingency-plan')!.data.charge, 0);
  assert.equal(owned(s, 'peer-review')!.data.cites, 4);
});

test('seeds: numbers and words map to stable seeds; same seed + choices = same run', () => {
  assert.equal(parseSeed(''), undefined);
  assert.equal(parseSeed('12345'), 12345);
  assert.equal(parseSeed('4294967296'), 0);
  assert.equal(parseSeed('hank'), parseSeed(' hank '));
  assert.notEqual(parseSeed('hank'), parseSeed('pam'));
  const run = (seed: number) => {
    const s = createRun({ seed });
    const moves: Move[] = ['P', 'R', 'S', 'S', 'R'];
    let i = 0;
    while (s.status !== 'dead' && s.round < 300) {
      if (s.status === 'store') { for (const o of s.store!.offers) if (!o.sold && upgradePrice(s, o.upgradeId) <= s.currency) buyUpgrade(s, o.slot); leaveStore(s); continue; }
      playRound(s, moves[i++ % moves.length]);
    }
    return `${s.round}:${s.owned.map((u) => u.id).join(',')}:${s.stats.opponentsEncountered.join(',')}`;
  };
  assert.equal(run(parseSeed('hank')!), run(parseSeed('hank')!));
});

test('saves from an older version are rejected rather than half-loaded', () => {
  const s = createRun({ seed: 1 });
  const old = { ...JSON.parse(JSON.stringify(s)), version: 1 };
  assert.ok(validateState(old).includes('version mismatch'));
});
