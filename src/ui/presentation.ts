// Presentation hooks for audio and animation. The engine emits events and
// never waits; these listeners decorate the UI after the fact.
import type { EngineEvent } from '../core/types';
import { onEngineEvent } from '../core/engine';

// ---------------- Audio: register sounds later without touching game code ----------------
export type SoundKey = 'button' | 'choice' | 'reveal' | 'win' | 'tie' | 'loss' | 'store' | 'purchase' | 'trigger' | 'life' | 'milestone' | 'save';
const sounds: Partial<Record<SoundKey, () => void>> = {};
let muted = false;

export function registerSound(key: SoundKey, play: () => void): void { sounds[key] = play; }
export function setMuted(m: boolean): void { muted = m; }
export function playSound(key: SoundKey): void { if (!muted) sounds[key]?.(); }

function soundFor(e: EngineEvent): SoundKey | null {
  switch (e.type) {
    case 'choice': return 'choice';
    case 'reveal': return 'reveal';
    case 'result': return e.record.outcome === 'WIN' ? 'win' : e.record.outcome === 'TIE' ? (e.record.saved ? 'save' : 'tie') : 'loss';
    case 'lifeConsumed': return 'life';
    case 'storeEnter': return 'store';
    case 'purchase': return 'purchase';
    case 'milestone': return 'milestone';
    default: return null;
  }
}

// ---------------- Animation: CSS classes applied to data-fx targets ----------------
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const queue: EngineEvent[] = [];

/** Screens call this after rendering; queued events become one-shot CSS animations. */
export function flushFx(root: HTMLElement): void {
  const events = queue.splice(0);
  if (reduced()) return;
  for (const e of events) {
    const fx = (sel: string, cls: string) => root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    });
    if (e.type === 'result') {
      fx('[data-fx="clash"]', 'fx-clash');
      fx('[data-fx="banner"]', `fx-${e.record.outcome.toLowerCase()}`);
      if (e.record.reward > 0) fx('[data-fx="coins"]', 'fx-bump');
    }
    if (e.type === 'lifeConsumed') fx('[data-fx="lives"]', 'fx-shake');
    if (e.type === 'purchase') fx('[data-fx="build"]', 'fx-bump');
  }
}

export function installPresentation(): void {
  onEngineEvent((e) => {
    const k = soundFor(e);
    if (k) playSound(k);
    queue.push(e);
  });
}
