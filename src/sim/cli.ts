// Balance simulator CLI.
//   npm run sim                 -> all reports (default 2000 runs per policy)
//   npm run sim -- summary 5000 -> just the policy summary with 5000 runs each
// Subcommands: summary | curves | stages | upgrades | scaling | adversarial | economy | samples | all
import { writeFileSync, mkdirSync } from 'node:fs';
import { POLICIES, getPolicy } from './policies';
import { runMany, runOne, grant, type RunMetrics } from './runner';
import { summarize, summaryHeader, summaryRow, pc, f1, mean, quantile } from './stats';
import { CURVES, getCurve } from '../core/intervals';
import { CONFIG } from '../core/config';
import { UPGRADES, getUpgrade } from '../core/registry';
import { OPPONENTS } from '../content/opponents';
import { createRun, playRound, leaveStore } from '../core/engine';
import { dbgAddUpgrade, dbgSetOpponent, dbgJumpToStage, dbgAddCurrency } from '../core/debug';
import { effectiveSaveChance } from '../core/rules';
import { beliefFromIntel, getIntel } from '../core/intel';
import { outcomeProbs } from '../core/rps';
import type { Dist, GameState, Move } from '../core/types';

const OUT = 'reports';
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const cmd = args[0] ?? 'all';
const N = Number(args[1] ?? 2000);
const CAP = 20000;

function write(name: string, body: string) {
  writeFileSync(`${OUT}/${name}`, body);
  console.log(`wrote ${OUT}/${name}`);
}

// ------------------------------------------------------------------ summary
function summary(n: number, mode: 'normal' | 'hard' = 'normal'): string {
  let md = `# Policy summary (${n} runs each, curve: ${CONFIG.curve}, ${mode} mode)\n\n`;
  md += 'Rounds survived per run. `store≥k` = share of runs that reached store k. `gap≥g` = share that survived a whole store gap of at least g rounds.\n\n';
  md += summaryHeader() + '\n';
  const all: RunMetrics[] = [];
  const perPolicy: Record<string, RunMetrics[]> = {};
  for (const p of POLICIES) {
    const ms = runMany(p, n, 1, undefined, { roundCap: CAP, mode });
    perPolicy[p.id] = ms;
    if (p.id !== 'random') all.push(...ms);
    md += summaryRow(p.label, summarize(ms)) + '\n';
  }
  // archetype breakdown across all non-random runs (classified by final build)
  const byArch: Record<string, RunMetrics[]> = {};
  for (const m of all) (byArch[m.archetype] ??= []).push(m);
  md += `\n## By build archetype (all non-random policies pooled, classified by final build)\n\nCaution: survivorship-biased. Short runs die with 2-4 upgrades and look "tree-heavy"; long runs buy almost everything and look "three-tree". Compare policies above for fair archetype comparisons.\n\n` + summaryHeader() + '\n';
  for (const [k, ms] of Object.entries(byArch).sort((a, b) => b[1].length - a[1].length)) md += summaryRow(k, summarize(ms)) + '\n';
  // deaths
  const s = summarize(all);
  md += `\n## Cause of death (non-random policies)\n\nBy opponent tier: ${Object.entries(s.deathByTier).map(([k, v]) => `${k} ${pc(v)}`).join(', ')}\n\n`;
  md += `By opponent: ${Object.entries(s.deathByOpponent).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pc(v)}`).join(', ')}\n\n`;
  md += `Max currency ever held: ${Math.round(s.maxCurrency)}. Max Extra Lives ever held: ${s.maxLivesHeld}. Runs hitting the ${CAP}-round safety cap ("immortal"): ${s.immortal}.\n`;
  // reach-store table
  md += `\n## Probability of reaching each store\n\n| Policy | ${Array.from({ length: 12 }, (_, i) => `#${i + 1} (r${cumRounds(i)})`).join(' | ')} |\n|---|${'---|'.repeat(12)}\n`;
  for (const p of POLICIES) {
    const sm = summarize(perPolicy[p.id]);
    md += `| ${p.label} | ${sm.reachStore.slice(0, 12).map(pc).join(' | ')} |\n`;
  }
  return md;
}

function cumRounds(storeIdx: number): number {
  const c = getCurve(CONFIG.curve);
  let t = 0;
  for (let i = 0; i <= storeIdx; i++) t += c.gap(i);
  return t;
}

// ------------------------------------------------------------------ curves
function curves(n: number): string {
  let md = `# Store-interval curve comparison (${n} runs per policy per curve)\n\n`;
  md += '| Curve | first gaps | Policy | median | p75 | p90 | p99 | max | store≥6 | store≥8 | gap≥34 | gap≥55 | gap≥89 | stores at death (median) | immortal |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const c of CURVES) {
    const gaps = Array.from({ length: 11 }, (_, i) => c.gap(i)).join(',');
    for (const pid of ['baseline', 'optimizer', 'rock']) {
      const ms = runMany(getPolicy(pid), n, 1, c.id, { roundCap: CAP });
      const s = summarize(ms);
      const st = ms.map((m) => m.stores).sort((a, b) => a - b);
      md += `| ${c.id} | ${gaps} | ${pid} | ${s.median} | ${s.p75} | ${s.p90} | ${s.p99} | ${s.max} | ${pc(s.reachStore[5])} | ${pc(s.reachStore[7])} | ${pc(s.survivedGap[34])} | ${pc(s.survivedGap[55])} | ${pc(s.survivedGap[89])} | ${quantile(st, 0.5)} | ${s.immortal} |\n`;
    }
  }
  return md;
}

// ------------------------------------------------------------------ stages
function stages(n: number): string {
  let md = `# Loss rate by stage (${n} runs per policy)\n\nRaw = RPS losses per round. Effective = losses that were not saved (cost a life or ended the run).\n\n`;
  for (const pid of ['baseline', 'optimizer', 'rock', 'paper', 'scissors', 'tie']) {
    const agg: Record<number, { n: number; raw: number; eff: number; saved: number }> = {};
    for (let i = 0; i < n; i++) {
      const { s } = runOne(getPolicy(pid), 7 + i * 13, undefined, { roundCap: CAP });
      for (const r of s.history) {
        const a = (agg[r.stage] ??= { n: 0, raw: 0, eff: 0, saved: 0 });
        a.n++; if (r.rawOutcome === 'LOSS') a.raw++; if (r.outcome === 'LOSS') a.eff++; if (r.saved) a.saved++;
      }
    }
    md += `## ${pid}\n\n| Stage | gap | rounds played | raw loss | saved | effective loss | P(survive whole gap) at this rate |\n|---|---|---|---|---|---|---|\n`;
    for (const k of Object.keys(agg).map(Number).sort((a, b) => a - b)) {
      const a = agg[k];
      if (a.n < 50) continue;
      const gap = getCurve(CONFIG.curve).gap(k);
      const eff = a.eff / a.n;
      md += `| ${k} | ${gap} | ${a.n} | ${pc(a.raw / a.n)} | ${pc(a.saved / a.n)} | ${pc(eff)} | ${pc(Math.pow(1 - eff, gap))} |\n`;
    }
    md += '\n';
  }
  return md;
}

// ------------------------------------------------------------------ upgrades
function upgrades(n: number): string {
  // "Owned" stats are confounded (long runs buy more), so the main measure grants the upgrade at
  // round 0 to the policy that matches its tree and compares against that policy without it.
  const ms: RunMetrics[] = [];
  for (const pid of ['baseline', 'optimizer', 'rock', 'paper', 'scissors', 'tie', 'greedy', 'survival']) ms.push(...runMany(getPolicy(pid), Math.floor(n / 2), 99, undefined, { roundCap: CAP }));
  const treePolicy: Record<string, string> = { rock: 'rock', paper: 'paper', scissors: 'scissors' };
  const plain: Record<string, ReturnType<typeof summarize>> = {};
  for (const t of Object.values(treePolicy)) plain[t] = summarize(runMany(getPolicy(t), n, 5, undefined, { roundCap: CAP }));
  let md = `# Upgrade report\n\nMain measure: the upgrade is **granted at round 0** to the policy matching its tree (${n} runs), compared with the same policy without it. Survival to store 6 (round 32) and median rounds are used because means are dominated by rare 1000-round runs. Granting at round 0 exaggerates upgrades that shine early (charges that recharge every store), so rarity/price is part of the verdict.\n\n`;
  md += Object.entries(plain).map(([k, v]) => `- Plain ${k} policy: median ${v.median}, store≥6 ${pc(v.reachStore[5])}, gap≥34 ${pc(v.survivedGap[34])}`).join('\n') + '\n\n';
  md += '| Upgrade | Tree | Rarity | Cost | pick rate (all policies) | granted: median | granted: store≥6 | Δ store≥6 vs plain | granted: gap≥34 | verdict |\n|---|---|---|---|---|---|---|---|---|---|\n';
  const rows: { d: string; delta: number }[] = [];
  for (const u of UPGRADES) {
    const pid = treePolicy[u.tree];
    const own = ms.filter((m) => m.owned.includes(u.id));
    const g = summarize(runMany(getPolicy(pid), n, 5, undefined, { roundCap: CAP, setup: grant([u.id]) }));
    const base = plain[pid];
    const delta = g.reachStore[5] - base.reachStore[5];
    const rel = delta / Math.max(0.01, base.reachStore[5]);
    const verdict = rel > 1.2 ? 'very strong (rarity must justify)' : rel > 0.4 ? 'strong' : rel > 0.1 ? 'solid' : rel > -0.1 ? 'situational / economy' : 'drawback outweighs for this policy';
    rows.push({ delta, d: `| ${u.name} | ${u.tree} | ${u.rarity} | ${u.cost} | ${pc(own.length / ms.length)} | ${g.median} | ${pc(g.reachStore[5])} | ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pts | ${pc(g.survivedGap[34])} | ${verdict} |` });
  }
  rows.sort((a, b) => b.delta - a.delta);
  md += rows.map((r) => r.d).join('\n') + '\n';
  md += '\n## Tree representation in final builds (all policies)\n\n';
  const treeCount: Record<string, number> = { rock: 0, paper: 0, scissors: 0 };
  ms.forEach((m) => m.owned.forEach((id) => treeCount[getUpgrade(id).tree]++));
  const tot = treeCount.rock + treeCount.paper + treeCount.scissors;
  md += Object.entries(treeCount).map(([k, v]) => `- ${k}: ${pc(v / tot)}`).join('\n') + '\n';
  return md;
}

// ------------------------------------------------------------------ scaling
function scaling(n: number): string {
  let md = `# Scaling upgrade report\n\nEach scaling upgrade is granted at round 0 to the optimizer (and to the Rock policy for Rock-streak upgrades). We record the upgrade's live value at rounds 0/5/10/20/50/200/500 (median across ${n} runs that were still alive), plus survival when bought **early** (round 0) vs **late** (at store 6).\n\n`;
  const checkpoints = [0, 5, 10, 20, 50, 200, 500];
  md += `| Upgrade | Cap | ${checkpoints.map((c) => `r${c}`).join(' | ')} | early: mean rounds | late: mean rounds |\n|---|---|${checkpoints.map(() => '---|').join('')}---|---|\n`;
  for (const u of UPGRADES.filter((x) => x.scaling)) {
    const pol = getPolicy(u.tree === 'rock' ? 'rock' : 'optimizer');
    const vals: Record<number, number[]> = {};
    const early = runMany(pol, n, 11, undefined, {
      roundCap: 600, setup: grant([u.id]),
      onRound: (s) => {
        if (!checkpoints.includes(s.round)) return;
        const own = s.owned.find((o) => o.id === u.id);
        if (!own) return;
        const v = parseFloat((u.scaling!.value(s, own).match(/-?\d+(\.\d+)?/) ?? ['0'])[0]);
        (vals[s.round] ??= []).push(v);
      },
    });
    const late = runMany(pol, n, 11, undefined, {
      roundCap: 600,
      onRound: (s) => { if (s.storesVisited >= 6 && !s.owned.some((o) => o.id === u.id)) dbgAddUpgrade(s, u.id); },
    });
    const cell = (c: number) => (vals[c]?.length ? `${quantile(vals[c].sort((a, b) => a - b), 0.5)} (n=${vals[c].length})` : '—');
    md += `| ${u.name} | ${u.scaling!.cap} | ${checkpoints.map(cell).join(' | ')} | ${f1(mean(early.map((m) => m.rounds)))} | ${f1(mean(late.map((m) => m.rounds)))} |\n`;
  }
  md += '\nEvery scaling value is bounded by its cap (or resets on a streak break / opponent change / life loss), so none can grow without limit.\n';
  return md;
}

// ------------------------------------------------------------------ adversarial
function adversarial(n: number): string {
  let md = '# Adversarial tests: trying to build an immortal run\n\n';
  const saveIds = UPGRADES.filter((u) => u.tags.includes('save') || u.tags.includes('charge')).map((u) => u.id);
  const infoIds = UPGRADES.filter((u) => u.tags.includes('info') || u.tags.includes('prediction')).map((u) => u.id).filter((id) => id !== 'no-thoughts');
  const godIds = [...new Set([...saveIds, ...infoIds, 'rocks-are-heavy', 'this-seems-fine', 'insurance-fraud', 'bedrock'])]
    .filter((id) => !['no-thoughts', 'glass-cannon', 'no-safety-net', 'high-stakes', 'absolute-unit'].includes(id));

  // 1) Per-opponent floor with the god build and perfect play (true odds + leaks).
  md += `## 1. Best possible per-round loss vs each opponent\n\nBuild: every save, charge and information upgrade (${godIds.length} upgrades), no drawbacks. The player best-responds using the TRUE odds each round and any Mastermind leak. 3000 rounds per opponent at a fixed huge gap (charges only recharge at stores, so they don't help here).\n\n| Opponent | tier | raw loss | effective loss (after saves) | P(survive 55) | P(survive 144) | P(survive 377) |\n|---|---|---|---|---|---|---|\n`;
  for (const o of OPPONENTS) {
    const s = createRun({ seed: 42, startingLives: 0 });
    godIds.forEach((id) => dbgAddUpgrade(s, id));
    dbgJumpToStage(s, 20);
    s.currentGap = 1e9;
    dbgSetOpponent(s, o.id);
    s.pendingOpponentMove = null;
    let raw = 0, eff = 0;
    const R = 3000;
    for (let i = 0; i < R; i++) {
      s.lives = 1e6; // measure, don't die
      s.currency = 0; // no Hush Money in this test
      const v = getIntel(s, { light: true });
      const d: Dist = v.leaked ? beliefFromIntel(v).dist : (s.pendingOpponentDist ?? [1 / 3, 1 / 3, 1 / 3]);
      const m = (['R', 'P', 'S'] as Move[]).map((mv) => ({ mv, l: outcomeProbs(mv, d).loss * (1 - effectiveSaveChance(s, mv)) })).sort((a, b) => a.l - b.l)[0].mv;
      const r = playRound(s, m);
      if (r.record.rawOutcome === 'LOSS') raw++;
      if (r.record.outcome === 'LOSS') eff++;
    }
    const e = eff / R;
    md += `| ${o.name} | ${o.tier} | ${pc(raw / R)} | ${pc(e)} | ${pc(Math.pow(1 - e, 55))} | ${pc(Math.pow(1 - e, 144))} | ${pc(Math.pow(1 - e, 377))} |\n`;
  }

  // 2) God build + optimizer + unlimited starting money.
  md += `\n## 2. God build from round 0, optimizer policy\n\n`;
  const variants: [string, (s: GameState) => void][] = [
    ['god build', (s) => godIds.forEach((id) => dbgAddUpgrade(s, id))],
    ['god build + 5,000 coins', (s) => { godIds.forEach((id) => dbgAddUpgrade(s, id)); dbgAddCurrency(s, 5000); }],
    ['god build + 1,000,000 coins', (s) => { godIds.forEach((id) => dbgAddUpgrade(s, id)); dbgAddCurrency(s, 1_000_000); }],
    ['every upgrade in the game', (s) => UPGRADES.forEach((u) => { for (let k = 0; k < u.maxStacks; k++) dbgAddUpgrade(s, u.id); })],
  ];
  md += '| Variant | runs | median | p90 | p99 | max | gap≥144 | gap≥377 | lives bought (mean) | immortal |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const [label, setup] of variants) {
    const ms = runMany(getPolicy('optimizer'), Math.max(200, Math.floor(n / 4)), 3, undefined, { roundCap: CAP, setup });
    const s = summarize(ms);
    md += `| ${label} | ${s.n} | ${s.median} | ${s.p90} | ${s.p99} | ${s.max} | ${pc(s.survivedGap[144])} | ${pc(ms.filter((m) => m.longestGapSurvived >= 377).length / ms.length)} | ${f1(s.avgLivesBought)} | ${s.immortal} |\n`;
  }

  // 3) Economy abuse checks.
  md += `\n## 3. Economy abuse\n\n`;
  const econ = runMany(getPolicy('greedy'), n, 17, undefined, { roundCap: CAP });
  const es = summarize(econ);
  md += `- Greedy policy, ${n} runs: max coins ever held ${Math.round(es.maxCurrency)}, max lives ever held ${es.maxLivesHeld}.\n`;
  const s = createRun({ seed: 1 });
  md += `- Life prices (lifetime escalation ×${CONFIG.store.lifeGrowth}): ${Array.from({ length: 10 }, (_, k) => Math.round(CONFIG.store.lifeBase * Math.pow(CONFIG.store.lifeGrowth, k))).join(', ')}. With 1,000,000 coins you can buy ~${Math.floor(Math.log(1_000_000 / CONFIG.store.lifeBase * (CONFIG.store.lifeGrowth - 1) + 1) / Math.log(CONFIG.store.lifeGrowth))} lives in a whole run.\n`;
  md += `- Store rerolls in one visit: ${Array.from({ length: 8 }, (_, k) => Math.round(CONFIG.store.rerollBase * Math.pow(CONFIG.store.rerollGrowth, k))).join(', ')} … (×${CONFIG.store.rerollGrowth} each).\n`;
  md += `- Opponent rerolls across a run: ${Array.from({ length: 8 }, (_, k) => Math.round(CONFIG.store.opponentRerollBase * Math.pow(CONFIG.store.opponentRerollGrowth, k))).join(', ')} … (×${CONFIG.store.opponentRerollGrowth} each).\n`;
  md += `- Payout bonuses are additive and capped at +${CONFIG.maxPayoutBonus * 100}%; save chance is capped at ${CONFIG.saveCap * 100}% (${CONFIG.saveCapCeiling * 100}% ceiling for Built Different, halved by Glass Cannon).\n`;
  void s;

  // 4) Tie runaway
  md += `\n## 4. Tie-economy runaway check\n\n`;
  const tieMs = runMany(getPolicy('tie'), n, 23, undefined, { roundCap: CAP });
  const optMs = runMany(getPolicy('optimizer'), n, 23, undefined, { roundCap: CAP });
  const perRound = (xs: RunMetrics[]) => mean(xs.map((m) => m.currencyEarned / Math.max(1, m.rounds)));
  md += `- Tie policy: ${f1(perRound(tieMs))} coins/round, median ${summarize(tieMs).median} rounds, tie rate ${pc(summarize(tieMs).tiePct)}.\n`;
  md += `- Optimizer: ${f1(perRound(optMs))} coins/round, median ${summarize(optMs).median} rounds.\n`;
  return md;
}

// ------------------------------------------------------------------ samples (manual QA narratives)
function samples(): string {
  let md = '# Representative runs (for manual inspection)\n\nPicked from 3000 optimizer runs: a bad run, an average run, a good run, an excellent run, and the longest final stretch.\n\n';
  const runs: { m: RunMetrics; s: GameState }[] = [];
  for (let i = 0; i < 3000; i++) runs.push(runOne(getPolicy('optimizer'), 500 + i * 17, undefined, { roundCap: CAP }));
  runs.sort((a, b) => a.m.rounds - b.m.rounds);
  const pick = (q: number) => runs[Math.min(runs.length - 1, Math.floor(q * runs.length))];
  const labels: [string, ReturnType<typeof pick>][] = [
    ['Bad run (10th percentile)', pick(0.1)], ['Average run (median)', pick(0.5)], ['Good run (90th percentile)', pick(0.9)],
    ['Excellent run (99th percentile)', pick(0.99)], ['Longest run of 3000', runs[runs.length - 1]],
  ];
  for (const [label, { m, s }] of labels) {
    md += `## ${label}: ${m.rounds} rounds, ${m.stores} stores\n\n`;
    md += `- Died: ${s.causeOfDeath}\n- Build (${m.upgrades}): ${m.owned.map((id) => getUpgrade(id).name).join(', ') || 'nothing'}\n`;
    md += `- Lives bought ${m.livesPurchased}, used ${m.livesConsumed}. Saves ${m.saves}. Coins earned ${m.currencyEarned}.\n`;
    const byStage: Record<number, { n: number; l: number; sv: number }> = {};
    s.history.forEach((r) => { const a = (byStage[r.stage] ??= { n: 0, l: 0, sv: 0 }); a.n++; if (r.rawOutcome === 'LOSS') a.l++; if (r.saved) a.sv++; });
    md += `- Stage by stage (rounds / raw losses / saves): ${Object.entries(byStage).map(([k, v]) => `S${k}: ${v.n}/${v.l}/${v.sv}`).join(' · ')}\n\n`;
  }
  return md;
}

// ------------------------------------------------------------------ economy
function economy(n: number): string {
  let md = `# Economy report (${n} runs per policy)\n\n| Policy | coins/round | earned (mean) | spent (mean) | upgrades (mean) | lives bought | lives used | store rerolls | opp rerolls | max coins held |\n|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const p of POLICIES) {
    const ms = runMany(p, n, 31, undefined, { roundCap: CAP });
    const s = summarize(ms);
    md += `| ${p.label} | ${f1(mean(ms.map((m) => m.currencyEarned / Math.max(1, m.rounds))))} | ${Math.round(s.avgEarned)} | ${Math.round(s.avgSpent)} | ${f1(s.avgUpgrades)} | ${f1(s.avgLivesBought)} | ${f1(s.avgLivesUsed)} | ${f1(s.avgStoreRerolls)} | ${f1(s.avgOppRerolls)} | ${Math.round(s.maxCurrency)} |\n`;
  }
  return md;
}

// ------------------------------------------------------------------ encounters
function encounters(n: number): string {
  // Which opponents players actually meet, by stage band (optimizer policy, no forced swaps beyond its own).
  const bands: [string, number, number][] = [['stores 0–3 (rounds 1–11)', 0, 3], ['stores 4–6 (rounds 12–53)', 4, 6], ['stores 7–9 (rounds 54–231)', 7, 9], ['store 10+ (round 232+)', 10, 99]];
  const count: Record<string, number[]> = {};
  const totals = bands.map(() => 0);
  for (const o of OPPONENTS) count[o.id] = bands.map(() => 0);
  for (let i = 0; i < n; i++) {
    const { s } = runOne(getPolicy('optimizer'), 17 + i * 31, undefined, { roundCap: CAP });
    const stageOpp: Record<number, string> = {};
    s.history.forEach((r, k) => { void k; stageOpp[r.stage] = stageOpp[r.stage] ?? ''; });
    // opponentsEncountered is in stage order (first appearance), which matches stages played.
    s.stats.opponentsEncountered.forEach((id, stage) => {
      const b = bands.findIndex(([, lo, hi]) => stage >= lo && stage <= hi);
      if (b >= 0 && stage <= s.stage) { count[id][b]++; totals[b]++; }
    });
  }
  let md = `# Who you actually meet (${n} optimizer runs)\n\nShare of stages in each band fought against each opponent. Tier gates come from \`CONFIG.opponentTierWeights\`; the cycle rule means nobody repeats until everyone reachable has appeared.\n\n| Opponent | tier | ${bands.map(([l]) => l).join(' | ')} |\n|---|---|${bands.map(() => '---|').join('')}\n`;
  for (const o of OPPONENTS) md += `| ${o.name} (${o.archetype}) | ${o.tier} | ${count[o.id].map((c, b) => (totals[b] ? pc(c / totals[b]) : '—')).join(' | ')} |\n`;
  md += `| **stages observed** | | ${totals.join(' | ')} |\n`;
  return md;
}

const t0 = Date.now();
if (cmd === 'summary' || cmd === 'all') write('summary.md', summary(N));
if (cmd === 'hard' || cmd === 'all') write('summary-hard.md', summary(N, 'hard'));
if (cmd === 'encounters' || cmd === 'all') write('encounters.md', encounters(Math.min(N, 2000)));
if (cmd === 'curves' || cmd === 'all') write('curves.md', curves(Math.min(N, 1500)));
if (cmd === 'stages' || cmd === 'all') write('stages.md', stages(Math.min(N, 1500)));
if (cmd === 'economy' || cmd === 'all') write('economy.md', economy(Math.min(N, 1500)));
if (cmd === 'upgrades' || cmd === 'all') write('upgrades.md', upgrades(Math.min(N, 800)));
if (cmd === 'scaling' || cmd === 'all') write('scaling.md', scaling(Math.min(N, 400)));
if (cmd === 'adversarial' || cmd === 'all') write('adversarial.md', adversarial(Math.min(N, 1000)));
if (cmd === 'samples' || cmd === 'all') write('samples.md', samples());
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
void leaveStore; void effectiveSaveChance;
