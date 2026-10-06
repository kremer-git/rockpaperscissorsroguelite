# Balance log

How the numbers in `src/core/config.ts` and `src/content/*.ts` were reached. Every change below came from a simulator run (`npm run sim`), not a guess. Current reports are in `reports/`.

## Where it landed (2000 runs per policy, Fibonacci gaps, after the polish pass)

| Player | median rounds | reach store 6 (r32) | survive a 34-gap | survive a 55-gap | p99 | longest |
|---|---|---|---|---|---|---|
| Random | 9 | 0.1% | 0% | 0% | 26 | 46 |
| Baseline | 17 | 20% | 4.1% | 1.4% | 167 | 350 |
| Paper-focused | 21 | 28% | 8.8% | 4.3% | 289 | 499 |
| Scissors-focused | 20 | 27% | 8.2% | 3.6% | 257 | 457 |
| Tie economy | 22 | 29% | 6.9% | 2.8% | 215 | 540 |
| Greedy economy | 19 | 30% | 9.0% | 2.4% | 183 | 362 |
| Survival / lives | 23 | 31% | 7.5% | 3.9% | 278 | 463 |
| Optimizer | 23 | 32% | 10.2% | 5.0% | 301 | 836 |
| Rock-focused | 23 | 32% | 10.8% | 6.2% | 453 | 952 |

No run in any test, including god builds with a million coins, survived indefinitely; none hit the 20,000-round safety cap.

## Changes, in order

1. **Early game was a coin flip meat grinder.** First sim: median 2 rounds, nobody reached store 6. Raw loss ~31% and upgrades barely mattered. → Start with 2 Extra Lives, stronger opponent habits.
2. **Opponents were too random to learn.** Even with perfect knowledge of the true odds, loss was 15–28%. Raised behaviour weights (≈2 → 4) and lowered randomness floors (0.05–0.10 → 0.04–0.07). Perfect information now gets ~10–14% against easy/medium opponents and ~20% against hard ones; the Nash Equilibrium stays pure random on purpose.
3. **Reading the tell matters.** Against adaptive opponents (Contrarian, Hot Hand, Collector) naive frequency counting loses *more* than random (up to 58%), because they punish predictable responses. Behaviour text for easy opponents is always visible (their titles give it away anyway); medium and harder ones need *Do Your Research*, a Paper prediction, or careful observation.
4. **Mid-game spike from medium opponents at stage 3** (50% of all deaths). Medium opponents now start at stage 4; the first store is a "starter pack" (one common per tree + one random) so information is on offer early.
5. **Builds formed too slowly.** Income 10/4 → 12/5, starting coins 15 → 25, commons 18 → 10, life base 60 → 35 with ×2 lifetime growth (was ×2.2).
6. **Runaway economy found by the top-runs check.** Long runs earned 140,000 coins by multiplying Risky Business × Momentum × YOLO × Glass Cannon × No Safety Net × Death Wish, then bought unlimited per-stage bribes. Fixes: all payout bonuses are now *additive* and capped at +300%; Hush Money's price doubles per use for the whole run instead of resetting each store.
7. **Charge saves that recharge every store were too strong early** (a stage early on is 1–5 rounds). Contingency Plan 2 → 1 charge; Monolith gives 1 charge, or 2 in stages of 20+ rounds, so it rewards the late game instead of the early one. Peer Review needs 4 Citations (was 3) and moved to Rare. This Seems Fine 35% → 30%.
8. **Spreadsheet and Predictive Analytics were traps** (−20 mean rounds when granted): a low-confidence prediction overrode a perfectly good reading of the tell. Now the estimator folds the behaviour description in as one of its models and a sensible player trusts it more as data accumulates. They now match or slightly beat Do Your Research in simulation; for a human they also do the counting.
9. **Rock slightly ahead** of the other trees; Thick Skull 10% → 9% per stack. Rock remains the most consistent tree (it commits), but the gap to Optimizer/Paper/Scissors/Tie is within ~20% on mean rounds, and adaptive opponents (Psychologist, Contrarian, Oracle) punish pure Rock spam.

10. **Polish pass (playtest feedback).**
    - Tendencies are now hidden for every opponent until *Do Your Research*, which dropped to 5 coins and is always in the first store. Round-one losses rose (21% → 32% for the optimizer) but mid-game got easier because research arrives earlier.
    - Pattern Recognition was replaced by **Cold Read**. The first draft (35% of rounds, "they did not pick X") turned out to be a free non-losing throw, because ruling out one move always leaves a throw that can't lose. It is now 15%, and Mastermind stays at 20%.
    - **Peer Review bypassed the save cap.** Citations accrue at the same rate as losses, so in long runs it saved a fixed share of all losses. It now works once per stage.
    - Thick Skull 9% → 8%, Geological Advantage cap 15% → 12% to trim Rock's lead.
    - The adversarial god build now lasts longer (median ~600 rounds, longest 1,238) than in the first report. The first report's simulated player was misusing that build (32% raw loss). Both still die; nothing is immortal.
    - Rock-focused play is still the most reliable, about 15–25% ahead on mean rounds.

## Round 3 (hard mode, opponent cycling, new stacking upgrades)

Normal mode barely moved (1500–2000 runs per policy): median 17–22 rounds, 20–31% reach store 6, p99 165–505. Rock-focused is still the most reliable.

| Player | Normal: median / p90 / p99 | Hard: median / p90 / p99 | Hard: reach store 6 |
|---|---|---|---|
| Baseline | 17 / 52 / 165 | 3 / 12 / 63 | 2.6% |
| Paper-focused | 20 / 78 / 301 | 3 / 16 / 81 | 4.8% |
| Scissors-focused | 19 / 77 / 231 | 3 / 19 / 79 | 4.7% |
| Rock-focused | 22 / 99 / 505 | 3 / 17 / 124 | 5.1% |
| Optimizer | 22 / 86 / 324 | 3 / 21 / 117 | 5.3% |

- **Hard Mode is brutal by design.** Half of hard runs end by round 3, because the first unsaved loss is fatal and round-one loss is ~30%. The tail still exists (longest 949). If it feels too punishing, the lightest fix is +35 starting coins in Hard Mode, so a first life can be bought at store 1.
- **Opponent cycling makes the late game a little easier.** There are only 5 hard/elite personas, so once they have appeared the "no repeats" rule brings in unseen mediums rather than repeating Sigrid or Delphine (see `reports/encounters.md`: mediums are ~48% of stages after round 232). Realistic players barely notice (optimizer p99 315 → 324). A god build does: its median rose from 608 to ~1,100 rounds, and about half of those runs now clear a 377-round gap. Still nothing is immortal (longest 2,160). The real fix is more hard/elite personas, which also serves the persona review.
- **New stacking upgrades:**
  - Paper Trail started at +2% per Receipt, and a single copy was worthless (+0.3 pts). It's now +3% (+9% max per copy).
  - Snip Snip and Close Shave are economy cards (+2 pts each), which is their job.
  - Cold Read ×2 (24%) and the 85% Instructions stay "solid".
- **QA-driven rule changes that affect balance:**
  - Hush Money now fires only after lives are gone. This made it stronger, since coins are no longer wasted while lives remain.
  - ALL-IN ties no longer feed tie upgrades.
  - A swap never pulls opponents more than one tier ahead.

## Round 5 (four new playstyles)

New personas: Lenny (The Loop, medium), Sal (The Superstitious, medium), Moira (Mood Swings, hard), Felix (The Bluffer, elite). That makes 20 opponents, 7 of them hard or elite.

**Learnability** (raw loss %, 40 runs × 60 rounds each against one opponent, from `opp.ts` in QA; "research" = reading the tell with the default 5-round history):

| Opponent | true odds | research | Spreadsheet | Predictive Analytics | no info |
|---|---|---|---|---|---|
| Lenny (Loop) | 10.4 | 23.0 | 17.5 | 16.6 | 33.8 |
| Sal (Superstitious) | 9.3 | 9.8 | 36.1 | 20.6 | 32.2 |
| Moira (Mood Swings) | 14.6 | 14.5 | 32.3 | 25.7 | 33.4 |
| Felix (Bluffer) | 17.8 | 18.2 | 30.6 | 30.6 | 31.5 |
| *for comparison:* Connor / Kai / Delphine (research) | | 10.1 / 14.4 / 36.2 | | | |

- **Lenny** is the only one where Paper's estimator beats reading the tell. A 4-throw loop needs more than the default 5-round history to spot with confidence (the tell-reader requires two matching comparisons), so a Notes App is good against him. A human who remembers the sequence does better than the simulated reader. Randomness was raised from 0.04 to 0.06 because the god build was too safe against him (1.9% → 3.0% effective loss).
- **Sal**'s cursed throw is a hard zero, the only rule allowed under the randomness floor, because "never repeats a loser" is the whole joke. That makes every round after you beat her non-losing if you read it, so she was toned down elsewhere: randomness 0.08, winStay 2.5, tie-cycle 2. She now plays like Connor (about 10% with research).
- **Moira** was too easy at weight 4 and floor 0.06 (10.8% with research). She's now at weight 3 and floor 0.08 (14.5%), in line with Kai. Her mood and the rounds until it swings are always shown (except under No Thoughts), so the challenge is switching your read on time, not discovering the clock.
- **Felix** works on three levels.
  - He leans to the throw that beats the counter to his announcement (the bluff).
  - He sometimes tells the truth.
  - He expects you to answer his announcement the way you answered the last one, and beats that.
  - Paper's estimator can't keep up with this (about 31%). Reading his tell gets to about 18%, so he's an elite that rewards research instead of a second Nash. The read layer counts as adaptive, so *Rocks Are Heavy* dampens it (QA catch).

**Runs (2000 per policy):** normal mode is unchanged within noise. Median is 17–22 rounds, 21–31% reach store 6, p99 is 187–367, and Rock-focused is still the most reliable. Hard Mode is also unchanged: median 3, 2.5–5.3% reach store 6. Deaths by tier: easy 45%, medium 33%, hard 18%, elite 4%.

**Late game:** this was the point of the round. Mediums dropped from ~48% to ~27% of stages after round 232; hard is now 48% and elite 25%. The god build's median fell from ~1,100 to ~960 rounds, and the share clearing a 377-round gap went from ~50% to 46%. Still nothing is immortal (longest 2,282 with a million coins).

The simulated policies reroll away Delphine and John, so in the encounter report Felix carries most of the elite share. A human who finds Felix hard can reroll him the same way.

## Round 6 (Instructions → legendary)

*Actually I Read the Instructions* moved from epic (60¢) to legendary (95¢) at playtest request: in human hands it's the card that makes long runs possible. In simulation, 2,000 runs per policy:
- **How often it shows up:** it's offered and bought half as often (5.6% → 2.9% of runs).
- **Its effect when owned:** unchanged (+9.3 points of runs reaching store 6).
- **Overall:** every policy is unchanged within noise: median 17–22 rounds, 21–31% reach store 6, p99 179–391.

The simulated optimizer rates it only "solid", because it reads its own estimate well even without the card. Humans lean on the true odds far more, which is why the rarity follows the playtest. No other balance numbers changed this round.

## Round 7 (normal mode starts with 3 Extra Lives)

Playtest: too many normal runs ended almost immediately. Starting lives went from 2 to 3 (Hard Mode stays at 0). 2,000 runs per policy:

| Player | median rounds (2 → 3 lives) | reach store 3 | reach store 6 | p99 |
|---|---|---|---|---|
| Random | 9 → 12 | 69% → 90% | 0.5% → 1.1% | 28 → 33 |
| Baseline | 17 → 26 | 90% → 98% | 21% → 34% | 179 → 237 |
| Paper-focused | 21 → 30 | 92% → 99% | 29% → 44% | 293 → 359 |
| Rock-focused | 22 → 30 | 92% → 99% | 30% → 46% | 391 → 479 |
| Optimizer | 22 → 32 | 92% → 99% | 31% → 48% | 375 → 471 |

- **The early game is much kinder.** Almost every run now reaches store 3. Easy opponents' share of deaths fell from 45% to 26%; medium (41%) and hard (26%) now do most of the killing, which is where the run is supposed to get hard.
- **The late game barely moved.** p99 rose 20–25%. The extra life is mostly spent in the first few stretches, and Extra Life prices still double per purchase.
- **Nothing became immortal:** no run in any policy hit the safety cap, and the god build is unchanged (median ~960).
- If normal mode now feels too soft mid-game, the lightest lever is the first Extra Life price (35¢) rather than going back to 2 lives.

## Round 9 (Show Your Work replaces Notes App; John is no longer uniform)

- **Notes App → Show Your Work** (Paper, common). Notes App (10-round history + throw counts) was rarely bought on purpose. Show Your Work rewards playing a 4-throw routine: each completion adds +2% leak chance per round, capped at +10% (five routines = at least 20 constrained throws). The routine changes after each completion so a reader-type opponent can't camp on it. Leak chance is now additive (Mastermind 20% + up to 10%), so the god build's ceiling rises from 20% to 30% leaks. The Paper sim player follows the routine when the routine throw is within 6 points of loss chance of its safest throw. Result (2000 runs per policy): win-rate delta +4.7 pts vs Notes App's +2.4 (rated *solid* instead of *situational*); Paper-Focused mean 54.8 → 56.0 rounds, median 30 → 29, store≥6 43.7% → 43.4%. No other policy moved more than noise.
- **John** was perfectly random (randomness 1/3), which made him a pure tax: nothing to learn, so the only answer was a reroll. He now plays a 60/30/10 split (≈55/30/14 after the 4% floor), dealt to Rock/Paper/Scissors afresh every encounter, and **re-dealt whenever you beat him twice in a row**. A plain 60/30/10 was far too easy once read: a Hunch-guided player lost only ~18% of rounds to him (an easy opponent is ~14%). With the re-deal, that's 27.8% with the Spreadsheet alone and 25.5% with Do Your Research too, next to Delphine (25.2%) and Felix (23.1%) under the same test (300 seeds × 30 rounds, following the Hunch's suggestion). Before the change he was a flat 33%. With true odds and a god build (`reports/adversarial.md`) he's now 5.3% effective loss, mid-pack, because the true odds show each re-deal at once. He's still rare: 0.6% of stages, and the policies reroll him.
- Hunch: "not much data yet" now only shows in the first 4 rounds; later low confidence reads "hard to read". The confidence thresholds didn't change.

## Store curve

Compared linear, Fibonacci, quadratic, exponential ×1.8 and a tuned ×1.5 curve (`reports/curves.md`). Linear never produces absurd late gaps (33 rounds at store 11) so it fails the core fantasy. Exponential jumps to 38 and 68 too early, before builds exist, and has the fewest runs reaching store 8. Quadratic gets few runs past store 6. The tuned ×1.5 curve is essentially tied with Fibonacci on every metric; Fibonacci was kept because it grows faster late (×1.618 per stage vs ×1.5), which is what makes the final stretch feel absurd, and players recognise the sequence. Store indices sit at different round counts on each curve, so compare medians and gap survival rather than store numbers across curves. Uncapped.

## Safeguards against immortality (`reports/adversarial.md`)

- Save chance is summed and capped at 60% (70% for Rock with Built Different, halved by Glass Cannon). Never 100%.
- Opponents always keep a randomness floor, so even the true odds plus Mastermind leaks leave 8–28% raw loss.
- God build (every save, charge and information upgrade from round 0, a build no real run can assemble this early): median 608 rounds, longest 1,203. Plus a million coins: longest 1,238. Only 2–4% of those runs cleared a 377-round gap, and none cleared the 610 after it.
- Extra Lives cost 35 × 2ⁿ by lifetime purchases: a million coins buys about 14 in a whole run.
- Store rerolls double within a visit; opponent rerolls grow ×1.6 across the run.
- Tie economy: 10.3 coins/round vs 13.5 for the optimizer. Viable, not dominant.
- Peer Review, Monolith and Contingency Plan all refill at most once per stage, so no save source scales with round count.

## Known soft spots

- Very late runs accumulate coins they can't spend well once the upgrade pool is exhausted (lives and rerolls are log-priced). That money can't buy immortality, but it is dead weight.
- Rock-focused play is the most reliable of the three single-tree strategies.
- Charge saves that refill every store (Monolith, Contingency Plan) are very strong if an epic shows up in the first few stores, when stages are only 1–5 rounds long. Epics are rare that early (1–4% of offers), so this is a lucky-run spike rather than a reliable strategy.
- Simulated players are heuristic. A skilled human reading opponents well should beat the Optimizer numbers, which is intended: the decisions matter.
