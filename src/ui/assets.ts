// Asset registry. Every visual slot in the UI asks for an asset by key.
// Today each key resolves to a placeholder glyph; a future art pass only needs
// to add `image` URLs here (or call registerAsset) — no screen code changes.
import { h } from './dom';

export interface AssetDef {
  glyph: string; // placeholder: a text glyph drawn in a tinted tile
  label: string; // accessible name
  image?: string; // future: URL or data URI of real artwork
  tint?: string; // CSS color token name for the placeholder tile
}

const ASSETS: Record<string, AssetDef> = {
  // Throws
  'move.R': { glyph: '●', label: 'Rock', tint: '--rock' },
  'move.P': { glyph: '▭', label: 'Paper', tint: '--paper' },
  'move.S': { glyph: '✂', label: 'Scissors', tint: '--scissors' },
  // Opponent portraits (initials until portraits exist)
  'opp.repeater': { glyph: 'GA', label: 'Gary' }, 'opp.rock': { glyph: 'HA', label: 'Hank' },
  'opp.paper': { glyph: 'PA', label: 'Pam' }, 'opp.scissors': { glyph: 'CA', label: 'Cassie' },
  'opp.cycler': { glyph: 'OT', label: 'Otto' }, 'opp.mimic': { glyph: 'PO', label: 'Polly' },
  'opp.contrarian': { glyph: 'CO', label: 'Connor' }, 'opp.hot': { glyph: 'PE', label: 'Pete' },
  'opp.cold': { glyph: 'OL', label: 'Olga' }, 'opp.collector': { glyph: 'CR', label: 'Carl' },
  'opp.gambler': { glyph: 'LO', label: 'Lou' }, 'opp.psych': { glyph: 'SI', label: 'Sigrid' },
  'opp.mirror': { glyph: 'MI', label: 'Miranda' }, 'opp.chaos': { glyph: 'KA', label: 'Kai' },
  'opp.oracle': { glyph: 'DE', label: 'Delphine' }, 'opp.nash': { glyph: 'JO', label: 'John' },
  'opp.loop': { glyph: 'LE', label: 'Lenny' }, 'opp.superstitious': { glyph: 'SA', label: 'Sal' },
  'opp.moods': { glyph: 'MO', label: 'Moira' }, 'opp.bluffer': { glyph: 'FE', label: 'Felix' },
  // Scenery slots
  'bg.table': { glyph: '', label: 'Table' },
  'store.sign': { glyph: '$', label: 'Store' },
  'ui.life': { glyph: '♥', label: 'Extra Life' },
  'ui.coin': { glyph: '¢', label: 'Coins' },
  'ui.reroll': { glyph: '↻', label: 'Reroll' },
};

const TREE_GLYPH: Record<string, string> = { rock: '●', paper: '▭', scissors: '✂' };

export function registerAsset(key: string, def: Partial<AssetDef>): void {
  ASSETS[key] = { ...(ASSETS[key] ?? { glyph: '?', label: key }), ...def };
}

/** Upgrade icons fall back to their tree glyph until art exists. */
export function upgradeAsset(icon: string, tree: string, name: string): AssetDef {
  return ASSETS[icon] ?? { glyph: TREE_GLYPH[tree] ?? '◆', label: name, tint: `--${tree}` };
}

export function asset(key: string, cls = '', fallback?: AssetDef): HTMLElement {
  const a = ASSETS[key] ?? fallback ?? { glyph: '?', label: key };
  if (a.image) return h('img', { class: `asset ${cls}`, src: a.image, alt: a.label, 'data-asset': key });
  return h('span', { class: `asset ${cls}`, role: 'img', 'aria-label': a.label, 'data-asset': key, style: a.tint ? `--tint: var(${a.tint})` : undefined }, a.glyph);
}
