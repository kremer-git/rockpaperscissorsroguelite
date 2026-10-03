// Lifetime awards for long runs. The only thing that survives between runs,
// and it grants no power: it's a trophy shelf, not meta-progression.
//
// Stored in two places: browser storage (always, instant) and, when the page is
// viewed on claude.ai by a signed-in person, their private `db` subtree so the
// shelf follows them across devices. The two are merged (union of awards, best
// of records), so neither can erase the other.

import { OPPONENTS } from '../content/opponents';

export interface AwardDef {
  rounds: number;
  name: string;
  blurb: string;
}

export const AWARDS: AwardDef[] = [
  { rounds: 100, name: 'Congrats, You Played Yourself', blurb: 'A hundred rounds of a game most people settle in one. Truly, a choice.' },
  { rounds: 200, name: 'How Is This Still Fun for You?', blurb: 'Two hundred rounds. We’re impressed, and a little concerned.' },
  { rounds: 300, name: 'Your Hand Called. It Wants a Break.', blurb: 'Three hundred rounds. Please stretch your wrist.' },
  { rounds: 400, name: 'Get Yourself Checked Out', blurb: 'Four hundred rounds. This is a medical recommendation.' },
  { rounds: 500, name: 'We’re Legally Required to Ask If You’re Okay', blurb: 'Five hundred rounds. Are you okay? Blink twice.' },
];

export interface Unlock { at: string; hard: boolean; seed: number }

export interface Progress {
  best: number;
  bestHard: number;
  runs: number;
  unlocked: Record<string, Unlock>; // keyed by rounds threshold
  /** Opponents Defeated collection: stretches played against each opponent, and stretches survived (= defeated). */
  foes: Record<string, FoeRecord>;
}

export interface FoeRecord { met: number; beaten: number }

const KEY = 'rps-roguelite.awards.v1';

export function emptyProgress(): Progress {
  return { best: 0, bestHard: 0, runs: 0, unlocked: {}, foes: {} };
}

function sanitize(p: unknown): Progress {
  const e = emptyProgress();
  if (!p || typeof p !== 'object') return e;
  const o = p as Partial<Progress>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  const unlocked: Record<string, Unlock> = {};
  if (o.unlocked && typeof o.unlocked === 'object') {
    for (const [k, v] of Object.entries(o.unlocked)) {
      if (!AWARDS.some((a) => String(a.rounds) === k) || !v || typeof v !== 'object') continue;
      const u = v as Partial<Unlock>;
      unlocked[k] = { at: typeof u.at === 'string' ? u.at : '', hard: !!u.hard, seed: n(u.seed) };
    }
  }
  const foes: Record<string, FoeRecord> = {};
  if (o.foes && typeof o.foes === 'object') {
    for (const [id, v] of Object.entries(o.foes)) {
      if (!OPPONENTS.some((x) => x.id === id) || !v || typeof v !== 'object') continue;
      const f = v as Partial<FoeRecord>;
      const met = n(f.met), beaten = n(f.beaten);
      if (met || beaten) foes[id] = { met: Math.max(met, beaten ? 1 : 0), beaten };
    }
  }
  return { best: n(o.best), bestHard: n(o.bestHard), runs: n(o.runs), unlocked, foes };
}

/** Union of two records: keep every award (earliest date, hard if either was hard), best of the numbers. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const unlocked: Record<string, Unlock> = { ...a.unlocked };
  for (const [k, v] of Object.entries(b.unlocked)) {
    const x = unlocked[k];
    if (!x) unlocked[k] = v;
    else unlocked[k] = { at: x.at && v.at ? (x.at < v.at ? x.at : v.at) : x.at || v.at, hard: x.hard || v.hard, seed: x.seed || v.seed };
  }
  const foes: Record<string, FoeRecord> = { ...a.foes };
  for (const [id, f] of Object.entries(b.foes ?? {})) {
    const x = foes[id];
    foes[id] = x ? { met: Math.max(x.met, f.met), beaten: Math.max(x.beaten, f.beaten) } : { ...f };
  }
  return { best: Math.max(a.best, b.best), bestHard: Math.max(a.bestHard, b.bestHard), runs: Math.max(a.runs, b.runs), unlocked, foes };
}

export type FoeStatus = 'unknown' | 'met' | 'defeated';

export function foeStatus(p: Progress, id: string): FoeStatus {
  const f = p.foes[id];
  return !f ? 'unknown' : f.beaten > 0 ? 'defeated' : 'met';
}

/** A stretch against this opponent began (its first round was played). Returns true on the very first meeting. */
export function noteMet(p: Progress, id: string): boolean {
  const f = p.foes[id] ?? (p.foes[id] = { met: 0, beaten: 0 });
  f.met++;
  return f.met === 1;
}

/** You survived a whole stretch against this opponent and reached the store. Returns true on the first defeat. */
export function noteBeaten(p: Progress, id: string): boolean {
  const f = p.foes[id] ?? (p.foes[id] = { met: 1, beaten: 0 });
  f.beaten++;
  return f.beaten === 1;
}

/** Records a run's round count; returns awards newly unlocked. Pure: mutates only `p`. */
export function recordRounds(p: Progress, rounds: number, hard: boolean, seed: number, now = new Date().toISOString()): AwardDef[] {
  p.best = Math.max(p.best, rounds);
  if (hard) p.bestHard = Math.max(p.bestHard, rounds);
  const fresh: AwardDef[] = [];
  for (const a of AWARDS) {
    const k = String(a.rounds);
    if (rounds >= a.rounds) {
      if (!p.unlocked[k]) { p.unlocked[k] = { at: now, hard, seed }; fresh.push(a); }
      else if (hard && !p.unlocked[k].hard) p.unlocked[k].hard = true;
    }
  }
  return fresh;
}

// ---------------- storage ----------------

type DocRef = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
let remote: DocRef | null = null;
let writing: Promise<unknown> = Promise.resolve();

export function loadLocal(): Progress {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return emptyProgress(); }
}

function saveLocal(p: Progress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
}

/** Save everywhere available. Remote writes are serialized (one at a time per document). */
export function saveProgress(p: Progress): void {
  saveLocal(p);
  const ref = remote;
  if (!ref) return;
  const snapshot = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
  writing = writing.then(() => ref.set(snapshot)).catch(() => { /* offline or read-only viewer: local copy still has it */ });
}

/**
 * Connect to the viewer's private cloud record if this page runs on claude.ai with `db`+`user`.
 * Calls `onMerged` with the merged record once connected. Safe to call when neither exists.
 */
export async function connectRemote(get: () => Progress, onMerged: (p: Progress) => void): Promise<void> {
  const claude = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
  if (!claude?.use) return;
  try {
    const [db, user] = (await Promise.all([claude.use('db'), claude.use('user')])) as [
      { collection(path: string): { doc(id: string): DocRef } } | null,
      { id(): Promise<string | null> } | null,
    ];
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    const ref = db.collection(`data/users/${id}`).doc('awards');
    const snap = await ref.get();
    remote = ref;
    const cloud = sanitize(snap.exists ? snap.data() : null);
    const merged = mergeProgress(get(), cloud);
    onMerged(merged);
    if (JSON.stringify(merged) !== JSON.stringify(cloud)) saveProgress(merged);
    else saveLocal(merged);
  } catch { /* stay local */ }
}
