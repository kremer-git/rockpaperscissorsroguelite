import type { App, Screen } from './app';
import type { GameState, Move } from '../core/types';
import { buyLife, buyUpgrade, createRun, curveGap, leaveStore, playRound, rerollOpponent, rerollStore, validateState, RuleError } from '../core/engine';
import { allInAvailable, canThrow } from '../core/rules';
import { h } from './dom';
import { installPresentation, flushFx } from './presentation';
import { applyAudioSettings, audioDebug, cueFor, installAudio, playCue, playSynth, setMusic, sfxLog, throwSound, type MusicTrack } from './audio';
import { onEngineEvent } from '../core/engine';
import { getOpponent } from '../core/opponentModel';
import type { Screen as ScreenName } from './app';
import { runScreen } from './runScreen';
import { storeScreen } from './storeScreen';
import { titleScreen, howtoScreen, gameOverScreen, HOWTO_STEPS } from './menus';
import { debugPanel } from './debugPanel';
import { OPPONENTS } from '../content/opponents';

/** Set at build time: true only in the dev/test build (debug panel), false in the published game. */
declare const __DEBUG__: boolean;
import { soundDock } from './soundDock';
import * as director from './director';
import { motionOK, setEffectsReduced } from './juice';
import { loadPrefs, savePrefs } from './prefs';
import { connectRemote, loadLocal, noteBeaten, noteMet, recordRounds, saveProgress } from './awards';

const SAVE_KEY = 'rps-roguelite.run.v1';

function save(s: GameState | null): void {
  try {
    if (!s || s.status === 'dead') localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch { /* storage unavailable: play on without resume */ }
}
function load(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    // Retired upgrades in an older save become their replacement (Notes App → Show Your Work).
    const RETIRED: Record<string, string> = { 'notes-app': 'show-your-work' };
    for (const u of s.owned ?? []) if (RETIRED[u.id]) { u.id = RETIRED[u.id]; u.data = {}; }
    for (const o of s.store?.offers ?? []) if (RETIRED[o.upgradeId]) o.upgradeId = RETIRED[o.upgradeId];
    return validateState(s).length ? null : s; // corrupted or outdated saves are ignored
  } catch { return null; }
}

declare global {
  interface Window { claude?: { use?: (name: string) => Promise<unknown>; hot?: { snapshot?(fn: () => unknown): void; ready?(fn: (d: unknown) => void): void; data?: unknown } } }
}

const root = document.getElementById('app')!;
const saved = load();

const app: App = {
  screen: 'title', state: null, last: null, allIn: false, debugOpen: false, debugEnabled: __DEBUG__,
  toast: null, howtoStep: 0, hasSave: !!saved, soundOpen: false, prefs: loadPrefs(), progress: loadLocal(), busy: false,
  actions: {
    start(seed?: number, mode?: 'normal' | 'hard') {
      const m = mode ?? (app.prefs.hardMode ? 'hard' : 'normal');
      app.state = createRun(seed !== undefined ? { seed, mode: m } : { mode: m });
      director.newRun();
      app.progress.runs++; saveProgress(app.progress);
      app.last = null; app.allIn = false; app.screen = 'run'; app.hasSave = false;
      save(app.state); render();
    },
    resume() {
      const s = load();
      if (!s) { app.hasSave = false; app.actions.notify('That saved run could not be loaded. Starting fresh is the roguelite way.'); render(); return; }
      app.state = s; app.last = null; app.screen = s.status === 'store' ? 'store' : 'run'; render();
    },
    throwMove(m: Move) {
      const s = app.state;
      if (!s || s.status !== 'playing' || app.screen !== 'run' || app.busy) return;
      if (!canThrow(s, m)) { app.actions.notify('Absolute Unit says: that throw costs coins you don’t have. Rock is free.'); return; }
      const allInAtPress = app.allIn && allInAvailable(s); // decided when the key was pressed, not after the pump
      const commit = () => {
        if (app.state !== s || s.status !== 'playing' || app.screen !== 'run') return;
        const before = director.snapshot(s);
        try {
          throwSound(m);
          app.last = playRound(s, m, { allIn: allInAtPress });
          app.allIn = false;
          checkAwards(s);
        } catch (e) { if (e instanceof RuleError) app.actions.notify(e.message); else throw e; }
        save(s); render();
        director.afterRound(app, before);
        if ((s.status as string) === 'dead') director.death(app, () => app.actions.goOver());
      };
      // The pump ("rock, paper, scissors, SHOOT") is ~200 ms and only with effects on. The throw is already
      // locked in by the opponent; this is presentation only.
      if (!motionOK()) { commit(); return; }
      app.busy = true;
      void director.pump(m).then(() => { app.busy = false; commit(); });
    },
    toggleAllIn() { if (app.busy) return; if (app.state && app.state.status === 'playing' && app.screen === 'run' && allInAvailable(app.state)) { app.allIn = !app.allIn; render(); } },
    buy(slot) {
      const wasSold = !!app.state?.store?.offers.find((o) => o.slot === slot)?.sold;
      tryStore(() => buyUpgrade(app.state!, slot));
      const nowSold = !!app.state?.store?.offers.find((o) => o.slot === slot)?.sold;
      if (!wasSold && nowSold) director.bought(slot); // only a real purchase gets the stamp
    },
    buyLife() { tryStore(() => buyLife(app.state!)); },
    rerollStore() { tryStore(() => rerollStore(app.state!)); },
    rerollOpponent() { tryStore(() => rerollOpponent(app.state!)); },
    leaveStore() {
      const s = app.state; if (!s || s.status !== 'store' || app.busy) return;
      const go = () => { if (app.state !== s || s.status !== 'store') return; leaveStore(s); app.last = null; app.allIn = false; app.screen = 'run'; save(s); render(); focusFirst('#throw-R'); };
      if (!motionOK()) { go(); return; }
      // The next stretch's length is only revealed now, with a short drum-roll, before the rounds start.
      app.busy = true;
      void director.gapReveal(curveGap(s, s.stage + 1), getOpponent(s.nextOpponentId).name).then(() => { app.busy = false; go(); });
    },
    goStore() { if (app.state?.status === 'store') { app.screen = 'store'; render(); focusFirst('#leave-store'); } },
    goOver() { if (app.state?.status === 'dead' && app.screen !== 'over') { app.screen = 'over'; save(null); render(); director.overIntro(); focusFirst('#restart'); } },
    go(screen: Screen) { app.screen = screen; if (screen === 'howto') app.howtoStep = 0; if (screen === 'title') app.hasSave = !!load(); render(); },
    setHowto(i) { app.howtoStep = i; render(); },
    toggleDebug() { if (!__DEBUG__) return; app.debugOpen = !app.debugOpen; render(); },
    render: () => render(),
    setPrefs(fn) { fn(app.prefs); savePrefs(app.prefs); setEffectsReduced(app.prefs.effects === 'reduced'); render(); },
    setPrefsSilently() { savePrefs(app.prefs); },
    notify(msg) { app.toast = msg; render(); window.setTimeout(() => { if (app.toast === msg) { app.toast = null; render(); } }, 3200); },
  },
};

/** Unlock lifetime awards as soon as a run crosses a threshold, and keep the best-run record. */
function checkAwards(s: GameState): void {
  const before = app.progress.best;
  const fresh = recordRounds(app.progress, s.round, s.mode === 'hard', s.seed);
  if (fresh.length) {
    saveProgress(app.progress);
    const a = fresh[fresh.length - 1];
    app.toast = `Award unlocked: “${a.name}”`;
    playSynth('award');
    window.setTimeout(() => { if (app.toast?.startsWith('Award unlocked')) { app.toast = null; render(); } }, 4500);
  } else if (s.status === 'dead' && app.progress.best !== before) saveProgress(app.progress);
}

function tryStore(fn: () => void): void {
  if (!app.state || app.state.status !== 'store') return;
  try { fn(); } catch (e) { if (e instanceof RuleError) { playSynth('deny'); app.actions.notify(e.message); } else throw e; }
  save(app.state); render();
}

function focusFirst(sel: string): void {
  requestAnimationFrame(() => (document.querySelector(sel) as HTMLElement | null)?.focus({ preventScroll: true }));
}

// ---------------- fit to screen ----------------
// The layout is designed for about 1360×820 CSS pixels. On larger windows we scale up,
// on smaller desktop windows we scale down a little, so the whole table fits without scrolling.
// Phones (narrow widths) use the stacked responsive layout instead.
const DESIGN_W = 1360, DESIGN_H = 820;
function fitToScreen(): void {
  const w = window.innerWidth, hgt = window.innerHeight;
  const z = w < 900 ? 1 : Math.max(0.72, Math.min(2.2, Math.min(w / DESIGN_W, hgt / DESIGN_H)));
  document.documentElement.style.setProperty('--zoom', String(z));
  document.documentElement.style.setProperty('--app-h', `${Math.floor(hgt / z)}px`);
  (document.documentElement.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(z);
  document.documentElement.classList.toggle('fit', w >= 900);
}
window.addEventListener('resize', fitToScreen);
fitToScreen();

const MUSIC_FOR: Record<ScreenName, MusicTrack> = { title: 'theme', howto: 'theme', run: 'theme', store: 'theme', over: 'theme' };

let lastScreen = '';
function render(): void {
  if (!director.isDying()) setMusic(MUSIC_FOR[app.screen]);
  // Persist the run on every render so debug edits and preference-driven changes survive a reload too.
  if (app.state && (app.screen === 'run' || app.screen === 'store')) save(app.state);
  const focusedId = (document.activeElement as HTMLElement | null)?.id;
  let view: HTMLElement;
  switch (app.screen) {
    case 'run': view = runScreen(app); break;
    case 'store': view = storeScreen(app); break;
    case 'over': view = gameOverScreen(app); break;
    case 'howto': view = howtoScreen(app); break;
    default: view = titleScreen(app);
  }
  root.replaceChildren(view,
    app.toast ? h('div', { class: 'toast', role: 'status' }, app.toast) : '',
    soundDock(app),
    __DEBUG__ && app.debugOpen ? debugPanel(app) : '');
  // A new screen starts at the top (on phones the page scrolls, and the old position would otherwise carry over).
  if (app.screen !== lastScreen) {
    lastScreen = app.screen; window.scrollTo(0, 0);
    // anything still flying (coins, tokens, sparks) belongs to the old screen
    if (!director.isDying()) document.querySelectorAll('#fx-layer > *').forEach((e) => e.remove());
  }
  if (focusedId) (document.getElementById(focusedId) as HTMLElement | null)?.focus({ preventScroll: true });
  flushFx(root);
  // 6: danger tint at 0 Extra Lives (not at the start of a Hard Mode run, only once a bought life is gone)
  const s = app.state;
  document.documentElement.classList.toggle('danger', !!s && app.screen === 'run' && s.status === 'playing' && s.lives === 0 && (s.mode !== 'hard' || s.stats.livesPurchased > 0));
  if (app.screen === 'store') director.store(app);
  if (app.screen === 'title') director.title(app);
}

// ---------------- keyboard ----------------
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const k = e.key.toLowerCase();
  if (__DEBUG__ && k === '`') { app.actions.toggleDebug(); e.preventDefault(); return; }
  if (k === 'v') { app.actions.setPrefs((p) => { p.audio.muted = !p.audio.muted; applyAudioSettings(p.audio); }); return; }
  if (k === 'escape' && app.soundOpen) { app.soundOpen = false; render(); return; }
  const s = app.state;
  const onButton = tag === 'BUTTON' && (k === 'enter' || k === ' ');
  switch (app.screen) {
    case 'title':
      if (k === 'enter' && !onButton) app.actions.start();
      else if (k === 'h') app.actions.go('howto');
      else if (k === 'c' && app.hasSave) app.actions.resume();
      else if (k === 'm') app.actions.setPrefs((p) => { p.hardMode = !p.hardMode; });
      break;
    case 'howto':
      if (k === 'arrowright') app.actions.setHowto(Math.min(HOWTO_STEPS - 1, app.howtoStep + 1));
      else if (k === 'arrowleft') app.howtoStep === 0 ? app.actions.go('title') : app.actions.setHowto(app.howtoStep - 1);
      else if (k === 'escape') app.actions.go('title');
      else if (k === 'enter' && !onButton && app.howtoStep === HOWTO_STEPS - 1) app.actions.start();
      break;
    case 'run':
      if (!s) break;
      if (s.status === 'playing' && (k === 'r' || k === 'p' || k === 's')) { app.actions.throwMove(k.toUpperCase() as Move); e.preventDefault(); }
      else if (k === 'a') app.actions.toggleAllIn();
      else if (k === 'b') app.actions.setPrefs((p) => { p.buildCollapsed = !p.buildCollapsed; });
      else if (k === 'enter' && !onButton) { if (s.status === 'store') app.actions.goStore(); else if (s.status === 'dead') app.actions.goOver(); }
      break;
    case 'store':
      if (/^[1-9]$/.test(k)) { const slot = s?.store?.offers[Number(k) - 1]?.slot; if (slot !== undefined) app.actions.buy(slot); }
      else if (k === 'l') app.actions.buyLife();
      else if (k === 'x') app.actions.rerollStore();
      else if (k === 'o') app.actions.rerollOpponent();
      else if (k === 'enter' && !onButton) app.actions.leaveStore();
      break;
    case 'over':
      if (k === 'enter' && !onButton) app.actions.start();
      else if (k === 't') app.actions.go('title');
      else if (k === 'y' && s) app.actions.start(s.seed, s.mode);
      break;
  }
});

installPresentation();
installAudio();
if (__DEBUG__) (window as unknown as { __fx: unknown }).__fx = { sfx: sfxLog, audio: audioDebug };
setEffectsReduced(app.prefs.effects === 'reduced');
// Warm the image cache so pictures never blink in when a screen re-renders.
window.setTimeout(() => {
  const srcs = ['art/fist-you.svg', 'art/fist-them.svg', 'art/move-R.webp', 'art/move-P.webp', 'art/move-S.webp', ...[100, 200, 300, 400, 500].map((n) => `art/award-${n}.webp`), ...OPPONENTS.map((o) => `portraits/${o.id}.jpg`)];
  for (const src of srcs) { const im = new Image(); im.src = src; void im.decode?.().catch(() => undefined); }
}, 300);
applyAudioSettings(app.prefs.audio);
onEngineEvent((e) => playCue(cueFor(e)));
// Opponents Defeated collection: a stretch counts as "met" once you've thrown against them, and as a defeat
// when you survive the whole stretch and reach the store.
onEngineEvent((e) => {
  const s = app.state;
  if (!s) return;
  if (e.type === 'result' && s.stageHistory.length === 1) { noteMet(app.progress, s.opponentId); saveProgress(app.progress); }
  if (e.type === 'storeEnter') {
    const first = noteBeaten(app.progress, s.opponentId);
    saveProgress(app.progress);
    // Deferred: never re-render in the middle of the engine's round.
    if (first) { const name = getOpponent(s.opponentId).name; window.setTimeout(() => app.actions.notify(`New in your collection: ${name} defeated.`), 0); }
  }
});

// Keep an in-progress run across live page updates.
window.claude?.hot?.snapshot?.(() => ({ state: app.state, screen: app.screen }));
const boot = (d: unknown) => {
  const data = d as { state?: GameState; screen?: Screen } | undefined;
  if (data?.state && !validateState(data.state).length) { app.state = data.state; app.screen = data.screen ?? 'run'; }
  render();
};
if (window.claude?.hot?.ready) window.claude.hot.ready(boot); else boot(window.claude?.hot?.data ?? {});

// Awards follow a signed-in viewer across devices when the page runs on claude.ai.
void connectRemote(() => app.progress, (merged) => { app.progress = merged; render(); });
