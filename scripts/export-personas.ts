// Exports every opponent to docs/personas.csv (open in Excel / Google Sheets) and docs/personas.md.
// Run: npx tsx scripts/export-personas.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { OPPONENTS } from '../src/content/opponents';
import { CONFIG } from '../src/core/config';

const BEHAVIOURS: [string, string][] = [
  ['repeatOwn', 'repeats its own last throw'], ['cycle', 'throws what beats its own last throw'],
  ['reverseCycle', 'throws what loses to its own last throw'], ['copyPlayer', 'copies your last throw'],
  ['counterPlayerLast', 'beats your last throw'], ['counterPlayerFreq', 'beats your most common recent throw'],
  ['counterPlayerBigram', 'beats what you usually throw after your last throw'], ['winStay', 'after winning, repeats'],
  ['loseShift', 'after losing, switches to what would have won'], ['winShift', 'after winning, moves on in the cycle'],
  ['loseStay', 'after losing, repeats'], ['leastPlayed', 'throws its least-used move'],
  ['echoTwoBack', 'beats its own throw from 2 rounds ago'], ['mirrorTwoBack', 'copies your throw from 2 rounds ago'],
  ['favoritePhase', 'picks a lucky move for a streak'], ['loop', 'repeats a short sequence (new one each encounter)'],
  ['avoidLoser', 'never repeats a throw that just lost (multiplier)'], ['moods', 'swaps between two behaviour sets every N rounds'],
  ['bluff', 'announces a throw, then bluffs / tells the truth / beats how you answered last time'], ['tiltAfterLosses', 'abandons its favourite after a losing streak'],
];
const firstStage = (tier: string) => CONFIG.opponentTierWeights.findIndex((r) => (r[tier] ?? 0) > 0);
const rules = (o: (typeof OPPONENTS)[number]) =>
  BEHAVIOURS.filter(([k]) => (o as unknown as Record<string, unknown>)[k] !== undefined)
    .map(([k, label]) => `${label} (${k}=${JSON.stringify((o as unknown as Record<string, unknown>)[k])})`).join('; ');
const esc = (x: unknown) => `"${String(x).replace(/"/g, '""')}"`;
mkdirSync('docs', { recursive: true });
const head = ['id', 'name', 'title (shown)', 'archetype (revealed by research)', 'tier', 'first possible stage', 'tendency text', 'base R/P/S', 'randomness floor', 'behaviour rules', 'flavor (unused in UI)'];
const rows = OPPONENTS.map((o) => [o.id, o.name, o.title, o.archetype, o.tier, firstStage(o.tier), o.tell, o.base.join('/'), o.randomness, rules(o), o.flavor]);
writeFileSync('docs/personas.csv', '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n');
let md = '# Personas (generated from src/content/opponents.ts — edit that file, then re-run `npx tsx scripts/export-personas.ts`)\n\n';
for (const o of OPPONENTS) md += `## ${o.name} — “${o.title}”\n\n- **Archetype:** ${o.archetype} · **tier:** ${o.tier} (from stage ${firstStage(o.tier)})\n- **Tendency text:** ${o.tell}\n- **Model:** base R/P/S ${o.base.join('/')}, randomness floor ${o.randomness}; ${rules(o) || 'no rules (pure base odds)'}\n\n`;
writeFileSync('docs/personas.md', md);
console.log(`wrote docs/personas.csv and docs/personas.md (${OPPONENTS.length} personas)`);
