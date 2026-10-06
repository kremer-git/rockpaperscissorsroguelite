// Choreography: when each effect plays, around the game's own flow. main.ts calls these after rendering.
// Nothing here changes game state; every function is a no-op (or an instant version) when motion is off.
import type { App } from './app';
import type { GameState, Move } from '../core/types';
import { h } from './dom';
import { treeOf } from './components';
import { asset } from './assets';
import { playSynth, setMusic } from './audio';
import { burst, coinsToHud, countUp, flashScreen, layer, motionOK, replay, shieldAround, sleep, sparkle } from './juice';
import { foeStatus } from './awards';
import { OPPONENTS } from '../content/opponents';

const TREE_COLOR: Record<string, string> = { rock: '#a9b6c3', paper: '#86b9ef', scissors: '#f2825a' };

export interface Before { currency: number; frac: number; left: number; lives: number }
export function snapshot(s: GameState): Before {
  return { currency: s.currency, frac: s.currentGap ? s.roundsIntoStage / s.currentGap : 0, left: s.currentGap - s.roundsIntoStage, lives: s.lives };
}

// ---------------- 3. the pump: "rock, paper, scissors, SHOOT" in ~200 ms ----------------
export const PUMP_MS = 200;
export function pump(m: Move): Promise<void> {
  const res = document.querySelector('.arena .result');
  document.getElementById(`throw-${m}`)?.classList.add('pressed');
  if (!res) return sleep(PUMP_MS);
  res.classList.add('pumping');
  res.replaceChildren(h('div', { class: 'pump-row' },
    h('span', { class: 'pump-fist you' }, asset('ui.fist.you', 'fist')),
    h('span', { class: 'vs' }, 'vs'),
    h('span', { class: 'pump-fist them' }, asset('ui.fist.them', 'fist'))));
  return sleep(PUMP_MS);
}

// ---------------- after a round: impact, coins, progress, arrival ----------------
export function afterRound(app: App, b: Before): void {
  const s = app.state, last = app.last;
  if (!s || !last) return;
  const r = last.record;
  const motion = motionOK();

  // 8 + 9: progress bar slides forward and ticks; store arrival rings a bell with a gold sweep
  const fill = document.querySelector<HTMLElement>('.hud .progress-fill');
  if (fill) {
    const target = s.status === 'store' ? 1 : s.currentGap ? s.roundsIntoStage / s.currentGap : 0;
    if (motion) {
      fill.style.transition = 'none';
      fill.style.width = `${Math.round(b.frac * 100)}%`;
      void fill.offsetWidth;
      fill.style.transition = '';
      fill.style.width = `${Math.round(target * 100)}%`;
    }
    if (s.status === 'playing' || s.status === 'store') {
      const left = s.status === 'store' ? 0 : s.currentGap - s.roundsIntoStage;
      if (s.status === 'store') {
        if (motion) window.setTimeout(() => replay(document.querySelector('.hud .progress-track'), 'arrive'), 180);
      } else {
        playSynth('tick', left <= 3 ? 1 + (3 - left) * 0.22 : 1); // rises over the last three rounds
        if (left <= 3) replay(document.querySelector('.hud .progress-track'), 'near');
      }
    }
  }

  // 7: coins fly to the counter (a small trickle for ties)
  if (r.reward > 0) {
    const from = (document.querySelector('.result .trig.coin') ?? document.querySelector('.result .banner'))?.getBoundingClientRect() ?? null;
    coinsToHud(from, r.reward, b.currency, s.currency, r.outcome !== 'WIN');
  }

  if (!motion) return;
  // 4: result impact
  const oppChip = document.querySelector('.clash .clash-side:last-child .move-chip');
  const youChip = document.querySelector('.clash .clash-side:first-child .move-chip');
  const portrait = document.querySelector('.opp-head .portrait');
  if (r.saved) {
    shieldAround(youChip);
  } else if (r.outcome === 'WIN') {
    replay(oppChip, 'fx-hit');
    replay(portrait, 'fx-hit');
    playSynth('hit');
    if (oppChip) burst(oppChip.getBoundingClientRect(), TREE_COLOR[treeOf(r.player)], 12);
    if (portrait) burst(portrait.getBoundingClientRect(), TREE_COLOR[treeOf(r.player)], 8, 38);
  } else if (r.outcome === 'TIE') {
    replay(oppChip, 'fx-bonk'); replay(youChip, 'fx-bonk');
    playSynth('bonk');
  } else if (r.rawOutcome === 'LOSS' && s.status !== 'dead') {
    flashScreen('loss-edges');
    replay(document.querySelector('.clash'), 'fx-shake');
    replay(portrait, 'fx-smug');
  }
}

// ---------------- 16: death transition (~2.5 s, any click/key skips) ----------------
let dying = false;
export function isDying(): boolean { return dying; }
export function death(app: App, done: () => void): void {
  if (dying) return;
  dying = true;
  const root = document.documentElement;
  const L = layer();
  const timers: number[] = [];
  const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener('pointerdown', skip, true);
    window.removeEventListener('keydown', skip, true);
    // drop the zoom/grey instantly (no ease-back onto the game-over screen)
    const app_ = document.getElementById('app');
    if (app_) app_.style.transition = 'none';
    root.classList.remove('dying', 'dying-grey');
    L.querySelectorAll('.death-veil, .death-title').forEach((e) => e.remove());
    if (app_) { void app_.offsetWidth; app_.style.transition = ''; }
    dying = false;
    done();
  };
  const skip = (e: Event) => {
    if (e instanceof KeyboardEvent && (e.metaKey || e.ctrlKey || e.altKey || ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key))) return; // browser shortcuts / alt-tab
    e.preventDefault(); e.stopPropagation(); finish();
  };
  window.addEventListener('pointerdown', skip, true);
  window.addEventListener('keydown', skip, true);

  const r = app.last?.record;
  const quip = r ? deathQuip(r.player, r.round) : 'Statistically inevitable.';
  if (!motionOK()) {
    // Reduced motion: no shake, zoom or veil: the losing throw stays visible for a moment, then the death screen.
    at(900, finish);
    return;
  }
  // 0–0.4 s: impact
  setMusic(null);
  playSynth('impact'); playSynth('scratch');
  flashScreen('death-flash', 600);
  const clash = document.querySelector('.clash');
  if (clash) {
    const c = clash.getBoundingClientRect();
    root.style.setProperty('--death-ox', `${c.left + c.width / 2}px`);
    root.style.setProperty('--death-oy', `${c.top + c.height / 2 + scrollY}px`);
  }
  root.classList.add('dying');
  // 0.4–1.2 s: colour drains, slow push-in on the clash; the opponent gets one smug bounce
  at(400, () => { root.classList.add('dying-grey'); replay(document.querySelector('.opp-head .portrait'), 'fx-smug'); });
  // 1.2–2.0 s: verdict slams down
  at(1200, () => {
    L.append(h('div', { class: 'death-title' }, h('span', { class: 'death-word' }, 'Run over'), h('span', { class: 'death-quip' }, quip)));
    playSynth('drumBig');
  });
  // 2.0–2.5 s: fade, then the death screen
  at(2000, () => L.append(h('div', { class: 'death-veil' })));
  at(2450, finish);
}

function deathQuip(m: Move, round: number): string {
  const by: Record<Move, string[]> = {
    R: ['Rock. Again. Bold.', 'Rock was a choice.', 'The rock has failed you.'],
    P: ['Paper. Crumpled.', 'Filed under: losses.', 'Paper beats nothing today.'],
    S: ['Scissors, snipped.', 'Ran with scissors. Fell.', 'Dull ending.'],
  };
  return by[m][round % 3];
}

/** Game-over stats count up from zero with soft ticks. */
export function overIntro(): void {
  if (!motionOK()) return;
  const vals = [...document.querySelectorAll<HTMLElement>('.stats-grid .stat-val')];
  vals.forEach((el, i) => {
    const target = Number((el.textContent ?? '').replace(/[^\d]/g, ''));
    if (!Number.isFinite(target) || !/^\s*[\d,]+\s*$/.test(el.textContent ?? '')) return;
    window.setTimeout(() => void countUp(el, 0, target, 520, () => playSynth('tick', 0.8 + i * 0.04)), i * 70);
  });
}

// ---------------- store: deal, gap count-up, legendary shimmer, bought stamp ----------------
let dealtKey = '';
let dealStart = 0;
let dealSlots: string[] = [];
/** A new run starts: store effects (deal, gap count-up) are keyed per run, so forget the last run's keys. */
export function newRun(): void { dealtKey = ''; }
export function store(app: App): void {
  const s = app.state;
  if (!s?.store) return;
  const key = `${s.storesVisited}:${s.store.rerollsThisVisit}`;
  const motion = motionOK();
  if (key !== dealtKey) {
    dealtKey = key;
    dealStart = performance.now();
    const cards = [...document.querySelectorAll<HTMLElement>('.offers .up-card:not(.sold-card)')];
    dealSlots = cards.map((c) => c.dataset.slot ?? '');
    if (motion) {
      cards.forEach((c, i) => window.setTimeout(() => playSynth('deal', 1 + i * 0.06), 70 * i));
      const legend = cards.find((c) => c.classList.contains('rarity-card-legendary'));
      if (legend) window.setTimeout(() => { playSynth('shimmer'); replay(document.querySelector(`.offers .up-card[data-slot="${legend.dataset.slot}"]`), 'reveal'); }, 70 * cards.indexOf(legend) + 380);
    }
  }
  // Deal-in: (re)applied on every render inside the deal window, picking up where it was, so a re-render mid-deal
  // (a toast clearing, a purchase) doesn't make the remaining cards pop in. Only cards that are new get dealt:
  // on a reroll, bought cards stay put (and greyed out).
  if (motion) {
    const elapsed = performance.now() - dealStart;
    dealSlots.forEach((slot, i) => {
      if (elapsed > 70 * i + 420) return;
      const c = document.querySelector<HTMLElement>(`.offers .up-card[data-slot="${slot}"]:not(.sold-card)`);
      if (!c || c.classList.contains('deal')) return;
      c.style.setProperty('--i', String(i));
      c.style.animationDelay = `${70 * i - elapsed}ms`;
      c.classList.add('deal');
      if (elapsed < 70 * i + 300) {
        c.classList.add('dealing');
        window.setTimeout(() => document.querySelector(`.offers .up-card[data-slot="${slot}"]`)?.classList.remove('dealing'), 70 * i + 300 - elapsed);
      }
    });
  }
}

function observeOnce(el: Element, run: () => void): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') { run(); return null; }
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.6)) return;
    io.disconnect(); run();
  }, { threshold: [0, 0.6, 1] });
  io.observe(el);
  return io;
}

/**
 * 10: the dreaded gap. The store doesn't say how long the next stretch is; pressing Continue reveals it
 * with a Fibonacci count-up (drums, shake, the number swelling), then the rounds start. Tap to skip.
 */
let revealing = false;
export function isRevealing(): boolean { return revealing; }
export function gapReveal(gap: number, vs: string): Promise<void> {
  if (!motionOK()) return Promise.resolve();
  revealing = true;
  const num = h('div', { class: 'gr-num num' }, '1');
  const sub = h('div', { class: 'gr-sub' }, `round${gap === 1 ? '' : 's'} vs ${vs}`);
  const box = h('div', { class: `gap-reveal ${gap >= 34 ? 'scary' : ''}`, id: 'gap-reveal', role: 'status', 'aria-label': `Next stretch: ${gap} rounds` },
    h('div', { class: 'gr-card' }, h('div', { class: 'eyebrow gr-eye' }, 'Next stretch'), num, sub));
  document.body.append(box);
  const fib = [1, 2];
  while (fib[fib.length - 1] < gap) fib.push(fib[fib.length - 1] + fib[fib.length - 2]);
  const steps = fib.filter((n) => n < gap).concat(gap);
  let skipped = false;
  return new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      document.removeEventListener('pointerdown', skip, true); document.removeEventListener('keydown', skip, true);
      revealing = false;
      resolve();
      // fade out over the freshly drawn rounds screen
      box.classList.add('out');
      window.setTimeout(() => box.remove(), 260);
    };
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (skipped) return; skipped = true;
      num.textContent = String(gap); num.style.setProperty('--dread', '1.6');
      window.setTimeout(finish, 120);
    };
    document.addEventListener('pointerdown', skip, true); document.addEventListener('keydown', skip, true);
    void (async () => {
      await sleep(140);
      for (let i = 0; i < steps.length && !skipped; i++) {
        const last = i === steps.length - 1;
        num.textContent = String(steps[i]);
        const k = steps.length === 1 ? 1 : (i + 1) / steps.length;
        num.style.setProperty('--dread', String(1 + k * 0.6));
        replay(num, last ? 'dread-slam' : 'dread-step');
        playSynth(last ? 'drumBig' : 'drum', last ? 1 : 0.85 + k * 0.4);
        if (last) {
          sub.classList.add('in');
          if (gap >= 34) replay(box, 'fx-shake');
          await sleep(gap >= 21 ? 900 : 650);
        } else await sleep(Math.max(80, 140 - i * 6));
      }
      if (!skipped) finish();
    })();
  });
}

/** 12: the bought card gets a stamp (no flying token: it pulled the eye away from the store). */
export function bought(slot: number): void {
  const card = document.querySelector<HTMLElement>(`.offers .up-card[data-slot="${slot}"]`);
  playSynth('stamp');
  if (!motionOK() || !card) return;
  replay(card.querySelector('.sold'), 'stamp-in');
  replay(card, 'just-bought');
}

// ---------------- title: defeated stamps and trophy unlocks play once ----------------
export function title(app: App): void {
  const p = app.progress, prefs = app.prefs;
  const defeated = OPPONENTS.filter((o) => foeStatus(p, o.id) === 'defeated').map((o) => o.id);
  const won = Object.keys(p.unlocked).map(Number);
  // First time tracking in this browser: don't replay old history, just remember it.
  if (prefs.seenDefeats === null || prefs.seenTrophies === null) {
    if (prefs.seenDefeats === null) prefs.seenDefeats = defeated;
    if (prefs.seenTrophies === null) prefs.seenTrophies = won;
    app.actions.setPrefsSilently();
    return;
  }
  const newFoes = defeated.filter((id) => !prefs.seenDefeats!.includes(id));
  const newCups = won.filter((n) => !prefs.seenTrophies!.includes(n));
  if (!newFoes.length && !newCups.length) return;
  prefs.seenDefeats = [...prefs.seenDefeats, ...newFoes];
  prefs.seenTrophies = [...prefs.seenTrophies, ...newCups];
  app.actions.setPrefsSilently();
  if (!motionOK()) return;
  // 15: trophy spin + sparkle, 14: defeated stamp slam. Each waits until it is on screen (phones: the shelf
  // and the collection are below the fold), and same-screen reveals are staggered.
  let queueAt = 0;
  const reveal = (el: Element | null, play: () => void) => {
    if (!el) return;
    el.classList.add('reveal-wait');
    observeOnce(el, () => {
      const wait = Math.max(0, queueAt - performance.now());
      queueAt = performance.now() + wait + 420;
      window.setTimeout(() => { el.classList.remove('reveal-wait'); play(); }, wait + 150);
    });
  };
  newCups.sort((a, b) => a - b).forEach((n) => {
    const art = document.querySelector(`.medal[data-award="${n}"] .medal-art`);
    reveal(art, () => {
      replay(art, 'trophy-spin');
      playSynth('whoosh');
      window.setTimeout(() => { if (art) { sparkle(art.getBoundingClientRect()); playSynth('sparkle'); } }, 650);
    });
  });
  newFoes.slice(0, 6).forEach((id) => {
    const card = document.querySelector<HTMLElement>(`.foe[data-foe="${id}"]`);
    const stamp = card?.querySelector('.foe-stamp') ?? null;
    if (!card || !stamp || !(card.closest('details') as HTMLDetailsElement | null)?.open) return;
    reveal(stamp, () => {
      replay(stamp, 'stamp-slam'); replay(card, 'foe-thud');
      playSynth('stamp');
      burst(stamp.getBoundingClientRect(), '#ff7b72', 8, 30);
    });
  });
}
