// Sound mapping: which engine event makes which sound. (Playback itself is checked in tests/e2e.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, playRound, leaveStore, buyUpgrade, onEngineEvent } from '../src/core/engine';
import { dbgAddUpgrade, dbgForceOutcome, dbgJumpToStage, dbgAddCurrency } from '../src/core/debug';
import { cueFor, type Cue } from '../src/ui/audio';
import { defaultPrefs } from '../src/ui/prefs';
import { existsSync, statSync } from 'node:fs';
import type { EngineEvent, GameState } from '../src/core/types';

function capture(fn: () => void): Cue[] {
  const cues: Cue[] = [];
  const off = onEngineEvent((e: EngineEvent) => { const c = cueFor(e); if (c) cues.push(c); });
  try { fn(); } finally { off(); }
  return cues;
}
const fresh = (lives = 0): GameState => { const s = createRun({ seed: 3, startingLives: lives }); dbgJumpToStage(s, 20); s.currentGap = 1e6; return s; };

test('win, tie, saved loss each have their own sound', () => {
  const s = fresh(0);
  dbgForceOutcome(s, 'R', 'WIN'); assert.deepEqual(capture(() => playRound(s, 'R')), [{ synth: 'win' }]);
  dbgForceOutcome(s, 'R', 'TIE'); assert.deepEqual(capture(() => playRound(s, 'R')), [{ synth: 'tie' }]);
  dbgAddUpgrade(s, 'contingency-plan');
  dbgForceOutcome(s, 'R', 'LOSS'); assert.deepEqual(capture(() => playRound(s, 'R')), [{ synth: 'save' }]);
});

test('losing an Extra Life plays LossOfLife (with the music ducked); dying plays the death sting only', () => {
  const s = fresh(1);
  dbgForceOutcome(s, 'P', 'LOSS'); assert.deepEqual(capture(() => playRound(s, 'P')), [{ file: 'lifeLost', duck: true }]);
  dbgForceOutcome(s, 'P', 'LOSS'); assert.deepEqual(capture(() => playRound(s, 'P')), [{ synth: 'death' }]);
});

test('This Seems Fine keeping the life plays the “phew”, not LossOfLife', () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = createRun({ seed, startingLives: 1 }); dbgJumpToStage(s, 20); s.currentGap = 1e6;
    dbgAddUpgrade(s, 'this-seems-fine');
    dbgForceOutcome(s, 'S', 'LOSS');
    const cues = capture(() => playRound(s, 'S'));
    if (s.lives === 1) { assert.deepEqual(cues, [{ synth: 'phew' }]); return; }
    assert.deepEqual(cues, [{ file: 'lifeLost', duck: true }]);
  }
  assert.fail('This Seems Fine never triggered in 200 seeds');
});

test('buying an upgrade, a life, a reroll and an opponent swap all play PurchaseSuccess', async () => {
  const { buyLife, rerollStore, rerollOpponent } = await import('../src/core/engine');
  const s = createRun({ seed: 8 });
  dbgForceOutcome(s, 'R', 'TIE');
  const enter = capture(() => playRound(s, 'R'));
  assert.ok(enter.some((c) => c.synth === 'storeIn'), 'store entry chime');
  dbgAddCurrency(s, 1e5);
  for (const act of [() => buyUpgrade(s, 0), () => buyLife(s), () => rerollStore(s), () => rerollOpponent(s)])
    assert.deepEqual(capture(act), [{ file: 'purchase' }]);
  assert.deepEqual(capture(() => leaveStore(s)), [{ synth: 'storeOut' }]);
});

test('audio settings default to sensible levels and survive missing/old prefs', () => {
  const d = defaultPrefs();
  assert.equal(d.audio.muted, false);
  assert.ok(d.audio.music > 0 && d.audio.music < 1, 'music not at full volume by default');
  assert.ok(d.audio.sfx > d.audio.music);
});

test('every audio file the game references exists and is compressed', () => {
  const files = ['rock-select', 'paper-select', 'scissors-select', 'purchase', 'life-lost', 'music-title', 'music-rounds', 'music-store'];
  let total = 0;
  for (const f of files) {
    const p = `assets/audio/${f}.mp3`;
    assert.ok(existsSync(p), p);
    const size = statSync(p).size;
    total += size;
    if (!f.startsWith('music')) assert.ok(size < 40_000, `${p} is ${size} bytes`);
  }
  assert.ok(total < 9_000_000, `audio total ${total} bytes`);
});
