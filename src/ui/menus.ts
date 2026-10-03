import type { App } from './app';

declare const __DEBUG__: boolean;
import { h, fmt } from './dom';
import { asset } from './assets';
import { buildPanel, moveChip } from './components';
import { getOpponent } from '../core/opponentModel';
import { MOVE_NAME } from '../core/rps';
import { parseSeed } from './seed';
import { UPGRADES } from '../core/registry';
import { OPPONENTS } from '../content/opponents';
import { AWARDS, foeStatus, type Progress } from './awards';

function copyText(app: App, text: string, id: string): void {
  const done = () => app.actions.notify('Seed copied.');
  try {
    navigator.clipboard.writeText(text).then(done, () => selectEl(id));
  } catch { selectEl(id); }
}
function selectEl(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const r = document.createRange(); r.selectNodeContents(el);
  const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
}

export function titleScreen(app: App): HTMLElement {
  const startSeeded = () => {
    const v = (document.getElementById('seed-input') as HTMLInputElement | null)?.value ?? '';
    const seed = parseSeed(v);
    if (v.trim() && seed === undefined) { app.actions.notify('That seed could not be read.'); return; }
    app.actions.start(seed);
  };
  const hard = app.prefs.hardMode;
  const p = app.progress;
  const shelf = h('section', { class: 'shelf', 'aria-label': 'Awards' },
    h('div', { class: 'shelf-head' }, h('span', { class: 'eyebrow' }, 'Trophy shelf'),
      h('span', { class: 'small muted num' }, p.best ? `Best run: ${fmt(p.best)} round${p.best === 1 ? '' : 's'}${p.bestHard ? ` · Hard: ${fmt(p.bestHard)}` : ''} · ${fmt(p.runs)} run${p.runs === 1 ? '' : 's'}` : 'No runs yet. The shelf is judging you.')),
    h('ol', { class: 'medals' }, AWARDS.map((a, i) => {
      const u = p.unlocked[String(a.rounds)];
      return h('li', { class: `medal ${u ? 'won' : 'locked'} tier-${i + 1}`, title: u ? `${a.blurb}${u.at ? ` Earned ${u.at.slice(0, 10)}.` : ''}` : `Reach round ${a.rounds} in one run.` },
        h('span', { class: 'medal-art', 'aria-hidden': 'true' }, asset(`award.${a.rounds}`, 'medal-img')),
        h('span', { class: 'medal-name' }, u ? a.name : '???'),
        u?.hard ? h('span', { class: 'hard-tag small' }, 'HARD') : h('span', { class: 'small muted' }, u ? 'Unlocked' : `Round ${a.rounds}`));
    })));
  const collection = foesCollection(app, p);
  return h('div', { class: 'screen title' },
    h('div', { class: 'title-block' },
      h('div', { class: 'title-hands', 'aria-hidden': 'true' }, moveChip('R', 'huge'), moveChip('P', 'huge'), moveChip('S', 'huge')),
      h('h1', { class: 'logo' }, h('span', null, 'Rock'), h('span', null, 'Paper'), h('span', null, 'Scissors')),
      h('p', { class: 'logo-sub' }, 'The Roguelite'),
      h('p', { class: 'tagline' }, 'It’s just Rock, Paper, Scissors. With a build. And an economy. And store gaps that grow like Fibonacci because of course they do.')),
    h('div', { class: 'title-actions' },
      app.hasSave ? h('button', { class: 'btn primary big', id: 'resume', onclick: () => app.actions.resume() }, 'Resume run', h('kbd', null, 'C')) : null,
      h('button', { class: `btn ${app.hasSave ? '' : 'primary'} big`, id: 'start', onclick: () => app.actions.start() }, 'Start run', h('kbd', null, 'Enter')),
      h('button', { class: 'btn big', id: 'howto', onclick: () => app.actions.go('howto') }, 'How to play', h('kbd', null, 'H'))),
    h('label', { class: `mode-toggle ${hard ? 'on' : ''}`, for: 'hard-mode' },
      h('input', { type: 'checkbox', id: 'hard-mode', checked: hard, onchange: () => app.actions.setPrefs((q) => { q.hardMode = !q.hardMode; }) }),
      h('span', null, h('b', null, 'Hard Mode'), hard ? ': start with 0 Extra Lives. Good luck.' : ': start with 0 Extra Lives instead of 2.'), h('kbd', null, 'M')),
    h('form', { class: 'seed-form', onsubmit: (e: Event) => { e.preventDefault(); startSeeded(); } },
      h('label', { for: 'seed-input', class: 'small muted' }, 'Play a specific seed'),
      h('input', { id: 'seed-input', type: 'text', inputmode: 'text', autocomplete: 'off', placeholder: 'e.g. 12345 or “lizard spock”', maxlength: '40', class: 'seed-input' }),
      h('button', { class: 'btn', id: 'start-seed', type: 'submit' }, 'Start seeded run')),
    h('p', { class: 'small muted seed-help' }, 'Same seed + same choices = the same run, so you can share a run or replay one.'),
    shelf,
    collection,
    h('ul', { class: 'title-facts small' },
      h('li', null, `${UPGRADES.length} upgrades across three skill trees`),
      h('li', null, `${OPPONENTS.length} opponents with learnable habits`),
      h('li', null, '0 meta-progression. Trophies are just for bragging.')),
    __DEBUG__ && app.debugEnabled ? h('p', { class: 'small muted foot' }, 'Press ` for debug mode.') : null);
}

/** Title screen: "Opponents Defeated" collection. Unknown opponents are a mystery tile; met-but-unbeaten ones are
 *  shown and marked as still to beat; beaten ones are crossed off. Collapsed by default, remembered in prefs. */
function foesCollection(app: App, p: Progress): HTMLElement {
  const statuses = OPPONENTS.map((o) => ({ o, st: foeStatus(p, o.id) }));
  const beaten = statuses.filter((x) => x.st === 'defeated').length;
  const met = statuses.filter((x) => x.st !== 'unknown').length;
  const cards = statuses.map(({ o, st }) => h('li', { class: `foe foe-${st}`, 'data-foe': o.id,
    title: st === 'unknown' ? 'Not met yet.' : st === 'met' ? `${o.name}, ${o.title}. Survive a whole stretch against them to cross them off.` : `${o.name}, ${o.title}. Defeated ${p.foes[o.id].beaten}×.` },
    st === 'unknown'
      ? h('span', { class: 'foe-pic foe-mystery', 'aria-hidden': 'true' }, '?')
      : h('span', { class: 'foe-pic portrait' }, asset(o.portrait, 'portrait-glyph'), st === 'defeated' ? h('span', { class: 'foe-stamp', 'aria-hidden': 'true' }, 'Defeated') : null),
    h('span', { class: 'foe-name' }, st === 'unknown' ? '???' : o.name),
    h('span', { class: 'foe-state small' }, st === 'unknown' ? 'Not met yet' : st === 'met' ? 'Not yet defeated' : 'Defeated')));
  return h('details', { class: 'shelf foes', id: 'foes', open: app.prefs.collectionOpen,
    ontoggle: (e: Event) => { const open = (e.target as HTMLDetailsElement).open; if (open !== app.prefs.collectionOpen) app.actions.setPrefs((q) => { q.collectionOpen = open; }); } },
    h('summary', { class: 'shelf-head' }, h('span', { class: 'eyebrow' }, 'Opponents defeated'),
      h('span', { class: 'small muted num', id: 'foes-count' }, `${beaten} of ${OPPONENTS.length} defeated · ${met} met`)),
    h('p', { class: 'small muted foes-help' }, 'Beat an opponent by surviving a whole stretch against them and reaching the store.'),
    h('ol', { class: 'foe-grid' }, cards));
}

const STEPS: [string, string][] = [
  ['Throw', 'Pick Rock, Paper or Scissors (keys R, P, S). Rock beats Scissors, Scissors beats Paper, Paper beats Rock. The opponent locks in its throw before you choose.'],
  ['Win for coins', 'A win pays 12 coins. A tie pays 5 and the run continues. After each result the buttons light up again: keep throwing until the store.'],
  ['Losing ends the run', 'Unless you own an Extra Life, which is used up instead. You start with 2 (0 in Hard Mode).'],
  ['Shop at stores', 'Stores sell upgrades, Extra Lives, rerolls of the offers, and a swap of your next opponent. You always see who’s next before you leave.'],
  ['New opponent, fresh memory', 'Each store brings a new opponent who knows nothing about you. Tendencies are habits, not rules: every opponent can surprise you now and then. When a tendency mentions “your previous throw” or “two rounds ago”, it only counts rounds against that opponent, so their first throw after a store reacts to nothing. Your own streak upgrades (Muscle Memory, Momentum…) do carry over.'],
  ['Build something', 'Rock makes Rock safer and rewards stubbornness. Paper reads the opponent: tendencies, hunches, leaks. Scissors turns risk into money. Mix freely.'],
  ['The gaps grow', 'Stores come after 1, 2, 3, 5, 8, 13, 21, 34, 55, 89… rounds. There is no cap and no final boss. There is only the next gap.'],
  ['Nothing is rigged', 'Opponents never look at how long you’ve survived, how rich you are or how strong your build is. Their odds depend only on the history you can see. Everyone appears once before anyone repeats. Your build gets strong; the gaps get longer; eventually probability wins. One more run?'],
];

export function howtoScreen(app: App): HTMLElement {
  const i = app.howtoStep;
  const [title, body] = STEPS[i];
  return h('div', { class: 'screen howto' },
    h('div', { class: 'howto-card card' },
      h('div', { class: 'eyebrow' }, `How to play · ${i + 1} of ${STEPS.length}`),
      h('h2', null, title),
      h('p', { class: 'howto-body' }, body),
      h('ol', { class: 'howto-dots', 'aria-hidden': 'true' }, STEPS.map((_, k) => h('li', { class: k === i ? 'on' : k < i ? 'done' : '' }))),
      h('div', { class: 'howto-nav' },
        h('button', { class: 'btn', id: 'howto-back', onclick: () => (i === 0 ? app.actions.go('title') : app.actions.setHowto(i - 1)) }, i === 0 ? 'Back to title' : 'Previous', h('kbd', null, '←')),
        i < STEPS.length - 1
          ? h('button', { class: 'btn primary', id: 'howto-next', onclick: () => app.actions.setHowto(i + 1) }, 'Next', h('kbd', null, '→'))
          : h('button', { class: 'btn primary', id: 'howto-start', onclick: () => app.actions.start() }, 'Start a run', h('kbd', null, 'Enter')))));
}
export const HOWTO_STEPS = STEPS.length;

const VERDICTS = [
  [0, 6, 'Early game. Nobody saw anything.'],
  [6, 20, 'A respectable warm-up. The build was “in progress”.'],
  [20, 55, 'Okay, that build was actually working.'],
  [55, 150, 'That was a real run. The spreadsheet is proud.'],
  [150, 400, 'God run. Somewhere, a Rock is weeping with pride.'],
  [400, Infinity, 'You became incredibly strong. You were not invincible.'],
] as const;

export function gameOverScreen(app: App): HTMLElement {
  const s = app.state!;
  const st = s.stats;
  const verdict = VERDICTS.find(([lo, hi]) => s.round >= lo && s.round < hi)?.[2] ?? '';
  const left = s.currentGap - s.roundsIntoStage;
  const last = s.history[s.history.length - 1];
  const near = left > 0 && left <= Math.max(2, Math.ceil(s.currentGap * 0.15));
  const cell = (label: string, value: string | number) => h('div', { class: 'stat' }, h('span', { class: 'eyebrow' }, label), h('span', { class: 'stat-val num' }, typeof value === 'number' ? fmt(value) : value));
  const fav = (['R', 'P', 'S'] as const).reduce((a, b) => (st.moveCounts[b] > st.moveCounts[a] ? b : a));
  return h('div', { class: 'screen over' },
    h('header', { class: 'over-head' },
      h('h1', { class: 'over-title' }, near ? 'NOOOOO.' : 'RUN OVER'),
      h('p', { class: 'over-round num' }, `Round ${fmt(s.round)} · ${s.storesVisited} store${s.storesVisited === 1 ? '' : 's'}`, s.mode === 'hard' ? h('span', { class: 'hard-tag' }, 'HARD') : null),
      h('p', { class: 'over-verdict' }, verdict),
      last ? h('div', { class: 'final-clash' }, moveChip(last.player, 'big'), h('span', { class: 'vs' }, 'lost to'), moveChip(last.opponent, 'big')) : null,
      h('p', { class: 'cause' }, s.causeOfDeath ?? ''),
      near ? h('p', { class: 'near small' }, 'So close.') : null),
    h('section', { class: 'stats-grid' },
      cell('Longest gap survived', st.longestGapSurvived ? `${st.longestGapSurvived} rounds` : '—'),
      cell('Wins', st.wins), cell('Ties', st.ties), cell('Losses', st.losses), cell('Saves', st.saves),
      cell('Coins earned', st.currencyEarned), cell('Coins spent', st.currencySpent), cell('Upgrades bought', st.upgradesPurchased),
      cell('Lives bought', st.livesPurchased), cell('Lives used', st.livesConsumed), cell('Store rerolls', st.storeRerolls), cell('Opponent swaps', st.opponentRerolls),
      cell('Favourite throw', st.moveCounts[fav] ? MOVE_NAME[fav] : '—')),
    h('div', { class: 'over-cols' },
      h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, `Final build (${s.owned.length})`), buildPanel(s)),
      h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'Opponents encountered'),
        h('ul', { class: 'opp-list' }, st.opponentsEncountered.map((id) => {
          const o = getOpponent(id);
          const killer = id === s.opponentId;
          return h('li', null, h('span', { class: 'portrait tiny' }, asset(o.portrait, 'portrait-glyph')),
            h('span', { class: 'opp-li-text' }, h('span', null, h('b', null, o.name), ` · ${o.archetype}`, killer ? h('span', { class: 'killer small' }, ' · ended the run') : null),
              h('span', { class: 'small muted opp-li-tell' }, o.tell)));
        })))),
    h('div', { class: 'over-actions' },
      h('button', { class: 'btn primary big', id: 'restart', onclick: () => app.actions.start() }, 'One more run', h('kbd', null, 'Enter')),
      h('button', { class: 'btn big', id: 'replay-seed', onclick: () => app.actions.start(s.seed, s.mode) }, 'Replay this seed', h('kbd', null, 'Y')),
      h('button', { class: 'btn big', id: 'to-title', onclick: () => app.actions.go('title') }, 'Title screen', h('kbd', null, 'T'))),
    h('p', { class: 'small muted foot seed-line' }, 'Seed ', h('span', { id: 'seed-value', class: 'num' }, String(s.seed)), ' ',
      h('button', { class: 'btn small', id: 'copy-seed', onclick: () => copyText(app, String(s.seed), 'seed-value') }, 'Copy')));
}
