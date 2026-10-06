// Core type definitions. Nothing in src/core may import from src/ui.

export type Move = 'R' | 'P' | 'S';
export const MOVES: readonly Move[] = ['R', 'P', 'S'];
export type Outcome = 'WIN' | 'TIE' | 'LOSS';
export type Tree = 'rock' | 'paper' | 'scissors';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Dist = [number, number, number]; // probabilities for R, P, S

export type RunStatus = 'playing' | 'store' | 'dead';
export type RunMode = 'normal' | 'hard';

export interface OwnedUpgrade {
  id: string;
  stacks: number;
  /** Free-form per-upgrade counters (streaks, charges, accumulated bonuses). */
  data: Record<string, number>;
}

export interface RoundRecord {
  round: number;
  stage: number;
  player: Move;
  opponent: Move;
  rawOutcome: Outcome; // pure RPS result
  outcome: Outcome; // after saves / conversions
  saved: boolean;
  lifeUsed: boolean;
  /** Bluffer: what it announced before this round. */
  said?: Move;
  /** This Seems Fine: the loss was covered by an Extra Life that was kept anyway. */
  lifeKept?: boolean;
  reward: number;
  allIn: boolean;
}

export interface StoreOffer {
  slot: number;
  upgradeId: string;
  price: number;
  sold: boolean;
}

export interface StoreState {
  offers: StoreOffer[];
  rerollsThisVisit: number;
  lifePurchasedThisVisit: number;
}

export interface Trigger {
  source: string; // upgrade id or 'core'
  text: string;
}

export interface RunStats {
  wins: number;
  ties: number;
  losses: number; // raw RPS losses (before saves)
  saves: number;
  currencyEarned: number;
  currencySpent: number;
  upgradesPurchased: number;
  livesPurchased: number;
  livesConsumed: number;
  storeRerolls: number;
  opponentRerolls: number;
  opponentsDefeated: number;
  opponentsEncountered: string[];
  longestGapSurvived: number;
  moveCounts: Record<Move, number>;
  allIns: number;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  status: RunStatus;
  round: number; // rounds completed
  stage: number; // index of current gap (0 = before first store)
  storesVisited: number;
  roundsIntoStage: number;
  currentGap: number; // rounds in this stage
  currency: number;
  lives: number;
  owned: OwnedUpgrade[];
  opponentId: string;
  nextOpponentId: string;
  opponentMemory: Record<string, number>; // per-opponent behaviour state
  pendingOpponentMove: Move | null; // committed before the player picks
  pendingOpponentDist: Dist | null;
  /** What the opponent announced this round (Bluffer), shown to the player before they choose. */
  opponentSays: Move | null;
  history: RoundRecord[]; // whole run
  stageHistory: RoundRecord[]; // current opponent only
  store: StoreState | null;
  opponentRerollsBought: number;
  lastTriggers: Trigger[];
  causeOfDeath: string | null;
  stats: RunStats;
  curveId: string;
  /** 'hard' starts with 0 Extra Lives. */
  mode: RunMode;
  /** Opponents already met or shown this cycle (current, next, and store swaps). Nobody repeats until everyone has appeared. */
  seenOpponents: string[];
  /** Actually I Read the Instructions: whether the true odds are readable this round. */
  oddsVisible: boolean;
  /** Debug: force the opponent's next throw. Never set during normal play. */
  debugForceOpponent: Move | null;
  debugLog: string[];
  /** Incremental statistics the Paper-tree estimator learns from (reset per opponent). */
  intelMemory: IntelMemory;
  /** Estimator output computed at round start (null without a prediction upgrade). */
  roundPrediction: RoundPrediction | null;
  /** Mastermind: the opponent's locked throw leaked this round. */
  leaked: boolean;
  /** Cold Read: a throw the opponent did NOT lock in this round. */
  ruledOut: Move | null;
  lastLifePrice: number;
}

export interface IntelMemory {
  counts: Record<string, [number, number, number]>;
  scores: Record<string, number>;
  total: number;
}

export interface RoundPrediction {
  dist: Dist;
  predicted: Move; // most likely opponent throw according to the estimator
  recommended: Move; // throw that minimises loss after your saves
  confidence: 'Low' | 'Medium' | 'High';
  /** Low confidence because there are only a few rounds to go on (vs. an opponent who is just hard to read). */
  thin?: boolean;
}

export interface RoundContext {
  state: GameState;
  player: Move;
  opponent: Move;
  rawOutcome: Outcome;
  outcome: Outcome;
  allIn: boolean;
  baseReward: number;
  flatBonus: number;
  /** Additive payout bonuses (+0.5 = +50%). Summed, then capped by CONFIG.maxPayoutBonus. */
  bonusPct: number;
  multiplier: number;
  saved: boolean;
  lifeUsed: boolean;
  /** True when a loss was absorbed by an Extra Life (even if This Seems Fine kept the life). */
  survived?: boolean;
  triggers: Trigger[];
}

/** What upgrades can contribute to the information panel. Higher = more info. */
export interface IntelFlags {
  hidden: boolean; // No Thoughts Just Rock
  historyWindow: number;
  behaviourText: boolean;
  frequencies: boolean;
  prediction: 0 | 1 | 2; // 0 none, 1 simple estimator, 2 context-mixing estimator
  trueOdds: boolean;
  /** Chance per round that the true odds are readable (Actually I Read the Instructions). */
  trueOddsChance: number;
  leakChance: number;
  coldReadChance: number;
  showNextOpponent: boolean;
}

/** Hooks an upgrade can implement. All hooks receive the owned stack count. */
export interface UpgradeHooks {
  onRunStart?(s: GameState, u: OwnedUpgrade): void;
  onRoundStart?(s: GameState, u: OwnedUpgrade): void;
  /** Pure: extra save (LOSS→TIE) chance for a throw. Must not mutate. */
  saveChance?(s: GameState, u: OwnedUpgrade, move: Move): number;
  /** Pure: cap override. Return a number to propose a new cap (max of proposals wins, min for 'capLimit'). */
  saveCap?(s: GameState, u: OwnedUpgrade, move: Move): number | undefined;
  /** Pure: multiplier on the global save cap (Glass Cannon). */
  saveCapMult?(s: GameState, u: OwnedUpgrade): number;
  /** Pure: may this throw be saved at all? */
  canSave?(s: GameState, u: OwnedUpgrade, move: Move): boolean;
  /** Adjust opponent distribution weights before normalisation (documented effects only). */
  modifyOpponentAdaptive?(s: GameState, u: OwnedUpgrade, adaptive: Dist): Dist;
  /** Change the rules outcome (e.g. Rock-vs-Rock counts as a win). */
  onReveal?(ctx: RoundContext, u: OwnedUpgrade): void;
  /** Charge-based saves checked after the probability roll fails. Return true to save. */
  chargeSave?(ctx: RoundContext, u: OwnedUpgrade): boolean;
  /** Paid charge saves (Hush Money) are tried after free ones. */
  chargeIsPaid?: boolean;
  /** Among free charges, lower goes first. Recharging charges (Monolith, Contingency) spend before earned ones (Peer Review). */
  chargePriority?: number;
  onReward?(ctx: RoundContext, u: OwnedUpgrade): void;
  onWin?(ctx: RoundContext, u: OwnedUpgrade): void;
  onTie?(ctx: RoundContext, u: OwnedUpgrade): void;
  onLoss?(ctx: RoundContext, u: OwnedUpgrade): void;
  onSave?(ctx: RoundContext, u: OwnedUpgrade): void;
  /** Return true to prevent the life from being consumed ("This Seems Fine"). */
  preventLifeLoss?(ctx: RoundContext, u: OwnedUpgrade): boolean;
  onLifeConsumed?(ctx: RoundContext, u: OwnedUpgrade): void;
  onRoundEnd?(ctx: RoundContext, u: OwnedUpgrade): void;
  onStoreEnter?(s: GameState, u: OwnedUpgrade, triggers: Trigger[]): void;
  onStoreExit?(s: GameState, u: OwnedUpgrade): void;
  onPurchase?(s: GameState, u: OwnedUpgrade, what: string): void;
  onOpponentChange?(s: GameState, u: OwnedUpgrade): void;
  /** Pure: price multipliers. */
  upgradePriceMult?(s: GameState, u: OwnedUpgrade): number;
  lifePriceMult?(s: GameState, u: OwnedUpgrade): number;
  opponentRerollMult?(s: GameState, u: OwnedUpgrade): number;
  freeStoreRerolls?(s: GameState, u: OwnedUpgrade): number;
  maxLives?(s: GameState, u: OwnedUpgrade): number;
  /** Pure: coin cost to throw a move (Absolute Unit). */
  throwCost?(s: GameState, u: OwnedUpgrade, move: Move): number;
  intel?(flags: IntelFlags, u: OwnedUpgrade): void;
  allowsAllIn?: boolean;
}

export interface UpgradeDef extends UpgradeHooks {
  id: string;
  name: string;
  tree: Tree;
  rarity: Rarity;
  cost: number;
  maxStacks: number;
  icon: string; // asset key (placeholder glyph until art exists)
  tags: string[];
  /** Fixed price instead of the rarity price. */
  costOverride?: number;
  /** For stackable upgrades: what one copy adds (shown on the card). */
  perCopy?: string;
  /** Only offered in stores if the player owns at least one of these. */
  requires?: string[];
  /** Short card text. May reference stacks. */
  describe(stacks: number): string;
  flavor: string;
  /** Scaling upgrades expose their current value for the UI and scaling report. */
  scaling?: { label: string; value(s: GameState, u: OwnedUpgrade): string; cap: string };
}

export type OpponentTier = 'easy' | 'medium' | 'hard' | 'elite';

export interface OpponentDef {
  id: string;
  name: string;
  /** Vague, amusing descriptor shown under the name. Should hint, never explain. */
  title: string;
  /** Literal archetype (e.g. 'The Mimic'); revealed with the tendency by Do Your Research. */
  archetype: string;
  portrait: string; // asset key
  tier: OpponentTier;
  difficulty: number; // 1-5, shown to the player as a threat level
  /** Relative chance of being picked within its tier (default 1). */
  weight?: number;
  flavor: string; // always visible
  tell: string; // behaviour description, visible with "Do Your Research"
  base: Dist; // base R/P/S weights
  randomness: number; // floor: each move keeps at least this probability
  repeatOwn?: number; // weight toward repeating its last throw
  cycle?: number; // weight toward the move that beats its own last throw (R→P→S)
  reverseCycle?: number; // weight toward the move that loses to its own last throw
  copyPlayer?: number; // weight toward the player's last throw
  counterPlayerLast?: number; // weight toward beating the player's last throw
  counterPlayerFreq?: { weight: number; window: number }; // beats player's most common recent throw
  counterPlayerBigram?: number; // beats player's most likely next throw from their 2-move pattern
  winStay?: number; // after it wins: repeat
  loseShift?: number; // after it loses: switch to what would have won
  winShift?: number; // after it wins: switch
  loseStay?: number; // after it loses: repeat
  leastPlayed?: number; // weight toward its least-thrown move this stage
  echoTwoBack?: number; // weight toward the move that beats its own throw from two rounds ago
  mirrorTwoBack?: number; // weight toward the player's throw from two rounds ago
  favoritePhase?: { weight: number; minLen: number; maxLen: number }; // Gambler: random favourite for a streak
  tiltAfterLosses?: { losses: number; weight: number }; // specialists: after N straight losses, lean away from favourite
  /** Loop: plays a fixed sequence of `minLen`–`maxLen` throws, new each encounter, from the start every time you meet. */
  loop?: { weight: number; minLen: number; maxLen: number };
  /** John: these base weights (e.g. 60/30/10) are dealt to Rock/Paper/Scissors in a fresh order every encounter. */
  shuffledBase?: Dist;
  /** John: re-deal the shuffled split after the player beats him this many times in a row. */
  reshuffleAfterWins?: number;
  /** Superstitious: after a throw loses, that throw is nearly banned next round (weight multiplier, e.g. 0.05). */
  avoidLoser?: number;
  /** Mood swings: every `period` rounds, switch between two behaviour sets (A first). */
  moods?: { period: number; a: OpponentBehaviour; b: OpponentBehaviour; names: [string, string] };
  /** Bluffer: announces a throw each round, then mostly throws what beats the counter to it. */
  bluff?: { bluff: number; honest: number; read: number };
}

/** The behaviour weights a mood can switch on (a subset of OpponentDef). */
export type OpponentBehaviour = Partial<Pick<OpponentDef, 'repeatOwn' | 'cycle' | 'reverseCycle' | 'copyPlayer' | 'counterPlayerLast' | 'winStay' | 'loseShift' | 'winShift' | 'loseStay' | 'leastPlayed' | 'echoTwoBack' | 'mirrorTwoBack'>>;

export type EngineEvent =
  | { type: 'runStart'; state: GameState }
  | { type: 'roundStart'; round: number }
  | { type: 'choice'; move: Move }
  | { type: 'reveal'; player: Move; opponent: Move }
  | { type: 'result'; record: RoundRecord; triggers: Trigger[] }
  | { type: 'lifeConsumed'; livesLeft: number }
  | { type: 'save'; source: string }
  | { type: 'currency'; amount: number }
  | { type: 'storeEnter'; storeIndex: number }
  | { type: 'storeExit'; nextGap: number }
  | { type: 'purchase'; what: string }
  | { type: 'opponentChange'; opponentId: string }
  | { type: 'milestone'; text: string }
  | { type: 'death'; cause: string };
