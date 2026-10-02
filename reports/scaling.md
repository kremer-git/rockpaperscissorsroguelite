# Scaling upgrade report

Each scaling upgrade is granted at round 0 to the optimizer (and to the Rock policy for Rock-streak upgrades). We record the upgrade's live value at rounds 0/5/10/20/50/200/500 (median across 400 runs that were still alive), plus survival when bought **early** (round 0) vs **late** (at store 6).

| Upgrade | Cap | r0 | r5 | r10 | r20 | r50 | r200 | r500 | early: mean rounds | late: mean rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| Muscle Memory | 20% | 0 (n=400) | 20 (n=390) | 16 (n=324) | 20 (n=235) | 4 (n=84) | 4 (n=28) | 4 (n=4) | 54.2 | 46.5 |
| Rock Collection | +5 | 0 (n=400) | 0 (n=387) | 0 (n=318) | 1 (n=217) | 3 (n=70) | 5 (n=22) | 5 (n=4) | 49.7 | 47.6 |
| Geological Advantage | 12% | 0 (n=400) | 0 (n=387) | 1 (n=317) | 2 (n=213) | 6 (n=72) | 12 (n=18) | 12 (n=6) | 48.8 | 47.0 |
| Bedrock | 30% | 0 (n=400) | 20 (n=387) | 20 (n=317) | 30 (n=216) | 30 (n=75) | 30 (n=24) | 30 (n=9) | 53.2 | 48.1 |
| Study Session | 15% | 0 (n=400) | 0 (n=382) | 1 (n=318) | 0 (n=218) | 6 (n=83) | 15 (n=19) | 15 (n=5) | 48.5 | 43.9 |
| Paper Trail | 3 | 0 (n=400) | 1 (n=380) | 2 (n=307) | 0 (n=220) | 3 (n=99) | 3 (n=28) | 3 (n=4) | 55.5 | 45.6 |
| Peer Review | 4 | 0 (n=400) | 2 (n=381) | 3 (n=316) | 3 (n=259) | 4 (n=137) | 4 (n=45) | 4 (n=5) | 77.8 | 52.8 |
| Contingency Plan | 1 | 1 (n=400) | 1 (n=400) | 1 (n=400) | 1 (n=389) | 0 (n=270) | 0 (n=93) | 0 (n=14) | 142.5 | 53.4 |
| Close Shave | 6 | 0 (n=400) | 1 (n=381) | 1 (n=315) | 2 (n=216) | 5 (n=80) | 6 (n=19) | 6 (n=3) | 49.6 | 43.9 |
| Momentum | +100% | 0 (n=400) | 10 (n=381) | 0 (n=316) | 0 (n=223) | 10 (n=86) | 10 (n=17) | 20 (n=2) | 46.7 | 43.6 |
| Sharpening Stone | +12 | 0 (n=400) | 0 (n=381) | 1 (n=313) | 1 (n=215) | 3 (n=75) | 10 (n=19) | 5 (n=1) | 49.7 | 44.4 |
| Hush Money | price doubles per use | 0 (n=400) | 0 (n=381) | 0 (n=339) | 0 (n=275) | 1 (n=161) | 4 (n=37) | 6 (n=3) | 76.0 | 58.5 |

Every scaling value is bounded by its cap (or resets on a streak break / opponent change / life loss), so none can grow without limit.
