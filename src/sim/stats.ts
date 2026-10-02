import type { RunMetrics } from './runner';

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i];
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export interface Summary {
  n: number;
  mean: number; median: number; min: number; max: number;
  p25: number; p75: number; p90: number; p95: number; p99: number;
  reachStore: number[]; // P(visited ≥ k stores), k = 1..14
  survivedGap: Record<number, number>; // P(longest gap survived ≥ g)
  avgEarned: number; avgSpent: number; avgUpgrades: number;
  avgLivesBought: number; avgLivesUsed: number; avgStoreRerolls: number; avgOppRerolls: number;
  winPct: number; tiePct: number; lossPct: number; savePct: number;
  deathByTier: Record<string, number>;
  deathByOpponent: Record<string, number>;
  immortal: number;
  archetypes: Record<string, number>;
  maxCurrency: number;
  maxLivesHeld: number;
}

export function summarize(ms: RunMetrics[]): Summary {
  const r = ms.map((m) => m.rounds).sort((a, b) => a - b);
  const n = ms.length;
  const totalRounds = ms.reduce((a, m) => a + m.rounds, 0) || 1;
  const count = <K extends string>(f: (m: RunMetrics) => K) => {
    const o: Record<string, number> = {};
    ms.forEach((m) => { const k = f(m); o[k] = (o[k] ?? 0) + 1 / n; });
    return o;
  };
  const gaps = [8, 13, 21, 34, 55, 89, 144, 233];
  const survivedGap: Record<number, number> = {};
  for (const g of gaps) survivedGap[g] = ms.filter((m) => m.longestGapSurvived >= g).length / n;
  return {
    n,
    mean: mean(r), median: quantile(r, 0.5), min: r[0] ?? 0, max: r[r.length - 1] ?? 0,
    p25: quantile(r, 0.25), p75: quantile(r, 0.75), p90: quantile(r, 0.9), p95: quantile(r, 0.95), p99: quantile(r, 0.99),
    reachStore: Array.from({ length: 14 }, (_, k) => ms.filter((m) => m.stores >= k + 1).length / n),
    survivedGap,
    avgEarned: mean(ms.map((m) => m.currencyEarned)), avgSpent: mean(ms.map((m) => m.currencySpent)),
    avgUpgrades: mean(ms.map((m) => m.upgrades)), avgLivesBought: mean(ms.map((m) => m.livesPurchased)),
    avgLivesUsed: mean(ms.map((m) => m.livesConsumed)), avgStoreRerolls: mean(ms.map((m) => m.storeRerolls)),
    avgOppRerolls: mean(ms.map((m) => m.opponentRerolls)),
    winPct: ms.reduce((a, m) => a + m.wins, 0) / totalRounds,
    tiePct: ms.reduce((a, m) => a + m.ties, 0) / totalRounds,
    lossPct: ms.reduce((a, m) => a + m.losses, 0) / totalRounds,
    savePct: ms.reduce((a, m) => a + m.saves, 0) / totalRounds,
    deathByTier: count((m) => (m.immortal ? 'none' : m.deathTier)),
    deathByOpponent: count((m) => (m.immortal ? 'none' : m.deathOpponent)),
    immortal: ms.filter((m) => m.immortal).length,
    archetypes: count((m) => m.archetype),
    maxCurrency: Math.max(...ms.map((m) => m.maxCurrency)),
    maxLivesHeld: Math.max(...ms.map((m) => m.maxLivesHeld)),
  };
}

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const f1 = (x: number) => x.toFixed(1);

export function summaryHeader(): string {
  return '| Policy | n | mean | median | p25 | p75 | p90 | p95 | p99 | max | store≥3 | store≥6 | store≥8 | store≥10 | gap≥34 | gap≥55 | gap≥89 | win% | tie% | loss% | saves% | lives bought | lives used | earned | immortal |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
}

export function summaryRow(label: string, s: Summary): string {
  return `| ${label} | ${s.n} | ${f1(s.mean)} | ${s.median} | ${s.p25} | ${s.p75} | ${s.p90} | ${s.p95} | ${s.p99} | ${s.max} | ${pc(s.reachStore[2])} | ${pc(s.reachStore[5])} | ${pc(s.reachStore[7])} | ${pc(s.reachStore[9])} | ${pc(s.survivedGap[34])} | ${pc(s.survivedGap[55])} | ${pc(s.survivedGap[89])} | ${pc(s.winPct)} | ${pc(s.tiePct)} | ${pc(s.lossPct)} | ${pc(s.savePct)} | ${f1(s.avgLivesBought)} | ${f1(s.avgLivesUsed)} | ${Math.round(s.avgEarned)} | ${s.immortal} |`;
}

export { pc, f1 };
