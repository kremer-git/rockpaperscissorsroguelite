import type { GameState, IntelFlags, Move, OwnedUpgrade, RoundContext, UpgradeDef } from '../core/types';
import { beats } from '../core/rps';
import { clamp, lastPlayerMove, num, pct, rockStreak, tieStreak, winStreak } from '../core/helpers';
import { nextRandom } from '../core/rng';

// ---------------------------------------------------------------------------
// Upgrade definitions. One primary effect each; rarer upgrades change rules
// rather than just inflating numbers. Numbers are in named constants so card
// text and behaviour can never drift apart.
// ---------------------------------------------------------------------------

const isRock = (m: Move) => m === 'R';
const rocksThrown = (s: GameState) => s.stats.moveCounts.R;
const onWinOrTie = (ctx: RoundContext) => (ctx.outcome === 'WIN' || ctx.outcome === 'TIE') && !ctx.saved;

// ======================= ROCK: DUMB AND SOLID ==============================
const THICK_SKULL = 0.08;
const MUSCLE_PER = 0.04, MUSCLE_MAX = 0.2;
const BRUTE_FORCE = 6;
const STONE_COLD = 5;
const COLLECTION_EVERY = 12, COLLECTION_MAX = 5;
const DIG_IN = 0.2;
const HEAVY_DAMPEN = 0.4;
const GEO_EVERY = 6, GEO_MAX = 0.12;
const BEDROCK_PER = 0.1, BEDROCK_MAX = 0.3;
const ROCK_BOTTOM = 0.2;
const NO_THOUGHTS_SAVE = 0.2, NO_THOUGHTS_COINS = 2;
const BUILT_DIFFERENT_CAP = 0.7;
const ABSOLUTE_SAVE = 0.3, ABSOLUTE_TAX = 5;
const MONOLITH = 2, MONOLITH_LONG = 20;

const ROCK: UpgradeDef[] = [
  {
    id: 'thick-skull', name: 'Thick Skull', tree: 'rock', rarity: 'common', cost: 0, maxStacks: 3, icon: 'up.skull',
    tags: ['save', 'rock'], flavor: 'Nothing gets in. Including ideas.',
    describe: (n) => `Throwing Rock: +${pct(THICK_SKULL * n)} save chance (a loss becomes a tie).`,
    perCopy: `+${pct(THICK_SKULL)} save chance on Rock`,
    saveChance: (_s, u, m) => (isRock(m) ? THICK_SKULL * u.stacks : 0),
  },
  {
    id: 'muscle-memory', name: 'Muscle Memory', tree: 'rock', rarity: 'common', cost: 0, maxStacks: 1, icon: 'up.muscle',
    tags: ['save', 'rock', 'scaling', 'streak'], flavor: 'The body remembers. The brain was never consulted.',
    describe: () => `Throwing Rock: +${pct(MUSCLE_PER)} save chance for each Rock you threw in a row before it (max +${pct(MUSCLE_MAX)}). Resets when you throw anything else. Streaks carry over between stores.`,
    saveChance: (s, _u, m) => (isRock(m) ? Math.min(MUSCLE_MAX, MUSCLE_PER * rockStreak(s)) : 0),
    scaling: { label: 'Rock streak bonus', cap: pct(MUSCLE_MAX), value: (s) => `+${pct(Math.min(MUSCLE_MAX, MUSCLE_PER * rockStreak(s)))}` },
  },
  {
    id: 'brute-force', name: 'Brute Force', tree: 'rock', rarity: 'common', cost: 0, maxStacks: 2, icon: 'up.fist',
    tags: ['economy', 'rock'], flavor: 'If it doesn’t work, you aren’t using enough rock.',
    describe: (n) => `Winning with Rock pays +${BRUTE_FORCE * n} coins.`,
    perCopy: `+${BRUTE_FORCE} coins per Rock win`,
    onReward: (ctx, u) => { if (ctx.outcome === 'WIN' && isRock(ctx.player)) { ctx.flatBonus += BRUTE_FORCE * u.stacks; ctx.triggers.push({ source: 'brute-force', text: `Brute Force +${BRUTE_FORCE * u.stacks}` }); } },
  },
  {
    id: 'stone-cold', name: 'Stone Cold', tree: 'rock', rarity: 'common', cost: 0, maxStacks: 2, icon: 'up.ice',
    tags: ['tie', 'economy', 'rock'], flavor: 'Two rocks, staring. Neither blinks. Rocks can’t blink.',
    describe: (n) => `Rock vs Rock pays +${STONE_COLD * n} coins (also when Big Rock Theory turns it into a win).`,
    perCopy: `+${STONE_COLD} coins per Rock-vs-Rock`,
    onReward: (ctx, u) => { if (!ctx.saved && isRock(ctx.player) && isRock(ctx.opponent)) { ctx.flatBonus += STONE_COLD * u.stacks; ctx.triggers.push({ source: 'stone-cold', text: `Stone Cold +${STONE_COLD * u.stacks}` }); } },
  },
  {
    id: 'rock-collection', name: 'Rock Collection', tree: 'rock', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.collection',
    tags: ['economy', 'rock', 'scaling'], flavor: 'Each one is special. They are all the same rock.',
    describe: () => `Every win or tie pays +1 coin for every ${COLLECTION_EVERY} Rocks you have thrown this run (max +${COLLECTION_MAX}).`,
    onReward: (ctx) => {
      const b = Math.min(COLLECTION_MAX, Math.floor(rocksThrown(ctx.state) / COLLECTION_EVERY));
      if (b > 0 && onWinOrTie(ctx)) { ctx.flatBonus += b; ctx.triggers.push({ source: 'rock-collection', text: `Rock Collection +${b}` }); }
    },
    scaling: { label: 'Bonus per win/tie', cap: `+${COLLECTION_MAX}`, value: (s) => `+${Math.min(COLLECTION_MAX, Math.floor(rocksThrown(s) / COLLECTION_EVERY))}` },
  },
  {
    id: 'dig-in', name: 'Dig In', tree: 'rock', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.shovel',
    tags: ['save', 'rock', 'momentum'], flavor: 'Survived once. Now refuses to leave.',
    describe: () => `After any save, your next round has +${pct(DIG_IN)} save chance with any throw. Streaks carry over between stores.`,
    onRoundStart: (_s, u) => { u.data.active = num(u, 'next'); u.data.next = 0; },
    saveChance: (_s, u) => (num(u, 'active') ? DIG_IN : 0),
    onSave: (ctx, u) => { u.data.next = 1; ctx.triggers.push({ source: 'dig-in', text: 'Dig In primed for next round' }); },
  },
  {
    id: 'rocks-are-heavy', name: 'Rocks Are Heavy', tree: 'rock', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.weight',
    tags: ['rock', 'counterplay'], flavor: 'Hard to counter something you can’t lift.',
    describe: () => `Opponents that adapt to YOUR throws are ${pct(1 - HEAVY_DAMPEN)} less likely to adapt by throwing Paper.`,
    modifyOpponentAdaptive: (_s, _u, a) => [a[0], a[1] * HEAVY_DAMPEN, a[2]],
  },
  {
    id: 'geological-advantage', name: 'Geological Advantage', tree: 'rock', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.strata',
    tags: ['save', 'rock', 'scaling'], flavor: 'Took millions of years. Worth it.',
    describe: () => `Throwing Rock: +1% save chance for every ${GEO_EVERY} Rocks thrown this run (max +${pct(GEO_MAX)}).`,
    saveChance: (s, _u, m) => (isRock(m) ? Math.min(GEO_MAX, 0.01 * Math.floor(rocksThrown(s) / GEO_EVERY)) : 0),
    scaling: { label: 'Rock save bonus', cap: pct(GEO_MAX), value: (s) => `+${pct(Math.min(GEO_MAX, 0.01 * Math.floor(rocksThrown(s) / GEO_EVERY)))}` },
  },
  {
    id: 'bedrock', name: 'Bedrock', tree: 'rock', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.bedrock',
    tags: ['lives', 'rock', 'synergy'], flavor: 'A solid foundation for poor decisions.',
    describe: () => `Extra Lives cost ${pct(BEDROCK_PER)} less for each OTHER Rock upgrade you own (Bedrock itself doesn’t count; extra copies of a stackable upgrade count once). Max ${pct(BEDROCK_MAX)} off.`,
    lifePriceMult: (s) => 1 - bedrockDiscount(s),
    scaling: { label: 'Life discount', cap: pct(BEDROCK_MAX), value: (s) => `−${pct(bedrockDiscount(s))}` },
  },
  {
    id: 'big-rock-theory', name: 'Big Rock Theory', tree: 'rock', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.boulder',
    tags: ['rock', 'tie', 'economy'], flavor: 'My rock is bigger. That’s the theory.',
    describe: () => 'Rock-vs-Rock ties count as WINS (win payout, win streaks).',
    onReveal: (ctx) => {
      if (ctx.outcome === 'TIE' && ctx.player === 'R' && ctx.opponent === 'R') {
        ctx.outcome = 'WIN';
        ctx.triggers.push({ source: 'big-rock-theory', text: 'Big Rock Theory: my rock is bigger. WIN.' });
      }
    },
  },
  {
    id: 'rock-bottom', name: 'Rock Bottom', tree: 'rock', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.bottom',
    tags: ['save', 'rock', 'desperation'], flavor: 'Only way is up. Or sideways. Into more rock.',
    describe: () => `While you have 0 Extra Lives: +${pct(ROCK_BOTTOM)} save chance when throwing Rock.`,
    saveChance: (s, _u, m) => (isRock(m) && s.lives === 0 ? ROCK_BOTTOM : 0),
  },
  {
    id: 'no-thoughts', name: 'No Thoughts Just Rock', tree: 'rock', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.nothoughts',
    tags: ['save', 'rock', 'economy', 'drawback'], flavor: '…',
    describe: () => `Throwing Rock: +${pct(NO_THOUGHTS_SAVE)} save chance. Wins and ties pay +${NO_THOUGHTS_COINS}. Drawback: ALL opponent intel is hidden (history, tendencies, hunches, leaks). Not offered if you own intel upgrades, and intel upgrades aren’t offered once you own it.`,
    saveChance: (_s, _u, m) => (isRock(m) ? NO_THOUGHTS_SAVE : 0),
    onReward: (ctx) => { if (onWinOrTie(ctx)) ctx.flatBonus += NO_THOUGHTS_COINS; },
    intel: (f: IntelFlags) => { f.hidden = true; },
  },
  {
    id: 'built-different', name: 'Built Different', tree: 'rock', rarity: 'epic', cost: 0, maxStacks: 1, icon: 'up.built',
    tags: ['rock', 'save', 'cap'], flavor: 'Doctors say it’s “just a rock.” Doctors are wrong.',
    describe: () => `Your save-chance cap for Rock rises from 60% to ${pct(BUILT_DIFFERENT_CAP)}.`,
    saveCap: (_s, _u, m) => (isRock(m) ? BUILT_DIFFERENT_CAP : undefined),
  },
  {
    id: 'monolith', name: 'Monolith', tree: 'rock', rarity: 'epic', cost: 0, maxStacks: 1, icon: 'up.monolith',
    tags: ['rock', 'save', 'charge'], flavor: 'Unmoved. Unbothered. Mildly ominous.',
    describe: () => `Each stage, your first Rock loss that isn’t otherwise saved becomes a tie — the first ${MONOLITH} in stages of ${MONOLITH_LONG}+ rounds. Recharges at every store.`,
    onRunStart: (s, u) => { u.data.charge = s.currentGap >= MONOLITH_LONG ? MONOLITH : 1; },
    onPurchase: (s, u, what) => { if (what === 'monolith') u.data.charge = s.currentGap >= MONOLITH_LONG ? MONOLITH : 1; },
    onOpponentChange: (s, u) => { u.data.charge = s.currentGap >= MONOLITH_LONG ? MONOLITH : 1; },
    chargePriority: 0,
    chargeSave: (ctx, u) => {
      if (isRock(ctx.player) && num(u, 'charge') > 0) { u.data.charge = num(u, 'charge') - 1; ctx.triggers.push({ source: 'monolith', text: `Monolith absorbed the hit (${u.data.charge} left this stage)` }); return true; }
      return false;
    },
  },
  {
    id: 'absolute-unit', name: 'Absolute Unit', tree: 'rock', rarity: 'legendary', cost: 0, maxStacks: 1, icon: 'up.unit',
    tags: ['rock', 'save', 'drawback'], flavor: 'In awe at the size of this lad.',
    describe: () => `Throwing Rock: +${pct(ABSOLUTE_SAVE)} save chance. Drawback: throwing Paper or Scissors costs ${ABSOLUTE_TAX} coins.`,
    saveChance: (_s, _u, m) => (isRock(m) ? ABSOLUTE_SAVE : 0),
    throwCost: (_s, _u, m) => (isRock(m) ? 0 : ABSOLUTE_TAX),
  },
];
const ROCK_IDS = new Set(ROCK.map((u) => u.id));
/** Distinct Rock upgrades owned other than Bedrock, 10% each, capped. */
export function bedrockDiscount(s: GameState): number {
  return Math.min(BEDROCK_MAX, BEDROCK_PER * s.owned.filter((o) => o.id !== 'bedrock' && ROCK_IDS.has(o.id)).length);
}

// ================== PAPER: INFORMATION AND PLANNING ========================
const AGREE = 5;
const CONFIRM = 3;
const STUDY_EVERY = 3, STUDY_MAX = 0.15;
const PEER_NEEDED = 4;
const FIVE_YEAR = 0.6;
const DUE_DILIGENCE = 0.15;
const SOURCES = 6;
const MASTERMIND = 0.2;
const CONTINGENCY = 1;
const COLD_READ = 0.12; // per copy, up to 2 copies
const INSTRUCTIONS = 0.85;
const TRAIL_PER = 0.03, TRAIL_MAX = 3; // per receipt; receipts per copy

function oppMostCommon(s: GameState): Move | null {
  const h = s.stageHistory;
  if (h.length < 3) return null;
  const c = { R: 0, P: 0, S: 0 } as Record<Move, number>;
  h.forEach((r) => c[r.opponent]++);
  return (['R', 'P', 'S'] as Move[]).reduce((a, b) => (c[b] > c[a] ? b : a));
}

const PAPER: UpgradeDef[] = [
  {
    id: 'do-your-research', name: 'Do Your Research', tree: 'paper', rarity: 'common', cost: 0, costOverride: 5, maxStacks: 1, icon: 'up.research',
    tags: ['info'], flavor: 'Read the wiki. Twice.',
    describe: () => 'Reveals every opponent’s archetype and tendency (what they tend to do). Cheap, because veterans already know.',
    intel: (f) => { f.behaviourText = true; },
  },
  {
    id: 'notes-app', name: 'Notes App', tree: 'paper', rarity: 'common', cost: 0, maxStacks: 1, icon: 'up.notes',
    tags: ['info'], flavor: '47 notes titled “thoughts”.',
    describe: () => 'History shows the last 10 rounds instead of 5, plus a running count of what this opponent has thrown.',
    intel: (f) => { f.historyWindow = Math.max(f.historyWindow, 10); f.frequencies = true; },
  },
  {
    id: 'agree-to-disagree', name: 'Agree to Disagree', tree: 'paper', rarity: 'common', cost: 0, maxStacks: 2, icon: 'up.handshake',
    tags: ['tie', 'economy'], flavor: 'A mature, well-documented stalemate.',
    describe: (n) => `Ties pay +${AGREE * n} coins.`,
    perCopy: `+${AGREE} coins per tie`,
    onReward: (ctx, u) => { if (ctx.outcome === 'TIE' && !ctx.saved) { ctx.flatBonus += AGREE * u.stacks; ctx.triggers.push({ source: 'agree-to-disagree', text: `Agree to Disagree +${AGREE * u.stacks}` }); } },
  },
  {
    id: 'confirmation-bias', name: 'Confirmation Bias', tree: 'paper', rarity: 'common', cost: 0, maxStacks: 2, icon: 'up.bias',
    tags: ['economy'], flavor: 'Knew it. Always knew it.',
    describe: (n) => `When you win or tie while the opponent throws their most common move this stage, +${CONFIRM * n} coins.`,
    perCopy: `+${CONFIRM} coins`,
    onReward: (ctx, u) => {
      const mc = oppMostCommon(ctx.state);
      if (mc && mc === ctx.opponent && onWinOrTie(ctx)) { ctx.flatBonus += CONFIRM * u.stacks; ctx.triggers.push({ source: 'confirmation-bias', text: `Confirmation Bias +${CONFIRM * u.stacks} (called it)` }); }
    },
  },
  {
    id: 'study-session', name: 'Study Session', tree: 'paper', rarity: 'common', cost: 0, maxStacks: 1, icon: 'up.study',
    tags: ['save', 'scaling'], flavor: 'Flashcards about one specific person.',
    describe: () => `+1% save chance (any throw) for every ${STUDY_EVERY} rounds against the current opponent (max +${pct(STUDY_MAX)}). Resets with a new opponent.`,
    saveChance: (s) => Math.min(STUDY_MAX, 0.01 * Math.floor(s.stageHistory.length / STUDY_EVERY)),
    scaling: { label: 'Save bonus vs this opponent', cap: pct(STUDY_MAX), value: (s) => `+${pct(Math.min(STUDY_MAX, 0.01 * Math.floor(s.stageHistory.length / STUDY_EVERY)))}` },
  },
  {
    id: 'paper-trail', name: 'Paper Trail', tree: 'paper', rarity: 'uncommon', cost: 0, maxStacks: 3, icon: 'up.trail',
    tags: ['save', 'scaling'], flavor: 'Keep your receipts. Especially the winning ones.',
    describe: (n) => `Each win against this opponent files a Receipt (max ${TRAIL_MAX}). Each Receipt gives +${pct(TRAIL_PER * n)} save chance with any throw. Receipts are shredded when a new opponent arrives.`,
    perCopy: `+${pct(TRAIL_PER)} save chance per Receipt`,
    onWin: (ctx, u) => { if (num(u, 'receipts') < TRAIL_MAX) { u.data.receipts = num(u, 'receipts') + 1; ctx.triggers.push({ source: 'paper-trail', text: `Receipt filed (${u.data.receipts}/${TRAIL_MAX})` }); } },
    onOpponentChange: (_s, u) => { u.data.receipts = 0; },
    saveChance: (_s, u) => TRAIL_PER * u.stacks * Math.min(TRAIL_MAX, num(u, 'receipts')),
    scaling: { label: 'Receipts', cap: `${TRAIL_MAX}`, value: (_s, u) => `${num(u, 'receipts')}/${TRAIL_MAX} (+${pct(TRAIL_PER * u.stacks * Math.min(TRAIL_MAX, num(u, 'receipts')))} save)` },
  },
  {
    id: 'cold-read', name: 'Cold Read', tree: 'paper', rarity: 'uncommon', cost: 0, maxStacks: 2, icon: 'up.coldread',
    tags: ['info'], flavor: 'You’re not a Scissors person. I can tell.',
    describe: (n) => `Each round, a ${pct(COLD_READ * n)} chance to learn one throw the opponent did NOT pick this round, so their real throw is one of the other two.`,
    perCopy: `+${pct(COLD_READ)} chance per round`,
    intel: (f, u) => { f.coldReadChance = Math.max(f.coldReadChance, COLD_READ * u.stacks); },
  },
  {
    id: 'spreadsheet', name: 'Spreadsheet', tree: 'paper', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.sheet',
    tags: ['info', 'prediction'], flavor: 'Actually, I made a spreadsheet.',
    describe: () => 'Adds a Hunch: their most likely throw with a confidence %, a suggested throw, and win/lose odds on each button. Built from their history (and their tendency, if you’ve done your research).',
    intel: (f) => { f.prediction = Math.max(f.prediction, 1) as 0 | 1 | 2; },
  },
  {
    id: 'peer-review', name: 'Peer Review', tree: 'paper', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.peer',
    tags: ['tie', 'save', 'charge'], flavor: 'Two reviewers agree. Reviewer 3 hated it.',
    describe: () => `Each genuine tie earns a Citation (max ${PEER_NEEDED}). With ${PEER_NEEDED} Citations, your next unsaved loss becomes a tie and spends them. Works once per stage (the lock lifts at every store; banked Citations carry over).`,
    onStoreExit: (_s, u) => { u.data.usedThisStage = 0; },
    onTie: (ctx, u) => { if (!ctx.saved && num(u, 'cites') < PEER_NEEDED) { u.data.cites = num(u, 'cites') + 1; ctx.triggers.push({ source: 'peer-review', text: `Citation earned (${u.data.cites}/${PEER_NEEDED})` }); } },
    chargePriority: 2,
    chargeSave: (ctx, u) => {
      if (num(u, 'cites') >= PEER_NEEDED && !num(u, 'usedThisStage')) { u.data.cites = 0; u.data.usedThisStage = 1; ctx.triggers.push({ source: 'peer-review', text: 'Peer Review: loss retracted after review' }); return true; }
      return false;
    },
    scaling: { label: 'Citations', cap: `${PEER_NEEDED}`, value: (_s, u) => `${num(u, 'cites')}/${PEER_NEEDED}${num(u, 'usedThisStage') ? ' (used this stage)' : ''}` },
  },
  {
    id: 'five-year-plan', name: 'Five-Year Plan', tree: 'paper', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.plan',
    tags: ['reroll', 'info'], flavor: 'Year one: Rock. Years two through five: TBD.',
    describe: () => `Opponent rerolls cost ${pct(1 - FIVE_YEAR)} less, and you can see your next opponent during the stage.`,
    opponentRerollMult: () => FIVE_YEAR,
    intel: (f) => { f.showNextOpponent = true; },
  },
  {
    id: 'due-diligence', name: 'Due Diligence', tree: 'paper', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.diligence',
    tags: ['save', 'prediction', 'synergy'], requires: ['spreadsheet', 'predictive-analytics'],
    flavor: 'Followed the process. The process is the defence.',
    describe: () => `+${pct(DUE_DILIGENCE)} save chance when you throw the Hunch’s suggested move. Requires Spreadsheet or Predictive Analytics.`,
    saveChance: (s, _u, m) => (s.roundPrediction && s.roundPrediction.recommended === m ? DUE_DILIGENCE : 0),
  },
  {
    id: 'compound-interest', name: 'Compound Interest', tree: 'paper', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.interest',
    tags: ['economy', 'scaling'], flavor: 'Money makes money. Slowly. Within reason.',
    describe: () => `On entering a store, gain 12% of your coins (max +45 per store).`,
    onStoreEnter: (s, _u, t) => {
      const g = Math.min(45, Math.floor(s.currency * 0.12));
      if (g > 0) { s.currency += g; s.stats.currencyEarned += g; t.push({ source: 'compound-interest', text: `Compound Interest +${g}` }); }
    },
  },
  {
    id: 'predictive-analytics', name: 'Predictive Analytics', tree: 'paper', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.analytics',
    tags: ['info', 'prediction'], flavor: 'Machine learning, but it’s a guy with a clipboard.',
    describe: () => 'A sharper Hunch: tests several pattern models (their last throw, yours, how they react to winning…) and trusts whichever has been right most lately. Includes everything Spreadsheet does.',
    intel: (f) => { f.prediction = 2; },
  },
  {
    id: 'i-have-sources', name: 'I Have Sources', tree: 'paper', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.sources',
    tags: ['economy', 'prediction', 'synergy'], requires: ['spreadsheet', 'predictive-analytics'],
    flavor: 'Citation needed. Citation provided.',
    describe: () => `Winning by beating the Hunch’s predicted throw pays +${SOURCES} coins. Requires Spreadsheet or Predictive Analytics.`,
    onReward: (ctx) => {
      const p = ctx.state.roundPrediction;
      if (p && ctx.outcome === 'WIN' && !ctx.saved && ctx.player === beats(p.predicted)) { ctx.flatBonus += SOURCES; ctx.triggers.push({ source: 'i-have-sources', text: `I Have Sources +${SOURCES}` }); }
    },
  },
  {
    id: 'contingency-plan', name: 'Contingency Plan', tree: 'paper', rarity: 'epic', cost: 0, maxStacks: 1, icon: 'up.contingency',
    tags: ['save', 'charge'], flavor: 'Plan A was Rock. Plan B is also documented.',
    describe: () => `Once per stage, your first loss that isn’t otherwise saved becomes a tie (any throw). Recharges at every store.`,
    onRunStart: (_s, u) => { u.data.charge = CONTINGENCY; },
    onStoreExit: (_s, u) => { u.data.charge = CONTINGENCY; },
    chargePriority: 1,
    chargeSave: (ctx, u) => {
      if (num(u, 'charge') > 0) { u.data.charge = num(u, 'charge') - 1; ctx.triggers.push({ source: 'contingency-plan', text: `Contingency Plan executed (${u.data.charge} left this stage)` }); return true; }
      return false;
    },
    scaling: { label: 'Plans left this stage', cap: `${CONTINGENCY}`, value: (_s, u) => `${num(u, 'charge')}` },
  },
  {
    id: 'read-the-instructions', name: 'Actually I Read the Instructions', tree: 'paper', rarity: 'legendary', cost: 0, maxStacks: 1, icon: 'up.manual',
    tags: ['info'], flavor: 'Page 1: “Welcome.” Page 2: everything.',
    describe: () => `On ${pct(INSTRUCTIONS)} of rounds, each throw button shows your TRUE chance to win and lose (their real odds, rounded to 5%). The other rounds, the page is smudged. They still roll the dice.`,
    intel: (f) => { f.trueOdds = true; f.trueOddsChance = Math.max(f.trueOddsChance, INSTRUCTIONS); },
  },
  {
    id: 'mastermind', name: 'Mastermind', tree: 'paper', rarity: 'legendary', cost: 0, maxStacks: 1, icon: 'up.mastermind',
    tags: ['info', 'leak'], flavor: 'Has a guy on the inside. The guy is also a rock.',
    describe: () => `Each round there is a ${pct(MASTERMIND)} chance the opponent’s locked-in throw leaks to you before you choose. You’ll see a banner when it happens.`,
    intel: (f) => { f.leakChance = Math.max(f.leakChance, MASTERMIND); },
  },
];

// ================ SCISSORS: SHARP-EDGED RISK TAKING ========================
const RISKY_WIN = 1.5, RISKY_TIE = 0.5;
const GO_FOR_IT = 4;
const MOMENTUM_PER = 0.1, MOMENTUM_MAX = 1.0;
const CUT_UP = 0.8, CUT_LIFE = 1.2;
const YOLO = 1.5;
const HIGH_STAKES = 12;
const SHARPEN_MAX = 12;
const STANDOFF_MAX = 4;
const MAX_EFFORT = 0.15, MAX_EFFORT_STREAK = 3;
const DEATH_WISH_COINS = 50, DEATH_WISH_ROUNDS = 5;
const SEEMS_FINE = 0.3;
const FRAUD = 0.6;
const GLASS_MULT = 2, GLASS_CAP = 0.5;
const NO_NET_MULT = 2.5;
const HUSH_BASE = 30;
const SNIP = 4;
const SCARS_MAX = 6;
export const hushPrice = (u: OwnedUpgrade) => HUSH_BASE * Math.pow(2, num(u, 'uses'));

const SCISSORS: UpgradeDef[] = [
  {
    id: 'risky-business', name: 'Risky Business', tree: 'scissors', rarity: 'common', cost: 0, maxStacks: 1, icon: 'up.risky',
    tags: ['economy', 'win'], flavor: 'Ties are for cowards and accountants.',
    describe: () => `Wins pay ${pct(RISKY_WIN - 1)} more. Ties pay ${pct(1 - RISKY_TIE)} less.`,
    onReward: (ctx) => { if (ctx.outcome === 'WIN') ctx.bonusPct += RISKY_WIN - 1; else if (ctx.outcome === 'TIE' && !ctx.saved) ctx.bonusPct -= 1 - RISKY_TIE; },
  },
  {
    id: 'go-for-it', name: 'Go For It', tree: 'scissors', rarity: 'common', cost: 0, maxStacks: 2, icon: 'up.goforit',
    tags: ['economy', 'switch'], flavor: 'Commitment is for rocks.',
    describe: (n) => `Winning with a different throw than your previous one pays +${GO_FOR_IT * n} coins. Your previous throw carries over between stores.`,
    perCopy: `+${GO_FOR_IT} coins per switch-win`,
    onReward: (ctx, u) => {
      const prev = lastPlayerMove(ctx.state);
      if (ctx.outcome === 'WIN' && prev && prev !== ctx.player) { ctx.flatBonus += GO_FOR_IT * u.stacks; ctx.triggers.push({ source: 'go-for-it', text: `Go For It +${GO_FOR_IT * u.stacks}` }); }
    },
  },
  {
    id: 'snip-snip', name: 'Snip Snip', tree: 'scissors', rarity: 'common', cost: 0, maxStacks: 3, icon: 'up.snip',
    tags: ['economy', 'scissors'], flavor: 'The sound of money. Also of a haircut going wrong.',
    describe: (n) => `Winning with Scissors pays +${SNIP * n} coins.`,
    perCopy: `+${SNIP} coins per Scissors win`,
    onReward: (ctx, u) => { if (ctx.outcome === 'WIN' && ctx.player === 'S') { ctx.flatBonus += SNIP * u.stacks; ctx.triggers.push({ source: 'snip-snip', text: `Snip Snip +${SNIP * u.stacks}` }); } },
  },
  {
    id: 'close-shave', name: 'Close Shave', tree: 'scissors', rarity: 'uncommon', cost: 0, maxStacks: 3, icon: 'up.shave',
    tags: ['economy', 'scaling', 'lives'], flavor: 'Every scar tells a story. The story is “profit”.',
    describe: (n) => `Every loss you survive (saved, or covered by an Extra Life) leaves a Scar (max ${SCARS_MAX} per run). Every win pays +${n} coin${n === 1 ? '' : 's'} per Scar.`,
    perCopy: '+1 coin per Scar on wins',
    onLoss: (ctx, u) => { if ((ctx.saved || ctx.survived) && num(u, 'scars') < SCARS_MAX) { u.data.scars = num(u, 'scars') + 1; ctx.triggers.push({ source: 'close-shave', text: `Close Shave: Scar ${u.data.scars}/${SCARS_MAX}` }); } },
    onReward: (ctx, u) => { const b = num(u, 'scars') * u.stacks; if (ctx.outcome === 'WIN' && b > 0) { ctx.flatBonus += b; ctx.triggers.push({ source: 'close-shave', text: `Scars +${b}` }); } },
    scaling: { label: 'Scars', cap: `${SCARS_MAX}`, value: (_s, u) => `${num(u, 'scars')}/${SCARS_MAX} (+${num(u, 'scars') * u.stacks} per win)` },
  },
  {
    id: 'momentum', name: 'Momentum', tree: 'scissors', rarity: 'common', cost: 0, maxStacks: 1, icon: 'up.momentum',
    tags: ['economy', 'streak', 'scaling'], flavor: 'An object in motion stays insufferable.',
    describe: () => `Each consecutive win before this one adds +${pct(MOMENTUM_PER)} to win payouts (max +${pct(MOMENTUM_MAX)}). Resets on a tie or loss. Streaks carry over between stores.`,
    onReward: (ctx) => {
      if (ctx.outcome !== 'WIN') return;
      const b = Math.min(MOMENTUM_MAX, MOMENTUM_PER * winStreak(ctx.state));
      if (b > 0) { ctx.bonusPct += b; ctx.triggers.push({ source: 'momentum', text: `Momentum +${pct(b)}` }); }
    },
    scaling: { label: 'Win payout bonus', cap: `+${pct(MOMENTUM_MAX)}`, value: (s) => `+${pct(Math.min(MOMENTUM_MAX, MOMENTUM_PER * winStreak(s)))}` },
  },
  {
    id: 'just-one-more', name: 'Just One More', tree: 'scissors', rarity: 'common', cost: 0, maxStacks: 1, icon: 'up.onemore',
    tags: ['reroll', 'store'], flavor: 'This reroll will be the one.',
    describe: () => 'Your first store reroll in each store visit is free. (It doesn’t carry over: if you’ve already rerolled this visit, you pay.)',
    freeStoreRerolls: () => 1,
  },
  {
    id: 'cut-corners', name: 'Cut Corners', tree: 'scissors', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.corners',
    tags: ['economy', 'store', 'drawback'], flavor: 'Structural integrity is a suggestion.',
    describe: () => `Upgrades cost ${pct(1 - CUT_UP)} less. Drawback: Extra Lives cost ${pct(CUT_LIFE - 1)} more.`,
    upgradePriceMult: () => CUT_UP,
    lifePriceMult: () => CUT_LIFE,
  },
  {
    id: 'yolo', name: 'YOLO', tree: 'scissors', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.yolo',
    tags: ['economy', 'desperation'], flavor: 'You only live once. Specifically, right now.',
    describe: () => `While you have 0 Extra Lives, payouts +${pct(YOLO - 1)}.`,
    onReward: (ctx) => { if (ctx.state.lives === 0) { ctx.bonusPct += YOLO - 1; } },
  },
  {
    id: 'high-stakes', name: 'High Stakes', tree: 'scissors', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.stakes',
    tags: ['economy', 'scissors', 'drawback'], flavor: 'Big bets, sharp edges.',
    describe: () => `Winning with Scissors pays +${HIGH_STAKES}. Drawback: losses while throwing Scissors can’t be saved (lives still work).`,
    onReward: (ctx) => { if (ctx.outcome === 'WIN' && ctx.player === 'S') { ctx.flatBonus += HIGH_STAKES; ctx.triggers.push({ source: 'high-stakes', text: `High Stakes +${HIGH_STAKES}` }); } },
    canSave: (_s, _u, m) => m !== 'S',
  },
  {
    id: 'sharpening-stone', name: 'Sharpening Stone', tree: 'scissors', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.whetstone',
    tags: ['economy', 'scissors', 'scaling'], flavor: 'Sharper every time. Dangerously so.',
    describe: () => `Each Scissors win permanently adds +1 to ALL win payouts (max +${SHARPEN_MAX}). Losing an Extra Life halves the bonus.`,
    onWin: (ctx, u) => { if (ctx.player === 'S') u.data.bonus = Math.min(SHARPEN_MAX, num(u, 'bonus') + 1); },
    onReward: (ctx, u) => { if (ctx.outcome === 'WIN' && num(u, 'bonus') > 0) ctx.flatBonus += num(u, 'bonus'); },
    onLifeConsumed: (ctx, u) => { u.data.bonus = Math.floor(num(u, 'bonus') / 2); ctx.triggers.push({ source: 'sharpening-stone', text: 'Sharpening Stone dulled (bonus halved)' }); },
    scaling: { label: 'Win payout bonus', cap: `+${SHARPEN_MAX}`, value: (_s, u) => `+${num(u, 'bonus')}` },
  },
  {
    id: 'standoff', name: 'Standoff', tree: 'scissors', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.standoff',
    tags: ['tie', 'economy', 'streak'], flavor: 'Nobody move. Seriously, nobody.',
    describe: () => `Consecutive ties boost tie payouts: 2nd tie +100%, 3rd +200%, up to +${(STANDOFF_MAX - 1) * 100}%. Streaks carry over between stores.`,
    onReward: (ctx) => {
      if (ctx.outcome !== 'TIE' || ctx.saved) return;
      const m = Math.min(STANDOFF_MAX, 1 + tieStreak(ctx.state));
      if (m > 1) { ctx.bonusPct += m - 1; ctx.triggers.push({ source: 'standoff', text: `Standoff +${(m - 1) * 100}%` }); }
    },
  },
  {
    id: 'maximum-effort', name: 'Maximum Effort', tree: 'scissors', rarity: 'uncommon', cost: 0, maxStacks: 1, icon: 'up.effort',
    tags: ['save', 'streak'], flavor: 'Adrenaline is a defensive stat.',
    describe: () => `While on a ${MAX_EFFORT_STREAK}+ win streak: +${pct(MAX_EFFORT)} save chance with any throw.`,
    saveChance: (s) => (winStreak(s) >= MAX_EFFORT_STREAK ? MAX_EFFORT : 0),
  },
  {
    id: 'double-or-nothing', name: 'Double or Nothing', tree: 'scissors', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.allin',
    tags: ['economy', 'gamble', 'active'], flavor: 'Technically triple or nothing. Legal made us say double.',
    describe: () => 'Unlocks the ALL-IN toggle: that round a win pays ×3, a tie pays nothing (and doesn’t count as a tie for your other upgrades), and saves are disabled.',
    allowsAllIn: true,
  },
  {
    id: 'hush-money', name: 'Hush Money', tree: 'scissors', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.hush',
    tags: ['save', 'economy', 'charge'], flavor: 'Nobody saw anything. Especially not the scissors.',
    describe: () => `Automatic last resort: when you would lose, nothing else saves you, and you have no Extra Life left, it pays to turn the loss into a tie (if you can afford it). First bribe ${HUSH_BASE} coins, then the price doubles every use for the rest of the run. Your build panel shows the next price.`,
    chargeSave: (ctx, u) => {
      if (ctx.state.lives > 0) return false; // lives go first; the bribe is the last resort
      const price = hushPrice(u);
      if (ctx.state.currency >= price) {
        ctx.state.currency -= price; ctx.state.stats.currencySpent += price;
        u.data.uses = num(u, 'uses') + 1;
        ctx.triggers.push({ source: 'hush-money', text: `Hush Money paid ${price}¢: loss became a tie (used ${u.data.uses}×, next ${hushPrice(u)}¢)` });
        return true;
      }
      ctx.triggers.push({ source: 'hush-money', text: `Hush Money couldn’t pay: next bribe costs ${price}¢` });
      return false;
    },
    chargeIsPaid: true,
    scaling: { label: 'Bribes', cap: 'price doubles per use', value: (_s, u) => `used ${num(u, 'uses')}×, next ${hushPrice(u)}¢` },
  },
  {
    id: 'death-wish', name: 'Death Wish', tree: 'scissors', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.deathwish',
    tags: ['lives', 'economy'], flavor: 'Near-death experiences are very motivating.',
    describe: () => `When an Extra Life is consumed: +${DEATH_WISH_COINS} coins and your next ${DEATH_WISH_ROUNDS} rounds pay +100%.`,
    onLifeConsumed: (ctx, u) => {
      ctx.state.currency += DEATH_WISH_COINS; ctx.state.stats.currencyEarned += DEATH_WISH_COINS;
      u.data.left = DEATH_WISH_ROUNDS + 1; // +1 because this round's end ticks it
      ctx.triggers.push({ source: 'death-wish', text: `Death Wish +${DEATH_WISH_COINS}, +100% pay for ${DEATH_WISH_ROUNDS} rounds` });
    },
    onReward: (ctx, u) => { if (num(u, 'left') > 0) ctx.bonusPct += 1; },
    onRoundEnd: (_ctx, u) => { if (num(u, 'left') > 0) u.data.left = num(u, 'left') - 1; },
  },
  {
    id: 'this-seems-fine', name: 'This Seems Fine', tree: 'scissors', rarity: 'rare', cost: 0, maxStacks: 1, icon: 'up.fine',
    tags: ['lives'], flavor: 'The room is on fire. The room has always been on fire.',
    describe: () => `When an Extra Life would be consumed, ${pct(SEEMS_FINE)} chance you keep it anyway.`,
    preventLifeLoss: (ctx) => {
      if (nextRandom(ctx.state) < SEEMS_FINE) { ctx.triggers.push({ source: 'this-seems-fine', text: 'This Seems Fine: kept the Extra Life somehow' }); return true; }
      return false;
    },
  },
  {
    id: 'insurance-fraud', name: 'Insurance Fraud', tree: 'scissors', rarity: 'epic', cost: 0, maxStacks: 1, icon: 'up.fraud',
    tags: ['lives', 'economy'], flavor: 'The rock fell on its own, officer.',
    describe: () => `When an Extra Life is consumed, refund ${pct(FRAUD)} of the price you paid for the last life you bought (starting lives were free, so until you buy one it refunds nothing).`,
    onLifeConsumed: (ctx) => {
      const g = Math.floor(ctx.state.lastLifePrice * FRAUD);
      if (g > 0) { ctx.state.currency += g; ctx.state.stats.currencyEarned += g; ctx.triggers.push({ source: 'insurance-fraud', text: `Insurance Fraud +${g}` }); }
    },
  },
  {
    id: 'glass-cannon', name: 'Glass Cannon', tree: 'scissors', rarity: 'epic', cost: 0, maxStacks: 1, icon: 'up.glass',
    tags: ['economy', 'drawback'], flavor: 'Hits hard. Shatters harder.',
    describe: () => `Payouts +${pct(GLASS_MULT - 1)}. Drawback: your save-chance cap is halved.`,
    onReward: (ctx) => { ctx.bonusPct += GLASS_MULT - 1; },
    saveCapMult: () => GLASS_CAP,
  },
  {
    id: 'no-safety-net', name: 'No Safety Net', tree: 'scissors', rarity: 'legendary', cost: 0, maxStacks: 1, icon: 'up.nonet',
    tags: ['economy', 'drawback', 'lives'], flavor: 'The net was holding you back.',
    describe: () => `Payouts +${pct(NO_NET_MULT - 1)}. Drawback: you can’t buy an Extra Life while you already hold one. Lives you already have are kept.`,
    onReward: (ctx) => { ctx.bonusPct += NO_NET_MULT - 1; },
    maxLives: () => 1,
  },
];

export const UPGRADES: UpgradeDef[] = [...ROCK, ...PAPER, ...SCISSORS];

// Fill in costs from rarity unless an upgrade overrides it.
export function applyRarityCosts(table: Record<string, number>): void {
  for (const u of UPGRADES) u.cost = u.costOverride ?? table[u.rarity];
}

// used by describe/debug helpers
export { clamp };
export type { OwnedUpgrade };
