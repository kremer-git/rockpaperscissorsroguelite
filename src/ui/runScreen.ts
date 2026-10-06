import { ROUTINE_LEN, ROUTINE_MAX, routineBonus, routineOf } from '../content/upgrades';
import { num } from '../core/helpers';
import { owned } from '../core/registry';
import type { App } from './app';
import type { Move } from '../core/types';
import { h, fmt, pct } from './dom';
import { asset } from './assets';
import { buildPanel, buttonOdds, cueLine, intelPanel, moveChip, opponentHeader, readStrip, storeProgress, treeOf, type ReadOpts } from './components';
import { getIntel } from '../core/intel';
import { allInAvailable, canThrow, effectiveSaveChance, throwCost } from '../core/rules';
import { MOVE_NAME, beats, outcomeProbs, resolve } from '../core/rps';
import { getOpponent } from '../core/opponentModel';

const OUTCOME_COPY: Record<string, string[]> = {
  WIN: ['WIN', 'Outplayed.', 'We take those.', 'Huge value.', 'As calculated.'],
  TIE: ['TIE', 'Stalemate.', 'Nobody blinked.', 'Mutually assured nothing.'],
  LOSS: ['LOSS', 'Skill issue?', 'RNG, probably.', 'Statistically inevitable.'],
  SAVED: ['SAVED', 'Absolutely balanced.', 'Denied.', 'Not today.'],
};
const MAX_CHIPS = 4;

export function runScreen(app: App): HTMLElement {
  const s = app.state!;
  const v = getIntel(s);
  const last = app.last;
  const playing = s.status === 'playing';

  // ---------- top bar ----------
  const top = h('header', { class: 'hud' },
    h('div', { class: 'hud-stat' }, h('span', { class: 'eyebrow' }, 'Round'), h('span', { class: 'hud-num num' }, fmt(s.round + (playing ? 1 : 0)))),
    h('div', { class: 'hud-stat', 'data-fx': 'coins' }, h('span', { class: 'eyebrow' }, 'Coins'), h('span', { class: 'hud-num num' }, asset('ui.coin', 'hud-glyph'), fmt(s.currency))),
    h('div', { class: 'hud-stat', 'data-fx': 'lives' }, h('span', { class: 'eyebrow' }, 'Extra Lives'), h('span', { class: `hud-num num ${s.lives === 0 ? 'danger' : ''}` }, asset('ui.life', 'hud-glyph'), String(s.lives))),
    h('div', { class: 'hud-progress' }, storeProgress(s)),
    h('div', { class: 'hud-seed small muted num', title: 'Seed for this run' }, s.mode === 'hard' ? h('span', { class: 'hard-tag' }, 'HARD') : null, ` Seed ${s.seed}`));

  // ---------- result ----------
  let result: HTMLElement;
  if (last) {
    const r = last.record;
    const key = r.saved ? 'SAVED' : r.outcome;
    const copy = OUTCOME_COPY[key];
    const quip = copy[1 + (r.round % (copy.length - 1))];
    const chips: { text: string; cls: string }[] = [];
    if (r.reward > 0) chips.push({ text: `+${fmt(r.reward)} coins`, cls: 'coin' });
    if (r.allIn) chips.push({ text: 'ALL-IN round', cls: '' });
    last.triggers.forEach((t) => chips.push({ text: t.text, cls: t.source === 'core' && t.text.includes('Life') ? 'life' : t.source === 'hush-money' ? 'hush' : '' }));
    const shown = chips.slice(0, MAX_CHIPS);
    const hidden = chips.slice(MAX_CHIPS);
    result = h('section', { class: `result out-${key.toLowerCase()}`, 'aria-live': 'polite' },
      h('div', { class: 'result-row' },
        h('div', { class: 'clash', 'data-fx': 'clash' },
          h('div', { class: 'clash-side' }, h('span', { class: 'eyebrow' }, 'You'), moveChip(r.player, 'big')),
          h('span', { class: 'vs' }, 'vs'),
          h('div', { class: 'clash-side' }, h('span', { class: 'eyebrow' }, getOpponent(s.opponentId).name), moveChip(r.opponent, 'big'))),
        h('div', { class: 'banner', 'data-fx': 'banner' },
          h('span', { class: 'banner-word' }, copy[0]),
          h('span', { class: 'banner-quip' }, `${MOVE_NAME[r.player]} vs ${MOVE_NAME[r.opponent]}. ${quip}`),
          r.rawOutcome === 'LOSS' ? h('span', { class: 'small muted' }, `Hindsight: ${MOVE_NAME[beats(r.opponent)]} would have beaten it.`) : null)),
      chips.length ? h('ul', { class: 'triggers' }, shown.map((c) => h('li', { class: `trig ${c.cls}` }, c.text)),
        hidden.length ? h('li', { class: 'trig more', title: hidden.map((c) => c.text).join('\n') }, `+${hidden.length} more`) : null) : null,
      s.status === 'store' ? h('button', { class: 'btn primary big', id: 'go-store', onclick: () => app.actions.goStore() }, `Enter store #${s.storesVisited}`) : null,
      s.status === 'dead' ? h('button', { class: 'btn danger big', id: 'go-over', onclick: () => app.actions.goOver() }, 'See the damage') : null);
  } else {
    result = h('section', { class: 'result idle' },
      h('p', { class: 'idle-line' }, s.round === 0 ? 'They’ve locked in a throw. Your move.' : `New opponent: ${getOpponent(s.opponentId).name}. ${s.currentGap} rounds to the next store.`),
      h('p', { class: 'small muted' }, s.round === 0 ? 'Tap a throw. The opponent always commits before you choose.' : 'Fresh start: they have no history with you yet, so this first throw can’t react to anything you did. Your own streaks carry over.'));
  }

  // ---------- throws ----------
  const readOpts: ReadOpts = {
    hideHunch: app.prefs.hidden.hunch, hideCold: app.prefs.hidden.coldRead,
    needsSuggestion: s.owned.some((u) => u.id === 'due-diligence' || u.id === 'i-have-sources'),
    onHide: (kind) => app.actions.setPrefs((p) => { p.hidden[kind] = true; }),
  };
  const known = buttonOdds(v, readOpts);
  // Show Your Work: a small chip on the throw that continues the routine (until its bonus is maxed).
  const sw = owned(s, 'show-your-work');
  const routineNext = sw && routineBonus(sw) < ROUTINE_MAX ? { m: routineOf(sw)[num(sw, 'step')], step: num(sw, 'step') + 1 } : null;
  const moves = (['R', 'P', 'S'] as Move[]).map((m) => {
    const save = effectiveSaveChance(s, m, app.allIn);
    const cost = throwCost(s, m);
    const ok = playing && canThrow(s, m);
    let odds: HTMLElement | null = null;
    if (playing && v.leaked) {
      const out = resolve(m, v.leaked);
      odds = h('span', { class: `odds leak-${out.toLowerCase()}` }, out === 'WIN' ? 'Wins' : out === 'TIE' ? 'Ties' : 'Loses');
    } else if (playing && known) {
      const o = outcomeProbs(m, known.d);
      odds = h('span', { class: 'odds', title: known.label }, `win ${pct(o.win)} · lose ${pct(o.loss)}`);
    }
    return h('button', {
      class: `throw tree-${treeOf(m)}`,
      id: `throw-${m}`, disabled: !ok, 'aria-keyshortcuts': m.toLowerCase(),
      'aria-label': `Throw ${MOVE_NAME[m]}${save > 0 ? `, save chance ${pct(save)}` : ''}${cost ? `, costs ${cost} coins` : ''}`,
      onclick: () => app.actions.throwMove(m),
    },
      h('span', { class: 'throw-art' }, asset(`move.${m}`, 'throw-glyph')),
      h('span', { class: 'throw-name' }, MOVE_NAME[m]),
      odds,
      h('span', { class: 'throw-meta' },
        save > 0 ? h('span', { class: 'save-tag' }, `save ${pct(save)}`) : h('span', { class: 'save-tag none' }, 'no save'),
        cost ? h('span', { class: 'tax-tag' }, `−${cost}¢`) : null,
        playing && routineNext?.m === m ? h('span', { class: 'routine-tag', title: 'Show Your Work: the next throw of your routine' }, `routine ${routineNext.step}/${ROUTINE_LEN}`) : null));
  });

  const allIn = allInAvailable(s) ? h('label', { class: `allin ${app.allIn ? 'on' : ''}`, for: 'allin' },
    h('input', { type: 'checkbox', id: 'allin', checked: app.allIn, disabled: !playing, onchange: () => app.actions.toggleAllIn() }),
    h('span', null, h('b', null, 'ALL-IN'), ' next throw: win pays ×3, tie pays 0, saves off')) : null;

  const prompt = playing
    ? h('div', { class: `your-move ${last ? 'pulse' : ''}`, 'data-fx': 'prompt' }, h('span', { class: 'your-move-label' }, `Round ${s.round + 1} · your move`),
      known ? h('span', { class: 'small muted' }, `Odds on buttons: ${known.label}`) : null)
    : null;

  const throwsBox = h('div', { class: `throw-zone ${playing ? 'ready' : ''}` },
    prompt, playing ? cueLine(v, s.round) : null, readStrip(v, readOpts),
    h('div', { class: 'throws', role: 'group', 'aria-label': 'Choose your throw' }, moves), allIn);

  const arena = h('main', { class: 'arena' }, result, throwsBox);

  // ---------- side panels (scroll inside themselves) ----------
  const oppPanel = h('aside', { class: 'panel opp-panel', 'aria-label': 'Opponent' }, opponentHeader(v), intelPanel(v, s));
  const recent = s.history.slice(-6).reverse();
  const collapsed = app.prefs.buildCollapsed;
  const toggleBuild = h('button', { class: 'btn small panel-toggle', id: 'build-toggle', type: 'button', 'aria-expanded': String(!collapsed),
    title: collapsed ? 'Show your build' : 'Hide your build', onclick: () => app.actions.setPrefs((p) => { p.buildCollapsed = !p.buildCollapsed; }) }, collapsed ? '◂' : 'Hide ▸');
  const buildP = collapsed
    ? h('aside', { class: 'panel build-panel rail', 'aria-label': 'Your build (collapsed)' }, toggleBuild,
      h('span', { class: 'rail-label' }, `Your build · ${s.owned.length}`))
    : h('aside', { class: 'panel build-panel', 'aria-label': 'Your build', 'data-fx': 'build' },
    h('div', { class: 'panel-head' }, h('h2', { class: 'panel-title' }, 'Your build'), toggleBuild),
    buildPanel(s, app),
    h('div', { class: 'mini-stats small num' },
      h('span', null, `W ${s.stats.wins}`), h('span', null, `T ${s.stats.ties}`), h('span', null, `Saves ${s.stats.saves}`), h('span', null, `Lives used ${s.stats.livesConsumed}`)),
    recent.length ? h('div', null, h('div', { class: 'eyebrow' }, 'Run log'),
      h('ol', { class: 'runlog small' }, recent.map((r) => h('li', null, `R${r.round}: ${MOVE_NAME[r.player]} vs ${MOVE_NAME[r.opponent]}, ${r.saved ? 'saved' : r.outcome.toLowerCase()}${r.lifeUsed ? ' (life used)' : ''}${r.reward ? ` +${r.reward}` : ''}`)))) : null);

  return h('div', { class: 'screen run' }, top, h('div', { class: `run-grid ${collapsed ? 'build-collapsed' : ''}` }, oppPanel, arena, buildP));
}
