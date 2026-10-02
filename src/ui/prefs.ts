// Per-viewer UI preferences (panel layout, hidden read-outs, hard mode toggle).
// Stored in browser storage: a convenience, so the game works fine without it.
import type { Tree } from '../core/types';
import { DEFAULT_AUDIO, type AudioSettings } from './audio';

export interface Prefs {
  hardMode: boolean;
  buildCollapsed: boolean;
  treeCollapsed: Record<Tree, boolean>;
  /** Player-chosen order of upgrade ids within each tree. Unlisted ids follow in purchase order. */
  order: Record<Tree, string[]>;
  /** Read-outs the player switched off. */
  hidden: { hunch: boolean; coldRead: boolean };
  /** Build items the player expanded for details. */
  expanded: string[];
  /** Music / effects volume and mute. */
  audio: AudioSettings;
}

const KEY = 'rps-roguelite.prefs.v1';

export function defaultPrefs(): Prefs {
  return {
    hardMode: false,
    buildCollapsed: false,
    treeCollapsed: { rock: false, paper: false, scissors: false },
    order: { rock: [], paper: [], scissors: [] },
    hidden: { hunch: false, coldRead: false },
    expanded: [],
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
      order: { ...d.order, ...(p.order ?? {}) },
      hidden: { ...d.hidden, ...(p.hidden ?? {}) },
      expanded: Array.isArray(p.expanded) ? p.expanded.filter((x) => typeof x === 'string') : [],
      audio: { ...d.audio, ...(p.audio && typeof p.audio === 'object' ? p.audio : {}) },
    };
  } catch { return d; }
}

export function savePrefs(p: Prefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

/** Sort owned ids by the player's saved order; anything new keeps purchase order at the end. */
export function orderIds(ids: string[], saved: string[]): string[] {
  const known = saved.filter((id) => ids.includes(id));
  return [...known, ...ids.filter((id) => !known.includes(id))];
}

/** Move `id` to sit before `beforeId` (or to the end when null) in a tree's order. */
export function reorder(current: string[], id: string, beforeId: string | null): string[] {
  const rest = current.filter((x) => x !== id);
  const i = beforeId ? rest.indexOf(beforeId) : -1;
  if (i < 0) return [...rest, id];
  return [...rest.slice(0, i), id, ...rest.slice(i)];
}
