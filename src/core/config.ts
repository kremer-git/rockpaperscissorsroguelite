// Every tunable number lives here so balance passes never touch game logic.
// Values were chosen by running `npm run sim` (see BALANCE.md), not by vibes. Mostly.

export const CONFIG = {
  startingCurrency: 25,
  startingLives: 2,

  rewards: {
    win: 12,
    tie: 5,
  },

  /** Payout bonuses add together (never multiply) and are capped here: no runaway multipliers. */
  maxPayoutBonus: 3,

  /** Global cap on probabilistic LOSS→TIE saves. Never 1.0: nobody is immortal. */
  saveCap: 0.6,
  /** Absolute ceiling any upgrade may raise the cap to. */
  saveCapCeiling: 0.7,

  store: {
    slots: 4,
    /** The first store offers one common from each tree plus a random pick ("starter pack"). */
    firstStoreStarterPack: true,
    rerollBase: 6,
    rerollGrowth: 2, // each reroll in the same visit costs ×2
    opponentRerollBase: 45,
    opponentRerollGrowth: 1.6, // escalates across the whole run
    lifeBase: 35,
    lifeGrowth: 2.0, // escalates by lives bought this run, not lives held
    rarityCost: { common: 10, uncommon: 20, rare: 36, epic: 60, legendary: 95 } as Record<string, number>,
    /** Rarity weights interpolate from `early` (store 1) to `late` (store `lateAt`). */
    rarityWeights: {
      early: { common: 60, uncommon: 30, rare: 9, epic: 1, legendary: 0 },
      late: { common: 25, uncommon: 30, rare: 25, epic: 13, legendary: 7 },
      lateAt: 8,
    } as { early: Record<string, number>; late: Record<string, number>; lateAt: number },
  },

  /** Store-gap curve id. See intervals.ts for all candidates. */
  curve: 'fibonacci' as string,

  /** Opponent tier weights by stage (index clamps to last row). */
  opponentTierWeights: [
    { easy: 1, medium: 0, hard: 0, elite: 0 }, // stage 0 (gap 1)
    { easy: 1, medium: 0, hard: 0, elite: 0 },
    { easy: 1, medium: 0, hard: 0, elite: 0 },
    { easy: 1, medium: 0, hard: 0, elite: 0 },
    { easy: 2, medium: 1, hard: 0, elite: 0 },
    { easy: 1, medium: 3, hard: 1, elite: 0 },
    { easy: 0, medium: 3, hard: 2, elite: 0 },
    { easy: 0, medium: 2, hard: 3, elite: 1 },
    { easy: 0, medium: 1, hard: 3, elite: 2 }, // stage 8+ (gap 55+)
  ] as Record<string, number>[],

  interest: {
    rate: 0.12,
    maxPerStore: 45,
  },

  safetyRoundCap: 100000, // simulator stops here and flags the run as "immortal"
};

export type Config = typeof CONFIG;
