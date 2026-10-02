// Debug / QA drawer. Toggle with the ` key. Uses the same engine functions as play.
import type { App } from './app';
import type { Move } from '../core/types';
import { h } from './dom';
import { UPGRADES } from '../core/registry';
import { OPPONENTS } from '../content/opponents';
import { dbgAddCurrency, dbgAddLife, dbgAddUpgrade, dbgForceOpponent, dbgForceOutcome, dbgInspect, dbgJumpToStage, dbgRemoveUpgrade, dbgSetOpponent, dbgSkipRounds, dbgSkipToStore } from '../core/debug';
import { getIntel } from '../core/intel';
import { rerollOpponent } from '../core/engine';

export function debugPanel(app: App): HTMLElement {
  const s = app.state;
  const act = (fn: () => void) => () => {
    try { fn(); } catch (e) { app.actions.notify(`Debug: ${(e as Error).message}`); }
    app.last = null;
    if (s?.status === 'store' && app.screen === 'run') app.screen = 'store';
    if (s?.status === 'playing' && app.screen === 'store') app.screen = 'run';
    if (s?.status === 'dead') app.screen = 'over';
    app.actions.render();
  };
  const val = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  if (!s) return h('aside', { class: 'debug', 'aria-label': 'Debug panel' }, h('h2', null, 'Debug'), h('p', null, 'Start a run to use debug tools.'),
    h('button', { class: 'btn small', onclick: () => app.actions.toggleDebug() }, 'Close'));

  const inspect = dbgInspect(s);
  const intel = s.status === 'playing' ? getIntel(s, { light: true }) : null;
  const dist = inspect.committedDist ? inspect.committedDist.map((x) => `${Math.round(x * 100)}%`).join(' / ') : '—';
  return h('aside', { class: 'debug', 'aria-label': 'Debug panel' },
    h('div', { class: 'debug-head' }, h('h2', null, 'Debug mode'), h('button', { class: 'btn small', onclick: () => app.actions.toggleDebug() }, 'Close ', h('kbd', null, '`'))),
    h('section', null, h('h3', null, 'Resources'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: act(() => dbgAddCurrency(s, 100)) }, '+100¢'),
        h('button', { class: 'btn small', onclick: act(() => dbgAddCurrency(s, 1000)) }, '+1000¢'),
        h('button', { class: 'btn small', onclick: act(() => dbgAddCurrency(s, 1_000_000)) }, '+1M¢'),
        h('button', { class: 'btn small', onclick: act(() => dbgAddLife(s, 1)) }, '+1 life'),
        h('button', { class: 'btn small', onclick: act(() => dbgAddLife(s, -1)) }, '−1 life'))),
    h('section', null, h('h3', null, 'Upgrades'),
      h('div', { class: 'row' },
        h('select', { id: 'dbg-up', 'aria-label': 'Upgrade' }, UPGRADES.map((u) => h('option', { value: u.id }, `${u.name} (${u.tree}, ${u.rarity})`))),
        h('button', { class: 'btn small', id: 'dbg-add', onclick: act(() => dbgAddUpgrade(s, val('dbg-up'))) }, 'Add'),
        h('button', { class: 'btn small', id: 'dbg-remove', onclick: act(() => dbgRemoveUpgrade(s, val('dbg-up'))) }, 'Remove'))),
    h('section', null, h('h3', null, 'Opponent'),
      h('div', { class: 'row' },
        h('select', { id: 'dbg-opp', 'aria-label': 'Opponent' }, OPPONENTS.map((o) => h('option', { value: o.id, selected: o.id === s.opponentId }, `${o.name} (${o.tier})`))),
        h('button', { class: 'btn small', id: 'dbg-setopp', onclick: act(() => dbgSetOpponent(s, val('dbg-opp'))) }, 'Set current'),
        s.status === 'store' ? h('button', { class: 'btn small', onclick: act(() => { s.currency += 1e6; rerollOpponent(s); s.currency -= 1e6; }) }, 'Reroll next (free)') : null),
      h('p', { class: 'small' }, `Committed throw: ${inspect.committedThrow ?? '—'} · true odds R/P/S: ${dist}`),
      intel?.prediction ? h('p', { class: 'small' }, `Estimator: ${intel.prediction.dist.map((x) => Math.round(x * 100) + '%').join(' / ')} (${intel.prediction.confidence})`) : null),
    s.status === 'playing' ? h('section', null, h('h3', null, 'Force next round'),
      h('div', { class: 'row' }, (['R', 'P', 'S'] as Move[]).map((m) => h('button', { class: 'btn small', onclick: act(() => dbgForceOpponent(s, m)) }, `Opp throws ${m}`))),
      h('div', { class: 'row' }, (['WIN', 'TIE', 'LOSS'] as const).map((o) => h('button', { class: 'btn small', onclick: act(() => dbgForceOutcome(s, 'R', o)) }, `${o} if you throw R`)))) : null,
    h('section', null, h('h3', null, 'Time travel'),
      h('div', { class: 'row' },
        h('input', { id: 'dbg-n', type: 'number', value: '10', min: '1', 'aria-label': 'Rounds', class: 'num-input' }),
        h('button', { class: 'btn small', onclick: act(() => dbgSkipRounds(s, Math.max(1, Number(val('dbg-n')) || 1))) }, 'Skip N rounds (tie)'),
        h('button', { class: 'btn small', onclick: act(() => dbgSkipToStore(s)) }, 'Skip to store')),
      h('div', { class: 'row' },
        h('input', { id: 'dbg-stage', type: 'number', value: '9', min: '0', 'aria-label': 'Stage', class: 'num-input' }),
        h('button', { class: 'btn small', id: 'dbg-jump', onclick: act(() => dbgJumpToStage(s, Math.max(0, Number(val('dbg-stage')) || 0))) }, 'Jump to stage (long gaps)')),
      h('div', { class: 'row' }, h('button', { class: 'btn small danger', onclick: () => app.actions.start() }, 'Reset run'))),
    h('section', null, h('h3', null, 'Inspect'),
      h('p', { class: 'small' }, `Save chance R/P/S: ${(['R', 'P', 'S'] as const).map((m) => Math.round(inspect.saveChance[m] * 100) + '%').join(' / ')} (raw ${(['R', 'P', 'S'] as const).map((m) => Math.round(inspect.rawSaveChance[m] * 100) + '%').join(' / ')})`),
      h('details', null, h('summary', null, 'Active modifiers & triggers'), h('pre', null, JSON.stringify({ owned: inspect.owned, lastTriggers: inspect.lastTriggers, reactive: inspect.reactive, adaptive: inspect.adaptive }, null, 1))),
      h('details', null, h('summary', null, 'Debug log'), h('pre', null, s.debugLog.slice(-30).join('\n') || '—')),
      h('details', null, h('summary', null, 'Full game state'), h('pre', null, JSON.stringify({ ...s, history: `${s.history.length} rounds`, stageHistory: `${s.stageHistory.length} rounds`, intelMemory: '…' }, null, 1)))));
}
