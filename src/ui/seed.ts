// Seed parsing (no DOM, so tests can import it).
/** Accepts a number (0–4294967295) or any text, which is hashed to a seed. Empty = random. */
export function parseSeed(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (/^\d+$/.test(t)) return Number(BigInt(t) % 4294967296n);
  let hsh = 2166136261;
  for (let i = 0; i < t.length; i++) { hsh ^= t.charCodeAt(i); hsh = Math.imul(hsh, 16777619); }
  return hsh >>> 0;
}

