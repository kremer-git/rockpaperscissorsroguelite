# Rock Paper Scissors — The Roguelite

It's just Rock, Paper, Scissors. With a build. And an economy. And store gaps that grow like Fibonacci.

Each round you throw Rock, Paper or Scissors against an opponent who has already locked in a throw. Win for coins, tie for fewer coins, lose and the run ends unless you own an Extra Life. Stores sell upgrades from three skill trees, Extra Lives, rerolls and a reroll of your next opponent. Stores come after 1, 2, 3, 5, 8, 13, 21, 34, 55, 89… rounds. There is no cap and no final boss. Eventually probability wins. Nothing carries over between runs.

## Run it

```bash
npm install          # typescript, esbuild, tsx (dev only; the game has zero runtime dependencies)
npm run build        # -> dist/index.html  (single self-contained file; just open it)
npm test             # 109 tests: engine rules, every upgrade's behaviour, edge cases, QA regressions
node tests/e2e.mjs   # 64 browser checks on dist/index.html (needs Playwright + Chromium)
npx tsx scripts/export-personas.ts   # docs/personas.csv + docs/personas.md for bulk review
npm run typecheck
npm run sim          # all balance reports -> reports/*.md  (~5 min at the default size)
```

`dist/index.html` works from disk in Chrome, Firefox, Safari and Edge. `dist/artifact.html` is the same page without the `<html>/<head>/<body>` wrapper for hosts that add their own.

### Controls

| Where | Keys |
|---|---|
| Run | `R` `P` `S` throw · `A` toggle ALL-IN (with Double or Nothing) · `Enter` continue to store / summary |
| Store | `1`–`4` buy offer · `L` Extra Life · `X` reroll store · `O` reroll next opponent · `Enter` continue |
| Game over | `Enter` one more run · `Y` replay this seed · `T` title |
| Anywhere | `` ` `` debug panel |

Mouse and touch work everywhere. Every state is also communicated in text, not only colour.

## Architecture

```
src/
  core/            rules — no DOM, no UI imports
    types.ts         GameState, hooks, events, data models
    config.ts        every tunable number (the only file balance passes edit)
    engine.ts        createRun, playRound, store actions, validation — the ONLY place rules run
    rules.ts         pure queries: save chance, prices, caps
    opponentModel.ts opponent behaviour -> probability distribution
    intel.ts         what the player may know: history, patterns, estimator, tells
    intervals.ts     store-gap curves (linear, fibonacci, polynomial, exponential, tuned)
    registry.ts      upgrade lookup
    rng.ts           seeded, serialisable RNG (mulberry32) stored in GameState
    debug.ts         QA helpers that act through the engine
  content/
    upgrades.ts      51 upgrade definitions (data + hooks)
    opponents.ts     20 opponent definitions (pure data)
  ui/              presentation — reads state, calls engine actions
    main.ts          app shell, keyboard, save/resume
    runScreen.ts storeScreen.ts menus.ts debugPanel.ts components.ts
    assets.ts        asset registry (art slots)
    presentation.ts  audio + animation hooks driven by engine events
    styles.css page.html
  sim/             Monte Carlo balance simulator
    policies.ts      9 simulated player policies
    runner.ts stats.ts cli.ts
tests/engine.test.ts   core rules, store, economy, validation
tests/upgrades.test.ts every upgrade + interactions (No Thoughts exclusions, charge order, All-In, High Stakes…)
reports/           generated balance reports (committed so you can read them without running anything)
```

Round flow is centralised in `engine.playRound`: commit opponent throw (at round start) → reveal → `onReveal` hooks → loss handling (save roll → free charges → paid charges → Extra Life → death) → rewards (`onReward` hooks, additive bonuses, cap) → `onWin/onTie/onLoss` → record → `onRoundEnd` → store or next round. The UI never duplicates any of this.

The engine emits events (`runStart`, `choice`, `reveal`, `result`, `save`, `lifeConsumed`, `currency`, `storeEnter`, `purchase`, `opponentChange`, `milestone`, `death`) and never waits for listeners.

## Defining an upgrade

Upgrades are data plus optional hooks (`src/content/upgrades.ts`):

```ts
{
  id: 'thick-skull', name: 'Thick Skull', tree: 'rock', rarity: 'common', cost: 0 /* from rarity */,
  maxStacks: 3, icon: 'up.skull', tags: ['save', 'rock'],
  flavor: 'Nothing gets in. Including ideas.',
  describe: (n) => `Throwing Rock: +${10 * n}% save chance (a loss becomes a tie). Stacks ×3.`,
  saveChance: (_s, u, move) => (move === 'R' ? 0.1 * u.stacks : 0),
}
```

Available hooks: `onRunStart onRoundStart saveChance saveCap saveCapMult canSave modifyOpponentAdaptive onReveal chargeSave(+chargeIsPaid) onReward onWin onTie onLoss onSave preventLifeLoss onLifeConsumed onRoundEnd onStoreEnter onStoreExit onPurchase onOpponentChange upgradePriceMult lifePriceMult opponentRerollMult freeStoreRerolls maxLives throwCost intel allowsAllIn`. Per-upgrade counters live in `owned.data`. Scaling upgrades expose `scaling.value()` for the UI and the scaling report. `requires` gates store appearance. Keep numbers in named constants next to the definitions so card text can't drift from behaviour.

Guard rails enforced by the engine: probabilistic saves are summed and capped (60%, 70% ceiling), payout bonuses are **added** and capped at +300% (nothing multiplies), Extra Life and opponent-reroll prices escalate across the whole run, store rerolls double within a visit, Hush Money doubles per use for the whole run.

## Defining an opponent

Opponents are pure data (`src/content/opponents.ts`): base R/P/S weights, a `randomness` floor, and weights for behaviours such as `repeatOwn`, `cycle`, `copyPlayer`, `counterPlayerLast`, `counterPlayerFreq`, `counterPlayerBigram`, `winStay/loseShift`, `winShift/loseStay`, `leastPlayed`, `echoTwoBack`, `mirrorTwoBack`, `favoritePhase`, `tiltAfterLosses`, `loop`, `avoidLoser`, `moods`, `bluff`, plus `tier`, `difficulty`, `weight`, `title` (a vague, funny descriptor, always shown), `archetype` + `tell` (the literal behaviour, hidden until *Do Your Research*, 5 coins and always in the first store, and revealed in the game-over debrief) and `flavor` (unused). For a bird's-eye view run `npx tsx scripts/export-personas.ts` and open `docs/personas.csv`.

Playstyles added in round 5:

| Persona | Tier | Rule | What the player sees |
|---|---|---|---|
| Lenny, The Loop | medium | `loop`: a 3–4 throw sequence (≥2 different throws, never plain R→P→S) picked per encounter and replayed from the start of each stage | Only the history |
| Sal, The Superstitious | medium | `avoidLoser: 0`: the throw that just lost is never repeated (the one rule allowed to beat the randomness floor); keeps winners; cycles after ties | Only the history |
| Moira, Mood Swings | hard | `moods`: Stubborn (repeats herself) and Spiteful (beats your last throw), swapping every 5 rounds | Mood and rounds until it swings, next to the throw buttons |
| Felix, The Bluffer | elite | `bluff`: announces a random throw; leans to what beats the counter to it (`bluff`), sometimes tells the truth (`honest`), and expects you to answer his announcement the way you answered the last one (`read`, an adaptive weight, so Rocks Are Heavy dampens it) | His announcement, every round, plus a "Said" row in the history |

Announcements and moods are hidden by No Thoughts Just Rock. The estimator (Spreadsheet / Predictive Analytics) has matching context models: the last two and three throws (loops), mood + last throw, and the announcement on its own and with how you answered the last one.

Opponent memory ("your previous throw", "two rounds ago") only covers rounds against the current opponent and starts fresh after every store. The player's own streak upgrades count across stores.

Picking: each stage's tier weights come from `CONFIG.opponentTierWeights`. Everyone appears once (as current, next, or a store swap) before anyone repeats. If a stage's allowed tiers are used up, the pick steps up at most one tier; past that, a repeat from the allowed tiers is used instead of dragging elites into the early game. `opponentModel.ts` turns that into a distribution using only visible history. Opponents commit their throw before the player chooses.

**No hidden rigging.** The distribution never reads round number, run length, currency, lives or build strength. The only documented upgrade that touches it is *Rocks Are Heavy* (dampens adaptive Paper). Difficulty over time comes from longer gaps and from the opponent tier table in `config.ts` (harder personalities later), both visible to the player: the store always shows the next opponent and the next gap length. A test (`no hidden rigging`) checks that a rich, long-lived, stacked run and a fresh run see identical odds given identical history.

## The simulator

`npm run sim` (or `npm run sim:<report> -- <runs>`) writes:

| Report | What it answers |
|---|---|
| `summary.md` | Run-length distribution per policy (mean, median, p25–p99, max), P(reach each store), P(survive gaps of 34/55/89+), win/tie/loss/save rates, lives, economy, cause of death, archetype breakdown |
| `curves.md` | Linear vs Fibonacci vs quadratic vs exponential vs tuned store curves |
| `stages.md` | Raw and effective loss rate per stage — the emotional curve in numbers |
| `upgrades.md` | Each upgrade granted at round 0 to its tree's policy vs without it |
| `scaling.md` | Every scaling upgrade's value at rounds 0/5/10/20/50/200/500, early vs late purchase |
| `adversarial.md` | God builds, a million coins, every upgrade at once: can anything become immortal? |
| `economy.md` | Coins per round, spending, lives, rerolls by policy |
| `samples.md` | Bad / average / good / excellent / longest runs, stage by stage, for manual review |
| `summary-hard.md` | The same summary in Hard Mode (0 starting lives) |
| `encounters.md` | How often each opponent is actually met, by stage band |

Policies: Random, Baseline, Rock-, Paper-, Scissors-focused, Tie Economy, Greedy, Survival, Optimizer. They see only what a player sees (`getIntel`) and act through the same engine calls as the UI. Runs hitting the safety cap are reported as "immortal" (there have been none).

**Reading the numbers.** Median rounds says how long a typical run lasts; `store≥k` says how far runs get; `gap≥55`/`gap≥89` is the "exceptional run" tail. In `stages.md`, *effective loss* is the chance per round of losing something (a life or the run); `P(survive whole gap)` at that rate shows why long gaps eventually end strong runs. An archetype or upgrade that pushes store≥6 or gap≥34 far above the others is a dominance problem; one that sits below the plain policy is a trap for that playstyle. See `BALANCE.md` for what was changed and why.

## Adding art, audio and animation later

- **Art:** every visual slot asks `assets.ts` for a key (`move.R`, `opp.oracle`, `up.skull`, `store.sign`, `ui.life`, …). Add `image: 'url or data URI'` to a key (or call `registerAsset`) and the placeholder glyph becomes an `<img>` everywhere. No screen changes.
- **Audio:** `presentation.ts` maps engine events to sound keys (`choice`, `reveal`, `win`, `tie`, `loss`, `save`, `life`, `store`, `purchase`, `milestone`). Call `registerSound('win', () => …)`.
- **Animation:** elements carry `data-fx` targets (`clash`, `banner`, `coins`, `lives`, `build`); queued engine events add CSS classes after render. Swap in richer animation without touching rules; the engine never waits on it. `prefers-reduced-motion` disables all of it.
- A canvas/WebGL renderer could subscribe to the same events (`onEngineEvent`) and read the same `GameState`.

## Hard Mode, awards and layout

- **Hard Mode** (title screen toggle, key `M`) starts with 0 Extra Lives. Stored in `GameState.mode`; seeds replay in the same mode.
- **Awards** at 100/200/300/400/500 rounds live on the title-screen trophy shelf (`src/ui/awards.ts`). They're saved in browser storage and, on claude.ai for a signed-in viewer, in their private `db` record (`data/users/<id>/awards`), merged as a union so nothing is lost. They grant no power.
- **Build panel**: collapse it (`B` or the Hide button), collapse each tree, and reorder upgrades by drag or ▲▼. Intel read-outs (Hunch, Cold Read) have on/off switches. All remembered per browser (`src/ui/prefs.ts`).

## Seeds

The title screen can start a run from a seed (a number, or any word, which is hashed). Same seed + same choices = the same run. The seed is shown in the HUD and on the game-over screen with a copy button and a "Replay this seed" button.

## Paper information, in order of power

| Upgrade | What you see |
|---|---|
| Do Your Research (5¢) | Opponent archetype + tendency text |
| Notes App | History of 10 rounds instead of 5, plus their throw counts |
| Cold Read (stacks ×2) | 12% of rounds per copy: one throw they did **not** pick, so it’s one of the other two. The Hunch and button odds use it too. |
| Spreadsheet / Predictive Analytics | A one-line Hunch (most likely throw, % confidence, suggested throw) and win/lose odds on each button |
| Actually I Read the Instructions | True win/lose odds on each button on 85% of rounds (the Hunch steps aside when they show) |
| Mastermind | 20% of rounds: a banner with their locked-in throw |

No Thoughts Just Rock hides all of it, so the store never offers it together with intel upgrades.

## Debug mode

Press `` ` ``: add coins/lives, add or remove any upgrade, set the current opponent, reroll the next one for free, force the opponent's next throw or a WIN/TIE/LOSS, skip N rounds, skip to the store, jump to any stage (long-gap testing), reset, and inspect true odds, estimator output, raw vs capped save chance, active modifiers, triggers, the debug log and the full state.
