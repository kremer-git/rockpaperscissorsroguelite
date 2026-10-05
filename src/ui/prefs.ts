// Per-viewer UI preferences (panel layout, hidden read-outs, hard mode toggle).
// Stored in browser storage: a convenience, so the game works fine without it.
import type { Tree } from '../core/types';
import { DEFAULT_AUDIO, type AudioSettings } from './audio';

export interface Prefs {
  hardMode: boolean;
  buildCollapsed: boolean;
  treeCollapsed: Record<Tree, boolean>;
  /** Read-outs the player switched off. */
  hidden: { hunch: boolean; coldRead: boolean };
  /** Build items the player expanded for details. */
  expanded: string[];
  /** Title screen: the player closed the Opponents Defeated collection (it starts open). */
  collectionClosed: boolean;
  /** Effects: 'reduced' turns off cosmetic animation (also automatic when the device asks for reduced motion). */
  effects: 'full' | 'reduced';
  /** Collection stamps / trophies whose reveal animation has already played in this browser (null = not tracked yet). */
  seenDefeats: string[] | null;
  seenTrophies: number[] | null;
  /** Music / effects volume and mute. */
  audio: AudioSettings;
}

const KEY = 'rps-roguelite.prefs.v1';

export function defaultPrefs(): Prefs {
  return {
    hardMode: false,
    buildCollapsed: false,
    treeCollapsed: { rock: false, paper: false, scissors: false },
    hidden: { hunch: false, coldRead: false },
    expanded: [],
    collectionClosed: false,
    effects: 'full',
    seenDefeats: null,
    seenTrophies: null,
    audio: { ...DEFAULT_AUDIO },
  };
}

export function loadPrefs(): Prefs {
  const d = defaultPrefs();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      hardMode: !!p.hardMode,
      buildCollapsed: !!p.buildCollapsed,
      treeCollapsed: { ...d.treeCollapsed, ...(p.treeCollapsed ?? {}) },
      hidden: { ...d.hidden, ...(p.hidden ?? {}) },
      expanded: Array.isArray(p.expanded) ? p.expanded.filter((x) => typeof x === 'string') : [],
      collectionClosed: !!p.collectionClosed,
      effects: p.effects === 'reduced' ? 'reduced' : 'full',
      seenDefeats: Array.isArray(p.seenDefeats) ? p.seenDefeats.filter((x) => typeof x === 'string') : null,
      seenTrophies: Array.isArray(p.seenTrophies) ? p.seenTrophies.filter((x) => typeof x === 'number') : null,
      audio: { ...d.audio, ...(p.audio && typeof p.audio === 'object' ? p.audio : {}) },
    };
  } catch { return d; }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}
