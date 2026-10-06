// Round 9: John's shuffled 60/30/10, Hunch wording, opt-in music, Show Your Work in the sims.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRun, playRound, leaveStore } from '../src/core/engine';
import { dbgAddUpgrade, dbgSetOpponent, dbgForceOutcome } from '../src/core/debug';
import { opponentDistribution, shuffledBaseOf, getOpponent, tickOpponentMemory, lastRedeal } from '../src/core/opponentModel';
import { computePrediction, guessFromTell } from '../src/core/intel';
import { defaultPrefs } from '../src/ui/prefs';
import { DEFAULT_AUDIO } from '../src/ui/audio';
import { OPPONENTS } from '../src/content/opponents';
import { POLICIES } from '../src/sim/policies';

const john = getOpponent('nash');

test('John: one throw ~60%, one ~30%, one ~10%, dealt in a new order each encounter', () => {
  const orders = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const s = createRun({ seed, startingLives: 99 });
    dbgSetOpponent(s, 'nash');
    tickOpponentMemory(s);
    const b = shuffledBaseOf(s, john)!;
    assert.deepEqual([...b].sort((x, y) => y - x), [6, 3, 1]);
    orders.add(b.join(','));
    const d = opponentDistribution(s).dist;
    const sorted = [...d].sort((x, y) => y - x);
    assert.ok(Math.abs(sorted[0] - 0.55) < 0.03 && Math.abs(sorted[1] - 0.3) < 0.03 && Math.abs(sorted[2] - 0.14) < 0.03, d.join());
  }
  assert.equal(orders.size, 6, 'all six assignments turn up');
});

test('John: the split holds until you beat him twice in a row, then he re-deals it (always to a different order)', () => {
  const s = createRun({ seed: 9, startingLives: 999 });
  s.currentGap = 1e6;
  dbgSetOpponent(s, 'nash');
  playRound(s, 'R');
  let deal = shuffledBaseOf(s, john)!.join(',');
  let redeals = 0;
  for (let i = 0; i < 300; i++) {
    const h = s.stageHistory;
    const twoWins = h.length >= 2 && h[h.length - 1].rawOutcome === 'WIN' && h[h.length - 2].rawOutcome === 'WIN';
    const now = shuffledBaseOf(s, john)!.join(',');
    if (now !== deal) { assert.ok(twoWins, `re-dealt without two wins at ${h.length}`); redeals++; deal = now; }
    else if (twoWins && lastRedeal(h, 2) === h.length) assert.fail('two wins in a row but no re-deal');
    const outcome = (['WIN', 'WIN', 'LOSS', 'TIE'] as const)[i % 4];
    dbgForceOutcome(s, 'R', outcome);
    playRound(s, 'R');
  }
  assert.ok(redeals > 50, `redeals=${redeals}`);
  // the visible-history rule matches the model's
  assert.equal(lastRedeal(s.stageHistory, 2), s.opponentMemory.sbAt);
});

test('John’s tendency reads as a ranking, and the Hunch can learn it', () => {
  assert.ok(/60%/.test(john.tell));
  assert.ok(/new every time/.test(john.tell) && /twice in a row/.test(john.tell));
  const h = (ms: string) => [...ms].map((m, i) => ({ round: i, player: 'R', opponent: m, rawOutcome: 'TIE', outcome: 'TIE', reward: 0 })) as never;
  assert.equal(guessFromTell(john, h('SS')), null, 'too few rounds to rank');
  const d = guessFromTell(john, h('SSPSSRSP'))!;
  assert.ok(d[2] > d[1] && d[1] > d[0]);
  // after two player wins in a row, only throws since then count
  const mixed = [...'SSSSRR'].map((m, i) => ({ round: i, player: 'P', opponent: m, rawOutcome: i >= 4 ? 'WIN' : 'TIE', outcome: 'TIE', reward: 0 })).concat([...'PPP'].map((m, i) => ({ round: 6 + i, player: 'R', opponent: m, rawOutcome: 'TIE', outcome: 'TIE', reward: 0 }))) as never;
  const d2 = guessFromTell(john, mixed)!;
  assert.ok(d2[1] > d2[2], 'Paper (since the re-deal) beats the old Scissors count');
});

test('Hunch: “not much data yet” only early on; a noisy opponent later is “hard to read”', () => {
  const s = createRun({ seed: 4, startingLives: 999 });
  dbgSetOpponent(s, 'chaos-engine');
  dbgAddUpgrade(s, 'spreadsheet');
  s.currentGap = 999;
  assert.equal(computePrediction(s, 1).thin, true);
  for (let i = 0; i < 18 && s.status === 'playing'; i++) { dbgForceOutcome(s, (['R', 'P', 'S'] as const)[i % 3], 'TIE'); playRound(s, (['R', 'P', 'S'] as const)[i % 3]); }
  const p = computePrediction(s, 1);
  assert.equal(p.thin, false);
  const src = readFileSync('src/ui/components.ts', 'utf8');
  assert.ok(src.includes('(hard to read)') && src.includes('(not much data yet)'));
});

test('music is opt-in: off by default, old prefs without the setting load with it off', () => {
  assert.equal(DEFAULT_AUDIO.musicOn, false);
  assert.equal(defaultPrefs().audio.musicOn, false);
  const src = readFileSync('src/ui/audio.ts', 'utf8');
  assert.ok(src.includes('createMediaElementSource'), 'music volume goes through a gain node (iPhone ignores .volume)');
  assert.ok(!src.includes('music-rounds') && !src.includes('music-store'), 'one music track');
});

test('no keyboard-shortcut chips in the interface', () => {
  for (const f of ['menus', 'runScreen', 'storeScreen', 'soundDock', 'components']) {
    assert.ok(!readFileSync(`src/ui/${f}.ts`, 'utf8').includes("h('kbd'"), f);
  }
});

test('the Paper sim player knows Show Your Work, and Notes App is retired', () => {
  assert.ok(!OPPONENTS.some((o) => o.tell.includes('Notes App')));
  const src = readFileSync('src/sim/policies.ts', 'utf8');
  assert.ok(src.includes('show-your-work') && !src.includes('notes-app'));
  assert.ok(POLICIES.some((p) => p.id === 'paper'));
});
