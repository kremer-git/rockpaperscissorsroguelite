import type { OpponentDef } from '../core/types';

// Opponents are behaviour models, not stat blocks. Each weight nudges the
// opponent toward a move given information the PLAYER can also see (history).
// `randomness` is a floor: every move keeps at least that probability, which is
// why even perfect information never becomes perfect prediction.
// Opponents always commit their throw before the player chooses.

export const OPPONENTS: OpponentDef[] = [
  // ---------- EASY: exploitable once you notice the habit ----------
  {
    id: 'repeater', name: 'Gary', title: 'Still Uses His First Password', archetype: 'The Repeater', portrait: 'opp.repeater', tier: 'easy', difficulty: 1,
    flavor: 'Found something that works. Will not be taking questions.',
    tell: 'Strongly tends to repeat whatever it threw last round.',
    base: [1, 1, 1], randomness: 0.04, repeatOwn: 4,
  },
  {
    id: 'rock-enjoyer', name: 'Hank', title: 'Collects Countertop Samples', archetype: 'Rock Enjoyer', portrait: 'opp.rock', tier: 'easy', difficulty: 1,
    flavor: 'Has a favourite. You can probably guess which.',
    tell: 'Throws Rock most of the time. After losing three times in a row, briefly loses faith and avoids Rock.',
    base: [0.8, 0.1, 0.1], randomness: 0.04, tiltAfterLosses: { losses: 3, weight: 1.5 },
  },
  {
    id: 'paper-pusher', name: 'Pam', title: 'Prints Out Her Emails', archetype: 'Paper Pusher', portrait: 'opp.paper', tier: 'easy', difficulty: 1,
    flavor: 'Middle management energy. Loves a good document.',
    tell: 'Throws Paper most of the time. After losing three times in a row, briefly avoids Paper.',
    base: [0.1, 0.8, 0.1], randomness: 0.04, tiltAfterLosses: { losses: 3, weight: 1.5 },
  },
  {
    id: 'scissor-sister', name: 'Cassie', title: 'Cuts Her Own Bangs', archetype: 'Scissor Sister', portrait: 'opp.scissors', tier: 'easy', difficulty: 1,
    flavor: 'Runs with scissors. Professionally.',
    tell: 'Throws Scissors most of the time. After losing three times in a row, briefly avoids Scissors.',
    base: [0.1, 0.1, 0.8], randomness: 0.04, tiltAfterLosses: { losses: 3, weight: 1.5 },
  },
  {
    id: 'cycler', name: 'Otto', title: 'Rotates His Tires Religiously', archetype: 'The Cycler', portrait: 'opp.cycler', tier: 'easy', difficulty: 2,
    flavor: 'Believes in taking turns. All three of them.',
    tell: 'Tends to throw the move that beats its own last throw: Rock → Paper → Scissors → Rock.',
    base: [1, 1, 1], randomness: 0.04, cycle: 4,
  },
  {
    id: 'mimic', name: 'Polly', title: 'Will Have What You’re Having', archetype: 'The Mimic', portrait: 'opp.mimic', tier: 'easy', difficulty: 2,
    flavor: 'Sincerest form of flattery. Also the only form.',
    tell: 'Tends to copy YOUR previous throw.',
    base: [1, 1, 1], randomness: 0.05, copyPlayer: 4,
  },
  // ---------- MEDIUM: react to results or to you ----------
  {
    id: 'loop', name: 'Lenny', title: 'Has Had the Same Song Stuck in His Head Since 2009', archetype: 'The Loop', portrait: 'opp.loop', tier: 'medium', difficulty: 3,
    flavor: 'Da da DUM, da da DUM. He can’t stop. He won’t stop.',
    tell: 'Plays one short sequence (3 or 4 throws) over and over, like R, R, P, S, R, R, P, S… He picks a new sequence each time you meet, and it restarts after every store.',
    base: [1, 1, 1], randomness: 0.06, loop: { weight: 5, minLen: 3, maxLen: 4 },
  },
  {
    id: 'superstitious', name: 'Sal', title: 'Knocks on Wood. Twice.', archetype: 'The Superstitious', portrait: 'opp.superstitious', tier: 'medium', difficulty: 3,
    flavor: 'Wearing the lucky socks. Has not washed the lucky socks.',
    tell: 'Never repeats a throw that just lost: that throw is cursed now. Keeps a throw that just won. After a tie, moves on to the next throw (Rock → Paper → Scissors).',
    base: [1, 1, 1], randomness: 0.08, avoidLoser: 0, winStay: 2.5, cycle: 2,
  },
  {
    id: 'contrarian', name: 'Connor', title: 'Always Has a Rebuttal', archetype: 'The Contrarian', portrait: 'opp.contrarian', tier: 'medium', difficulty: 3,
    flavor: 'Well, actually…',
    tell: 'Tends to throw whatever would have beaten YOUR previous throw.',
    base: [1, 1, 1], randomness: 0.05, counterPlayerLast: 4,
  },
  {
    id: 'hot-hand', name: 'Pete', title: 'Never Leaves a Winning Table', archetype: 'Hot Hand', portrait: 'opp.hot', tier: 'medium', difficulty: 3,
    flavor: 'If it ain’t broke, throw it again.',
    tell: 'After winning, repeats its throw. After losing, switches to whatever would have beaten you. After a tie, leans toward repeating.',
    base: [1, 1, 1], randomness: 0.05, winStay: 4, loseShift: 4, repeatOwn: 1.2,
  },
  {
    id: 'cold-hand', name: 'Olga', title: 'Suspicious of Good News', archetype: 'Cold Hand', portrait: 'opp.cold', tier: 'medium', difficulty: 3,
    flavor: 'Wins make her nervous. Losses make her stubborn.',
    tell: 'After winning, switches to the next move in the cycle (Rock → Paper → Scissors). After losing, stubbornly repeats. After a tie, leans toward the next move in the cycle.',
    base: [1, 1, 1], randomness: 0.05, winShift: 4, loseStay: 4, cycle: 1.2,
  },
  {
    id: 'collector', name: 'Carl', title: 'Eats His Skittles by Color', archetype: 'The Collector', portrait: 'opp.collector', tier: 'medium', difficulty: 3,
    flavor: 'Needs an even number of each. It’s a whole thing.',
    tell: 'Tends to throw whichever move it has thrown the LEAST against you so far.',
    base: [1, 1, 1], randomness: 0.05, leastPlayed: 4,
  },
  {
    id: 'gambler', name: 'Lou', title: 'Owns a Lucky Shirt', archetype: 'The Gambler', portrait: 'opp.gambler', tier: 'medium', difficulty: 3,
    flavor: 'Has a system. The system is vibes.',
    tell: 'Picks a lucky move and leans on it for a streak of 4–9 rounds, then picks a new one.',
    base: [1, 1, 1], randomness: 0.05, favoritePhase: { weight: 4, minLen: 4, maxLen: 9 },
  },
  // ---------- HARD: adapt to your habits ----------
  {
    id: 'psychologist', name: 'Sigrid', title: 'Takes Notes at Dinner', archetype: 'The Psychologist', portrait: 'opp.psych', tier: 'hard', difficulty: 4,
    flavor: 'Tell me about your Rock.',
    tell: 'Watches your last 6 throws and counters your most common one. The more lopsided your habits, the harder it commits.',
    base: [1, 1, 1], randomness: 0.06, counterPlayerFreq: { weight: 4, window: 6 },
  },
  {
    id: 'mirror', name: 'Miranda', title: 'Laughs a Beat Late', archetype: 'The Mirror', portrait: 'opp.mirror', tier: 'hard', difficulty: 4,
    flavor: 'Is on a slight delay.',
    tell: 'Tends to throw what YOU threw two rounds ago.',
    base: [1, 1, 1], randomness: 0.06, mirrorTwoBack: 4,
  },
  {
    id: 'chaos-engine', name: 'Kai', title: 'Brought a Theremin', archetype: 'The Chaos Engine', portrait: 'opp.chaos', tier: 'hard', difficulty: 4,
    flavor: 'Beep boop. Entropy.',
    tell: 'Looks random, but leans toward the move that beats its own throw from two rounds ago.',
    base: [1, 1, 1], randomness: 0.07, echoTwoBack: 3,
  },
  {
    id: 'mood-swings', name: 'Moira', title: 'Returned the Same Couch Twice', archetype: 'Mood Swings', portrait: 'opp.moods', tier: 'hard', difficulty: 4,
    flavor: 'Two moods. Neither of them is “fine”.',
    tell: 'Switches mood every 5 rounds (the badge shows which). Stubborn: repeats her own last throw. Spiteful: throws whatever would have beaten YOUR last throw.',
    base: [1, 1, 1], randomness: 0.08,
    moods: { period: 5, a: { repeatOwn: 3 }, b: { counterPlayerLast: 3 }, names: ['Stubborn', 'Spiteful'] },
  },
  // ---------- ELITE ----------
  {
    id: 'oracle', name: 'Delphine', title: 'Finishes Your Sentences', archetype: 'The Oracle', portrait: 'opp.oracle', tier: 'elite', difficulty: 5,
    flavor: 'Has read your chat history. Metaphorically.',
    tell: 'Learns what you usually throw after your previous throw and counters it; also punishes favourite moves. Being unpredictable is the defence.',
    base: [1, 1, 1], randomness: 0.07, counterPlayerBigram: 4, counterPlayerFreq: { weight: 1.5, window: 10 },
  },
  {
    id: 'bluffer', name: 'Felix', title: 'Tells You Exactly What He’ll Do', archetype: 'The Bluffer', portrait: 'opp.bluffer', tier: 'elite', difficulty: 5,
    flavor: 'Wears sunglasses indoors. Announces his throw. Lies about it.',
    tell: 'Announces a throw, then usually throws whatever beats the throw that would beat his announcement. He also remembers how you answered his last announcement and expects the same answer again.',
    base: [1, 1, 1], randomness: 0.08, bluff: { bluff: 2, honest: 0.8, read: 2.5 },
  },
  {
    id: 'nash', name: 'John', title: 'Has No Tells. None.', archetype: 'The Nash Equilibrium', portrait: 'opp.nash', tier: 'elite', difficulty: 5, weight: 0.5,
    flavor: 'Emotionally unavailable. Mathematically unbeatable.',
    tell: 'Perfectly random. No pattern exists. Your only tools here are saves, lives, and an opponent reroll.',
    base: [1, 1, 1], randomness: 1 / 3,
  },
];

export const OPPONENTS_BY_ID: Record<string, OpponentDef> = Object.fromEntries(OPPONENTS.map((o) => [o.id, o]));
