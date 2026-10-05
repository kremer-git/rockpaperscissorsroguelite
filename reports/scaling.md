# Scaling upgrade report

Each scaling upgrade is granted at round 0 to the optimizer (and to the Rock policy for Rock-streak upgrades). We record the upgrade's live value at rounds 0/5/10/20/50/200/500 (median across 400 runs that were still alive), plus survival when bought **early** (round 0) vs **late** (at store 6).

| Upgrade | Cap | r0 | r5 | r10 | r20 | r50 | r200 | r500 | early: mean rounds | late: mean rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| Muscle Memory | 20% | 0 (n=400) | 8 (n=400) | 16 (n=381) | 20 (n=317) | 4 (n=134) | 8 (n=45) | 12 (n=11) | 80.4 | 80.1 |
| Rock Collection | +5 | 0 (n=400) | 0 (n=400) | 0 (n=380) | 1 (n=300) | 3 (n=136) | 5 (n=41) | 5 (n=13) | 81.2 | 84.6 |
| Geological Advantage | 12% | 0 (n=400) | 0 (n=400) | 1 (n=379) | 2 (n=299) | 6 (n=135) | 12 (n=49) | 12 (n=12) | 85.2 | 80.1 |
| Bedrock | 30% | 0 (n=400) | 20 (n=400) | 20 (n=380) | 30 (n=299) | 30 (n=137) | 30 (n=51) | 30 (n=10) | 84.7 | 83.4 |
| Study Session | 15% | 0 (n=400) | 0 (n=398) | 1 (n=378) | 0 (n=305) | 6 (n=136) | 15 (n=35) | 15 (n=7) | 71.5 | 63.6 |
| Paper Trail | 3 | 0 (n=400) | 1 (n=398) | 2 (n=374) | 0 (n=301) | 3 (n=141) | 3 (n=38) | 3 (n=6) | 74.5 | 69.6 |
| Peer Review | 4 | 0 (n=400) | 1 (n=398) | 3 (n=379) | 3 (n=335) | 4 (n=191) | 4 (n=67) | 4 (n=7) | 103.0 | 76.5 |
| Contingency Plan | 1 | 1 (n=400) | 1 (n=400) | 1 (n=400) | 1 (n=398) | 0 (n=328) | 0 (n=122) | 0 (n=16) | 168.6 | 75.8 |
| Close Shave | 6 | 0 (n=400) | 1 (n=398) | 2 (n=376) | 3 (n=298) | 6 (n=127) | 6 (n=35) | 6 (n=5) | 68.6 | 62.9 |
| Momentum | +100% | 0 (n=400) | 10 (n=397) | 0 (n=374) | 0 (n=294) | 10 (n=129) | 10 (n=33) | 0 (n=3) | 67.1 | 62.3 |
| Sharpening Stone | +12 | 0 (n=400) | 0 (n=398) | 1 (n=375) | 1 (n=295) | 2 (n=125) | 4 (n=31) | — | 64.3 | 57.2 |
| Hush Money | price doubles per use | 0 (n=400) | 0 (n=398) | 0 (n=382) | 0 (n=350) | 1 (n=223) | 3 (n=62) | 5 (n=9) | 107.5 | 83.5 |

Every scaling value is bounded by its cap (or resets on a streak break / opponent change / life loss), so none can grow without limit.
