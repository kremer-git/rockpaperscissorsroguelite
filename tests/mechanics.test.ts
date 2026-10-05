// Every power-up gets exactly one mechanic symbol, and the obvious ones land where a player would expect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADES } from '../src/core/registry';
import { MECHANIC_LABEL, mechanicOf, mechanicSvg } from '../src/ui/mechanics';

test('every power-up maps to a known mechanic with an icon', () => {
  for (const u of UPGRADES) {
    const m = mechanicOf(u);
    assert.ok(m in MECHANIC_LABEL, u.id);
    assert.ok(mechanicSvg(m).startsWith('<svg'), u.id);
  }
});

test('mechanic symbols match what the cards do', () => {
  const m = (id: string) => mechanicOf(UPGRADES.find((u) => u.id === id)!);
  assert.equal(m('thick-skull'), 'save');
  assert.equal(m('monolith'), 'charge');
  assert.equal(m('contingency-plan'), 'charge');
  assert.equal(m('do-your-research'), 'info');
  assert.equal(m('read-the-instructions'), 'info');
  assert.equal(m('brute-force'), 'payout');
  assert.equal(m('momentum'), 'streak');
  assert.equal(m('stone-cold'), 'tie');
  assert.equal(m('death-wish'), 'lives');
  assert.equal(m('double-or-nothing'), 'risk');
  assert.equal(m('just-one-more'), 'reroll');
  assert.equal(m('compound-interest'), 'scaling');
});

test('the ten symbols are all used (no dead icons)', () => {
  const used = new Set(UPGRADES.map((u) => mechanicOf(u)));
  assert.deepEqual([...used].sort(), Object.keys(MECHANIC_LABEL).sort());
});
