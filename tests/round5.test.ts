// Round 5: new opponent playstyles (Loop, Superstitious, Mood Swings, Bluffer).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, playRound, validateState, leaveStore } from '../src/core/engine';
import { dbgAddUpgrade, dbgJumpToStage, dbgSetOpponent } from '../src/core/debug';
import { getIntel, guessFromTell } from '../src/core/intel';
import { currentMood, getOpponent, loopSequence, opponentDistribution, relativeTo, shiftFrom } from '../src/core/opponentModel';
import { beats, idx, losesTo } from '../src/core/rps';
import { OPPONENTS } from '../src/content/opponents';
import type { GameState, Move } from '../src/core/types';

const MOVES: Move[] = ['R', 'P', 'S'];

function arena(opp: string, seed = 11, ups: string[] = []): GameState {
  const s = createRun({ seed, startingLives: 0 });
  dbgJumpToStage(s, 25);
  s.currentGap = 1e6;
  dbgSetOpponent(s, opp);
  ups.forEach((id) => dbgAddUpgrade(s, id));
  return s;
}
const argmax = (d: number[]) => d.indexOf(Math.max(...d));
function playSafe(s: GameState, m: Move) { s.lives = 99; return playRound(s, m); }

test('the four new personas exist with titles, tells, portraits and sensible tiers', () => {
  const want: Record<string, string> = { loop: 'medium', superstitious: 'medium', 'mood-swings': 'hard', bluffer: 'elite' };
  for (const [id, tier] of Object.entries(want)) {
    const o = getOpponent(id);
    assert.equal(o.tier, tier, id);
    assert.ok(o.title && o.tell && o.archetype && o.portrait, id);
  }
  assert.equal(OPPONENTS.length, 20);
  assert.equal(OPPONENTS.filter((o) => o.tier === 'hard' || o.tier === 'elite').length, 7);
});

test('The Loop: one sequence of 3–4 throws per encounter (never a plain R→P→S cycle), played over and over', () => {
  let hits = 0, total = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const s = arena('loop', seed);
    const seq = loopSequence(s)!;
    assert.ok(seq && seq.length >= 3 && seq.length <= 4, `len ${seq?.length}`);
    assert.ok(new Set(seq).size >= 2);
    assert.ok(!(seq.length === 3 && seq[1] === beats(seq[0]) && seq[2] === beats(seq[1])), 'plain cycle');
    for (let i = 0; i < 40; i++) {
      const expected = seq[s.stageHistory.length % seq.length];
      assert.equal(argmax(s.pendingOpponentDist!), idx(expected));
      const r = playSafe(s, 'R');
      if (r.record.opponent === expected) hits++;
      total++;
    }
  }
  assert.ok(hits / total > 0.75, `only ${hits}/${total} followed the loop`);
});

test('The Loop: the tell-reader spots the period from visible history', () => {
  const s = arena('loop', 3);
  const seq = loopSequence(s)!;
  for (let i = 0; i < 12; i++) playSafe(s, 'R');
  const h = s.stageHistory.filter((r, i) => r.opponent === seq[i % seq.length]);
  if (h.length === s.stageHistory.length) {
    const g = guessFromTell(getOpponent('loop'), s.stageHistory.slice(-5))!;
    assert.equal(argmax(g), idx(seq[s.stageHistory.length % seq.length]));
  }
});

test('The Superstitious: never repeats a throw that just lost; keeps a winner; cycles after a tie', () => {
  const s = arena('superstitious');
  let after = 0, repeats = 0;
  for (let i = 0; i < 400; i++) {
    const last = s.stageHistory[s.stageHistory.length - 1];
    if (last && last.rawOutcome === 'WIN') {
      const d = s.pendingOpponentDist!;
      assert.ok(d[idx(last.opponent)] === 0, `cursed throw still at ${d[idx(last.opponent)]}`);
    }
    if (last && last.rawOutcome === 'LOSS') assert.equal(argmax(s.pendingOpponentDist!), idx(last.opponent));
    if (last && last.rawOutcome === 'TIE') assert.equal(argmax(s.pendingOpponentDist!), idx(beats(last.opponent)));
    const r = playSafe(s, MOVES[i % 3]);
    if (last && last.rawOutcome === 'WIN') { after++; if (r.record.opponent === last.opponent) repeats++; }
  }
  assert.ok(after > 50 && repeats === 0, `${repeats}/${after}`);
});

test('Mood Swings: two behaviours alternate every 5 rounds; the badge tells you which', () => {
  const o = getOpponent('mood-swings');
  assert.equal(currentMood(o, 0).index, 0);
  assert.equal(currentMood(o, 4).index, 0);
  assert.equal(currentMood(o, 5).index, 1);
  assert.equal(currentMood(o, 10).index, 0);
  const s = arena('mood-swings');
  for (let i = 0; i < 30; i++) {
    const n = s.stageHistory.length;
    const v = getIntel(s);
    assert.equal(v.mood!.index, currentMood(o, n).index);
    assert.equal(v.mood!.roundsLeft, 5 - (n % 5));
    const last = s.stageHistory[n - 1];
    if (last) {
      const expect = v.mood!.index === 0 ? last.opponent : beats(last.player); // Stubborn repeats; Spiteful beats your last
      assert.equal(argmax(s.pendingOpponentDist!), idx(expect), `round ${n} mood ${v.mood!.name}`);
    }
    playSafe(s, MOVES[(i * 7) % 3]);
  }
});

test('The Bluffer: announces a throw every round, recorded in history; opening lean is the bluff', () => {
  const s = arena('bluffer');
  const said = s.opponentSays!;
  assert.ok(MOVES.includes(said));
  // round 1: nothing to read yet, so the bluff dominates (beats what beats the announcement)
  assert.equal(argmax(s.pendingOpponentDist!), idx(losesTo(said)));
  assert.equal(losesTo(said), beats(beats(said)));
  assert.equal(getIntel(s).said, said);
  const r = playSafe(s, 'R');
  assert.equal(r.record.said, said);
  assert.ok(s.opponentSays && MOVES.includes(s.opponentSays));
});

test('The Bluffer: expects you to answer his announcement the way you did last time, and beats that answer', () => {
  const s = arena('bluffer', 5);
  for (let i = 0; i < 60; i++) {
    const last = s.stageHistory[s.stageHistory.length - 1];
    const said = s.opponentSays!;
    if (last?.said) {
      const rel = relativeTo(last.player, last.said);
      const expectYou = shiftFrom(said, rel);
      const read = beats(expectYou);
      const d = s.pendingOpponentDist!;
      // His two strongest options are the read and the bluff; the read wins when they differ.
      assert.equal(argmax(d), idx(read));
      if (read !== losesTo(said)) assert.ok(d[idx(losesTo(said))] > d[idx(said === read ? losesTo(said) : said)] - 1e-9);
    }
    playSafe(s, MOVES[(i * 5 + 1) % 3]);
  }
});

test('The Bluffer: a reader of the tell does far better than random; the Hunch learns announcements', () => {
  let lossTell = 0, n = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const s = arena('bluffer', seed, ['do-your-research']);
    for (let i = 0; i < 40; i++) {
      const v = getIntel(s);
      const last = s.stageHistory[s.stageHistory.length - 1];
      const g = guessFromTell(v.opponent, s.stageHistory, { said: v.said })!;
      const m = beats(MOVES[argmax(g)]);
      void last;
      const r = playSafe(s, m);
      if (r.record.rawOutcome === 'LOSS') lossTell++;
      n++;
    }
  }
  assert.ok(lossTell / n < 0.25, `tell reader lost ${(100 * lossTell / n).toFixed(1)}%`);
});

test('announcements and moods are hidden by No Thoughts Just Rock (it hides everything)', () => {
  const s = arena('bluffer', 2, ['no-thoughts']);
  const v = getIntel(s);
  assert.ok(v.flags.hidden);
  assert.equal(v.said, null);
  assert.equal(getIntel(arena('mood-swings', 2, ['no-thoughts'])).mood, null);
});

test('the opponent’s announcement is cleared in the store and survives save/load validation', () => {
  const s = arena('bluffer');
  s.currentGap = s.roundsIntoStage + 1;
  playSafe(s, 'R');
  assert.equal(s.status, 'store');
  assert.equal(s.opponentSays, null);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))), []);
  leaveStore(s);
  assert.deepEqual(validateState(JSON.parse(JSON.stringify(s))), []);
  const bad = { ...JSON.parse(JSON.stringify(s)), opponentSays: 'X' };
  assert.ok(validateState(bad).includes('bad opponentSays'));
});

test('no hidden rigging still holds for the new personas: same history → same odds, whatever the build', () => {
  for (const id of ['loop', 'superstitious', 'mood-swings', 'bluffer']) {
    const a = arena(id, 9);
    const b = arena(id, 9, ['thick-skull', 'spreadsheet']);
    b.currency = 1e6; b.lives = 9;
    for (let i = 0; i < 12; i++) {
      assert.deepEqual(opponentDistribution(a).dist.map((x) => x.toFixed(9)), opponentDistribution(b).dist.map((x) => x.toFixed(9)), `${id} round ${i}`);
      const m = MOVES[i % 3];
      // keep both runs on the same opponent throw so histories match
      b.pendingOpponentMove = a.pendingOpponentMove; b.opponentSays = a.opponentSays;
      a.lives = 99; b.lives = 99;
      playRound(a, m); playRound(b, m);
      b.opponentMemory = { ...a.opponentMemory };
      b.opponentSays = a.opponentSays;
    }
  }
});

test('Rocks Are Heavy also dampens Felix’s read of your answers (it reads YOUR throws)', () => {
  const a = arena('bluffer', 4);
  const b = arena('bluffer', 4, ['rocks-are-heavy']);
  for (let i = 0; i < 6; i++) {
    b.pendingOpponentMove = a.pendingOpponentMove; b.opponentSays = a.opponentSays;
    a.lives = 99; b.lives = 99; playRound(a, 'R'); playRound(b, 'R');
    b.opponentSays = a.opponentSays;
  }
  const da = opponentDistribution(a).dist, db = opponentDistribution(b).dist;
  const last = a.stageHistory[a.stageHistory.length - 1];
  const read = shiftFrom(a.opponentSays!, relativeTo(last.player, last.said!) + 1);
  if (read === 'P') assert.ok(db[1] < da[1]);
  else assert.deepEqual(da, db);
});

test('corrupted Loop memory or a missing announcement is rejected on load', () => {
  const s = arena('loop');
  const bad = JSON.parse(JSON.stringify(s));
  bad.opponentMemory.l0 = 7;
  assert.ok(validateState(bad).includes('bad loop sequence'));
  const f = JSON.parse(JSON.stringify(arena('bluffer')));
  f.opponentSays = null;
  assert.ok(validateState(f).includes('bluffer without an announcement'));
});

test('the mood read-out only shows during a live round', () => {
  const s = arena('mood-swings');
  s.currentGap = s.roundsIntoStage + 1;
  assert.ok(getIntel(s).mood);
  playSafe(s, 'R');
  assert.equal(s.status, 'store');
  assert.equal(getIntel(s).mood, null);
});
