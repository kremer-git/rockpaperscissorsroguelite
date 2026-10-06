# Adversarial tests: trying to build an immortal run

## 1. Best possible per-round loss vs each opponent

Build: every save, charge and information upgrade (27 upgrades), no drawbacks. The player best-responds using the TRUE odds each round and any Mastermind leak. 3000 rounds per opponent at a fixed huge gap (charges only recharge at stores, so they don't help here).

| Opponent | tier | raw loss | effective loss (after saves) | P(survive 55) | P(survive 144) | P(survive 377) |
|---|---|---|---|---|---|---|
| Gary | easy | 7.9% | 3.5% | 14.4% | 0.6% | 0.0% |
| Hank | easy | 10.2% | 3.6% | 13.6% | 0.5% | 0.0% |
| Pam | easy | 9.5% | 5.6% | 4.1% | 0.0% | 0.0% |
| Cassie | easy | 10.9% | 4.4% | 8.6% | 0.2% | 0.0% |
| Otto | easy | 6.9% | 3.4% | 15.2% | 0.7% | 0.0% |
| Polly | easy | 9.7% | 3.9% | 11.4% | 0.3% | 0.0% |
| Lenny | medium | 8.9% | 3.0% | 18.7% | 1.2% | 0.0% |
| Sal | medium | 7.6% | 4.2% | 9.6% | 0.2% | 0.0% |
| Connor | medium | 11.7% | 6.7% | 2.2% | 0.0% | 0.0% |
| Pete | medium | 11.5% | 5.7% | 3.9% | 0.0% | 0.0% |
| Olga | medium | 9.7% | 3.6% | 13.6% | 0.5% | 0.0% |
| Carl | medium | 7.9% | 3.8% | 11.9% | 0.4% | 0.0% |
| Lou | medium | 8.5% | 3.7% | 12.6% | 0.4% | 0.0% |
| Sigrid | hard | 14.7% | 8.9% | 0.6% | 0.0% | 0.0% |
| Miranda | hard | 10.2% | 4.4% | 8.4% | 0.2% | 0.0% |
| Kai | hard | 11.1% | 5.4% | 4.7% | 0.0% | 0.0% |
| Moira | hard | 11.5% | 6.1% | 3.1% | 0.0% | 0.0% |
| Delphine | elite | 17.3% | 9.3% | 0.5% | 0.0% | 0.0% |
| Felix | elite | 16.2% | 5.9% | 3.5% | 0.0% | 0.0% |
| John | elite | 10.2% | 5.3% | 4.9% | 0.0% | 0.0% |

## 2. God build from round 0, optimizer policy

| Variant | runs | median | p90 | p99 | max | gap≥144 | gap≥377 | lives bought (mean) | immortal |
|---|---|---|---|---|---|---|---|---|---|
| god build | 250 | 1287 | 1985 | 2827 | 3160 | 98.0% | 69.2% | 3.1 | 0 |
| god build + 5,000 coins | 250 | 1292 | 1915 | 2312 | 2983 | 97.6% | 70.8% | 2.4 | 0 |
| god build + 1,000,000 coins | 250 | 1371 | 1986 | 2351 | 3114 | 97.6% | 78.0% | 2.5 | 0 |
| every upgrade in the game | 250 | 133 | 190 | 220 | 289 | 0.0% | 0.0% | 1.8 | 0 |

## 3. Economy abuse

- Greedy policy, 1000 runs: max coins ever held 43380, max lives ever held 6.
- Life prices (lifetime escalation ×2): 35, 70, 140, 280, 560, 1120, 2240, 4480, 8960, 17920. With 1,000,000 coins you can buy ~14 lives in a whole run.
- Store rerolls in one visit: 6, 12, 24, 48, 96, 192, 384, 768 … (×2 each).
- Opponent rerolls across a run: 45, 72, 115, 184, 295, 472, 755, 1208 … (×1.6 each).
- Payout bonuses are additive and capped at +300%; save chance is capped at 60% (70% ceiling for Built Different, halved by Glass Cannon).

## 4. Tie-economy runaway check

- Tie policy: 12.0 coins/round, median 28 rounds, tie rate 57.7%.
- Optimizer: 16.3 coins/round, median 31 rounds.
