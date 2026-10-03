// Asset registry. Every visual slot in the UI asks for an asset by key.
// Today each key resolves to a placeholder glyph; a future art pass only needs
// to add `image` URLs here (or call registerAsset) — no screen code changes.
import { h } from './dom';
import { OPPONENTS } from '../content/opponents';

export interface AssetDef {
  glyph: string; // placeholder: a text glyph drawn in a tinted tile
  label: string; // accessible name
  image?: string; // future: URL or data URI of real artwork
  tint?: string; // CSS color token name for the placeholder tile
}

const ASSETS: Record<string, AssetDef> = {
  // Throws
  'move.R': { glyph: '●', label: 'Rock', tint: '--rock', image: 'art/move-R.webp' },
  'move.P': { glyph: '▭', label: 'Paper', tint: '--paper', image: 'art/move-P.webp' },
  'move.S': { glyph: '✂', label: 'Scissors', tint: '--scissors', image: 'art/move-S.webp' },
  // Trophies (title-screen shelf), keyed by the round count that unlocks them
  'award.100': { glyph: '100', label: '100-round trophy', image: 'art/award-100.webp' },
  'award.200': { glyph: '200', label: '200-round trophy', image: 'art/award-200.webp' },
  'award.300': { glyph: '300', label: '300-round trophy', image: 'art/award-300.webp' },
  'award.400': { glyph: '400', label: '400-round trophy', image: 'art/award-400.webp' },
  'award.500': { glyph: '500', label: '500-round trophy', image: 'art/award-500.webp' },
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

// Opponent portraits ship next to the page as dist/portraits/<opponent id>.jpg (256×256, face-cropped by
// scripts/portraits.py). If one fails to load, the initials tile above is shown instead.
for (const o of OPPONENTS) ASSETS[o.portrait] = { ...(ASSETS[o.portrait] ?? { glyph: '?', label: o.name }), image: `portraits/${o.id}.jpg` };

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
  if (a.image) {
    const img = h('img', { class: `asset asset-img ${cls}`, src: a.image, alt: a.label, 'data-asset': key, draggable: 'false' }) as HTMLImageElement;
    // Missing file (e.g. index.html copied without its portraits folder): fall back to the placeholder glyph.
    img.addEventListener('error', () => img.replaceWith(glyphTile(key, cls, a)), { once: true });
    return img;
  }
  return glyphTile(key, cls, a);
}

function glyphTile(key: string, cls: string, a: AssetDef): HTMLElement {
  return h('span', { class: `asset ${cls}`, role: 'img', 'aria-label': a.label, 'data-asset': key, style: a.tint ? `--tint: var(${a.tint})` : undefined }, a.glyph);
}
