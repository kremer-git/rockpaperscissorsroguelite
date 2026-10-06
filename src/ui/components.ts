// Reusable UI pieces. All read from state; none apply rules.
import type { Dist, GameState, Move, RoundRecord, Tree, UpgradeDef } from '../core/types';
import { h, pct } from './dom';
import { asset, upgradeAsset } from './assets';
import { MECHANIC_LABEL, mechanicOf, mechanicSvg } from './mechanics';
import { MOVE_NAME } from '../core/rps';
import type { IntelView } from '../core/intel';
import { getUpgrade } from '../core/registry';
import type { App } from './app';

export const RARITY_LABEL: Record<string, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
};
export const TREE_LABEL: Record<string, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };
export const RARITY_PIPS: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
export const treeOf = (m: Move) => (m === 'R' ? 'rock' : m === 'P' ? 'paper' : 'scissors');

export function moveChip(m: Move, cls = ''): HTMLElement {
  return h('span', { class: `move-chip tree-${treeOf(m)} ${cls}`, title: MOVE_NAME[m] }, asset(`move.${m}`, 'glyph'));
}

/** Rarity as a coloured sticker (like the tree tag), with pips so it never relies on colour alone. */
export function rarityBadge(r: string): HTMLElement {
  return h('span', { class: `rarity-sticker rarity-${r}` },
    h('span', { class: 'pips', 'aria-hidden': 'true' }, '◆'.repeat(RARITY_PIPS[r])), h('span', null, RARITY_LABEL[r]));
}

export function treeBadge(t: string): HTMLElement {
  return h('span', { class: `tree-badge tree-${t}` }, TREE_LABEL[t]);
}

/** Explains stacking in plain words. `copyNo` = which copy buying this would give you. */
export function stackNote(d: UpgradeDef, copyNo?: number): HTMLElement | null {
  if (d.maxStacks <= 1) return null;
  return h('p', { class: 'stack-note' },
    `Stackable: you can buy up to ${d.maxStacks} copies`, d.perCopy ? `; each copy adds ${d.perCopy}.` : '.',
    copyNo ? h('b', null, ` This is copy ${copyNo} of ${d.maxStacks}.`) : null);
}

/** Power-up icon: the tree's own Rock/Paper/Scissors drawing, with a small badge for the card's main mechanic. */
export function upgradeIcon(d: UpgradeDef, cls = ''): HTMLElement {
  const m = mechanicOf(d);
  const move = d.tree === 'rock' ? 'R' : d.tree === 'paper' ? 'P' : 'S';
  return h('div', { class: `card-icon tree-${d.tree} ${cls}`, 'data-mech': m },
    asset(`move.${move}`, 'icon', upgradeAsset(d.icon, d.tree, d.name)),
    h('span', { class: `mech mech-${m}`, title: MECHANIC_LABEL[m], 'aria-label': MECHANIC_LABEL[m], role: 'img', html: mechanicSvg(m) }));
}

export function upgradeCard(d: UpgradeDef, stacksShown: number, footer?: HTMLElement | null, extra = '', copyNo?: number): HTMLElement {
  return h('article', { class: `card up-card tree-${d.tree} rarity-card-${d.rarity} ${extra}` },
    h('header', { class: 'card-head' },
      upgradeIcon(d),
      h('div', { class: 'card-titles' }, h('h3', null, d.name), h('div', { class: 'card-meta' }, treeBadge(d.tree), rarityBadge(d.rarity)))),
    h('p', { class: 'card-text' }, d.describe(Math.max(1, stacksShown))),
    stackNote(d, copyNo),
    h('p', { class: 'card-flavor' }, d.flavor),
    footer ?? null);
}

/**
 * History as a small table. Columns run oldest → newest; the header counts
 * "rounds ago" (1 = last round) so "two rounds ago" behaviours are easy to check.
 */
export function historyTable(hist: RoundRecord[]): HTMLElement {
  if (!hist.length) return h('p', { class: 'muted small' }, 'No rounds against this opponent yet.');
  const n = hist.length;
  const cell = (cls: string, text: string, title?: string) => h('span', { class: `ht-cell ${cls}`, title }, text);
  const res = (r: RoundRecord) => (r.saved ? 'S' : r.outcome === 'WIN' ? 'W' : r.outcome === 'TIE' ? 'T' : 'L');
  return h('div', { class: 'ht', role: 'table', 'aria-label': 'Recent rounds against this opponent' },
    h('div', { class: 'ht-row ht-head', role: 'row' }, h('span', { class: 'ht-label' }, 'Rounds ago'), hist.map((_, i) => cell('ht-ago', String(n - i)))),
    hist.some((r) => r.said) ? h('div', { class: 'ht-row ht-said', role: 'row' }, h('span', { class: 'ht-label', title: 'What they announced before throwing' }, 'Said'),
      hist.map((r) => (r.said ? cell(`ht-move said tree-${treeOf(r.said)}`, r.said, `Announced ${MOVE_NAME[r.said]}`) : cell('ht-move', '·')))) : null,
    h('div', { class: 'ht-row', role: 'row' }, h('span', { class: 'ht-label' }, 'Them'), hist.map((r) => cell(`ht-move tree-${treeOf(r.opponent)}`, r.opponent, MOVE_NAME[r.opponent]))),
    h('div', { class: 'ht-row', role: 'row' }, h('span', { class: 'ht-label' }, 'You'), hist.map((r) => cell(`ht-move tree-${treeOf(r.player)}`, r.player, MOVE_NAME[r.player]))),
    h('div', { class: 'ht-row', role: 'row' }, h('span', { class: 'ht-label' }, 'Result'),
      hist.map((r) => cell(`ht-res out-${r.saved ? 'save' : r.outcome.toLowerCase()}`, res(r), r.saved ? 'Saved' : r.outcome))),
    h('p', { class: 'ht-key small muted' }, 'W win · T tie · L loss · S saved'));
}

export function opponentHeader(v: IntelView): HTMLElement {
  const o = v.opponent;
  return h('div', { class: 'opp-head' },
    h('div', { class: 'portrait' }, asset(o.portrait, 'portrait-glyph')),
    h('div', { class: 'opp-id' },
      h('div', { class: 'eyebrow' }, 'Opponent'),
      h('h2', null, o.name),
      h('div', { class: 'opp-title' }, o.title)),
    v.showTell ? h('p', { class: 'opp-tell' }, h('b', null, `${o.archetype}: `), o.tell)
      : v.flags.hidden ? null
        : h('p', { class: 'opp-tell locked' }, 'Tendency unknown. ', h('b', null, 'Do Your Research'), ' (5¢ in the store) reveals it. Or watch the history.'));
}

const SAY_LINES = ['“{m}. Definitely {m}.”', '“I’m throwing {m}. Honest.”', '“{m}. Would I lie to you?”', '“Between you and me: {m}.”', '“{m}. Write it down.”'];

/** Things the opponent shows before you throw: an announcement (The Bluffer) or a mood (Mood Swings). */
export function cueLine(v: IntelView, round: number): HTMLElement | null {
  if (v.said) {
    const line = SAY_LINES[round % SAY_LINES.length].replace(/\{m\}/g, MOVE_NAME[v.said]);
    return h('div', { class: 'cue say', id: 'opp-says', 'aria-live': 'polite' },
      h('span', { class: 'cue-who' }, `${v.opponent.name} says`), moveChip(v.said, 'tiny'), h('span', { class: 'cue-text' }, line));
  }
  if (v.mood) {
    const left = v.mood.roundsLeft;
    return h('div', { class: `cue mood mood-${v.mood.index}`, id: 'opp-mood' },
      h('span', { class: 'cue-who' }, `${v.opponent.name} is`), h('b', null, v.mood.name),
      h('span', { class: 'cue-text muted' }, left === 1 ? 'Mood swings after this round.' : `Mood swings in ${left} rounds.`));
  }
  return null;
}

/** Left panel below the header: history, counts, next opponent. */
export function intelPanel(v: IntelView, s: GameState): HTMLElement {
  if (v.flags.hidden) return h('div', { class: 'intel' }, h('p', { class: 'note' }, 'No Thoughts Just Rock: all intel is hidden. You are at peace.'));
  const blocks: (HTMLElement | null)[] = [
    h('div', null, h('div', { class: 'eyebrow' }, `History vs ${v.opponent.name} (last ${Math.min(v.flags.historyWindow, s.stageHistory.length)} of ${s.stageHistory.length})`), historyTable(v.visibleHistory),
      h('p', { class: 'small muted reset-note' }, 'This history starts over at every store. A new opponent’s first throw can’t react to anything you did.')),
  ];
  if (v.frequencies) {
    const f = v.frequencies;
    blocks.push(h('div', { class: 'counts' }, h('span', { class: 'eyebrow' }, 'Their throws so far'),
      h('div', { class: 'count-row' }, (['R', 'P', 'S'] as Move[]).map((m, i) => h('span', { class: `count tree-${treeOf(m)}` }, moveChip(m, 'tiny'), h('b', { class: 'num' }, String(f[i])))))));
  }
  if (v.nextOpponent) blocks.push(h('p', { class: 'small muted' }, `Five-Year Plan: next up is ${v.nextOpponent.name}${v.showTell ? ` (${v.nextOpponent.archetype})` : ''}.`));
  return h('div', { class: 'intel' }, blocks);
}

export interface ReadOpts {
  hideHunch: boolean;
  hideCold: boolean;
  /** Owns Due Diligence or I Have Sources: keep the suggested throw visible even when true odds show. */
  needsSuggestion?: boolean;
  onHide?: (kind: 'hunch' | 'coldRead') => void;
}

/** Cold Read shown this round, unless the player switched it off. */
export const visibleRuledOut = (v: IntelView, o: ReadOpts): Move | null => (o.hideCold ? null : v.ruledOut);

/** The Hunch is shown unless switched off, or unless true odds are on the buttons this round (they beat it). */
export const hunchShown = (v: IntelView, o: ReadOpts): boolean => !!v.prediction && !o.hideHunch && !v.trueOdds;

/** The "read" on this round, shown right above the throw buttons. */
export function readStrip(v: IntelView, o: ReadOpts): HTMLElement | null {
  if (v.flags.hidden) return null;
  if (v.leaked) {
    return h('div', { class: 'leak-banner', role: 'status' },
      h('span', { class: 'eyebrow' }, 'Mastermind leak'),
      h('span', { class: 'leak-line' }, 'They locked in ', moveChip(v.leaked, 'mid'), h('b', null, MOVE_NAME[v.leaked].toUpperCase())));
  }
  const hideBtn = (kind: 'hunch' | 'coldRead', label: string) => o.onHide
    ? h('button', { class: 'read-hide', type: 'button', title: `Hide ${label}. Turn it back on from Your Build.`, 'aria-label': `Hide ${label}`, onclick: () => o.onHide!(kind) }, '×')
    : null;
  const parts: HTMLElement[] = [];
  const ro = visibleRuledOut(v, o);
  if (ro) {
    const others = (['R', 'P', 'S'] as Move[]).filter((m) => m !== ro).map((m) => MOVE_NAME[m]);
    parts.push(h('span', { class: 'read-item cold' }, h('span', { class: 'eyebrow' }, 'Cold read'),
      ' Not ', h('b', null, MOVE_NAME[ro]), `. They picked ${others[0]} or ${others[1]}.`, hideBtn('coldRead', 'Cold Read')));
  }
  if (!hunchShown(v, o) && v.prediction && v.trueOdds && o.needsSuggestion && !o.hideHunch) {
    parts.push(h('span', { class: 'read-item hunch compact' }, h('span', { class: 'eyebrow' }, 'Hunch'),
      ' Suggested: ', h('b', null, MOVE_NAME[v.prediction.recommended]), ' (for Due Diligence / I Have Sources)'));
  }
  if (hunchShown(v, o)) {
    const p = v.prediction!;
    const d = hunchDist(v, o)!;
    const top = (['R', 'P', 'S'] as Move[]).reduce((a, b) => (d[['R', 'P', 'S'].indexOf(b)] > d[['R', 'P', 'S'].indexOf(a)] ? b : a));
    const conf = Math.round(Math.max(...d) * 100);
    parts.push(h('span', { class: 'read-item hunch' }, h('span', { class: 'eyebrow' }, 'Hunch'),
      ' Probably ', h('b', null, MOVE_NAME[top]), ` · ${conf}% sure`, p.confidence === 'Low' ? (p.thin ? ' (not much data yet)' : ' (hard to read)') : '',
      ' · suggested: ', h('b', null, MOVE_NAME[p.recommended]), hideBtn('hunch', 'the Hunch')));
  }
  if (v.oddsUnreadable) parts.push(h('span', { class: 'read-item smudge' }, h('span', { class: 'eyebrow' }, 'Instructions'), ' Smudged this round: no true odds.'));
  if (!parts.length) return null;
  return h('div', { class: 'read-strip' }, parts);
}

function withoutMove(d: Dist, m: Move | null): Dist {
  if (!m) return d;
  const out: Dist = [...d] as Dist;
  out[['R', 'P', 'S'].indexOf(m)] = 0;
  const t = out[0] + out[1] + out[2];
  return t > 0 ? [out[0] / t, out[1] / t, out[2] / t] : d;
}

/** Estimated distribution for the hunch, with a visible Cold Read folded in. */
export function hunchDist(v: IntelView, o: ReadOpts = { hideHunch: false, hideCold: false }): Dist | null {
  if (!v.prediction) return null;
  return withoutMove(v.prediction.dist, visibleRuledOut(v, o));
}

/**
 * The distribution behind the win/lose odds on the throw buttons: true odds when readable,
 * otherwise the Hunch. A visible Cold Read is folded into either, since it is real information
 * about this round's locked-in throw.
 */
export function buttonOdds(v: IntelView, o: ReadOpts): { d: Dist; label: string } | null {
  const ro = visibleRuledOut(v, o);
  if (v.trueOdds) return { d: withoutMove(v.trueOdds, ro), label: ro ? 'true odds + cold read' : 'true odds' };
  if (v.prediction && !o.hideHunch) return { d: hunchDist(v, o)!, label: ro ? 'estimate + cold read' : 'estimate' };
  return null;
}

const INTEL_TOGGLES: Record<string, 'hunch' | 'coldRead'> = { spreadsheet: 'hunch', 'predictive-analytics': 'hunch', 'cold-read': 'coldRead' };
const TREES: Tree[] = ['rock', 'paper', 'scissors'];

/**
 * The player's build, grouped by tree. With `app` it becomes interactive:
 * collapsible trees, remembered
 * expanded items, and on/off switches for the Hunch and Cold Read read-outs.
 */
export function buildPanel(s: GameState, app?: App): HTMLElement {
  if (!s.owned.length) return h('p', { class: 'muted small' }, 'No upgrades yet. Your build is “vibes”.');
  const prefs = app?.prefs;
  const sections = TREES.map((t) => {
    // Purchase order within each tree (the player-sortable order was removed: it wasn't worth the clutter).
    const ids = s.owned.filter((u) => getUpgrade(u.id).tree === t).map((u) => u.id);
    if (!ids.length) return null;
    const collapsed = !!prefs?.treeCollapsed[t];
    const items = ids.map((id) => {
      const u = s.owned.find((x) => x.id === id)!;
      const d = getUpgrade(id);
      const sc = d.scaling ? h('span', { class: 'scaling num' }, `${d.scaling.label}: ${d.scaling.value(s, u)}`) : null;
      const kind = INTEL_TOGGLES[id];
      const toggle = app && kind ? h('label', { class: 'intel-toggle small' },
        h('input', { type: 'checkbox', id: `show-${id}`, checked: !prefs!.hidden[kind], onchange: () => app.actions.setPrefs((p) => { p.hidden[kind] = !p.hidden[kind]; }) }),
        kind === 'hunch' ? ' Show the Hunch on the table' : ' Show Cold Read on the table') : null;
      const open = !!prefs?.expanded.includes(id);
      const details = h('details', { open, ontoggle: app ? (e: Event) => {
        const isOpen = (e.target as HTMLDetailsElement).open;
        if (isOpen === prefs!.expanded.includes(id)) return;
        app.prefs.expanded = isOpen ? [...prefs!.expanded, id] : prefs!.expanded.filter((x) => x !== id);
        app.actions.setPrefs(() => undefined);
      } : undefined },
        h('summary', null,
          h('span', { class: 'build-name' }, d.name, d.maxStacks > 1 ? h('span', { class: 'stacks' }, ` (${u.stacks} of ${d.maxStacks})`) : null),
          h('span', { class: `pip-dot rarity-${d.rarity}`, 'aria-label': d.rarity }, '◆'.repeat(RARITY_PIPS[d.rarity]))),
        h('span', { class: 'build-desc small' }, d.describe(u.stacks)));
      const li = h('li', { class: `build-item tree-${d.tree}`, 'data-id': id, 'data-tree': t }, details, sc, toggle);
      return li;
    });
    const head = app
      ? h('button', { class: `tree-head eyebrow tree-text-${t}`, type: 'button', 'aria-expanded': String(!collapsed), id: `tree-toggle-${t}`,
        onclick: () => app.actions.setPrefs((p) => { p.treeCollapsed[t] = !p.treeCollapsed[t]; }) }, `${collapsed ? '▸' : '▾'} ${TREE_LABEL[t]} · ${ids.length}`)
      : h('div', { class: `eyebrow tree-text-${t}` }, `${TREE_LABEL[t]} · ${ids.length}`);
    return h('section', { class: 'tree-group' }, head, collapsed ? null : h('ul', null, items));
  });
  return h('div', { class: 'build' },
    h('p', { class: 'small muted' }, 'Click an upgrade for details.'),
    sections);
}

export function storeProgress(s: GameState): HTMLElement {
  const left = s.currentGap - s.roundsIntoStage;
  const frac = s.currentGap ? s.roundsIntoStage / s.currentGap : 0;
  return h('div', { class: 'progress', 'aria-label': `${left} rounds until the next store` },
    h('div', { class: 'progress-top' },
      h('span', { class: 'eyebrow' }, `Stage ${s.stage + 1} · this stretch is ${s.currentGap} round${s.currentGap === 1 ? '' : 's'}`),
      h('span', { class: 'num strong' }, left === 0 ? 'Store next!' : `${left} to store #${s.storesVisited + 1}`)),
    h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill', style: `width:${Math.round(frac * 100)}%` })));
}

export { pct };
