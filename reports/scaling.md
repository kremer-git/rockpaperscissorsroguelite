# Scaling upgrade report

Each scaling upgrade is granted at round 0 to the optimizer (and to the Rock policy for Rock-streak upgrades). We record the upgrade's live value at rounds 0/5/10/20/50/200/500 (median across 400 runs that were still alive), plus survival when bought **early** (round 0) vs **late** (at store 6).

| Upgrade | Cap | r0 | r5 | r10 | r20 | r50 | r200 | r500 | early: mean rounds | late: mean rounds |
|---|---|---|---|---|---|---|---|---|---|---|
| Muscle Memory | 20% | 0 (n=400) | 8 (n=400) | 16 (n=381) | 20 (n=318) | 4 (n=136) | 8 (n=46) | 12 (n=12) | 82.4 | 80.4 |
| Rock Collection | +5 | 0 (n=400) | 0 (n=400) | 0 (n=380) | 1 (n=299) | 3 (n=134) | 5 (n=49) | 5 (n=15) | 87.8 | 85.1 |
| Geological Advantage | 12% | 0 (n=400) | 0 (n=400) | 1 (n=379) | 2 (n=299) | 6 (n=134) | 12 (n=51) | 12 (n=14) | 87.2 | 78.3 |
| Bedrock | 30% | 0 (n=400) | 20 (n=400) | 20 (n=380) | 30 (n=299) | 30 (n=136) | 30 (n=47) | 30 (n=13) | 85.3 | 79.0 |
| Show Your Work | +10% leak chance | 0 (n=400) | 0 (n=398) | 0 (n=376) | 0 (n=301) | 0 (n=135) | 1 (n=33) | 3 (n=7) | 71.1 | 65.4 |
| Study Session | 15% | 0 (n=400) | 0 (n=398) | 1 (n=378) | 0 (n=303) | 6 (n=135) | 15 (n=29) | 15 (n=6) | 70.6 | 66.4 |
| Paper Trail | 3 | 0 (n=400) | 1 (n=398) | 2 (n=374) | 0 (n=299) | 3 (n=137) | 3 (n=43) | 3 (n=9) | 77.8 | 70.0 |
| Peer Review | 4 | 0 (n=400) | 1 (n=398) | 3 (n=379) | 3 (n=334) | 4 (n=198) | 4 (n=66) | 4 (n=10) | 105.7 | 77.7 |
| Contingency Plan | 1 | 1 (n=400) | 1 (n=400) | 1 (n=400) | 1 (n=398) | 0 (n=317) | 0 (n=133) | 0 (n=27) | 177.7 | 77.5 |
| Close Shave | 6 | 0 (n=400) | 1 (n=398) | 2 (n=376) | 3 (n=297) | 6 (n=136) | 6 (n=33) | 6 (n=6) | 71.7 | 65.1 |
| Momentum | +100% | 0 (n=400) | 10 (n=397) | 0 (n=374) | 0 (n=294) | 10 (n=135) | 10 (n=28) | 10 (n=3) | 65.8 | 63.7 |
| Sharpening Stone | +12 | 0 (n=400) | 0 (n=398) | 1 (n=375) | 1 (n=295) | 2 (n=129) | 4 (n=23) | 12 (n=4) | 64.0 | 60.7 |
| Hush Money | price doubles per use | 0 (n=400) | 0 (n=398) | 0 (n=382) | 0 (n=350) | 0 (n=224) | 3 (n=74) | 4 (n=9) | 112.0 | 86.1 |

Every scaling value is bounded by its cap (or resets on a streak break / opponent change / life loss), so none can grow without limit.
