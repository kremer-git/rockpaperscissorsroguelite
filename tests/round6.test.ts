// Round 6: art, Opponents Defeated collection, award rename, rarity change, tendency wording, no build ordering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { AWARDS, emptyProgress, foeStatus, mergeProgress, noteBeaten, noteMet } from '../src/ui/awards';
import { defaultPrefs } from '../src/ui/prefs';
import { OPPONENTS } from '../src/content/opponents';
import { getUpgrade } from '../src/core/registry';
import { createRun, leaveStore, playRound } from '../src/core/engine';
import { dbgForceOutcome } from '../src/core/debug';

test('Opponents Defeated: unknown → met (first round of a stretch) → defeated (stretch survived)', () => {
  const p = emptyProgress();
  assert.equal(foeStatus(p, 'repeater'), 'unknown');
  assert.equal(noteMet(p, 'repeater'), true);
  assert.equal(noteMet(p, 'repeater'), false);
  assert.equal(foeStatus(p, 'repeater'), 'met');
  assert.equal(noteBeaten(p, 'repeater'), true);
  assert.equal(noteBeaten(p, 'repeater'), false);
  assert.equal(foeStatus(p, 'repeater'), 'defeated');
  assert.deepEqual(p.foes.repeater, { met: 2, beaten: 2 });
  // defeat without a recorded meeting still counts as met
  noteBeaten(p, 'nash');
  assert.equal(p.foes.nash.met, 1);
});

test('collection merges local + cloud records without losing progress, and old saves load', () => {
  const a = emptyProgress(); noteMet(a, 'repeater'); noteBeaten(a, 'cycler');
  const b = emptyProgress(); noteMet(b, 'repeater'); noteMet(b, 'repeater'); noteMet(b, 'oracle');
  const m = mergeProgress(a, b);
  assert.equal(foeStatus(m, 'repeater'), 'met');
  assert.equal(m.foes.repeater.met, 2);
  assert.equal(foeStatus(m, 'cycler'), 'defeated');
  assert.equal(foeStatus(m, 'oracle'), 'met');
  // a pre-collection save (no `foes` field) merges cleanly
  const old = { best: 50, bestHard: 0, runs: 3, unlocked: {} } as unknown as ReturnType<typeof emptyProgress>;
  assert.equal(foeStatus(mergeProgress(old, a), 'cycler'), 'defeated');
});

test('stage survival is what the collection calls a defeat (engine: storeEnter after the stretch)', () => {
  const s = createRun({ seed: 3, startingLives: 5 });
  const first = s.opponentId;
  dbgForceOutcome(s, 'R', 'WIN');
  playRound(s, 'R'); // gap 1 → store
  assert.equal(s.status, 'store');
  assert.equal(s.stats.opponentsDefeated, 1);
  leaveStore(s);
  assert.notEqual(s.opponentId, first);
});

test('the 100-round award has a new, drier name; ids (round counts) are unchanged so earned awards keep', () => {
  assert.deepEqual(AWARDS.map((a) => a.rounds), [100, 200, 300, 400, 500]);
  assert.equal(AWARDS[0].name, 'Congrats, You Played Yourself');
  assert.ok(!AWARDS.some((a) => a.name === 'Centurion'));
});

test('Actually I Read the Instructions is now legendary', () => {
  assert.equal(getUpgrade('read-the-instructions').rarity, 'legendary');
});

test('tendency texts read as habits, not guarantees (except Sal’s curse, which is absolute)', () => {
  const lenny = OPPONENTS.find((o) => o.id === 'loop')!;
  assert.ok(/usually/i.test(lenny.tell));
  assert.ok(/slips/i.test(lenny.tell));
  for (const id of ['hot-hand', 'cold-hand', 'mood-swings', 'superstitious', 'psychologist', 'oracle']) {
    assert.ok(/tends|leans|usually/i.test(OPPONENTS.find((o) => o.id === id)!.tell), id);
  }
  assert.ok(/^Never repeats a throw that just lost/.test(OPPONENTS.find((o) => o.id === 'superstitious')!.tell));
});

test('build ordering prefs are gone; the collection remembers whether it is open', () => {
  const p = defaultPrefs();
  assert.ok(!('order' in p));
  assert.equal(p.collectionClosed, false); // the collection starts open
});

test('throw and trophy art: all eight files exist as small WebP images', () => {
  const files = readdirSync('assets/art').filter((f) => f.endsWith('.webp')).sort();
  assert.deepEqual(files, ['award-100.webp', 'award-200.webp', 'award-300.webp', 'award-400.webp', 'award-500.webp', 'move-P.webp', 'move-R.webp', 'move-S.webp']);
  for (const f of files) {
    const b = readFileSync(`assets/art/${f}`);
    assert.equal(String.fromCharCode(...b.slice(0, 4)) + String.fromCharCode(...b.slice(8, 12)), 'RIFFWEBP', f);
    assert.ok(b.length < 40000, `${f} is ${b.length} bytes`);
  }
});

test('the seed box suggests “lizard spock”, and that seed works', async () => {
  const src = readFileSync('src/ui/menus.ts', 'utf8');
  assert.ok(src.includes('lizard spock'));
  assert.ok(!src.includes('“hank”'));
  const { parseSeed } = await import('../src/ui/seed');
  assert.equal(typeof parseSeed('lizard spock'), 'number');
});
