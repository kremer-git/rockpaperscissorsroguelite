// "Juice": short, cosmetic animations and sounds layered on top of the game.
// Rules: transform/opacity only, most effects < 400 ms, never block input for long, never touch game state.
// Everything checks motionOK(): off when the device asks for reduced motion or the player picks
// Effects: Reduced in the sound menu. With motion off, the game behaves exactly as before.
import { playSynth, type SynthSfx } from './audio';
import { h, fmt } from './dom';

let effectsReduced = false;
export function setEffectsReduced(v: boolean): void {
  effectsReduced = v;
  document.documentElement.classList.toggle('calm', !motionOK());
}
export function motionOK(): boolean {
  if (effectsReduced) return false;
  try { return !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; }
}

/** A fixed, click-through layer that survives screen re-renders. */
export function layer(): HTMLElement {
  let el = document.getElementById('fx-layer');
  if (!el) { el = h('div', { id: 'fx-layer', 'aria-hidden': 'true' }); document.body.append(el); }
  return el;
}

export const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Restart a CSS animation class on an element. */
export function replay(el: Element | null, cls: string): void {
  if (!el) return;
  el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls);
}

const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const onScreen = (r: DOMRect) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0;

let lastSound = 0;
function throttledSynth(k: SynthSfx, gapMs: number, pitch = 1): void {
  const now = performance.now();
  if (now - lastSound < gapMs) return;
  lastSound = now;
  playSynth(k, pitch);
}

/** Tokens (coins, cards…) that arc from one point to another. Resolves when the last one lands. */
export function fly(opts: { from: DOMRect; to: DOMRect; n: number; cls: string; html?: string; dur?: number; stagger?: number; arc?: number; onLand?: (i: number) => void }): Promise<void> {
  const { from, to, n, cls } = opts;
  const dur = opts.dur ?? 520, stagger = opts.stagger ?? 55, arc = opts.arc ?? 70;
  const a = centre(from), b = centre(to);
  const L = layer();
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const t = h('span', { class: `fly ${cls}`, html: opts.html ?? '' });
    const jx = (i - (n - 1) / 2) * 7, jy = (i % 2) * 6;
    t.style.left = `${a.x + jx}px`; t.style.top = `${a.y + jy}px`;
    L.append(t);
    const dx = b.x - a.x - jx, dy = b.y - a.y - jy;
    const anim = t.animate([
      { transform: 'translate(-50%,-50%) translate(0,0) scale(.6)', opacity: 0 },
      { transform: `translate(-50%,-50%) translate(${dx * 0.45}px, ${dy * 0.45 - arc}px) scale(1.1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(-50%,-50%) translate(${dx}px, ${dy}px) scale(.7)`, opacity: 0.9 },
    ], { duration: dur, delay: i * stagger, easing: 'cubic-bezier(.45,0,.6,1)', fill: 'both' });
    jobs.push(anim.finished.then(() => { t.remove(); opts.onLand?.(i); }).catch(() => { t.remove(); }));
  }
  return Promise.all(jobs).then(() => undefined);
}

/** A burst of dots from a point. */
export function burst(at: DOMRect, color: string, n = 10, spread = 46): void {
  if (!motionOK() || !onScreen(at)) return;
  const c = centre(at), L = layer();
  for (let i = 0; i < n; i++) {
    const d = h('span', { class: 'dot' });
    const size = 5 + (i % 3) * 2;
    d.style.cssText = `left:${c.x}px;top:${c.y}px;width:${size}px;height:${size}px;background:${color}`;
    L.append(d);
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const r = spread * (0.6 + Math.random() * 0.6);
    d.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(-50%,-50%) translate(${Math.cos(ang) * r}px, ${Math.sin(ang) * r}px) scale(.2)`, opacity: 0 },
    ], { duration: 520 + Math.random() * 160, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).finished.then(() => d.remove(), () => d.remove());
  }
}

/** A full-screen tint that flashes once (e.g. red edges on a loss). */
export function flashScreen(cls: string, ms = 520): void {
  if (!motionOK()) return;
  const f = h('div', { class: `screen-flash ${cls}` });
  layer().append(f);
  window.setTimeout(() => f.remove(), ms + 40);
}

/** Counts a number up (or down) inside an element whose last text node is the number. */
export function countUp(el: Element | null, from: number, to: number, ms: number, onStep?: () => void, format: (n: number) => string = fmt): Promise<void> {
  return new Promise((resolve) => {
    if (!el) return resolve();
    const node = [...el.childNodes].reverse().find((n) => n.nodeType === Node.TEXT_NODE) ?? el.appendChild(document.createTextNode(''));
    if (!motionOK() || from === to || ms <= 0) { node.textContent = format(to); return resolve(); }
    const t0 = performance.now();
    let lastShown = from;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (v !== lastShown) { lastShown = v; node.textContent = format(v); onStep?.(); }
      if (k < 1) requestAnimationFrame(step); else { node.textContent = format(to); resolve(); }
    };
    node.textContent = format(from);
    requestAnimationFrame(step);
  });
}

/** Coins arcing from the result to the HUD coin counter, which counts up as they land. */
export function coinsToHud(from: DOMRect | null, amount: number, before: number, after: number, small: boolean): void {
  const target = document.querySelector('[data-fx="coins"] .hud-num');
  if (!target) return;
  if (!motionOK() || !from || amount <= 0) { void countUp(target, before, after, 0); return; }
  const n = small ? (amount >= 8 ? 2 : 1) : Math.max(3, Math.min(7, Math.round(amount / 6)));
  const to = target.getBoundingClientRect();
  const dur = small ? 420 : 560, stagger = small ? 70 : 50;
  void countUp(target, before, after, dur + stagger * (n - 1));
  void fly({ from, to, n, cls: small ? 'coin small' : 'coin', html: '¢', dur, stagger, arc: small ? 30 : 70,
    onLand: () => { throttledSynth(small ? 'coinSmall' : 'coin', 38, 1); replay(target.closest('[data-fx="coins"]'), 'fx-bump'); } });
}

/** Purple shield ring that snaps around an element (a save). */
export function shieldAround(el: Element | null): void {
  if (!el || !motionOK()) return;
  const r = el.getBoundingClientRect();
  if (!onScreen(r)) return;
  const pad = 14;
  const ring = h('div', { class: 'shield-ring', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/></svg>' });
  ring.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
  layer().append(ring);
  window.setTimeout(() => ring.remove(), 900);
}

export function sparkle(at: DOMRect, n = 14): void {
  if (!motionOK() || !onScreen(at)) return;
  const c = centre(at), L = layer();
  for (let i = 0; i < n; i++) {
    const s = h('span', { class: 'spark', html: '✦' });
    s.style.left = `${c.x}px`; s.style.top = `${c.y}px`;
    L.append(s);
    const ang = (i / n) * Math.PI * 2;
    const r = 40 + Math.random() * 40;
    s.animate([
      { transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 0 },
      { transform: `translate(-50%,-50%) translate(${Math.cos(ang) * r * 0.5}px, ${Math.sin(ang) * r * 0.5}px) scale(1.1) rotate(90deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(-50%,-50%) translate(${Math.cos(ang) * r}px, ${Math.sin(ang) * r}px) scale(.4) rotate(180deg)`, opacity: 0 },
    ], { duration: 900, delay: i * 18, easing: 'ease-out', fill: 'both' }).finished.then(() => s.remove(), () => s.remove());
  }
}

export { onScreen };
