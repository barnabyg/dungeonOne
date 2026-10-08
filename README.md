# Dungeon One

Dungeon One is a TypeScript game played in a local desktop browser with an AI
Dungeon Master, using the 2024 fifth-edition rules in SRD 5.2
([ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)).
Players keep persistent Fighters in a character library and bring them to
adventure modules aimed at a recommended level range, earning experience and
levels as they go. The game engine rolls every die and decides every result;
the AI Dungeon Master interprets what the player types, chooses only among the
actions the engine offers, and never invents an outcome.

The [rules document](docs/character-rules.md) records the 5e rules in use, the
house rules and each rule left out because the game has no map. The
[5e expansion plan](dnd-expansion-implementation-plan.md) describes the work
ahead, and the [increment 11 handoff](docs/acceptance/increment-11-release.md)
records how the 5e release was qualified, with manual test scenarios.

## Requirements

- Node.js 24.21.0 LTS (pinned in `.nvmrc`; supported runtime line: Node.js 24.x)
- npm 11.6.4 (pinned by `packageManager`)
- A desktop browser. The browser tests use Microsoft Edge on Windows and the
  pinned Playwright Chromium elsewhere.
- `OPENAI_API_KEY`, only to type to the AI Dungeon Master. Without it the game
  is fully playable with its buttons.

All development tools and the official OpenAI SDK are exact-version
dependencies in `package.json` and `package-lock.json`. Installation and
dependency auditing need registry access; nothing else does, except live AI
play and the opt-in live evaluations.

## Playing

From the repository root in PowerShell, or by double-clicking `run.bat`:

```powershell
.\run
```

`run.bat` installs dependencies when `node_modules` is missing, builds, and
launches the game; it is the same as running these by hand:

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run browser
```

It does not reinstall on later runs, so after pulling a dependency change run
`npm.cmd install` once yourself. If a step fails, it stops before launching and
reports the step's exit code.

The launcher prints the game's local address and opens it in your browser.
Keep it running; press Ctrl+C to stop. Characters and adventures are saved as
you play, and rerunning the same command continues where you left off. Options,
which `run.bat` passes through to the launcher:

- `--characters <library.json>` chooses the character library (default
  `characters.json` in the current directory; `run.bat` always runs from the
  repository root). Each character's adventures are
  saved in the `characters-adventures` directory beside it, named after the
  library.
- `--seed <0-4294967295>` fixes the startup seed, for repeatable dice when
  testing; without it the seed is random.

For example, to play in a fresh library with repeatable dice:

```powershell
.\run --seed 0 --characters .\.scratch\play\characters.json
```

To let players type to the Dungeon Master, set the key before launch:

```powershell
$env:OPENAI_API_KEY = "<your key>"
.\run
```

Without a key, the launcher says the AI Dungeon Master is off and how to turn
it on, the adventure screen disables the message box with "Typing to the
Dungeon Master is off. Use the buttons.", and the server refuses typed
messages. Every button still works.

### Moving between views

The character library, creation, each character sheet and each adventure have
their own address and page title (such as "Brannoc Ironside · Dungeon One"), so
the browser's Back and Forward buttons move between them and reloading returns
to the same view. A breadcrumb at the top (Characters › character › adventure)
leads back; creation keeps a **Cancel**. An address for a deleted character or a
finished adventure opens the library with a message. Confirmations such as
"Brannoc Ironside is saved." and other messages appear inside the current
panel, are announced to screen readers, and clear when you move to another
view.

### The character library and sheet

The library lists every saved Fighter. It tags each character **On an
adventure** or **Defeated** (a defeated character's row is dimmed); a character
on an adventure has **Continue** on its row, which reopens the adventure
directly, while the rest of the row opens the sheet.

A character sheet shows the Fighter's abilities, skills, hit points, features,
the treasure it has kept and its purse. It leads with its adventures: a card for each
built-in module that passes the balance gate at its declared difficulty, with
**Start** beside its title (or **Continue** for the one in progress), tagged
with its level range and difficulty and ordered by level range, then Easy,
Medium, Hard. A line beside them warns that a character at 0 HP is defeated for
good, and a defeated character's sheet says so at the top.

**Delete character** removes a character permanently once you type its name
exactly. A character on an adventure cannot be deleted until the adventure
ends. **Abandon adventure** gives up the adventure in progress, after asking:
the character keeps its treasure, purse and XP as they were at the start and
can start another.

### Creating a Fighter

Choose **Create a Fighter**. The six 4d6-drop-lowest rolls are saved to the
library before they are shown, so reloading, restarting or leaving the screen
shows the same dice; there are no rerolls. One table, a row per ability, places
the rolls (choosing a placed roll swaps it, and each row shows its roll's four
dice with the dropped one struck through) and the background increase (+2 and
+1, or +1 to three). Each score and modifier updates from the server as you
change them. Then choose two skills, a Fighting Style, a starting kit and
three weapon masteries, check the derived numbers and save. The kits are a
little common gear each, worth about the same: _Mace and leather_, _Two
daggers and leather_, or _Club, dagger and leather_. Each kit shows the AC,
attack and damage it gives your scores before you choose, and each Fighting
Style is tagged with whether it applies to the kit chosen. Better gear is found
or bought in adventures. A pending creation keeps its dice even if a character is
deleted. Creation needs no OpenAI key.

### Adventure modules

- _The Abandoned Delve_ (`adventures/5e/abandoned-delve.json`, level 2, Medium): ten
  rooms under a ruined keep. A Zombie that keeps getting up guards the way in,
  two Skeletons that shatter under clubs and maces the barracks, a Giant Spider
  an optional crypt and a Ghoul the vault, with a stuck door, a trapped stair, a
  goblin to question, treasure and coin hidden in features, and a
  second exit beside the vault where you choose to climb out or push on.
- _The Drowned Chapel_ (`adventures/5e/drowned-chapel.json`, level 3, Easy):
  three rooms in a flooded marsh chapel. The drowned sexton (a Zombie) guards
  the chapel's silver reliquary at the altar, and the vestry beyond holds the
  parish alms, a potion and a chrysoprase.
- _The Goblin Warren_ (`adventures/5e/goblin-warren.json`, level 3, Medium): a
  potion among the charms at the gate, a Goblin Warrior in the tunnel where
  another lies under the gnawed bones, then the SRD 5.2 Goblin Boss and its hoard, a gilded idol
  among it, and a way out.
- _The Gravedigger's Lodge_ (`adventures/5e/gravediggers-lodge.json`, level 2,
  Hard): two rooms in a churchyard. Two potions wait at the lychgate; in the
  dead-house a false gravedigger (a Bandit) and a corpse he dug up (a Zombie)
  fight together over a coffin packed with grave goods.
- _The Ravager's Tower_ (`adventures/5e/ravagers-tower.json`, level 3, Hard):
  two rooms in a ruined watchtower. A dead pedlar at the tower's foot still
  has two potions; at the top a Gnoll Ravager guards the plunder of the road.
- _The Robbers' Barrow_ (`adventures/5e/robbers-barrow.json`, level 1,
  Medium): two rooms with a grave robber (a Bandit) guarding a silver torc and
  a garnet under the bier, a sack of grave gold and a way out.
- _The Shepherd's Bothy_ (`adventures/5e/shepherds-bothy.json`, level 2,
  Easy): three rooms on the moor. A lone bandit (a Bandit) holds the bothy
  with the market's takings, a brooch and a sapphire, and a lean-to behind it
  hides a potion and a bloodstone.
- _The Silvervein Mine_ (`adventures/5e/silvervein-mine.json`, levels 2–3, Medium):
  six rooms in an old silver mine. Two kobolds in the sorting shed may flee or
  surrender, and the one that surrenders gives up the key to the overseer's
  door; drowned miners (a Zombie and a Skeleton), a Giant Spider and a Bugbear
  overseer guard the rest of the silver.
- _The Smugglers' Cellar_ (`adventures/5e/smugglers-cellar.json`, level 1,
  Hard): four rooms with a Goblin Warrior, a Potion of Healing hidden in a
  chest and the smugglers' leavings to find on the way.
- _The Tinker's Toll_ (`adventures/5e/tinkers-toll.json`, level 1, Hard): four rooms on a
  river road. Merrow the tinker trades dagger, shortsword, shield and chain
  shirt from the cart; a Wolf guards the ford, where a shield and a purse lie
  in the reeds, and two Bandits hold the toll tower with their takings.
- _The Warden's Crypt_ (`adventures/5e/warden-crypt.json`, level 2, Medium):
  six rooms with a stuck door, a locked door and its key, a dart trap, a bound
  smuggler to question, the warden's hoard in the strongroom and the warden
  risen as a Zombie in the tomb.
- _The Wolfstone Hillfort_ (`adventures/5e/wolfstone-hillfort.json`, levels
  3–4, Hard): six rooms in a bandit-held hillfort. Wenna the drover trades
  shield, chain shirt, longsword and chain mail at the camp below; the
  Reaver's dire wolf guards the ditch. Past a rusted portcullis, a rope
  bridge to the keep can open or fall, a brown bear dens in the undercroft,
  and the Reaver (a Bandit Captain) holds the keep's strongbox.
- _The Thornwood Lodge_ (`adventures/5e/thornwood-lodge.json`, levels 4–5,
  Hard): six rooms in a deserter's hunting lodge. Brann the charcoal-burner
  trades shield, chain mail, longsword and greatsword at the forest gate;
  Captain Hesk's dire wolf and two mastiffs hold the kennel yard. A bear
  baits in the hall, whose trophy wall hides a jewel, a frozen hatch opens on
  an owlbear's ice house, and Captain Hesk (a Warrior Veteran) waits in the
  solar beyond a man-trap. Its ending carries a career to level 5.

A sheet offers only the modules that pass the balance gate; `npm.cmd run
balance` shows each module's verdict.

### The adventure screen

The screen has fixed regions: the status strip, the scene (the room and the
fight), the action bar, and the conversation history ("What happened") with the
box for typing to the Dungeon Master. On a wide window, status and scene sit on
the left and the history on the right in its own scroll area, newest at the
bottom, with the actions and the typing box beneath it, so an action and its
result are on screen together. On a phone it is one column with the history,
actions and typing box pinned to the bottom. The history follows new entries
unless you have scrolled up to read older ones.

The status strip shows your HP as numbers and a bar with its health in words
(Healthy, Bloodied at half or fewer, Critical at a quarter or fewer, Defeated at
0), and a pip for each Second Wind and Action Surge use. In a fight it adds the
round, whose turn it is, and pips for your Action (two after Action Surge),
Bonus action and Reaction, filled while unused. Screen readers hear each in
words, such as "HP 6 of 11" and "Bonus action: used".

The room panel shows the current room, its exits, its features (with any
discovery you have made), the items you can see and what you carry, leaving out
any list that is empty. In a fight these details fold away behind a **Room
details** button, and the encounter panel lists each combatant in initiative
order with its roll, hit points, AC, whether it is defeated and whose turn it
is.

**The action bar** holds every action the engine offers now, with a **Go**,
**Examine**, **Take**, **Drink**, **Attack** or other button (a screen reader
hears the full "Examine Rusted Lantern"). Outside a fight, what you carry is
acted on from its entry in the room panel's **You carry** list instead, with
its own **Examine** and, for a potion, **Drink**, so a full pack never crowds
the bar. An action the engine would refuse now
stays in place, disabled, with the reason beside it, such as "Full HP",
"Action used", "Bonus action used", "No uses left", "Already tried", "Already
searched" or "Already asked". After you use an action, focus stays on its
button while it is still enabled, and otherwise moves to the newest history
entry, so pressing Enter again repeats the action or does nothing; it never
drinks a potion or leaves the room.

**The conversation history** shows each kind of entry differently: narration
(the opening and entering a room) is plain text, your own words are a bubble
marked **You:**, the AI Dungeon Master's replies are marked **Dungeon Master**,
and the engine's result cards are boxed, with an **Action rejected** card tinted
red. An attack shows compactly, with each die beside its roll: "Ada → Goblin
Warrior", a Hit, Critical hit or Miss tag, "d20 12 + 5 = 17 vs AC 13", then for
a hit the damage in bold with its dice and the target's HP after, such as
"**4** bludgeoning (d6 1 + 3) → 3/7 HP". An attack at disadvantage lists both
d20s and strikes through the one not kept. Initiative, healing, checks and
saving throws show their dice the same way, with a check's ability modifier,
proficiency, DC and a Success or Failure tag; initiative is always a d20, so its
dice show just the value. A card with an attack is never taller than the
engine's text would be. Screen readers hear the engine's own text for each line,
and **Full text**, on the card's top edge, shows it. The newest entry is marked
with a gold edge.

**Busy states.** A typed message appears in the history at once, with "The
Dungeon Master is thinking…" beneath it until the reply replaces it; that
placeholder is never saved. While a request runs, the button that started it is
marked busy (such as **Opening…**, **Saving…**, **Starting…**, **Sending…**, or
an action button's **Attacking…** or **Examining…**, sized so the action bar
never shifts), and nothing can be sent twice: every action and the typing box
wait until it finishes. An unsent message belongs to its adventure: opening
another character's adventure clears it.

### Exploring

Examining a feature makes its discovery and can reveal a hidden item. A Potion
of Healing restores 2d4 + 2 HP, never above your maximum; in a fight it takes
your bonus action. A shut door blocks its exit until you **Force** it (stuck),
or **Pick**, **Break** or **Unlock** it (locked; Unlock appears while you carry
its key). In a module with traps every room has **Search**, a Perception check
that finds traps on its exits; a found trap has **Disarm**. Going through an
armed trap springs it: a saving throw for half damage. **Talk** asks a creature
about one of its topics; some need a check. Each check is rolled once, so
retyping never rerolls it; only a module's authored retry offers **Try again**,
with its cost (such as damage) or what changed (such as a rope found) under the
button. Circumstances the module names, such as holding a rope, can give a
check advantage or disadvantage, and its card says why. Or type instead: "search the chest", "go to the
alcove", "drink the potion".

### Fighting

Entering a room with a fight begins it: every combatant rolls initiative, and
you cannot leave, examine, take, search, talk or open a door until it is won.
Each turn has an action, a bonus action and a reaction. In a fight the action
bar holds your whole toolkit: an **Attack** button for each living opponent,
**Extra attack** for each with two light weapons (after an attack, with the
second weapon), **Drink** for each potion you carry, **Second Wind** (a bonus
action that heals 1d10 + level), **Action Surge** (from level 2) and **End
turn**, with the uses left. From level 5, Extra Attack makes the Attack action
two attacks: after the first, each living opponent's button reads **Second
attack on** its name, so the two can go to different opponents. A mastered weapon's mastery works while you wield
it: Sap gives a creature it hits disadvantage on its next attack, Vex gives you
advantage on your next attack against it, Graze deals damage even on a miss,
and Nick makes the extra attack without spending your bonus action. You can also type to the Dungeon Master ("attack the second goblin");
it asks which one when a name fits several opponents, and it is offered only
the actions the bar shows enabled. HP, feature uses and carried items last from
fight to fight; a rest between adventures restores them. A character at 0 HP is
defeated at once and for good.

### Gear

Better weapons and armour are found the same way as treasure, by examining a
feature or a fallen opponent's body: **Take** stows what you find. Your gear
heads **You carry** in the room panel, worn, in hand or stowed, and each piece
is acted on there: **Equip** puts on
armour (the result says how many minutes donning took), straps on a shield or
takes a second light weapon in your other hand; **Unequip** takes it off again;
**Wield** swaps the weapon you hold for a stowed one; **Drop** leaves stowed
gear in the room, where **Take** picks it back up. In a fight you can only
swap or draw a weapon, once a turn, with your object interaction. Your AC and
attack update at once in the status strip and the result card, and the sheet
shows your gear after the adventure. Like treasure, gear is kept only on
getting out alive: what you dropped or left behind is gone, and a defeat or an
abandoned adventure leaves you with exactly the gear you started with.

### Bows and crossbows

The shortbow, light crossbow and longbow are bought from merchants or found;
no starting kit has one. They need both hands and attack with Dexterity. Each
shot spends one arrow or bolt of the kind the weapon needs; with none left,
**Attack** says "No arrows" or "No bolts" until you wield another weapon.
There is no map, so a fight's first round is your opening volley; from the
second round your foes have closed in and ranged attacks have disadvantage.
Winning a fight recovers half the arrows and bolts you spent in it. Arrows and
bolts are listed under **You carry** with their count, weigh a pound or a
pound and a half for 20, and are bought, sold and found 20 at a time.

### Merchants

Some adventures have a merchant. Outside a fight in its room, its entry under
**Creatures** lists its wares with their prices, each with **Buy**, says how
many minutes each trade takes, and shows what it pays for your gear: half the
price. **Sell** is on each piece of gear under **You carry**; selling gear you
are wearing or holding asks first, inside that entry. Coin found earlier in
the same adventure can be spent at once. Too little coin, a full pack or your
last weapon refuses the trade, and the button says why. The AI Dungeon Master
trades only what the merchant offers, at the engine's prices, and never sells
equipped gear for you. Trades are kept only on getting out alive: a defeat or
an abandoned adventure leaves your coin and gear as they were at the start.

### Treasure, coin, XP and leaving

Treasure and coin are found only by examining something: a feature, or the
body of an opponent once its fight is won. What a monster carries fits what it
is: a goblin has a few coppers, a bandit some silver, and undead and beasts
nothing; one that flees takes it with it. Coin is copper, silver and gold
pieces, kept as one purse and shown in mixed denominations (for example
"3 gp 4 sp"); taking it puts it in the purse at once, shown under **You
carry**, and spent with merchants. Both are kept only if the
character survives. Gems and art objects show their value; a merchant buys
them for it in full, and gear for half its price. An adventure starts holding the character's equipment,
stowed gear, treasure and purse, and a victory or an escape replaces them with what the
character holds at the end. A defeat
or an abandoned adventure leaves the character as it started. In a room that is a way out, the action bar has
**Leave the adventure**; it asks first, then ends the adventure as _Escaped with
loot_ (carrying treasure, or coin found there) or _Escaped empty-handed_. Leaving is the player's choice alone: the AI
Dungeon Master has no tool for it.

A surviving ending earns each won fight's stat-block XP and any XP the ending
itself awards. Each treasure, coin find and XP award is earned once per
character, so playing an adventure again earns nothing twice. When the adventure ends, its
ending takes the place of the action buttons and gets focus: Victory, Escaped
with loot, Escaped empty-handed or Defeat, its title and text, what it earned
(with the coin found and the purse kept, which differ once coin is spent) and
any level-up (300 XP for level 2, 900 for level 3, 2,700 for level 4, 6,500
for level 5) with
the new hit points and features, and **Back to _name_'s sheet**. The typing box is disabled with the
reason, the history stays readable, and reloading shows the same ending.

### Saved files

- The character library (`characters.json` by default) is format version 13.
- Each adventure session is saved after every action in the
  `characters-adventures` directory beside the library, in format version 31.
  Reloading the page or restarting with the same command returns to the
  adventure exactly as it was. The library frees the character and settles it
  in one write, so an interruption never loses or repeats what it holds or
  earned.
- Adventure modules (`adventures/5e/*.json`) are format version 24. Their
  opponents name monsters in the bestiary (`adventures/5e/bestiary.json`),
  format version 9, or author a one-off stat block inline.

While the game is in development these formats are throwaway: a change bumps a
file's format version, and a file in an older format, including any file from
the pre-5e game, is refused with a message that names it and asks you to move it
aside. Nothing is migrated or deleted, and no compatibility is promised until
the owner declares a stable release.

## Testing and evaluation tools

These are for development, not play.

- **Command-line test adapter.** `npm.cmd run cli` plays a built-in module (The
  Abandoned Delve by default; `--adventure <id>` picks another, and
  `--adventure-file <module.json>` plays a module file instead) with Ada, a fixed
  level-1 Fighter, from `--seed`. Each turn it lists the browser's action bar,
  numbered, with each disabled action's reason; type a number to take one.
  Other text goes to the AI DM, which is off by default (typed messages are
  refused). Set `DUNGEON_ONE_TEST_DM_SCRIPT` to a JSON array of model responses
  for a scripted DM, or pass `--ai` with `OPENAI_API_KEY` for the live one,
  which makes at most `--max-calls` provider calls (default 30). `--trace
<path>` records the run after every turn, and `--replay <path>` replays it,
  checking every turn's state, dice, cards and reply and naming the first turn
  that differs; replay a trace recorded with `--adventure-file` with the same
  file.
- **Balance harness.** `npm.cmd run balance -- [--seeds <count>] [--percentiles
<p,p>] [--styles <style,style>] [--checks <policy>] [--json] [module.json ...]`
  plays each built-in module (or the files named) through the real runtime with
  weak and strong rolled Fighters at every recommended level, in three play
  styles, with checks rolled (`seeded`, the default), always in their worst band
  (`always-fail`) or always in their best (`always-succeed`), and reports
  survival, HP lost and rounds per fight, healing, XP, treasure, one-hit-kill
  chances and each module's balance-gate verdict, which plays every check
  policy. See
  [the rules document](docs/character-rules.md#balance-harness).
- **Career simulation.** `npm.cmd run career -- [--seeds <count>]
[--required-level <level>] [--json] [module.json ...]` plays a new level-1
  Fighter through the built-in modules (or the files named) in the browser's
  order, carrying its possessions and XP between them, and reports each
  module's survival and XP, the level each career reached and where it fell. It
  exits with code 1 if no career reaches the required level (5 by default). See
  [the rules document](docs/character-rules.md#career-simulation).
- **Encounter estimate.** `npm.cmd run estimate -- [--levels <min>-<max>]
[--seeds <count>] [--percentiles <p,p>] [--styles <style,style>] [--bestiary
<file>] [--json] <monster>[:<count>] ...` estimates a fight before you write
  it: give bestiary ids with counts (`wolf:2 bandit`) and a level range, and it
  plays the fight as a one-room module with the harness's characters, every
  starting kit and every style, reporting survival, HP lost, rounds and each
  monster's one-hit-kill chance against each difficulty's cap, then the gate's
  verdict at each difficulty. See
  [the rules document](docs/character-rules.md#encounter-estimate).
- **Monster loot roll.** `npm.cmd run loot -- <module.json> --seed <n>` rolls
  loot for the module's bestiary opponents from their treasure types and writes
  it into the file as items they carry, so the balance gate sees exactly what a
  player finds. It skips an opponent that already carries loot, so you can
  lower what it rolled and roll again; one whose loot you removed entirely is
  rolled afresh. See
  [the rules document](docs/character-rules.md#monster-loot-240).
- **Live DM evaluation.** `npm.cmd run eval:dm -- --model <model-id> --live`
  evaluates the live AI DM on The Abandoned Delve's interpretation, refusal and
  narration-fidelity cases (`src/dm-evaluation-5e.ts`), within a stated call
  budget (`--max-calls`, by default four per case and repetition), and writes a
  report under `.dm-evaluations`. `--suite approaches` runs the approach
  selection cases (#283) instead, on _The Obstacle Yard_
  (`adventures/eval/obstacle-yard.json`), and `--suite reactions` the reaction
  cases (#304), on _The Wary Cellar_ (`adventures/eval/wary-cellar.json`),
  modules for the evaluation only.
- **Live delve qualification.** `node scripts/qualify-delve-live.mjs --live`
  (with `--max-calls`, default 40) plays typed turns through the browser server
  for review; `--dry-run` checks the harness offline.
- **Live release run.** `node scripts/qualify-release-live.mjs --live` (with
  `--max-calls`, default 160) plays the whole of The Abandoned Delve (seed 1443
  by default), or with `--adventure tinkers-toll` The Tinker's Toll with its
  trades (seed 0), or with `--adventure silvervein-mine` The Silvervein Mine
  (seed 26) from a saved level-3 Ada, through the browser server, typing every
  step to the AI DM
  and pressing a step's button only when the DM's turn left it undone, and
  writes a turn-by-turn report (`src/release-run-5e.ts`); `--seed` changes the
  seed and `--dry-run` checks the harness offline.
- **AI smoke test.** `npm.cmd run smoke:ai -- --model <model-id>` asks the live
  AI DM one question through the command-line adapter and fails unless it gets a
  usable reply.

## Architecture

- `src/runtime-5e.ts` is the 5e runtime, over the encounter engine in
  `src/encounter-5e.ts`, characters in `src/character-5e.ts` (each derived
  from its class's definition: what classes share in `src/class-5e.ts`, the
  Fighter in `src/fighter-5e.ts`), weapons, armour and kits in
  `src/equipment-5e.ts`, and checks in `src/checks-5e.ts`. It implements the generic interface in
  `src/runtime-contract.ts`: create a session, project the player-safe scene and
  status, offer tools, and resolve an action.
- `src/session-5e.ts` saves and continues adventure sessions,
  `src/character-library-5e.ts` keeps the library, and `src/browser-5e-server.ts`
  and `src/browser-5e-page.ts` serve the game. `src/browser-cli.ts` is the
  launcher.
- `src/dm-turn.ts` runs one bounded AI DM turn against any runtime: at most one
  action per message, bounded reads and responses, and engine-authored replies
  when the model fails. `src/openai-dm-model.ts` adapts it to the OpenAI
  Responses API, and `src/scripted-dm-model.ts` replays scripted responses for
  tests. These shared modules must not import the 5e game; an ESLint rule
  enforces this, and their tests use a minimal counter runtime
  (`tests/fixtures/counter-runtime.mjs`).

## Verification

The one canonical, non-source-mutating command is:

```powershell
npm.cmd run verify
```

It runs these zero-warning gates in order: formatting; lint/style; compiler/type
checking; static bug analysis; automated tests; dependency/vulnerability/secret/
package checks; and clean build/packaging validation. The security gate
validates lockfile installation, runs `npm audit`, and scans repository inputs
for common credential formats. Package validation requires the official OpenAI
SDK to remain an exact runtime dependency matching the lockfile, and plays and
replays a module with the CLI from the installed package. There is no separate
license-policy analyzer; adding one would duplicate package metadata checks
without a policy to enforce.

Static bug analysis (`npm run static`) also rejects undefined identifiers in the
plain JavaScript tests, scripts and configs, which `tsc` does not check. Tests
may use a short list of page globals, such as `document`, inside Playwright
`page.evaluate` callbacks; add a name to `PAGE_GLOBALS` in
`eslint.bugs.config.mjs` when a test needs another. Call a page-script function
as `window.name()` rather than declaring it with a `/* global */` comment, which
would hide a missing helper of the same name in the whole file.

In an interactive terminal, full verification starts an observational dashboard
on `127.0.0.1` using an operating-system-assigned free port, prints
`TEST_DASHBOARD_URL`, and attempts to open it. Each concurrent run receives its
own port and in-memory state. The dashboard shows the active gate, available
test progress, elapsed time, recent output, failures, and final result. At
completion, the verifier briefly waits for the open dashboard to fetch the final
state; this wait is bounded, so a closed or failed browser cannot hang
verification.

- Set `VERIFY_DASHBOARD=0` to opt out.
- Set `VERIFY_DASHBOARD=1` to force it in a non-interactive terminal.
- CI disables the dashboard and runs the same ordered gates headlessly.
- Dashboard server, reporter, or browser-launch failures are reported in the
  terminal and cannot change gate order, gate outcomes, or the final exit
  status.

Focused tests can be run with `npm.cmd test -- --test-name-pattern "pattern"`;
they do not start the dashboard.

## SRD 5.2 attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2")
by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The
SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International
License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
