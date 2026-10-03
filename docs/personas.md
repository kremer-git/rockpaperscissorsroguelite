# Personas (generated from src/content/opponents.ts — edit that file, then re-run `npx tsx scripts/export-personas.ts`)

## Gary — “Still Uses His First Password”

- **Archetype:** The Repeater · **tier:** easy (from stage 0)
- **Tendency text:** Strongly tends to repeat whatever it threw last round.
- **Model:** base R/P/S 1/1/1, randomness floor 0.04; repeats its own last throw (repeatOwn=4)

## Hank — “Collects Countertop Samples”

- **Archetype:** Rock Enjoyer · **tier:** easy (from stage 0)
- **Tendency text:** Throws Rock most of the time. After losing three times in a row, briefly loses faith and avoids Rock.
- **Model:** base R/P/S 0.8/0.1/0.1, randomness floor 0.04; abandons its favourite after a losing streak (tiltAfterLosses={"losses":3,"weight":1.5})

## Pam — “Prints Out Her Emails”

- **Archetype:** Paper Pusher · **tier:** easy (from stage 0)
- **Tendency text:** Throws Paper most of the time. After losing three times in a row, briefly avoids Paper.
- **Model:** base R/P/S 0.1/0.8/0.1, randomness floor 0.04; abandons its favourite after a losing streak (tiltAfterLosses={"losses":3,"weight":1.5})

## Cassie — “Cuts Her Own Bangs”

- **Archetype:** Scissor Sister · **tier:** easy (from stage 0)
- **Tendency text:** Throws Scissors most of the time. After losing three times in a row, briefly avoids Scissors.
- **Model:** base R/P/S 0.1/0.1/0.8, randomness floor 0.04; abandons its favourite after a losing streak (tiltAfterLosses={"losses":3,"weight":1.5})

## Otto — “Rotates His Tires Religiously”

- **Archetype:** The Cycler · **tier:** easy (from stage 0)
- **Tendency text:** Tends to throw the move that beats its own last throw: Rock → Paper → Scissors → Rock.
- **Model:** base R/P/S 1/1/1, randomness floor 0.04; throws what beats its own last throw (cycle=4)

## Polly — “Will Have What You’re Having”

- **Archetype:** The Mimic · **tier:** easy (from stage 0)
- **Tendency text:** Tends to copy YOUR previous throw.
- **Model:** base R/P/S 1/1/1, randomness floor 0.05; copies your last throw (copyPlayer=4)

## Lenny — “Has Had the Same Song Stuck in His Head Since 2009”

- **Archetype:** The Loop · **tier:** medium (from stage 4)
- **Tendency text:** Usually repeats a short sequence (3 or 4 throws), like R, R, P, S… but sometimes slips. New sequence each time you meet; it restarts after every store.
- **Model:** base R/P/S 1/1/1, randomness floor 0.06; repeats a short sequence (new one each encounter) (loop={"weight":5,"minLen":3,"maxLen":4})

## Sal — “Knocks on Wood. Twice.”

- **Archetype:** The Superstitious · **tier:** medium (from stage 4)
- **Tendency text:** Never repeats a throw that just lost: it’s cursed. Tends to keep a throw that just won. After a tie, tends to move on to the next throw (Rock → Paper → Scissors).
- **Model:** base R/P/S 1/1/1, randomness floor 0.08; throws what beats its own last throw (cycle=2); after winning, repeats (winStay=2.5); never repeats a throw that just lost (multiplier) (avoidLoser=0)

## Connor — “Always Has a Rebuttal”

- **Archetype:** The Contrarian · **tier:** medium (from stage 4)
- **Tendency text:** Tends to throw whatever would have beaten YOUR previous throw.
- **Model:** base R/P/S 1/1/1, randomness floor 0.05; beats your last throw (counterPlayerLast=4)

## Pete — “Never Leaves a Winning Table”

- **Archetype:** Hot Hand · **tier:** medium (from stage 4)
- **Tendency text:** After winning, tends to repeat its throw. After losing, tends to switch to whatever would have beaten you. After a tie, leans toward repeating.
- **Model:** base R/P/S 1/1/1, randomness floor 0.05; repeats its own last throw (repeatOwn=1.2); after winning, repeats (winStay=4); after losing, switches to what would have won (loseShift=4)

## Olga — “Suspicious of Good News”

- **Archetype:** Cold Hand · **tier:** medium (from stage 4)
- **Tendency text:** After winning, tends to switch to the next move in the cycle (Rock → Paper → Scissors). After losing, tends to stubbornly repeat. After a tie, leans toward the next move.
- **Model:** base R/P/S 1/1/1, randomness floor 0.05; throws what beats its own last throw (cycle=1.2); after winning, moves on in the cycle (winShift=4); after losing, repeats (loseStay=4)

## Carl — “Eats His Skittles by Color”

- **Archetype:** The Collector · **tier:** medium (from stage 4)
- **Tendency text:** Tends to throw whichever move it has thrown the LEAST against you so far.
- **Model:** base R/P/S 1/1/1, randomness floor 0.05; throws its least-used move (leastPlayed=4)

## Lou — “Owns a Lucky Shirt”

- **Archetype:** The Gambler · **tier:** medium (from stage 4)
- **Tendency text:** Picks a lucky move and leans on it for a streak of 4–9 rounds, then picks a new one.
- **Model:** base R/P/S 1/1/1, randomness floor 0.05; picks a lucky move for a streak (favoritePhase={"weight":4,"minLen":4,"maxLen":9})

## Sigrid — “Takes Notes at Dinner”

- **Archetype:** The Psychologist · **tier:** hard (from stage 5)
- **Tendency text:** Watches your last 6 throws and tends to counter your most common one. The more lopsided your habits, the harder it commits.
- **Model:** base R/P/S 1/1/1, randomness floor 0.06; beats your most common recent throw (counterPlayerFreq={"weight":4,"window":6})

## Miranda — “Laughs a Beat Late”

- **Archetype:** The Mirror · **tier:** hard (from stage 5)
- **Tendency text:** Tends to throw what YOU threw two rounds ago.
- **Model:** base R/P/S 1/1/1, randomness floor 0.06; copies your throw from 2 rounds ago (mirrorTwoBack=4)

## Kai — “Brought a Theremin”

- **Archetype:** The Chaos Engine · **tier:** hard (from stage 5)
- **Tendency text:** Looks random, but leans toward the move that beats its own throw from two rounds ago.
- **Model:** base R/P/S 1/1/1, randomness floor 0.07; beats its own throw from 2 rounds ago (echoTwoBack=3)

## Moira — “Returned the Same Couch Twice”

- **Archetype:** Mood Swings · **tier:** hard (from stage 5)
- **Tendency text:** Switches mood every 5 rounds (shown above your throws). Stubborn: tends to repeat her own last throw. Spiteful: tends to throw whatever would have beaten YOUR last throw.
- **Model:** base R/P/S 1/1/1, randomness floor 0.08; swaps between two behaviour sets every N rounds (moods={"period":5,"a":{"repeatOwn":3},"b":{"counterPlayerLast":3},"names":["Stubborn","Spiteful"]})

## Delphine — “Finishes Your Sentences”

- **Archetype:** The Oracle · **tier:** elite (from stage 7)
- **Tendency text:** Learns what you usually throw after your previous throw and tends to counter it; also punishes favourite moves. Being unpredictable is the defence.
- **Model:** base R/P/S 1/1/1, randomness floor 0.07; beats your most common recent throw (counterPlayerFreq={"weight":1.5,"window":10}); beats what you usually throw after your last throw (counterPlayerBigram=4)

## Felix — “Tells You Exactly What He’ll Do”

- **Archetype:** The Bluffer · **tier:** elite (from stage 7)
- **Tendency text:** Announces a throw, then usually throws whatever beats the throw that would beat his announcement. He also remembers how you answered his last announcement and expects the same answer again.
- **Model:** base R/P/S 1/1/1, randomness floor 0.08; announces a throw, then bluffs / tells the truth / beats how you answered last time (bluff={"bluff":2,"honest":0.8,"read":2.5})

## John — “Has No Tells. None.”

- **Archetype:** The Nash Equilibrium · **tier:** elite (from stage 7)
- **Tendency text:** Perfectly random. No pattern exists. Your only tools here are saves, lives, and an opponent reroll.
- **Model:** base R/P/S 1/1/1, randomness floor 0.3333333333333333; no rules (pure base odds)

