# Scaling upgrade report

Each scaling upgrade is granted at round 0 to the optimizer (and to the Rock policy for Rock-streak upgrades). We record the upgrade's live value at rounds 0/5/10/20/50/200/500 (median across 400 runs that were still alive), plus survival when bought **early** (round 0) vs **late** (at store 6).

| Upgrade | Cap | r0 | r5 | r10 | r20 | r50 | r200 | r500 | early: mean rounds | late: mean rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| Muscle Memory | 20% | 0 (n=400) | 20 (n=390) | 16 (n=324) | 20 (n=235) | 4 (n=87) | 4 (n=32) | 4 (n=8) | 59.8 | 51.5 |
| Rock Collection | +5 | 0 (n=400) | 0 (n=387) | 0 (n=318) | 1 (n=217) | 3 (n=73) | 5 (n=24) | 5 (n=5) | 51.3 | 50.8 |
| Geological Advantage | 12% | 0 (n=400) | 0 (n=387) | 1 (n=317) | 2 (n=213) | 6 (n=77) | 12 (n=28) | 12 (n=11) | 58.9 | 53.4 |
| Bedrock | 30% | 0 (n=400) | 20 (n=387) | 20 (n=317) | 30 (n=216) | 30 (n=78) | 30 (n=28) | 30 (n=9) | 55.9 | 49.5 |
| Study Session | 15% | 0 (n=400) | 0 (n=382) | 1 (n=318) | 0 (n=214) | 6 (n=82) | 15 (n=21) | 15 (n=5) | 49.6 | 41.9 |
| Paper Trail | 3 | 0 (n=400) | 1 (n=380) | 2 (n=307) | 0 (n=219) | 3 (n=97) | 3 (n=23) | 3 (n=4) | 52.4 | 44.7 |
| Peer Review | 4 | 0 (n=400) | 2 (n=381) | 3 (n=316) | 3 (n=258) | 4 (n=141) | 4 (n=48) | 4 (n=4) | 75.4 | 48.2 |
| Contingency Plan | 1 | 1 (n=400) | 1 (n=400) | 1 (n=400) | 1 (n=388) | 0 (n=270) | 0 (n=96) | 0 (n=11) | 140.6 | 50.8 |
| Close Shave | 6 | 0 (n=400) | 1 (n=381) | 1 (n=316) | 2 (n=213) | 5 (n=84) | 6 (n=20) | 6 (n=2) | 47.4 | 41.3 |
| Momentum | +100% | 0 (n=400) | 10 (n=381) | 0 (n=317) | 0 (n=222) | 0 (n=91) | 20 (n=19) | 0 (n=4) | 48.5 | 41.0 |
| Sharpening Stone | +12 | 0 (n=400) | 0 (n=381) | 1 (n=314) | 1 (n=212) | 3 (n=74) | 7 (n=20) | 8 (n=1) | 44.8 | 40.4 |
| Hush Money | price doubles per use | 0 (n=400) | 0 (n=381) | 0 (n=339) | 0 (n=276) | 1 (n=159) | 2 (n=38) | 5 (n=5) | 75.6 | 54.9 |

Every scaling value is bounded by its cap (or resets on a streak break / opponent change / life loss), so none can grow without limit.
