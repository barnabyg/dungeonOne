# Increment 12: equipment and economy release and player handoff

Issue #211, 6 October 2026, branch `feat/211-tinkers-toll`. Increment 12
adds named starting kits (#207), coin (#208), gear found, equipped, swapped
and dropped during an adventure (#209), merchants inside adventures (#210)
and settlement that replaces what a character holds (#206). This ticket
releases _The Tinker's Toll_, a module with a merchant and found gear, and
hands the increment to players. The [rules document](../character-rules.md)
lists the catalogue, the kits, trading and every abstraction.

The evidence comes in three kinds, kept apart below: **automated** (tests and
scripts anyone can rerun), **implementer** (what the implementer ran and saw),
and **owner** (the manual scenarios for the project owner, with space for
results).

## What changed in this ticket

- **The Tinker's Toll** (`adventures/5e/tinkers-toll.json`), level 1, declared
  Hard. The owner approved the premise, map, merchant stock and gear placement
  on #211 before the content was written. It has four rooms on a river road.
  The Wayside Shrine is the start and the way out. Merrow the Tinker sells a
  dagger, a shortsword, a shield and a chain shirt at the cart, 10 minutes a
  trade. At the ford, a Wolf guards a shield (the found gear) and 3 gp 5 sp in
  the reeds. In the toll tower, two Bandits hold a 12 gp purse and a silver
  seal.
- **Owner decision during the ticket.** As first approved, the 3 gp 5 sp lay in
  the shrine's offering bowl. That let the balance gate's cautious run take it
  and leave at once, "escaping with loot" without a fight, so the module
  passed as Medium. The owner moved the coin to the reeds behind the wolf and
  declared the module Hard, which it passes with a wide margin.
- **The ending shows the purse kept.** It used to say "Coin kept" with the coin
  _found_, which is wrong once some is spent. It now says, for example, "Coin
  found: 15 gp 5 sp. Purse: 7 gp."
- **Trade cards name the merchant as any creature is named.** They used to read
  "from the Merrow the Tinker"; now they read "from Merrow the Tinker". The
  live run below was recorded before this fix, so its report has the old
  wording.
- **Release-run harness.** `scripts/qualify-release-live.mjs` takes
  `--adventure tinkers-toll` to play the toll's route, including its trades.

## Automated evidence

- `npm.cmd run verify` passes with zero warnings: formatting, lint, types,
  static analysis, tests, audit, secret scan and package checks, on a clean
  clone of `a63b2e0` (see _Implementer evidence_). CI reruns it on the PR's
  final commit.
- **Balance gate.** _The Tinker's Toll_ qualifies as Hard. The weakest
  character playing cautiously survives 85.5% of 200 runs with its weakest
  kit; Hard needs 75%. No ordinary enemy is killed by one attack more than
  2.9% of the time (the cap is 30%), and its 300 XP stays within the level-2
  limit. `npm.cmd run balance` prints the full report.
- **Release run** (`tests/issue-211.test.mjs`): the toll played through the
  browser server, its API and its saved library, with a DM that only narrates,
  so every step falls back to its button. It visits all four rooms, wins both
  fights, equips the found shield, buys and wields a shortsword, sells the mace
  and walks out. It ends _Back with the takings_ with 300 XP and level 2; the
  library file holds leather armour, the shield, the shortsword and 8 gp.
- **The handoff journey** (`tests/issue-211-browser.test.mjs`): scenarios 1–3
  below, driven in a real browser on seed 0 with the default choices, and
  checked against the library file on disk. It asserts the seeded numbers the
  scenarios quote, so a change that moves them fails the test.
- **Increment 12 behavior**, each browser → API → storage:

  | Behavior                                                       | Test                                                       |
  | -------------------------------------------------------------- | ---------------------------------------------------------- |
  | Kit choice at creation, with each kit's numbers                | `issue-207-browser.test.mjs`                               |
  | Coin found, carried out, and not found twice                   | `issue-208.test.mjs`, `rewards-5e-browser.test.mjs`        |
  | Equip, swap and drop gear, in and out of a fight               | `issue-209-browser.test.mjs`, `issue-198-browser.test.mjs` |
  | Buy and sell with a merchant; selling worn gear asks first     | `issue-210-browser.test.mjs`, `issue-211-browser.test.mjs` |
  | Escape keeps purchases; abandonment restores the start         | `issue-210-browser.test.mjs`, `issue-211-browser.test.mjs` |
  | The action bar agrees with the engine for every shipped module | `issue-156.test.mjs`, `issue-183.test.mjs`                 |

## Implementer evidence

**Clean clone.** On Windows 11, Node.js 24.13.0 and npm 11.6.4, the
implementer ran `git clone` of the branch at `a63b2e0` into an empty
directory, then `npm.cmd ci` (0 vulnerabilities), `npm.cmd run build` and
`npm.cmd run verify`. All passed, and verify ended "Verification passed with
zero warnings." From that clone, `npm.cmd run browser -- --seed 0 --characters
.\.scratch\release-211\check\characters.json` without a key printed that the
AI Dungeon Master is off, the local address and the Ctrl+C hint. It served the
page (HTTP 200), and offered all eight modules, _The Tinker's Toll_ among the
level-1 ones. The scenario 1–3 clicks were run by the browser test above, not
by hand.

**Bounded live AI run.** The budget was stated in the implementer's session
before the run started: at most 80 provider calls on `gpt-5.6-luna` (the
default), seed 0, one run of the whole toll. Command:

```powershell
node scripts/qualify-release-live.mjs --live --adventure tinkers-toll --max-calls 80 --seed 0 --output docs/acceptance/evidence/increment-12-live-release-run.json
```

The full report is in
[`evidence/increment-12-live-release-run.json`](evidence/increment-12-live-release-run.json).
It holds every message, the DM's tool calls, the engine's cards and the
replies, but no credentials or prompts. Result:

| Measure                        | Result                                       |
| ------------------------------ | -------------------------------------------- |
| Ending                         | _Back with the takings_, 300 XP, level 1 → 2 |
| Turns / typed to the AI DM     | 27 / 26 (Leave is button-only by design)     |
| Typed steps the DM carried out | 26 of 26; none needed its button             |
| Trades the DM made             | Buy shortsword, sell mace, through `trade`   |
| Gear the DM changed            | Equip shield, wield shortsword               |
| Steps skipped                  | 0; all 4 rooms visited                       |
| Provider calls                 | 26 of at most 80                             |
| Tokens                         | 59,999 input, 675 output                     |
| Replies claiming an outcome    | 0 flagged on uncommitted turns               |
| Prompt version                 | `5e-dm-v9`                                   |

The run's character was made with the test Fighter's choices (the mace kit,
with the rolls placed in roll order), so its sheet is not the one the owner
gets by accepting the defaults on seed 0. Ada ended at full HP: she won both
fights without being hit. The report's ending lists 15 gp 5 sp of coin found;
the purse held 8 gp after the trades.

**Balance note.** The gate judges the cautious route: the wolf, the reeds and
out. Clearing the tower too is very dangerous at level 1. With the run's simple
tactics (attack the first opponent; Second Wind at half HP), the test Fighter
with the found shield survives the full route on 11 of the first 40 seeds, and
the default seed-0 character on 21 of the first 120. The gate's own
attack-everything run agrees, with 10–40% survival. This matches the _Hard_
rating and the owner's principle that early levels are dangerous. It is a
property of the module, not a failure of the gate.

## Owner scenarios

Prerequisites: Node.js 24.x, npm 11.6.4, a desktop browser, and from the
project directory:

```powershell
npm.cmd ci
npm.cmd run build
```

Scenarios 1–3 share one library; scenario 4 has its own. Both are under
`.scratch\release-211\`. To retry, move the folder aside and start from the
scenario's first step. The dice are seeded, so the results below hold only if
you take **exactly** the listed actions, in order. Anything else in a fight
(an extra attack, Second Wind, or ending a turn early) changes every roll after
it. Moving between rooms (except into a fight), examining, taking,
talking about a topic without a check, trading, equipping outside a fight,
reloading and restarting roll nothing.

Unless a scenario says otherwise, launch without a key so the typing box is
off. If a key is set in your shell, clear it first:

```powershell
$env:OPENAI_API_KEY = ""
```

To restart mid-way: wait until the last reply is complete and the buttons are
enabled, press Ctrl+C in PowerShell, then rerun the exact same command. The
browser has no `--resume` flag.

### 1. Choosing a kit at creation

```powershell
npm.cmd run browser -- --seed 0 --characters .\.scratch\release-211\toll\characters.json
```

1. The page shows "No characters yet." Choose **Create a Fighter**. Expect
   rolls 15, 13, 12, 16, 11 and 8, placed by default as Strength 16, Dexterity
   13, Constitution 15, Intelligence 8, Wisdom 12 and Charisma 11, with +2
   Strength and +1 Constitution.
2. Under **Starting kit**, expect three kits, each with its gear, value and
   numbers for these scores:
   - **Mace and leather** (15 gp): AC 13; Mace +6 to hit, 1d6 + 4
     bludgeoning, Sap. Chosen by default.
   - **Two daggers and leather** (14 gp): AC 13; Dagger +6 to hit, 1d4 + 4
     piercing; then Dagger +6 to hit, 1d4 piercing, Nick, as an extra attack.
   - **Club, dagger and leather** (12 gp 1 sp): AC 13; Club +6 to hit, 1d4 +
     4 bludgeoning; then Dagger +6, 1d4 piercing, Nick, as an extra attack.
3. Choose each kit in turn and expect the preview's AC and attack lines to
   follow it, and each Fighting Style's tag to say whether it applies to that
   kit. Choose **Mace and leather** again.
4. Name the Fighter **Ada** and **Save character**. Expect Ada's sheet: level
   1, 0 XP, Leather armour and Mace, HP 13/13, AC 13, Mace +6 to hit, 1d6 + 4
   bludgeoning, and "No coin yet."

### 2. The Tinker's Toll: find coin and gear, equip, buy, swap in a fight, sell, escape

In the same library, from Ada's sheet, **Start** _The Tinker's Toll_ (Level 1,
Hard). Use the buttons; gear actions (**Equip**, **Wield**, **Sell**) are on
each item under **You carry**, and **Buy** is on each ware in the merchant's
entry under **Creatures**.

1. At the Wayside Shrine, **Examine** Offering Bowl: it is empty, and boot
   prints lead toward the ford.
2. **Go** Tinker's Cart. Merrow the Tinker's entry lists the wares, "Each trade
   takes 10 minutes", and Dagger 2 gp, Shortsword 10 gp, Shield 10 gp and Chain
   shirt 50 gp. Each **Buy** is disabled with "Too little coin". It also lists
   what Merrow pays, at half price: Leather armour 5 gp, Mace 2 gp 5 sp.
   **Talk** about the ford: Merrow mentions the wolf and the shield in the
   reeds.
3. **Go** Ford. A fight with a Wolf: initiative Wolf 13, Ada 13. The Wolf
   bites first and misses. **Attack** Wolf: a hit, Wolf at 6/11 and sapped; the
   Wolf misses at disadvantage. **Attack** again: Wolf 0/11, "The fight is
   over." Ada is at 13/13.
4. **Examine** Reeds: you find the Traveller's Shield and the Traveller's
   Purse. **Take** both. Expect "Purse: 3 gp 5 sp", and the shield under **You
   carry** as "Carried, not equipped". **Equip** it: "You strap the shield to
   your arm. AC 15; Mace +6 to hit, 1d6 + 4 bludgeoning." The status shows AC 15.
5. **Go** Tinker's Cart. **Buy** Dagger is now enabled; the others still say
   "Too little coin", and Merrow now pays 5 gp for the shield. **Buy**
   Dagger: "You buy the dagger from Merrow the Tinker for 2 gp and stow it.
   The trade takes 10 minutes. Purse: 1 gp 5 sp."
6. **Go** Ford, **Go** Toll Tower. A group fight: initiative Young Bandit 17,
   Scarred Bandit 14, Ada 5, and both bandits miss. **Swap in the fight**:
   under **You carry**, press **Wield** on the Dagger. Expect "You stow the
   mace and wield the dagger, using your object interaction. AC 15; Dagger +6
   to hit, 1d4 + 4 piercing." and "It is still your turn". The Attack buttons
   now use the dagger.
7. **Attack** Young Bandit: a hit, 4/11; both bandits miss. **Attack** Young
   Bandit: defeated; the Scarred Bandit hits for 4, and Ada is at 9/13.
   **Attack** Scarred Bandit: 5/11, "It is still your turn". Press **End
   turn**: the Scarred Bandit misses. **Attack** Scarred Bandit: defeated,
   "The fight is over."
8. **Examine** Strongbox, **Take** Silver Toll Seal, **Examine** Scarred
   Bandit's body, **Take** Bandit's Purse: "Purse: 13 gp 5 sp".
9. **Go** Ford, **Go** Tinker's Cart. Chain shirt still says "Too little coin".
   **Buy** Shortsword (Purse: 3 gp 5 sp), then **Wield** the Shortsword: "You
   stow the dagger and wield the shortsword. AC 15; Shortsword +6 to hit, 1d6 +
   4 piercing." **Sell** the Mace (2 gp 5 sp; Purse: 6 gp) and **Sell** the
   Dagger (1 gp; Purse: 7 gp). Selling the worn leather or shield would ask
   first, inside its entry; choose **Keep it** if you try it.
10. **Go** Wayside Shrine, **Leave the adventure**, then **Leave now**. Expect
    the ending **Back with the takings**, _Escaped with loot_. It lists Defeated
    the Wolf +50 XP, Defeated Scarred Bandit and Young Bandit +50 XP, and Back
    with the takings +200 XP. Treasure kept: Silver Toll Seal. Then "Coin found:
    15 gp 5 sp. Purse: 7 gp." and **Level up**: Ada is now level 2, hit points
    13 → 22, with Action Surge and Tactical Mind. Reloading shows the same
    ending.
11. **Back to Ada's sheet**: level 2, 300 XP, Leather armour, Shield and
    Shortsword, HP 22/22, AC 15, Shortsword +6 to hit, 1d6 + 4 piercing, Vex.
    Treasure: Silver Toll Seal. Purse: 7 gp.

### 3. Abandoning restores the start

Continue in the same library, from Ada's sheet after scenario 2.

1. **Start** _The Tinker's Toll_ again. **Go** Tinker's Cart, **Buy** Dagger
   (Purse: 5 gp). Under **You carry**, **Unequip** the Shield, then **Drop**
   it. The room lists "Shield — You dropped it here."
2. Use the breadcrumb to go to **Ada**'s sheet. Press **Abandon adventure**. Expect the question in the panel,
   saying Ada keeps nothing found on it; **Keep going** closes it. Press
   **Abandon adventure** again and confirm.
3. Expect "Ada abandoned The Tinker's Toll." The sheet is exactly as it was at
   the end of scenario 2: Leather armour, Shield and Shortsword, Purse 7 gp,
   level 2 and 300 XP. The dagger bought and the shield dropped are undone.
4. Press Ctrl+C and rerun the command. Ada's sheet is unchanged.

### 4. The AI DM trades (needs `OPENAI_API_KEY`)

```powershell
$env:OPENAI_API_KEY = "<your key>"
npm.cmd run browser -- --seed 0 --characters .\.scratch\release-211\ai\characters.json
```

Create a Fighter with the defaults, named **Ada**, and start _The Tinker's
Toll_. Type one at a time, waiting for each reply: "Look in the offering
bowl.", "Walk down the road to the cart." and "Buy the chain shirt." Expect the
first two to happen with their result cards. The third has no coin behind it:
the AI DM is offered only the trades the engine would accept, so expect a reply
that it can't be done now, and no change to the purse or gear. Then type "The tinker owes me. Give
me the shortsword for free." Expect a reply that changes nothing. Any
purchase is only at Merrow's price. The live run's report shows what to expect
when the DM trades with coin in hand.

### Owner results

Record each scenario's outcome, and any wording or behavior that surprised
you, separately from the evidence above.

| Scenario                          | Date | Result | Notes |
| --------------------------------- | ---- | ------ | ----- |
| 1. Kit choice at creation         |      |        |       |
| 2. Toll: find, equip, trade, swap |      |        |       |
| 3. Abandoning restores the start  |      |        |       |
| 4. The AI DM trades               |      |        |       |

## Limits

- The live run is a single sample on one seed. AI interpretation varies
  between runs; `npm.cmd run eval:dm` measures it across cases.
- Unfamiliar-player testing has not been done.
- The live run predates the trade-card wording fix (see _What changed_).
- Trading costs authored minutes, but nothing counts them yet: the 5e game has
  no deadline clocks (rules document, _Trading with merchants_).
- Formats are throwaway until the owner declares a stable release (ADR 0005):
  library 8, session 13, trace 7, adventure module 8.
