// Sound for the game: recorded files for throws, purchases and life loss, one
// optional music loop (off until the player turns it on), and small synthesized
// sounds (Web Audio) for UI feedback.
//
// Music volume goes through a Web Audio gain node where possible: iPhone/iPad
// browsers ignore an audio element's .volume (only the hardware buttons change it),
// which is why the music slider used to do nothing on phones.
//
// Everything is driven by engine events and screen changes, never the other
// way round: the engine never waits on audio. Browsers only allow sound after
// the player interacts, so nothing plays until the first click or key press.

import type { EngineEvent, Move } from '../core/types';

export type MusicTrack = 'theme';
export type FileSfx = 'rock' | 'paper' | 'scissors' | 'purchase' | 'lifeLost';
export type SynthSfx = 'hover' | 'click' | 'toggle' | 'deny' | 'win' | 'tie' | 'save' | 'phew' | 'death' | 'storeIn' | 'storeOut' | 'award'
  | 'coin' | 'coinSmall' | 'tick' | 'drum' | 'drumBig' | 'stamp' | 'deal' | 'impact' | 'scratch' | 'sparkle' | 'shimmer' | 'whoosh' | 'bonk' | 'hit';

export interface AudioSettings {
  music: number; // 0..1, applied on top of MUSIC_CEILING
  sfx: number; // 0..1
  muted: boolean;
  /** Music is opt-in ("Turn on epic music?"); nothing is downloaded until it is on. */
  musicOn: boolean;
}

export const DEFAULT_AUDIO: AudioSettings = { music: 0.5, sfx: 0.8, muted: false, musicOn: false };

/** Music never plays louder than this, even at 100%: it sits under the effects. */
const MUSIC_CEILING = 0.55;

const FILES: Record<FileSfx | `music-${MusicTrack}`, string> = {
  rock: 'audio/rock-select.mp3',
  paper: 'audio/paper-select.mp3',
  scissors: 'audio/scissors-select.mp3',
  purchase: 'audio/purchase.mp3',
  lifeLost: 'audio/life-lost.mp3',
  'music-theme': 'audio/music-title.mp3',
};

let settings: AudioSettings = { ...DEFAULT_AUDIO };
let unlocked = false;
let wanted: MusicTrack | null = null;
let current: MusicTrack | null = null;
let duck = 1; // temporary music dip (life lost)
const music: Partial<Record<MusicTrack, HTMLAudioElement>> = {};
const gains = new WeakMap<HTMLAudioElement, GainNode>();
const pools: Partial<Record<FileSfx, HTMLAudioElement[]>> = {};
let ctx: AudioContext | null = null;
let lastHover = 0;

const canAudio = () => typeof window !== 'undefined' && typeof Audio !== 'undefined';
const musicLevel = () => (settings.muted || !settings.musicOn ? 0 : settings.music * MUSIC_CEILING * duck);
const sfxLevel = () => (settings.muted ? 0 : settings.sfx);

// ---------------- settings ----------------

export function applyAudioSettings(next: AudioSettings): void {
  const wasOn = settings.musicOn;
  settings = { music: clamp01(next.music), sfx: clamp01(next.sfx), muted: !!next.muted, musicOn: !!next.musicOn };
  if (settings.musicOn !== wasOn) { const w = wanted; wanted = null; if (current) stopCurrent(); setMusic(w); return; }
  if (current && music[current]) setVol(music[current]!, musicLevel());
}
export const getAudioSettings = (): AudioSettings => ({ ...settings });
const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

// ---------------- music ----------------

function audioCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = AC ? new AC() : null;
  } catch { ctx = null; }
  return ctx;
}

/**
 * Pages opened straight from disk (file://) can't route an audio file through Web Audio
 * (the browser treats it as another site and plays silence), so those keep using .volume.
 */
const canRoute = () => typeof location !== 'undefined' && /^https?:$/.test(location.protocol);

function track(t: MusicTrack): HTMLAudioElement {
  let el = music[t];
  if (!el) {
    el = new Audio();
    el.src = FILES[`music-${t}`];
    el.loop = true;
    el.preload = 'auto';
    el.dataset.track = t;
    music[t] = el;
    const ac = canRoute() ? audioCtx() : null;
    if (ac) {
      try {
        const g = ac.createGain();
        g.gain.value = 0;
        ac.createMediaElementSource(el).connect(g).connect(ac.destination);
        gains.set(el, g);
      } catch { /* fall back to .volume */ }
    }
    if (!gains.has(el)) el.volume = 0;
  }
  return el;
}

function getVol(el: HTMLAudioElement): number {
  const g = gains.get(el);
  return g ? g.gain.value : el.volume;
}
function setVol(el: HTMLAudioElement, v: number): void {
  const g = gains.get(el);
  if (g) g.gain.value = v; else el.volume = Math.max(0, Math.min(1, v));
}

/** Fade the music's volume to `to` over `ms`, then optionally pause it. */
const fades = new WeakMap<HTMLAudioElement, number>();
function fade(el: HTMLAudioElement, to: number, ms: number, pauseAfter = false): void {
  const prev = fades.get(el);
  if (prev) cancelAnimationFrame(prev);
  const from = getVol(el);
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    setVol(el, Math.max(0, Math.min(1, from + (to - from) * k)));
    if (k < 1) fades.set(el, requestAnimationFrame(step));
    else { fades.delete(el); if (pauseAfter) el.pause(); }
  };
  fades.set(el, requestAnimationFrame(step));
}

function stopCurrent(): void {
  if (current && music[current]) fade(music[current]!, 0, 500, true);
  current = null;
}

/**
 * Which loop should be playing (null = silence, e.g. while the run-over sequence plays).
 * There is one theme that loops across every screen and keeps its place.
 */
export function setMusic(t: MusicTrack | null): void {
  wanted = t;
  if (!unlocked || !canAudio()) return;
  if (!settings.musicOn) { if (current) stopCurrent(); return; }
  if (t === current) { if (t && music[t]?.paused) void music[t]!.play().catch(() => undefined); return; }
  if (current) stopCurrent();
  current = t;
  if (!t) return;
  const el = track(t);
  if (ctx?.state === 'suspended') void ctx.resume();
  setVol(el, 0);
  void el.play().then(() => fade(el, musicLevel(), 900)).catch(() => undefined);
}

/** Dip the music briefly so a sound effect sits on top of it. */
function duckMusic(amount: number, ms: number): void {
  if (!current || !music[current]) return;
  duck = amount;
  fade(music[current]!, musicLevel(), 120);
  window.setTimeout(() => { duck = 1; if (current && music[current]) fade(music[current]!, musicLevel(), 600); }, ms);
}

// ---------------- recorded effects ----------------

export function playFile(k: FileSfx, gain = 1): void {
  if (!unlocked || !canAudio() || sfxLevel() <= 0) return;
  const pool = (pools[k] ??= []);
  let el = pool.find((a) => a.paused || a.ended);
  if (!el && pool.length < 4) { el = new Audio(FILES[k]); el.preload = 'auto'; pool.push(el); }
  if (!el) el = pool[0];
  el.currentTime = 0;
  el.volume = Math.min(1, sfxLevel() * gain);
  void el.play().catch(() => undefined);
}

export function throwSound(m: Move): void {
  playFile(m === 'R' ? 'rock' : m === 'P' ? 'paper' : 'scissors');
}

// ---------------- synthesized effects ----------------

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number; slide?: number };

const SYNTH: Record<SynthSfx, Note[]> = {
  hover: [{ f: 1800, t: 0, d: 0.025, type: 'sine', g: 0.05 }],
  click: [{ f: 880, t: 0, d: 0.04, type: 'triangle', g: 0.18 }, { f: 1320, t: 0.012, d: 0.03, type: 'sine', g: 0.08 }],
  toggle: [{ f: 660, t: 0, d: 0.05, type: 'square', g: 0.06 }, { f: 990, t: 0.04, d: 0.05, type: 'square', g: 0.05 }],
  deny: [{ f: 196, t: 0, d: 0.12, type: 'square', g: 0.09 }, { f: 147, t: 0.09, d: 0.16, type: 'square', g: 0.08 }],
  win: [{ f: 784, t: 0, d: 0.1, type: 'triangle', g: 0.2 }, { f: 1175, t: 0.08, d: 0.18, type: 'triangle', g: 0.18 }],
  tie: [{ f: 523, t: 0, d: 0.12, type: 'sine', g: 0.16 }],
  // shield snapping up: a bright rising chime
  save: [{ f: 660, t: 0, d: 0.22, type: 'sine', g: 0.13, slide: 1320 }, { f: 1319, t: 0.06, d: 0.1, type: 'triangle', g: 0.08 }, { f: 1760, t: 0.12, d: 0.32, type: 'sine', g: 0.09 }],
  phew: [{ f: 600, t: 0, d: 0.35, type: 'sine', g: 0.14, slide: 1200 }],
  death: [{ f: 392, t: 0, d: 0.22, type: 'sawtooth', g: 0.12 }, { f: 330, t: 0.2, d: 0.22, type: 'sawtooth', g: 0.11 }, { f: 262, t: 0.4, d: 0.7, type: 'sawtooth', g: 0.12, slide: 180 }],
  // store arrival bell: struck tone with a bright overtone and a second, softer strike
  storeIn: [{ f: 1319, t: 0, d: 1.1, type: 'sine', g: 0.16 }, { f: 3297, t: 0, d: 0.35, type: 'sine', g: 0.04 }, { f: 1976, t: 0.16, d: 1.0, type: 'sine', g: 0.09 }, { f: 2637, t: 0.16, d: 0.3, type: 'triangle', g: 0.03 }],
  storeOut: [{ f: 300, t: 0, d: 0.25, type: 'triangle', g: 0.1, slide: 900 }],
  coin: [{ f: 1976, t: 0, d: 0.05, type: 'square', g: 0.035 }, { f: 2637, t: 0.035, d: 0.09, type: 'square', g: 0.03 }],
  coinSmall: [{ f: 2093, t: 0, d: 0.06, type: 'sine', g: 0.045 }],
  tick: [{ f: 1500, t: 0, d: 0.018, type: 'square', g: 0.022 }],
  drum: [{ f: 95, t: 0, d: 0.2, type: 'sine', g: 0.42, slide: 48 }, { f: 190, t: 0, d: 0.04, type: 'triangle', g: 0.08 }],
  drumBig: [{ f: 72, t: 0, d: 0.6, type: 'sine', g: 0.6, slide: 34 }, { f: 150, t: 0, d: 0.07, type: 'square', g: 0.07 }, { f: 48, t: 0.02, d: 0.5, type: 'sine', g: 0.3 }],
  stamp: [{ f: 170, t: 0, d: 0.1, type: 'square', g: 0.1, slide: 70 }, { f: 85, t: 0, d: 0.16, type: 'sine', g: 0.34, slide: 45 }],
  deal: [{ f: 2600, t: 0, d: 0.03, type: 'triangle', g: 0.03, slide: 1400 }],
  impact: [{ f: 120, t: 0, d: 0.3, type: 'sine', g: 0.5, slide: 38 }, { f: 240, t: 0, d: 0.06, type: 'square', g: 0.09 }],
  scratch: [{ f: 1400, t: 0, d: 0.12, type: 'sawtooth', g: 0.06, slide: 300 }, { f: 300, t: 0.1, d: 0.16, type: 'sawtooth', g: 0.05, slide: 900 }],
  sparkle: [{ f: 2093, t: 0, d: 0.12, type: 'sine', g: 0.07 }, { f: 2637, t: 0.06, d: 0.12, type: 'sine', g: 0.06 }, { f: 3136, t: 0.12, d: 0.12, type: 'sine', g: 0.05 }, { f: 4186, t: 0.18, d: 0.3, type: 'sine', g: 0.05 }],
  shimmer: [{ f: 1568, t: 0, d: 0.5, type: 'sine', g: 0.05, slide: 3136 }, { f: 2349, t: 0.08, d: 0.45, type: 'sine', g: 0.035, slide: 4699 }],
  whoosh: [{ f: 900, t: 0, d: 0.22, type: 'sawtooth', g: 0.025, slide: 200 }],
  bonk: [{ f: 330, t: 0, d: 0.09, type: 'triangle', g: 0.14, slide: 250 }],
  hit: [{ f: 220, t: 0, d: 0.08, type: 'square', g: 0.08, slide: 110 }, { f: 1760, t: 0, d: 0.05, type: 'triangle', g: 0.05 }],
  award: [{ f: 523, t: 0, d: 0.12, type: 'triangle', g: 0.18 }, { f: 659, t: 0.11, d: 0.12, type: 'triangle', g: 0.18 }, { f: 784, t: 0.22, d: 0.12, type: 'triangle', g: 0.18 }, { f: 1047, t: 0.33, d: 0.5, type: 'triangle', g: 0.2 }],
};

/** Recent synth cues (for tests; tiny ring buffer). */
export const sfxLog: string[] = [];

/** `pitch` scales every note's frequency (e.g. rising ticks). */
export function playSynth(k: SynthSfx, pitch = 1): void {
  sfxLog.push(k); if (sfxLog.length > 200) sfxLog.shift();
  if (!unlocked || sfxLevel() <= 0) return;
  try {
    const ctx = audioCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime + 0.005;
    for (const n of SYNTH[k]) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.f * pitch, now + n.t);
      if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.slide * pitch, now + n.t + n.d);
      const peak = (n.g ?? 0.15) * sfxLevel();
      g.gain.setValueAtTime(0.0001, now + n.t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + n.t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      osc.connect(g).connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.02);
    }
  } catch { /* audio unavailable: play silently */ }
}

// ---------------- event mapping (pure, unit-tested) ----------------

export type Cue = { file?: FileSfx; synth?: SynthSfx; duck?: boolean };

/** Which sound an engine event makes. Throw sounds are played on the click itself, not here. */
export function cueFor(e: EngineEvent): Cue | null {
  switch (e.type) {
    case 'result': {
      const r = e.record;
      if (r.rawOutcome === 'LOSS' && !r.saved) {
        if (r.lifeUsed) return { file: 'lifeLost', duck: true }; // an Extra Life was spent
        if (r.lifeKept) return { synth: 'phew' }; // This Seems Fine kept the life
        return null; // run over: the 'death' event plays
      }
      if (r.saved) return { synth: 'save' };
      return { synth: r.outcome === 'WIN' ? 'win' : 'tie' };
    }
    case 'death': return { synth: 'death' };
    case 'purchase': return { file: 'purchase' };
    case 'storeEnter': return { synth: 'storeIn' };
    case 'storeExit': return { synth: 'storeOut' };
    default: return null;
  }
}

export function playCue(c: Cue | null): void {
  if (!c) return;
  if (c.duck) duckMusic(0.35, 1500);
  if (c.file) playFile(c.file);
  if (c.synth) playSynth(c.synth);
}

// ---------------- wiring ----------------

/**
 * Unlock audio on the first gesture, and add hover/click sounds to buttons.
 * Throw buttons are skipped (they have their own Rock/Paper/Scissors sounds).
 */
export function installAudio(root: Document = document): void {
  if (!canAudio()) return;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    setMusic(wanted);
  };
  root.addEventListener('pointerdown', unlock, { capture: true });
  root.addEventListener('keydown', unlock, { capture: true });
  root.addEventListener('pointerover', (e) => {
    const b = (e.target as HTMLElement).closest?.('button:not(:disabled), .medal, label.mode-toggle, label.allin');
    if (!b || b.classList.contains('throw') || (e.relatedTarget as HTMLElement | null)?.closest?.('button, .medal, label') === b) return;
    const now = performance.now();
    if (now - lastHover < 60) return;
    lastHover = now;
    playSynth('hover');
  });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest?.('input[type="checkbox"], input[type="range"]')) { playSynth('toggle'); return; }
    const b = t.closest?.('button');
    if (!b || b.classList.contains('throw') || b.disabled) return;
    if (b.id.startsWith('buy-') || b.id === 'buy-life' || b.id === 'reroll-store' || b.id === 'reroll-opp') return; // purchase sound covers these
    playSynth('click');
  }, { capture: true });
}

/** Test hook: lets tests inspect what the audio system would play. */
export const audioDebug = {
  get unlocked() { return unlocked; },
  get current() { return current; },
  get wanted() { return wanted; },
  musicVolume: () => (current && music[current] ? getVol(music[current]!) : 0),
  /** True when the music runs through a Web Audio gain node (what makes the slider work on iPhone). */
  musicRouted: () => !!(current && music[current] && gains.has(music[current]!)),
  forceUnlock() { if (!unlocked) { unlocked = true; setMusic(wanted); } },
};
