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
  /** Title screen: the Opponents Defeated collection is expanded. */
  collectionOpen: boolean;
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
    collectionOpen: false,
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
      collectionOpen: !!p.collectionOpen,
      audio: { ...d.audio, ...(p.audio && typeof p.audio === 'object' ? p.audio : {}) },
    };
  } catch { return d; }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}
