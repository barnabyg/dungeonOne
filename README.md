# Dungeon One

Dungeon One is a TypeScript game played in a local desktop browser with a live
AI Dungeon Master. Players keep persistent characters in a character library and
bring them to adventure modules aimed at a recommended level range, earning
experience and levels as they go.

## Moving to 5e

The game is moving to the 2024 fifth-edition rules in SRD 5.2
([ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)). Increment 11 (issues #125–#140, see the
[5e expansion plan](dnd-expansion-implementation-plan.md)) builds a 5e Fighter,
group combat, a balance gate on each module's declared difficulty and a new
dungeon-crawl adventure module, then removes the pre-5e game.

- **Transition flag.** Until 5e becomes the browser's only mode (#137), 5e play
  is reached by launching the browser with a temporary `--5e` flag and its own
  `--characters` library path. The default browser keeps running the pre-5e
  game, so `main` stays playable.
- **Throwaway formats.** While 5e is in development, character library, save,
  trace and adventure module files each carry one format version. A change bumps
  it, and older files are refused with a message naming the file and asking you
  to move it aside. Nothing is migrated or deleted, and no compatibility is
  promised until the owner declares a stable release.
- **Creating a 5e Fighter.** Launch with
  `npm.cmd run browser -- --5e --seed 0 --characters .\.scratch\5e\characters.json`
  (the default library is `characters-5e.json`; creation needs no OpenAI key).
  Choose **Create a Fighter**: the six 4d6-drop-lowest rolls are saved to the
  library before they are shown, so reloading, restarting or leaving the screen
  shows the same dice. One table, a row per ability, places the rolls (choosing
  a placed roll swaps it) and the background increase (+2 and +1, or +1 to
  three) and shows each score and modifier as you change them; then choose two
  skills and a Fighting Style, check the derived numbers and save.
  Saved Fighters open as character sheets. **Delete character** on a sheet
  removes it permanently once you type its name exactly; a pending creation
  keeps its dice. The 5e library is format version 3; a pre-5e library, or a
  5e library from an earlier build (format version 2), is refused at startup
  and left unchanged.
- **Starting a 5e adventure.** A saved Fighter's sheet leads with its
  adventures: **Start** for each built-in 5e adventure module (or **Continue**
  for the one in progress), tagged with its level range and difficulty and
  ordered by level range, then Easy, Medium, Hard. A line beside them warns
  that a character at 0 HP is defeated for good, and a defeated character's
  sheet says so at the top. The modules are:
  _The Goblin in the Cellar_ (`adventures/5e/cellar-goblin.json`), one SRD 5.2
  Goblin Warrior; _The Goblins in the Storeroom_
  (`adventures/5e/goblin-storeroom.json`), a group fight against two Goblin
  Minions and a Goblin Warrior; and _The Smugglers' Cellar_
  (`adventures/5e/smugglers-cellar.json`), four rooms to explore with a Giant
  Rat, a Goblin Warrior and a Potion of Healing hidden in a chest.
- **Exploring a 5e adventure.** The room panel shows the current room, its
  exits, its features (with any discovery you have made), the items
  you can see and what you carry. **Go to**, **Examine**, **Take** and
  **Drink** buttons appear only while the engine would accept them, or you
  can type ("search the chest", "go to the alcove", "drink the potion").
  Examining a feature makes its discovery and can reveal a hidden item. A
  Potion of Healing restores 2d4 + 2 HP, never above your maximum; in a
  fight it takes your bonus action. Entering a room with a fight begins it,
  and you cannot leave, examine or take anything until it is won. HP, feature
  uses and carried items last from fight to fight.
- **Fighting in a 5e adventure.** Starting a fight rolls initiative for every combatant;
  the encounter panel lists each combatant in initiative order with its roll,
  hit points, AC, whether it is defeated and whose turn it is. Attack with the
  **Attack** button for each living opponent, or type to the AI Dungeon Master
  ("attack the second goblin"; it asks which one when a name fits several
  opponents). Each turn has an action, a bonus action and a reaction:
  **Second Wind** (a bonus action that heals 1d10 + level, offered when hurt),
  **Action Surge** (from level 2) and **End turn** appear while they are
  legal, with the uses left. Spent uses stay spent for the rest of the
  adventure; each adventure starts with all of them. The mace's Sap mastery gives a creature it hits
  disadvantage on its next attack, and the result card shows both dice and the
  source. Typing needs `OPENAI_API_KEY`; without it, typed messages are
  refused and the buttons still work. The engine rolls every die and writes
  every action's result.
  The session is saved after every action in the
  `characters-5e-adventures` directory beside the library (format version 4;
  a save from an earlier build is refused and left unchanged),
  and reloading the page or restarting with the same command returns to the
  adventure exactly as it was. Winning the fight that ends the adventure frees the character for another adventure;
  0 HP is instant defeat, and a defeated character cannot start another. A
  character on an adventure cannot be deleted until the adventure ends.
  The library tags each character **On an adventure** or **Defeated** (a
  defeated character's row is dimmed); a character on an adventure has
  **Continue** on its row, which reopens the adventure directly, while the
  rest of the row still opens the sheet.
- **The 5e adventure screen.** It has fixed regions: the status strip, the
  scene (the room, the fight and the ending), the action buttons, and the
  conversation history ("What happened") with the box for typing to the
  Dungeon Master. On a wide window, status and scene sit on the left and the
  history on the right in its own scroll area, newest at the bottom, with the
  actions and the typing box beneath it, so an action and its result are on
  screen together. On a phone it is one column with the history, actions and
  typing box pinned to the bottom. The history follows new entries unless you
  have scrolled up to read older ones. The status strip shows your HP as
  numbers and a bar with its health in words (Healthy, Bloodied at half or
  fewer, Critical at a quarter or fewer, Defeated at 0), and a pip for each
  Second Wind and Action Surge use; in a fight it adds the round, whose turn
  it is, and pips for your Action (two after Action Surge), Bonus action and
  Reaction, filled while unused. Screen readers hear each in words, such as
  "HP 6 of 11" and "Bonus action: used".
- **Moving between 5e views.** The character library, creation, each
  character sheet and each adventure have their own address and page title
  (such as "Brannoc Ironside · Dungeon One"), so the browser's Back and
  Forward buttons move between them and reloading returns to the same view.
  A breadcrumb at the top (Characters › character › adventure) leads back;
  creation keeps a **Cancel**. An address for a deleted character or a
  finished adventure opens the library with a message.
- **Rules.** The [rules document](docs/character-rules.md) records the 5e rules
  in use, the house rules and each positional rule left out.
- **Runtime interface.** Saves, traces and replay, the AI DM turn loop and its
  history, the browser server and the character career use a runtime only
  through `src/runtime-contract.ts` (create a session, project the player-safe
  scene and status, offer tools, resolve an action, record save events).
  `src/data-runtime.ts` is the single registry that selects a runtime, and an
  ESLint rule stops shared modules from importing a pre-5e game module, so the
  5e runtime plugs in beside the old ones and #139 deletes them without
  touching shared code. The 5e runtime (`src/runtime-5e.ts`, over the encounter
  engine in `src/encounter-5e.ts`) implements that interface and is obtained
  from the registry.

**Removal pending (#139).** Hollow Beacon, Stonebridge, the browser's `--legacy`
single save slot, the CLI command-mode adventures (the chapel, the Stolen Signet,
crossroads and other fixtures), the adventure generator, and every existing
character, library, save and trace are removed without migration. The rest of
this README documents that pre-5e game as it still runs today; its compatibility
statements no longer bind future builds. The README is rewritten for the 5e game
when the old game is removed. The command-line app (`npm.cmd start`) stays a
testing adapter, not a player interface. Earlier handoffs such as
[increment 4 acceptance](docs/acceptance/issue-53.md) and the
[Hollow Beacon opening](docs/acceptance/issue-81.md) are historical.

This work includes material from the System Reference Document 5.2 ("SRD 5.2")
by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The
SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International
License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

## Independent characters and leveled adventures

**Removal pending (#139):** this section describes the pre-5e game.

[Increment 10](increment-10-implementation-plan.md) adds an independent character
library, character creation and selection before adventure selection, full sheets
with six ability scores, and Fighter levels 1–3. The browser defaults to this mode.
Hollow Beacon recommends levels 1–2; Stonebridge recommends levels 2–3.
A new Fighter takes one of three ability presets or rolls 3d6 in order for
every ability; a roll can only be replaced by rerolling the whole set (#118).
Characters retain identity and earned XP across adventures; each game preserves
its frozen starting sheet for accurate continuation and review.

See the [house rules](docs/character-rules.md) and
[player testing guide](docs/acceptance/increment-10-characters.md) for creation,
two complete journeys, restart, and compatibility checks. `--characters` chooses
the library path; session files live in the adjacent `character-adventures`
directory. Preserve both when copying or backing up a career. `--legacy` uses the
original Hollow Beacon v11 single slot. Existing save/trace formats remain
readable with their original rules. The adventure generator retains its existing
mode. Live-provider and unfamiliar-player qualification are still pending.

Character adventures use the `character-adventure-dm-v2` prompt. When the engine
refuses an attempted action, the reply is engine-authored (no action was
committed; the **Action rejected** card gives the reason), so AI narration cannot
claim the refused result. Committed actions, reads and clarifications keep AI
narration. AI traces recorded under `character-adventure-dm-v1` still replay.

Character adventures use `character-adventure-tools-v2`. Its `talk` tool gives
the model each offered topic's label and only the approaches the browser offers
for it, so a contextual talk click commits without the model asking for an
approach. AI traces recorded under `character-adventure-tools-v1` still replay.
See [issue 109](docs/acceptance/issue-109.md).

Hollow Beacon **v13** (`character-adventure-rules-v2`)
replaces **Inspect** and **Search** with one **Examine** action: examining a
feature with an available search performs that search and records its
discovery in the same turn; examining anything else only describes it. Typed
requests to look at, read, study, search, inspect or examine something resolve
to Examine. v13 uses `character-adventure-dm-v3` and
`character-adventure-tools-v3`. Hollow Beacon v12 saves and Stonebridge keep
`character-adventure-rules-v1` with Inspect and Search unchanged; nothing is
migrated. See [issue 110](docs/acceptance/issue-110.md).

New Hollow Beacon adventures start **v14** (`hollow-beacon-story.json`): v13's
rules with its player-facing text rewritten as plain story after the first
unfamiliar-player session. Its introduction opens the conversation, and its
options and journal avoid engine terms. Four generic assessment checks are
gone. v13 saves continue unchanged. In character adventures, the toolbar's
**Adventures** opens the character library, **Character sheet** opens the
current sheet, and click options never offer attacking someone you are not
already fighting (type it instead). See [issue 95](docs/acceptance/issue-95.md).

New adventures start **Hollow Beacon v15** (`hollow-beacon-loot.json`) and
**Stonebridge v2** (`stonebridge-loot.json`), schema 18 under
`character-adventure-rules-v3`: the same content plus a little treasure (#119).
Characters created from now on use `fighter-rules-v3` and carry silver and a
healing draught (1d4 + 1 HP) between adventures. Treasure is always found by
examining something or given by a named person, never simply awarded. A found
draught can be drunk at once. Treasure is pending until surviving completion and
earned once per character; abandonment and defeat keep the starting inventory,
including any draught drunk.
Older characters still play but receive no treasure. Stonebridge v2 uses
Examine, and treasure releases use `character-adventure-dm-v4`. v14 and
Stonebridge v1 saves continue unchanged. See the
[house rules](docs/character-rules.md#fighter-rules-version-3).

```powershell
npm.cmd run browser -- --seed 42 --characters .\.scratch\character-player\characters.json --save .\.scratch\character-player\legacy.json
```

Character creation and sheet reads work without an API key. Gameplay requires
`OPENAI_API_KEY` configured before launch.

To continue, wait for a complete reply, press Ctrl+C and rerun the same command;
the selected adventure opens where it was saved. To start over, abandon the
adventure in the character library, rest, and start again; the abandoned journey
stays reviewable. See the [issue 93 continuation handoff and supported-release
policy](docs/acceptance/issue-93.md).

## Requirements

- Node.js 24.21.0 LTS (pinned in `.nvmrc`; supported runtime line: Node.js 24.x)
- npm 11.6.4 (pinned by `packageManager`)

All development tools and the official OpenAI SDK are exact-version dependencies in `package.json` and `package-lock.json`. Installation and dependency auditing require registry access. Command play, help, invalid-argument handling, and trace replay do not require a network connection, AI credentials, or any external service. Live AI play and adventure generation require network access and an OpenAI API key. Command play and the adventure generator are removal pending (#139).

### Hollow Beacon in a desktop browser

**Removal pending (#139):** this section describes the pre-5e game.

The browser presents an illustrated current scene, a compact Fighter HP/day/
caravan deadline strip, nearby people and objects, and the saved adventure.
The parchment and charcoal layout adapts to phone widths; the scene and story
precede the exploration list, with a reachable composer. **Read the scene** expands the full
description and objective. Decorative artwork does not establish game facts.
Routine successful turns use a small **Saved** indicator; failures retain explicit
messages about whether an action committed. **Game menu** contains the seed,
**New game**, and **Refresh adventure** for rereading or recovering saved progress.
Inline emphasis in replies and player information uses styled bold or italic text
instead of visible asterisks, including restored replies. Formatting is display
only: saved prose remains exact, and provider text cannot create HTML or links.

Friendly NPC options lead with conversation. Persuasion appears when an authored
topic has distinct consequences or a real check; initiating violence is a separate
danger action with its stakes. Combat routes warn before travel. During a fight,
the encounter panel keeps enemy HP, turn ownership and currently legal Attack,
Cover and carried healing controls available after each round. Routes are visibly
inspection-only until combat ends. The engine still owns costs, dice and outcomes.

**Journal** contains **Evidence** and **Leads** views, preserving observation,
testimony and belief attribution. Known world supplies belong in the journal;
Inventory shows carried items with their currently legal inspection/use controls.
Character introduces the supported Fighter and its current combat profile.
See the [UI redesign player handoff](docs/acceptance/ui-gameplay-redesign.md).

Adventure titles, opening text, scene names and character labels come from the
browser presentation data. An optional local artwork pack supplies illustrations
by adventure ID, content version and location ID. A missing, mismatched or broken
image uses the neutral dice motif; the UI never guesses scenery from a location's
English name. Only the current location's image is sent to the page. Images are
presentation assets and do not enter saves, replay, journal evidence or AI context.
The browser launcher supports the existing Hollow Beacon v4-v11 family in legacy
slots, plus the two bundled character-enabled modules. Arbitrary authored or
generated modules remain outside browser support. Custom legacy adventures
remain playable through command mode.

To supply location images, create a JSON manifest next to local PNG, JPEG or WebP
files. For example, `artwork/manifest.json`:

```json
{
  "adventureId": "hollow-beacon",
  "version": "11",
  "locations": [
    {
      "id": "watch-yard",
      "file": "watch-yard.webp",
      "alt": "An illustration of the watch yard"
    },
    {
      "id": "watch-loft",
      "file": "watch-loft.webp",
      "alt": "An illustration of the watch loft"
    }
  ]
}
```

```powershell
npm.cmd run browser -- --legacy --seed 0 --save .\ui-redesign-player-save.json --artwork .\artwork\manifest.json
```

File paths must remain inside the manifest's folder, including after resolving
symlinks. Packs allow at most 50 images, 2 MiB per file and 20 MiB total; the JSON
manifest is limited to 64 KiB. Invalid packs fail before a save changes. Use
stable, publicly visible setting details, without hidden enemies, clue solutions
or mutable outcomes. Artwork loads once at startup; restart after changing it.
Automatic generation is not included. A future generation step can create and
cache a pack during adventure authoring, then use this same presentation hook
without making image generation part of taking a turn.

The combined saved journey, desktop observations, bounded live-provider evidence,
and delivered interfaces for the increment 8 rewrite are in the
[increment 9 qualification and handoff](docs/acceptance/issue-106.md).
The full character-mode Hollow Beacon v12 journey with a live AI Dungeon
Master, its review and the opt-in `scripts/qualify-character-live.mjs` runner
are in the [issue 94 qualification](docs/acceptance/issue-94.md).
The unfamiliar-player handoff for Hollow Beacon v14 (player and host sheets,
named journeys, and the `scripts/qualify-handoff.mjs` clean-checkout browser
check) is in the [issue 95 qualification](docs/acceptance/issue-95.md).
Full verification includes real browser/API/storage journeys using pinned
Playwright: Windows requires installed Microsoft Edge; Linux/macOS require
`npx playwright install chromium` (on Linux CI, use `--with-deps`). Browser
tests are offline; live checks are opt-in and never run during verification.

**Hints** prepares optional guidance from public objectives, known leads and
current legal actions. It stays collapsed until opened, refreshes as game progress
changes, and restores its cached content with the save slot. Opening/reopening
uses no AI calls, actions, time or dice. Reload starts with Hints collapsed.
After reading baseline guidance, select **Request a stronger hint** for a
more focused reflection on subjects already named in current journal leads.
It highlights possible connections without naming an exact action or solution.
Escalation is explicit and cached for that game position; it never creates a
conversation turn or changes the adventure. Waiting and unavailable results
appear within Hints. See [issue 103 player checks](docs/acceptance/issue-103.md).
See [issue 102 player checks](docs/acceptance/issue-102.md) for the seeded journey
and an offline real-browser delay/failure fixture.

The rest of this section describes the `--legacy` single save slot, kept so
released Hollow Beacon v4–v11 saves continue. For new play, use the character
library above. After `npm.cmd ci` and `npm.cmd run build`, supply
`OPENAI_API_KEY` in the launch environment, then run:

```powershell
npm.cmd run browser -- --legacy --seed 0 --save .\hollow-beacon-browser-save.json
```

The launcher starts **Hollow Beacon: Final Warning** (issue #91, content version 11) at a printed `http://127.0.0.1:<available-port>` URL and attempts to open
your desktop browser. If opening fails, use the printed URL. Keep the
launcher running; Ctrl+C stops the service without closing the saved session.
Rerun the same command to read the same slot at its saved seed, even if the
new command requests a different seed. Missing AI configuration fails before
serving the page or writing a save. Credentials stay in the launch environment.

Click **Start adventure** for an empty slot. The complete opening is saved
through the verified save authority without replacing an occupied file,
including when two starts race. Starting creates missing parent directories for
the configured save path; reading an empty slot creates no directories.
The page displays the authoritative scene,
location, visible exits, Day 0, Day 3 caravan deadline, 20/20 HP, and seed 0.
**Refresh adventure** in Game menu rereads the verified slot. Existing slots load without
replacement; corrupt, closed (`quit`), other-adventure, unlisted-release or
tampered slots produce an error and remain unchanged. New slots start v11;
occupied v4–v11 slots continue with their own saved content and rules, without
migration. Start v11 beside an older game by using another `--save` path. See
the [issue 93 supported-release policy](docs/acceptance/issue-93.md).
Released v4 Watch Route slots continue
with their original content and endings, including completed Review mode.
V5 adds the camp survey and Refugee Overlook, attributed testimony and contested
claims, and provisional tower instructions that leave play open. The v5 investigation retains its original nonterminal decisions. See the
[issue 85 player checks](docs/acceptance/issue-85.md).
V6 uses [schema 11](schema/adventure-v11.schema.json) / `chapel-clues-rules-v12`:
one remembered safe-signal claim can change Captain Iona's trust and private
belief, and the observed setting plate permits an honest correction after
acceptance or refusal. Her current relationship and the check stakes are public;
the result card shows the engine's die, DC and result. Other actors and the
signal, keeper and caravan do not change from belief alone. Journal keeps the
earlier belief as an attributed historical record and the correction as testimony.
Released v4 and v5 saves/history continue under their original tuples. See the
[issue 86 browser handoff](docs/acceptance/issue-86.md).
V7 adds a raider encounter on the shorter Ridge Trail, with a visible one-use
cover choice: spend one action for +4 AC against the next enemy attack. Attack,
healing and cover spend no days; the engine resolves one enemy response before
returning the turn. Cards show initiative, action cost, attack dice, damage and
HP separately from narration. The defeated raider's supply sack supplies an
attributed aftermath clue. V7 uses schema 12 / `chapel-clues-rules-v13` /
`chapel-clues-engine-v17`; released v4-v6 slots keep their content, history and
rules. See [issue 87 player checks](docs/acceptance/issue-87.md).
V8 adds Ridge Shelter between either road and the tower. Its dressing station
restores exactly `min(8, missing HP)` HP once per session, outside combat while
injured, for 0 days. It consumes the camp dressing without spending a carried
item. Full HP preserves the dressing. The guarded Tower Approach starts a second
fight for 0 days; the safe Drainage Walk adds 1 day and requires no clue or roll.
Both lead to the Tower Runner. Combat has no retreat or surrender; 0 HP ends
the session in defeat. Recovery costs and route stakes are public before travel
or treatment; known world supplies appear in Journal. V8 uses
schema 13 / `chapel-clues-rules-v14` / `chapel-clues-engine-v18`, with new bounded
recovery tools and prompt versions. Released v4-v7 content and occupied slots
continue unchanged. See [issue 88 player checks](docs/acceptance/issue-88.md).
V10 adds a tower confrontation. Compare the fixed work order with the watch
plate or refugee sighting frame, present a living Captain Iona's intervention
warrant, or deliberately fight Vey for control. Proof and alliance avoid dice
and casualties; force uses the existing combat actions and records Vey's death.
Failed persuasion leaves the physical evidence open. Control unlocks the final
warning board and continuing play; v10 retains its original nonterminal decisions. Missing
components and dead allies leave an honest onward route. New slots use content
10 / schema 15 / `chapel-clues-rules-v16` / `chapel-clues-engine-v20`; released
v4-v9 slots retain their original content, history and rules. See the
[issue 90 browser and CLI handoff](docs/acceptance/issue-90.md).
V11 adds three final warnings after tower control and warning-board review.
The verified safe signal requires physical alignment evidence and the fitted
component; slower human warning and urgent risky signal remain available without
that item, even late or after failed persuasion. Public stakes distinguish
signal work, dispatch and risk from unconfirmed rescue. Conditional final records
retain deadline, evidence, prior commitments and actual casualties. Commitment
closes play into Review; information and saved Conversation history remain readable.
New slots use content 11 / schema 16 / `chapel-clues-rules-v17` /
`chapel-clues-engine-v21`; released v4-v10 slots keep their original semantics.
See [issue 91 browser and route handoff](docs/acceptance/issue-91.md).

Active or completed Hollow Beacon slots
offer **New game**. Its keyboard-accessible confirmation explains that progress,
conversation and both hint levels will be replaced, and displays the new seed
from the launcher. **Cancel** or Escape preserves the current game; confirming
saves a fresh opening in the same slot. Pending turns or hint preparation reject
replacement until they finish. An interrupted write recovers a whole verified
old or new slot; after a failure or lost response, use **Refresh adventure** in Game menu
before retrying. Old-tab actions and delayed replies cannot enter the new game.
See [issue 104 player checks](docs/acceptance/issue-104.md).

V9 adds a spare signal component at the watch setting plate. Take and inspect it,
then fit it at the tower's beacon socket outside combat. This spends one component
for zero days and dice, without healing, and enables the existing provisional
light instruction. Inventory, socket, Journal and local hints refresh together;
wrong-target and repeated use preserve the committed state. Released v4-v8
slots remain unchanged. See [issue 89 player checks](docs/acceptance/issue-89.md).

Type one ordinary-language action or question and select **Send message**.
The browser uses the same bounded AI tools as the CLI and its default model
(`gpt-5.6-luna`). Your request appears immediately with a waiting indicator;
input stays disabled until the complete reply arrives. Replies retain NPC
attribution, authoritative result cards explain resolved actions, and the
location, exits, HP, and time refresh from verified saved state. Consequential
results save before display. Provider failures report whether an action was
saved; do not repeat an action marked saved. The reply then points to the
**Resolved action** or **Action rejected** card rather than the CLI's Mechanics
block. Lost responses and stale tab requests
refresh the preserved position without repeating the action. Save failures retain
the result; repair storage and use **Refresh adventure** in Game menu to recover it. Keep the
launcher running if it reports an unsaved result. See [issue 101 recovery checks](docs/acceptance/issue-101.md).

Click a visible exit to travel immediately, or select a person or object to
see its current local options. Topic, inspection, search (Examine in Hollow
Beacon v13), and ending buttons send one explicit intent through that same AI
turn. Ending options show their public stakes before selection. Old scene options are rejected and refreshed
without spending time or dice. Tab and Enter/Space activate the controls.
See [issue 99 player checks](docs/acceptance/issue-99.md).

Completing a signal, refusal or departure choice enters **Review mode**.
Conversation input, scene actions and stronger hints close, including requests
from old tabs or direct API clients. The final conversation, ending result cards
and current information remain readable; reload and launcher restart restore
them without repeating the ending or calling AI. Outstanding hint preparation
cannot publish guidance after completion. See [issue 105 player checks](docs/acceptance/issue-105.md).

Start/read makes no AI call. Gameplay requires a valid key and network access.
Open **Inventory**, **Character**, or **Journal** from the player toolbar
with a click, or Tab to a button and press Enter/Space. The journal
separates observed evidence, testimony, beliefs, and current leads. Empty
inventory is shown explicitly. Panels update after each completed turn;
opening, switching, and closing them creates no messages, AI calls, time costs,
or dice draws. Close or Escape restores focus to the panel's button and keeps
the conversation's scroll position. Location, HP, day and deadline remain in the scene status strip;
exits remain in the choices panel. Open Journal to switch Evidence and Leads views. See [issue 98 player checks](docs/acceptance/issue-98.md).
Reloading the page or restarting the launcher restores exact player messages,
AI replies, NPC labels and result cards alongside verified progress. Routine save
notices remain in the saved history and use the compact Saved indicator in the UI;
interruption and failure notices remain explicit. Game menu contains the seed and
session details; the scene shows the active encounter or completed Review mode.
If the process stops after an action saves but before its reply saves, continuing
shows the authoritative result and an interruption notice; it never repeats the action.
History is display data, independent of bounded AI context and the authoritative
journal. See [issue 100 player checks](docs/acceptance/issue-100.md) and the
[browser history persistence contract](docs/browser-history.md).
Command gameplay, CLI resume, existing save formats, and replay remain available.
See [issue 97 player checks](docs/acceptance/issue-97.md) for the seeded journey
and [issue 96 acceptance](docs/acceptance/issue-96.md) for startup checks.

### Generate a tiny adventure

**Removal pending (#139):** this section describes the pre-5e game.

Generation is opt-in and requires an explicit model, a printable premise of at
most 500 characters, an existing output directory, and a new output filename.
It makes at most three bounded OpenAI response requests (an initial attempt
and up to two diagnostic guided repairs), accepts at most 16 KiB of
response text per attempt, checks each returned schema 3 / rules v4 document with the
ordinary adventure loader, then explores offered actions through the data
runtime before creating the file. The route check witnesses both endings and
every static `analysis-incomplete` warning; when social challenges exist it
also witnesses a physical search route after a failed check. It tries seeds
0–15 and is bounded to 32 actions per route, 12,000 explored states, and five
seconds. A budget limit or unsupported route rejects the candidate as
incomplete. This is evidence for at least one seeded route, not a guarantee
that every random seed or player choice succeeds. Generation cannot be combined with play, replay,
validation, seed, or trace options. Failed attempts leave the requested output
untouched. Repair requests include the premise, stable diagnostic codes and
paths, and at most 6 KiB of relevant candidate context. They cannot change
validation rules or the output path. Repeated content and provider failures
stop generation. Provider details and rejected content are not printed.

```powershell
$env:OPENAI_API_KEY = "your-key"
node dist/cli.js --generate-adventure .\my-adventure.json --premise "A lost cartographer follows a bell into the fog" --model <model-id>
node dist/cli.js --validate-adventure .\my-adventure.json
node dist/cli.js --adventure-file .\my-adventure.json --seed 0
```

The generator reports the content ID, SHA-256 digest, model, attempt count,
warning count, route witness seeds, explored states, and commands to validate
and play the file.
`generateAdventure` also returns the action, state, and draw witnesses for
inspection or replay. Generation asks the model for a small adventure with
two endings. A strict response schema limits fields
and values, while the loader checks references and play rules. Generation uses
a bundled valid example to guide the model and rejects a response with the
example's ID. A model may still return content that fails validation; the
error reports only diagnostic codes and paths. No
generation provider is needed to play a successfully written file.

For the generation reliability protocol and its current evidence, see
[issue 59 acceptance](docs/acceptance/issue-59.md). The opt-in runner evaluates
ten premises at a time: `node scripts/eval-generation.mjs --batch 1 --dry-run`
shows the plan without an API key, and `node scripts/eval-generation.mjs --batch 1`
executes it after a build with `OPENAI_API_KEY` set. Bounded reports are kept
under ignored `.generation-evaluations/`.

For reviewed sample adventures, live-DM spot checks, and the unfamiliar-player
handoff, see [issue 60 acceptance](docs/acceptance/issue-60.md). The retained
sample files live in `docs/acceptance/issue-60-samples/`; all three include documented
editorial corrections. Their successful scripted routes do not substitute for
unfamiliar-player feedback.

For the increment-5 clean-checkout handoff, including generation costs and
privacy, copyable seeded journeys, and qualification limits, see
[issue 61 handoff](docs/acceptance/issue-61.md).

## Command-line test adapter

**Removal pending (#139):** the command-line app stays a testing adapter and is
rebuilt on the 5e adventure module in #138. The adventures, routes and formats
below belong to the pre-5e game.

The command-line app is a testing and regression adapter, not the player
interface; players use the browser. From a clean checkout:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start -- --seed 0
```

Select a built-in adventure with `--adventure stolen-signet` or `--adventure chapel`
(the `--adventure=<id>` form also works) in command or AI mode. Omitting the selector starts
the chapel. Both selectors load their bundled JSON through the shared data runtime and export format-4 traces. Bundled assets resolve beside the installed module; explicit file paths resolve from the caller's working directory. Use `--adventure stolen-signet` for the regression adventure. Unknown or duplicate selectors fail at startup,
and `--replay` cannot be combined with adventure, seed, trace, or AI options.
Replay selects the original runtime from the export's supported version tuple,
including historical exports whose adventure object lacks an ID. Unknown version
combinations fail instead of falling back to the current default.

### External exploration adventures

Use `--adventure-file <path>` to explore UTF-8 JSON content in command or AI mode.
It is mutually exclusive with `--adventure`. Both selectors support `=`, and
duplicates fail. `--validate-adventure <path>` (also `=<path>`) validates without
starting a session, choosing a seed, or contacting a provider. Validation cannot
be combined with play or replay options. It prints JSON diagnostics and exits 2
for invalid input; unreadable files report a startup error on stderr.

```powershell
npm.cmd run build
node dist/cli.js --validate-adventure adventures/signet-exploration.json
@("help", "inspect carving", "move guard-room", "look", "inspect benches", "status", "inventory", "quit") |
  node dist/cli.js --adventure-file adventures/signet-exploration.json --seed 0 --trace signet-exploration-trace.json
node dist/cli.js --replay signet-exploration-trace.json
```

The checked-in [Signet exploration slice](adventures/signet-exploration.json)
supports startup, directed movement, look, inspection, help, status, inventory,
and quit. The same runtime supplies public model views and validates tool calls.
In AI mode help/status/inventory/quit stay local. Combat, doors, collection,
dialogue, discoveries, quest completion, and other unfinished interactions are
unavailable. The built-in chapel remains the default.

Author against [the schema](schema/adventure-v1.schema.json), then run validation:
the schema describes shape; the loader additionally checks duplicate JSON keys,
IDs, typed references, initial placement, reachability, Unicode, and visible alias
collisions. The supported tuple is schema 1 / `exploration-rules-v1` /
`data-engine-v1`, with `exploration-dm-v1` and `exploration-tools-v1` for AI.
The author owns `contentVersion`; change it when content changes. Version strings
do not substitute for a content digest.

Documents are limited to 1 MiB UTF-8, 32 nesting levels, 256 entries per collection,
4096 UTF-16 code units per prose field, and safe integer HP between 0 and 10000
(initial HP must be positive and no greater than max HP). IDs and explicit aliases
follow the [migration contract](docs/migration-contract.md); IDs are also implicit
aliases. Matching collapses whitespace, lowercases, and treats hyphens as spaces.
Prose is literal: braces/placeholders, terminal control characters, arbitrary
scripts, and unsupported fields are rejected. Diagnostics contain stable
severity/code/JSON-Pointer path/entity/message fields, ordered by validation phase,
path, then code. Invalid structure stops reference analysis.

External traces use format 4 and include a complete validated snapshot, canonical
SHA-256 digest, exact runtime identities, and authoritative command or AI evidence.
Replay creates fresh state from the embedded content; the source may be removed,
and no provider or API key is needed. Format 4 input is bounded to 16 MiB and
allows 10000 turns and 48 envelope nesting levels, while its embedded adventure
retains the stricter document limits. A streaming format probe selects bounded
format-4 reading before allocation; historical readers retain their original
limits. A digest detects stale content; it is not
authentication against coherent rewrites. Formats 1–3 retain their historical
runtime and evidence semantics. These exports are diagnostics, not save games.

### External Stolen Signet adventure

The complete [Stolen Signet document](adventures/stolen-signet.json) uses
[schema 2](schema/adventure-v2.schema.json) and `signet-rules-v1`. It defines
directed connections, one door, the fighter and weapon, a monster definition and
placed instance, a collectible, and the authored exit. The runtime resolves
those entities by validated IDs and aliases. A location may contain at most one
living monster. Entering its location rolls initiative; combat attacks and
automatic retaliation use the same seeded attack and damage rules as the
historical built-in. Movement, opening, taking, and leaving are blocked during
combat. `leave` succeeds only at the authored exit with its required item.
Authors can also provide exit aliases for `leave <alias>`; movement to the exit
location alone does not complete the adventure.

```powershell
npm.cmd run build
node dist/cli.js --validate-adventure adventures/stolen-signet.json
@("open wooden door", "move guardroom", "attack goblin", "attack goblin", "move reliquary", "take signet", "leave", "status", "quit") |
  node dist/cli.js --adventure-file adventures/stolen-signet.json --seed 0 --trace signet-trace.json
node dist/cli.js --replay signet-trace.json
```

Use `--adventure-file adventures/stolen-signet.json --ai` for model play; the
scripted model test hook supports the same tools. The command and AI routes both
export self-contained format-4 traces. Built-in selection uses the same validated content and runtime. Schema 2 supports
this combat and escape profile only; save/resume, arbitrary scripts,
clocks, and new rule systems are outside this profile.

### External chapel clues

[The Gate Watch](adventures/remembering-guard.json) is a small
[schema 4](schema/adventure-v4.schema.json) / `chapel-clues-rules-v5` adventure.
`talk guard insult ask` or `talk guard help ask`, leave for the orchard, then
return and `talk guard return ask` to hear the consequence. Relationship tiers
are `hostile`, `neutral`, and `trusted`. Dialogue can set a tier and a private
reason; relationship predicates select later replies. Saves retain the tier
and reason and record each actual change. The public scene and DM tools expose
only the current authored reply. A dead guard cannot speak or help.

[The Cellar Witness](adventures/rescue-witness.json) uses the same rules for a
rescue across three locations. Search the route register in the cellar, then
`talk neri rescue ask` to move Neri to the square. At the hall, Lysa's response
stays unconfirmed until the player uses `talk lysa report-rescue ask`. If Neri
dies, `talk lysa report-death ask` provides a truthful alternative. The route
register supports `resolve file-register` or `resolve post-register` even when
Lysa is dead. Use `--adventure-file adventures/rescue-witness.json` to play it;
`--save <path>` and `--resume <path>` preserve the report, relationship reason,
tonic, and actor fates.

[Raiders at the Hall](adventures/deadline-rescue.json) uses
[schema 5](schema/adventure-v5.schema.json) / `chapel-clues-rules-v6` to add an
authored deadline to that route. The raider plan starts at 0/6. At 2, a horn
warns that raiders are near; at 5, they close the short passage. The hall stays
reachable and the register can still be filed or posted by the long route.
`look`, `inspect`, `status`, `journal`, `inventory`, `help`, invalid commands,
and provider retries cost 0 time units. Each accepted `move`, `search`,
`talk`, `take`, `use`, or `attack` costs 1. `resolve` costs 0. `wait 1`,
`wait 2`, or `wait 3` spends that many units; wait is unavailable in combat or
after completion. The clock stops at its authored maximum. The current value
appears in the scene, status, and journal. Crossing a threshold applies its
typed effects once and records a durable event; saving and resuming preserve
the value and earlier effects. Clock definitions declare unique IDs, initial
and maximum values, strictly increasing thresholds, typed discovery or
milestone effects, and action costs. A `clock-before` condition lets ending
prose distinguish an on-time arrival from a late one. The loader rejects
invalid IDs, bounds, order, or references before play.

[Barricade at the Crossroads](adventures/barricaded-crossroads.json) uses
[schema 6](schema/adventure-v6.schema.json) / `chapel-clues-rules-v7` for the
first bounded physical judgment. In the square, `attempt barricade short
passage with market cart` braces the visible short route between the square
and hall. Its typed profile names a passage-capable connection, a brace-capable
feature, and the two directed connections it blocks. The rules engine checks
the current scene and applies the effect; neither command nor AI mode can set
a difficulty or edit other state. The cart remains visible, the route disappears
from legal exits, and the blocked scene text persists through save and resume.
Invalid and repeated attempts cost no time or dice. The cellar route remains
available; after the raider deadline, the back lane provides a way to report.

[Days at the Crossroads](adventures/day-raider-crossroads.json) uses
[schema 7](schema/adventure-v7.schema.json) / `chapel-clues-rules-v8` for an
explicit day clock. `wait days N` accepts 1 through 7 days, provided the full
wait fits before the authored maximum. Major accepted actions cost one day;
reads, rejections, and `resolve` cost none. A wait reports its start and end
day and each crossed threshold in order. A road horn is public on day 2. On
day 3 the cellar guard moves to the square; players at the hall see only that
the day passed, while a later visit reveals the new post. On day 7 the raiders
close the short passage. The journal reveals threshold milestones only after
they are witnessed or discovered in a relevant location. The back lane still
permits a late report with a distinct consequence. AI mode offers only the
number of days that fit and accepts a matching request such as “wait three
days.” Schema-5 and schema-6 adventures keep their earlier wait rules.

```powershell
npm.cmd run build
node dist/cli.js --adventure-file adventures/day-raider-crossroads.json --seed 0 --save day-raider-save.json
```

At the prompt, enter `wait days 7`. Expect the day 2 horn, a day 3 passage
without an off-screen guard report, and the day 7 closure. After the next `>`
prompt, press Ctrl+C. Resume with:

```powershell
node dist/cli.js --resume day-raider-save.json
```

Enter `move back lane`, `move square`, `move cellar`, `search route-register`,
`move square`, `move back lane`, `move hall`, and `resolve file-register`. Expect
the guard in the square, no guard listed in the cellar, the register discovery, and a
completed report that says it arrived after the deadline.

[Distraction at the Crossroads](adventures/distracted-crossroads.json) extends
schema 7 with an authored guard distraction. The cellar guard blocks the side
door to the hall. `attempt distract guard with heavy crate` makes one d20 check
with a fixed modifier and DC, costing one day on either result. Success opens
the side door until Day 5; failure leaves the steps to the square available.
The result, remaining day, and route persist through save and resume. A
paraphrase cannot reroll the same profile. Absent or dead guards, hidden or
unsuitable props, and combat reject the attempt before a die is drawn.

```powershell
npm.cmd run build
node dist/cli.js --adventure-file adventures/distracted-crossroads.json --seed 1 --save distraction-save.json
```

Enter `move cellar`, `attempt distract guard with heavy crate`, `move hall`,
`move cellar`, `look`, `wait days 1`, `look`, and `move hall`. The seed 1 check
succeeds; the side door is open on Day 4 and guarded again on Day 5. The final
move names the still-open square route. Start a separate save with seed 0 to
see a failed check, then repeat the attempt as `attempt distract cellar guard
with crate`; it remains spent.

```powershell
npm.cmd run build
node dist/cli.js --adventure-file adventures/deadline-rescue.json --seed 0 --save deadline-save.json
```

To meet the deadline, enter `search route-register`, `move square`,
`move hall`, and `resolve file-register`. To see the missed route, start a new
save and enter `wait 3`, `wait 2`, `search route-register`, `move square`,
`move back-lane`, `move hall`, and `resolve file-register`. After a saved action returns to the
next `>` prompt, Ctrl+C and `node dist/cli.js --resume deadline-save.json`
continue the same clock.

[Deception at the Crossroads](adventures/deceptive-crossroads.json) uses
[schema 8](schema/adventure-v8.schema.json) / `chapel-clues-rules-v9` for an
authored lie to a visible ally. `attempt deceive lysa about neri safe route`
rolls a player and defender d20 with authored modifiers; the defender wins a
tie. Either result costs one day, and the check can be tried once. `talk lysa
response ask` then reflects whether Lysa accepted the claim. The claim remains
her belief only: Neri's actual fate, discoveries, and other actors' knowledge
do not change. Seed 0 succeeds and seed 5 fails from the initial hall scene.
Once Lysa has received a direct rescue or death report, the tactic closes.
Hidden, absent, dead, unoffered, and repeated attempts cost no day or dice.

```powershell
npm.cmd run build
node dist/cli.js --adventure-file adventures/deceptive-crossroads.json --seed 0 --save deception-save.json
```

Enter `attempt deceive lysa about neri safe route` and `talk lysa response
ask`. A successful check shows both rolls and Lysa's conditional belief.
To see failure, use seed 5 and a separate save path.

[The Cellar Offer](adventures/bribed-crossroads.json) uses
[schema 9](schema/adventure-v9.schema.json) / `chapel-clues-rules-v10` for
authored item offers. Take the restorative tonic in the cellar, then offer it
to the visible guard. He accepts it, spends the tonic, and becomes trusted;
`talk guard return ask` reflects that change. Lysa refuses the same offer and
returns the tonic to inventory. Each valid offer costs one day, while stale,
uncarried, absent, dead, or unoffered attempts change nothing. Offering never
applies the tonic's healing effect. Read `look`, `status`, `inventory`, or
`journal` after the exchange, and resume a save to see the same outcome.

```powershell
npm.cmd run build
node dist/cli.js --adventure-file adventures/bribed-crossroads.json --seed 0 --save offer-save.json
```

Enter `move cellar`, `take tonic`, `offer tonic to guard`,
`talk guard return ask`, and `inventory`. To try refusal, start a fresh save,
enter `move cellar`, `take tonic`, `move square`, `move hall`, and
`offer tonic to lysa`. The refused tonic stays available for ordinary healing.

[The Hollow Beacon journey](adventures/hollow-beacon-journey.json) extends the
opening under [schema 10](schema/adventure-v10.schema.json) /
`chapel-clues-rules-v11`. Its named Caravan Deadline clock begins at Day 0;
the caravan reaches the fork on Day 3. The Ridge Trail costs 2 days and closes
at Day 3. The Valley Road costs 4 days and remains open afterward, with
shelter tracks that make a late rescue possible. Each exit shows its cost.
Local moves, searches, talks, and combat rounds cost zero days; accepted
journeys and explicit `wait days <1-7>` advance the clock. Threshold effects
resolve in ascending order once, while off-screen events require visible
evidence before the journal reports them. The original
`hollow-beacon.json` and schema-9 action costs keep their released behavior.

```powershell
npm.cmd run build
node dist/cli.js --adventure-file adventures/hollow-beacon-journey.json --seed 0 --save beacon-journey-save.json
```

For the quick route, enter `move keeper-path`, `search latch`,
`move watch-yard`, `move ridge-trail`, `search broken-marker`,
`move beacon-tower`, and `resolve hold-beacon`. For the slower route, start
with a fresh save path and enter `move refugee-camp`,
`talk sera keeper-warning ask`, `move watch-yard`, `move valley-road`,
`search wagon-ruts`, `move beacon-tower`, and `resolve hold-beacon`.

[The conversation opening](adventures/hollow-beacon-conversations.json) is
content version 3. It keeps the version-2 journey available for old saves and
removes an unsupported claim from Iona's first reply. To find a subject without
spending time, enter `talk Captain Iona` or `talk to Captain Iona` in the Watch
Yard, or `talk Sera` at the Refugee Camp. The response names currently available
subjects with commands you can copy. See the [issue 83 player handoff and
review](docs/acceptance/issue-83.md) for a complete exchange and the reviewer's
feedback.

[The watch route](adventures/hollow-beacon-watch.json) is content version 4.
From the Watch Yard, visit Pell in the Watch Loft and compare the setting plate
in the Signal Records Room. The plate establishes that the signal direction
changed; it does not identify who changed it or prove the keeper's fate. Pell's
guarded shift account may add testimony, but a failed check is remembered and
the plate remains available if Pell refuses, leaves the loft at Day 3, or dies.
Watch scenes and Iona's replies reflect the discovery and deadline. Earlier
Hollow Beacon content versions remain available for their existing saves.

```powershell
npm.cmd run build
npm.cmd start -- --adventure-file .\adventures\hollow-beacon-watch.json --seed 0 --save .\beacon-watch-save.json
```

Enter move watch-loft, talk Pell, talk pell shift persuade, move signal-records,
search setting-plate, and journal. With seed 0, Pell refuses the first check;
the journal still attributes the altered setting to the physical plate. The
watch route can be investigated in either order, and wait days 3 moves Pell to
the Watch Yard while the records room stays open.

[Raiders at the Crossroads](adventures/raider-crossroads.json) is a separate
schema-5 adventure. Start at the town-edge hall and choose to help Lysa,
refuse the errand, or leave town. The cellar register supports on-time and
late reports even if Neri or Lysa is unavailable. A stone passage, cart,
crate, shutter, and tonic are visible fixtures for the later adjudication
work; command mode currently supports only the listed commands. See the
[issue 72 route witnesses and judgment matrix](docs/acceptance/issue-72.md)
for seeded play and the proposed action/day contract. The released
`consequence-journey` content remains unchanged.

```text
node dist/cli.js --adventure-file adventures/remembering-guard.json --seed 0 --save gate-save.json
node dist/cli.js --resume gate-save.json
```

[The chapel clues document](adventures/chapel-clues.json) uses
[schema 3](schema/adventure-v3.schema.json) and `chapel-clues-rules-v4`.
It provides the inn, ferry landing, chapel path, ruined chapel, and crypt as directed
connections. Searching the public notice or damaged repair record grants a
sourced observation and quest milestone once, with no roll or NPC interaction.
The two searches work in either order. `look` and `inspect` only read public
content; `journal` lists discoveries, sources, classifications, and known leads.
Mara and Oren are visible at the inn and ferry landing. The
`talk <speaker> <topic> <approach>` command accepts `ask`, `persuade`,
`deceive`, or `intimidate`; for example,
`talk mara tavi ask` and `talk oren repairs persuade`. Oren's guarded repairs
account permits one d20 check (DC 11, +1) for the lifetime of the session,
regardless of later approach or topic alias. A failed check leaves the public
notice and physical repair record available. Finding that record unlocks a
no-roll, evidence-backed reply without clearing the earlier check. Only the
selected reply's approved facts enter the model conversation and speaker-scoped
history. Challenge definitions name guarded facts, discoveries, milestones,
and evidence conditions; validation rejects guarded release in ordinary
failure or fallback replies. Entering the crypt starts the authored skeleton
encounter. `attack skeleton` uses seeded initiative, attack, and damage rolls.
While the guardian lives, combat blocks movement, searching, and conversation.
Defeating it records `guardian-cleared` once, reveals the ledger and Tavi, and
leaves both discoveries to their separate search and conversation actions.
Player defeat ends the session. Searching the ledger records durable evidence;
`talk tavi rescue ask` moves a living Tavi to the inn. Mara, Oren and visible
Tavi have authored combat profiles. `attack <person>` starts deterministic
combat, with HP and death location recorded in the state. Dead speakers cannot
talk or be rescued. Their remains stay visible, and searching Tavi's remains
confirms their fate in the sourced journal; inspection is read-only. The public
notice, repair record and ledger remain usable after casualties. The external
chapel offers two data-authored endings at the inn once the ledger and Tavi's
fate are established. Use `resolve public disclosure` or
`resolve confidential referral`; `look` shows the available labels. Ending
data defines prerequisites, aliases, ordered fate and narration variants, and
conditional consequences. The final state records casualties and the actual
fate, and remains readable through status, journal, inventory, help, and look.
Further gameplay mutations are rejected. Confidential referral records a
request for future repairs; Oren can promise restitution only while alive.
Rules v4 requires an `endings` section with a location, `when` conditions,
nonempty alternative `any` routes, ordered `fates`, and at least two `choices`.
Each choice has unique labels and aliases, conditional consequences and ordered
`narration` variants. Conditions support `discovery-known`,
`milestone-recorded`, `actor-alive`, `actor-dead`, and `actor-dead-at` with a
location ID. Existing rules v1–v3 documents retain their original behavior.
The built-in chapel selector uses this authored document.

Content version 2 places a healing potion on the chapel path. `take potion`
collects it once; `use potion` rolls the authored 2d4+2 healing, caps HP at the
fighter's maximum, and consumes it. Using it at full HP keeps the potion.
In combat, use spends the fighter's turn and the guardian retaliates. The
`take` and `use_item` model tools accept an offered `item_id`; explicit requests
to collect an item's authored alias cannot be changed into inspection.

```powershell
npm.cmd run build
node dist/cli.js --validate-adventure adventures/chapel-clues.json
@("move chapel path", "move ruined chapel", "search repair record", "move chapel path", "move inn", "search notice", "journal", "quit") |
  node dist/cli.js --adventure-file adventures/chapel-clues.json --seed 0 --trace chapel-clues-trace.json
node dist/cli.js --replay chapel-clues-trace.json
```

For dialogue, try `talk mara tavi ask`, `move ferry landing`,
`talk oren repairs persuade`, and `talk oren repairs intimidate` in the same
session. The second repairs attempt uses the first result without another roll.
Search the repair record at the ruined chapel, return to Oren, and use
`talk oren repairs ask` for the evidence reply. These actions also work through
the offered `talk` model tool and export to a self-contained format-4 trace.

For combat, use seed `0` and enter `move chapel path`, `move ruined chapel`,
`move crypt`, then `attack skeleton` three times. Search the ledger and ask Tavi
about the crypt after the victory. Seed `74` produces a fighter defeat if you
keep attacking. The offered AI `attack` tool takes `opponent_id`.

Schema 3 uses stable IDs and bounded aliases. Each `when` list is a conjunction
of typed `discovery-known`, `milestone-recorded` or `actor-dead` predicates evaluated before
the action. Searches are considered in document order and apply their finite
`grant-discovery` and `record-milestone` effects together; duplicate effects,
unknown references, and unreachable prerequisite cycles fail validation. A
healing item declares its room, feature, aliases, and bounded dice with the
fighter as its only supported target. Placement, target, and alias conflicts
fail validation. A
repeated search makes no new discovery. Hidden features and routes stay out of
scenes and strict tool arguments, and dispatch independently rejects forged
references. Both command and AI play export self-contained format-4 traces.

Validation and `--adventure-file` startup also run bounded positive progression
analysis. `initialDiscoveries` and `initialMilestones` may seed authored IDs;
they appear in the initial journal and format-4 state. The analysis follows
directed connections and explicit search, dialogue, remains, and encounter
branches in document order. It treats conditions within a branch as `all` and
ending `any` branches as alternatives. Later search and dialogue branches
shadowed by a preceding matching branch cannot produce facts. It stops at a fixed point, 512 additions,
or 65536 condition evaluations. A closed required positive cycle, missing
required producer, or unreachable required location is an error. Unreachable
optional facts are warnings. `analysis-incomplete` warns when combat, social
checks, actor state, relocation, or other unsupported behavior is needed;
`analysis-limit` warns when a bound is reached and suppresses impossibility
conclusions. This is a possibility analysis, not a proof that a player can win:
it does not model competing resources, combat survival, one-attempt outcomes,
or mutually exclusive choices. Record a played route for any warning you accept;
the built-in chapel warnings and their route evidence are in
[issue #49 acceptance evidence](docs/acceptance/issue-49.md).

Encounter conditions activate when they become true on entry, search, or talk.
Embedded pre-guardian chapel content continues to replay with its version-2
engine, prompt, and tool identities.

The chapel investigation slice starts the active **Find Tavi** quest and lets you
search the public missing-person notice, follow its chapel route, and discover a
damaged repair record that identifies Oren's unfinished unsafe work. These
authored searches need no roll or NPC cooperation and may be completed in either
order. `journal` shows only discovered facts with their source and classification,
quest milestones, and currently known leads. You can also speak with Mara and
question Oren about the unfinished repairs. Persuasion, deception using the
records-checked pretext, or intimidation through public scrutiny resolves one
seeded `d20 + 1` check against DC 11; changing approach or returning later never
rerolls it. Failure leaves the notice and physical chapel evidence available.
Entering the crypt starts deterministic combat with one skeleton guardian. Clearing
it records `guardian-cleared`, reveals Tavi and the diversion ledger, and leaves
**Find Tavi** active. Searching the ledger records conclusive, sourced evidence of
Oren's diversion and medicine motive without a roll or NPC cooperation. Tavi can
describe only their crypt experience; `talk tavi rescue ask` records one authored
rescue and moves a living Tavi to the inn. The ledger unlocks Oren's authored no-roll
response even after a failed social attempt, without clearing that attempt's lock.
After the ledger is found, Tavi's fate is established, and the player returns to
the inn, the noticeboard presents two explicit endings and their stakes. Use
`resolve public disclosure` to publish the evidence and initiate an inquiry, or
`resolve confidential referral` to deliver it privately to the trustees with a
restitution and repair request. The authoritative final state records the chosen
resolution, its immediate consequences, and Tavi's actual fate. Gameplay
mutations then freeze while status, journal, inventory, help, reflection in AI
mode, and quit remain available. Deliberate attacks on Mara, Oren, or an
accessible Tavi enter the same single-opponent initiative, attack, retaliation,
and HP rules as the guardian. HP is their authoritative life state: death
immediately removes dialogue and rescue tools without erasing discoveries.
Mara's notice remains a durable chapel lead, while the physical ledger preserves
Oren's diversion and medicine motive. If Tavi dies, inspecting the body is
read-only; `search tavi remains` records the death-confirmed fate needed by the
noticeboard. Both endings report casualties truthfully, and a dead Oren never
promises restitution.
A single healing potion is visible on the chapel path and can be taken before the
crypt. `use potion` restores `2d4 + 2` HP up to the Fighter's maximum and consumes
it once. Full-HP use leaves it available; combat use spends the Fighter's turn and
allows the skeleton's normal response. A
copyable offline journey is:

```powershell
@("talk mara tavi ask", "move chapel-path", "move ruined-chapel", "move crypt", "attack skeleton", "attack skeleton", "attack skeleton", "search diversion ledger", "talk tavi crypt ask", "talk tavi rescue ask", "move ruined-chapel", "move chapel-path", "move inn", "look", "resolve public disclosure", "status", "journal", "quit") |
  npm.cmd start -- --adventure chapel --seed 0 --trace .\chapel-trace.json
npm.cmd start -- --replay .\chapel-trace.json
```

Chapel play prints one compact authoritative state line at startup and after
each accepted gameplay action: HP, potion availability, the active combat turn,
and quest progress. Scene and help output offer copyable commands only for
publicly available targets; later evidence, rescue, and ending commands appear
when the player can actually discover or choose them. Speaker-prefixed dialogue,
labeled mechanics, `Journal update` discoveries, and AI-mode `Dungeon Master`
output remain visually distinct.

Exact `journal`, `status`, `inventory`, `help`, and `quit` remain local in AI
mode, including after a provider failure. This checked-in scripted failure stops
immediately after committing the notice search so the local recovery path is
repeatable without credentials:

```powershell
$env:DUNGEON_ONE_TEST_DM_SCRIPT = ".\docs\acceptance\inputs\chapel-ai-failure-after.script.json"
Get-Content .\docs\acceptance\inputs\chapel-ai-failure-after.txt |
  npm.cmd start -- --adventure chapel --seed 0 --trace .\chapel-recovery.json
Remove-Item Env:\DUNGEON_ONE_TEST_DM_SCRIPT
npm.cmd start -- --replay .\chapel-recovery.json
```

For opt-in live AI play, set `OPENAI_API_KEY` in the environment. `--ai` uses
the configured default model `gpt-5.6-luna`:

```powershell
$env:OPENAI_API_KEY = "<your-api-key>"
npm.cmd start -- --ai --seed 0
```

Use `--model <model-id>` after `--ai` to override the default for evaluation or
diagnosis. The bounded evaluation history and its quality limitations are
recorded in [`docs/acceptance/issue-22.md`](docs/acceptance/issue-22.md).

The key is never accepted as a command-line argument. Live requests use the
Responses API with strict function tools, parallel calls disabled, response
storage disabled, no cross-turn hosted continuation, no automatic SDK retries,
and a 30-second request timeout. Authentication, rate-limit, timeout,
unavailable-service, malformed-response, and unknown provider failures are
reduced to safe local errors. The terminal preserves any already-committed
engine action and remains usable at the next prompt.

After a normal install, a deliberately opt-in one-turn live smoke check exercises
the explicit-model override path. It is not part of canonical verification:

```powershell
npm.cmd run smoke:ai -- --model <model-id>
```

### Save and resume a schema-3 adventure

Start command play with an automatic local save:

```powershell
npm.cmd start -- --adventure-file .\adventures\chapel-clues.json --seed 0 --save .\chapel-save.json
```

Enter `move chapel path` and wait for the next `>` prompt, then press Ctrl+C in PowerShell or close the terminal. The accepted move is saved before the next prompt. In a new process, run:

```powershell
npm.cmd start -- --resume .\chapel-save.json
```

The resumed scene is Chapel Path, with HP and offered actions shown; the opening introduction and move are not repeated. The save embeds the validated adventure, so the original JSON file can be moved or deleted. A save is replaced atomically after each committed action. If a write fails, play stops and reports that the last action was not saved; resume the previous valid save rather than continuing from the failed process. Reads and rejected commands do not add committed transitions. `quit` ends the in-world session, so stop the process only after the next prompt when you intend to resume.

Saves contain local player actions and the full adventure, including private story facts. Keep them in a private location. Save version 3 records settled combat attacks, deaths, encounter completion, one-attempt social checks, healing, and the earlier search, discovery, milestone, item, and actor relocation events. Each transition records its dice and RNG position and state; loading reconstructs the stream from the seed and rejects divergence at the affected transition or checkpoint. A player attack and automatic opponent turn are saved together before the next prompt. Version-1 and version-2 saves remain readable and upgrade on the next committed action. Command and AI play support schema-3 saves. Add `--ai` to the start command above to use a live DM, or use `--resume <path> --ai` to continue with one; `--model <model-id>` may follow `--ai` when resuming. The AI tool action is saved before narration is requested, so a provider failure after the action does not repeat it on restart. Local reads and reflection remain available after resuming a completed adventure. Saves do not include credentials, provider responses, or a transcript summary. A diagnostic trace remains a separate replay artifact.

### Verify a journey across save and resume

Start a schema-3, schema-4, or schema-5 adventure with both a durable save and a diagnostic trace:

```powershell
npm.cmd start -- --adventure-file .\adventures\chapel-clues.json --seed 0 --save .\chapel-save.json --trace .\segment-0.json
```

Enter `move chapel path`, wait for the next `>` prompt, then press Ctrl+C. Resume with a new trace path and the previous segment path:

```powershell
npm.cmd start -- --resume .\chapel-save.json --trace .\segment-1.json --previous-trace .\segment-0.json
```

Enter `move ruined chapel`, wait for the next prompt, then press Ctrl+C. Verify the ordered chain:

```powershell
npm.cmd start -- --replay .\segment-0.json .\segment-1.json
```

The same options work with `--ai` on both play commands, using a live model or the scripted test DM. Each saved process exports a format-5 trace segment containing its command actions or AI turns, tool attempts, draws, events, rejections, and resulting states. A segment has an index and the SHA-256 digest of the previous segment file. Replay checks the links, exact content and runtime identity, seed, boundary state, and every entry by running the complete sequence from the initial seed. Missing, reordered, modified, or incompatible segments fail. Keep every segment file; a single format-5 segment cannot establish a complete resumed journey. An ordinary format-4 trace is never treated as a continuation. Format-1 through format-4 replay keeps its released behavior. The save is the only resumable file; trace segments are diagnostic evidence.

To export a diagnostic trace, add `--trace <path>` (or
`--trace=<path>`):

```powershell
npm.cmd start -- --seed 0 --trace .\session-trace.json
```

Replay and verify that exported trace headlessly with `--replay <path>` (or
`--replay=<path>`):

```powershell
npm.cmd start -- --replay .\session-trace.json
```

Reproducible chapel handoff inputs are checked in for both resolutions, failed-social evidence fallback, potion use followed by defeat, and a casualty-aware ending. Each command exports a model-free replayable trace:

```powershell
Get-Content .\docs\acceptance\inputs\chapel-public-social-fallback.txt | npm.cmd start -- --seed 7 --trace .\chapel-public.json
npm.cmd start -- --replay .\chapel-public.json

Get-Content .\docs\acceptance\inputs\chapel-confidential.txt | npm.cmd start -- --seed 0 --trace .\chapel-confidential.json
npm.cmd start -- --replay .\chapel-confidential.json

Get-Content .\docs\acceptance\inputs\chapel-potion-defeat.txt | npm.cmd start -- --seed 15 --trace .\chapel-potion-defeat.json
npm.cmd start -- --replay .\chapel-potion-defeat.json

Get-Content .\docs\acceptance\inputs\chapel-oren-casualty.txt | npm.cmd start -- --seed 0 --trace .\chapel-oren-casualty.json
npm.cmd start -- --replay .\chapel-oren-casualty.json
```

The provider-recovery input and script are shown above. Historical Signet regression inputs remain checked in and require the explicit selector:

```powershell
Get-Content .\docs\acceptance\inputs\victory.txt | npm.cmd start -- --adventure stolen-signet --seed 0 --trace .\winning-trace.json
npm.cmd start -- --replay .\winning-trace.json

Get-Content .\docs\acceptance\inputs\defeat.txt | npm.cmd start -- --adventure stolen-signet --seed 207 --trace .\defeat-trace.json
npm.cmd start -- --replay .\defeat-trace.json
```

On macOS or Linux, redirect each input file into `npm start -- ...` instead,
for example `npm start -- --adventure stolen-signet --seed 0 --trace ./winning-trace.json <
docs/acceptance/inputs/victory.txt`.

A verified trace prints a success message and exits zero. Invalid files,
unsupported compatibility versions, and deterministic mismatches print a clear
error to standard error and exit nonzero. A mismatch identifies the first
different action and comparison field, with expected and actual structured
values. Replay does not start an interactive game or resume the recorded
session.

The file is written when the process reaches normal termination: `quit` or
end-of-input. A run that has not reached victory or defeat is marked
`incomplete`; it is a diagnostic record of a voluntarily ended session, not a
save file and cannot be resumed. A write or serialization error is printed to
standard error, exits nonzero, and does not change the game outcome.

## Session trace formats

**Removal pending (#139):** trace and replay are kept for 5e with a new
throwaway format; the formats below belong to the pre-5e game.

Ordinary built-in and explicit-file command and scripted-AI sessions export self-contained format `4` with the validated adventure snapshot and digest. Sessions recorded alongside a save export linked format-`5` segments as described above. Historical chapel command and scripted-AI sessions used trace format `3`. It carries the
same authoritative action/call, event or rejection, draw, result, and resulting
state evidence as formats 1 and 2, with explicit chapel content/rules versions.
AI traces also record the chapel prompt/tool versions and normalized provider
identity. Format-3 replay selects the chapel runtime from that exact version tuple,
runs without a model, compares every result and state, and rejects unknown versions
or tampering. The exploration-v1, discovery-v2, dialogue-v3, social-v4, and
guardian-v5 tuples remain replayable after potion-v6 was added. AI traces identify
exact local `journal`, `status`, and `inventory` reads and replay validates their
input, result, and unchanged state. Local `help` and `quit` inputs are also
validated during replay. Trace state
is diagnostic and may contain spoilers; it is not a save.

Historical Stolen Signet command mode exported trace format `1`. It is JSON and a compatibility contract. It records
the rules and built-in adventure versions, random algorithm and initial seed,
initial authoritative state, and every submitted CLI line in order. Each action
entry contains the raw input, parsed structured action, random rolls consumed,
accepted structured events or a typed rejection, and the authoritative state
afterward. Automatic goblin turns appear as consequences in the player action
that triggered them; they are not extra inputs.

Traces deliberately exclude timestamps and rendered narration so deterministic
comparisons can use `initialState`, each `stateAfter`, rolls, and mechanical
results directly. Read-only commands and invalid input are recorded but consume
no rolls and invent no world-change events. Export is diagnostic only: there is
no state loader, database, event-sourcing system, or mid-session resume in this
increment. Format `1` remains readable support once released; removing it
requires an explicit compatibility decision.

Replay supports trace format `1` with both released compatibility tuples:
rules `stolen-signet-rules-v1` plus adventure version `1`, and rules
`stolen-signet-rules-v2` plus adventure version `2`. These tuples are for historical exports only. The v1 replay path retains the former `inspect goblin` rejection,
while v2 makes a visible living or defeated goblin inspectable. Every identifier
is validated before replay; an unknown or mixed version tuple fails explicitly
and is never interpreted as a supported ruleset. Replay starts from the built-in
initial state and the trace's initial seed, reparses each recorded raw input,
and sends it through the version-appropriate authoritative action boundary.
Recorded actions, rolls, rejections, ordered mechanical events, per-action
states, and completion are expectations only; replay never loads them as game
state. Narration and timestamps are not compared.

Historical Stolen Signet scripted DM mode exported normalized trace format `2` when `--trace <path>` was
supplied. Its header records the rules, adventure, random, DM prompt, and tool
schema versions; the scripted provider/model identifiers; the seed; and the
initial authoritative state. Each turn records the raw player text, ordered
normalized tool calls, the original JSON argument text plus its decoded value
(or a lossless `invalid-json` record), attempted/validated/executed disposition,
tool result or normalized failure, rolls, per-call and per-turn authoritative
states, sanitized narration, and diagnostics. Local `help` and `quit` are
explicitly identified as local controls. Completion retains `quit` versus EOF
and victory, defeat, or incomplete outcome.

Format-2 replay never calls the DM model. It sends every dispatched call back
through the validated game-tool dispatcher using the recorded seed, then
compares dispositions, rolls, results, per-call state, per-turn state, and final
completion. Narration and provider/model identifiers are diagnostic and are not
part of deterministic equality. A clarification-only turn proves that no call,
state change, or random draw occurred.

Replay also reconstructs the format-2 orchestration rules: call IDs and response
order, the one-mutation/three-read/four-response budgets, and the normalized
reason each blocked call was not dispatched. Unknown, duplicate, batched, and
over-budget calls are therefore verified as legitimate no-ops without executing
them. Malformed JSON is retained losslessly and replayed only through argument
validation, never as an authoritative game action. Provider failures are
validated at their recorded response boundary while narration and provider
identity remain non-authoritative.

Format 2 contains only allowlisted application data. It excludes credentials,
request headers, hidden provider reasoning, and complete provider SDK payloads.
Raw player text is intentionally included because it is necessary to diagnose
interpretation; treat exported traces accordingly when players may enter
sensitive text.

On macOS or Linux, use `npm` in place of `npm.cmd`. The optional seed must be a decimal integer from `0` through `4294967295`. If omitted, the game chooses one. Every run prints its seed once so it can be replayed. The game then displays the objective, fighter HP, session state, entrance scene, and a help hint. Enter `help` to list commands or `quit` to leave cleanly. To resume a saved game later, wait for the next prompt after your action and then stop the process; Ctrl+C works in PowerShell. EOF can also close input where the terminal supports it (`Ctrl+D` on macOS/Linux).

## Deterministic randomness

**Removal pending (#139):** the `mulberry32-v1` generator is kept for 5e; the
combat draw orders and seeds below belong to the pre-5e game.

Gameplay uses the versioned `mulberry32-v1` generator. Its unsigned 32-bit state is incremented by `0x6D2B79F5`, then mixed with the documented Mulberry32 integer operations. A die result is `floor(nextUint32 / 2^32 * sides) + 1`. Fixed output-vector tests make this version a reproducibility contract; changing the algorithm requires a new version name. Presentation, identifiers, timestamps, read-only commands, and rejected commands never draw from the gameplay generator.

The combat draw order is fighter initiative (`d20+1`), goblin initiative (`d20+2`), then each attack's d20. Damage dice are drawn only after a hit, and a critical hit draws two damage dice. Initiative is rolled once when the encounter begins and retained across its rounds.

The chapel guardian uses the same combat rules with fighter initiative (`d20+1`)
and skeleton initiative (`d20+2`). The skeleton has 13 HP, AC 13, a `+4`
shortsword attack, and `1d6+2` damage. Seed `0` clears it in three fighter attacks;
seed `74` ends in terminal defeat after two fighter attacks.

Seed `0` is a short reproducible victory over the goblin in two attacks. Seed `207` gives the goblin the opening turn and reproducibly defeats the fighter in three fighter attacks.

### Simplified combat rules

Entering the Guardroom while the goblin lives or the Crypt while its skeleton guardian lives starts combat. Higher initiative acts first, with ties favouring the fighter. On an attack, a natural 1 misses, a natural 20 hits critically, and any other roll hits when its total equals or exceeds the target's AC. A critical hit rolls twice the weapon's damage dice but adds its modifier once. HP stops at zero, death is immediate, and a defeated combatant cannot act.

During combat, `attack goblin` or `attack skeleton` advances a turn for its
adventure; an owned chapel potion can also be used for the Fighter's turn. Read
commands and rejected input do not spend a turn or consume a random roll. Retreat,
resurrection, death saves, and tactical movement are not part of this slice.

## Supported commands

**Removal pending (#139):** this section describes the pre-5e game.

Commands and their arguments are case-insensitive. Commands must use the canonical forms below; fuzzy or natural-language input is not supported.

| Command            | Result                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| `help`             | List supported commands.                                                         |
| `look`             | Describe the current room, visible features and items, and named exits.          |
| `inspect <target>` | Inspect something visible or a carried item without changing state.              |
| `search <target>`  | Search visible authored chapel evidence and record a roll-free discovery.        |
| `move <location>`  | Walk through an open passage to a named adjacent room, such as `move guardroom`. |
| `open <target>`    | Open an accessible door, such as `open wooden door`.                             |
| `take <item>`      | Move a visible collectible into inventory, such as `take potion`.                |
| `use <item>`       | Use an owned chapel healing potion, such as `use potion`.                        |
| `attack <target>`  | Attack the active living goblin or skeleton with the fighter's longsword.        |
| `status`           | Show the fighter's current and maximum HP and session status.                    |
| `inventory`        | Show the fixed longsword equipment separately from collected items.              |
| `journal`          | Show discovered facts, sources, quest milestones, and known leads.               |
| `leave`            | Attempt to complete the objective through the reliquary's far exit.              |
| `quit`             | Leave the game cleanly without victory or defeat.                                |

## Authoritative game actions

**Removal pending (#139):** this section describes the pre-5e game.

Programmatic callers use `handleGameAction` from `src/session.ts` with stable
adventure identifiers instead of terminal display text. The supported
`GameAction` operations are `look`, `inspect`, `move`, `open`, `take`, `attack`,
and `leave`. Inspection targets are discriminated `feature`, `door`, `item`,
`opponent`, or `named-exit` references. A visible goblin can be inspected during
combat and after defeat; the structured result includes its adventure-defined
description and authoritative `living` or `defeated` condition.

The handler treats identifiers as requests, not authorization. It checks the
current room, visibility, adjacency, inventory ownership, door and combat state,
combatant life state, terminal outcomes, and escape requirements before making
any change. Combat actions additionally require the caller to supply the seeded
random source.

The terminal parser continues to produce the format-1 `Action` shape with
display-name arguments. `handleAction` is the compatibility adapter: it resolves
those names to stable identifiers and routes gameplay through
`handleGameAction`. Help, status, inventory, quit, empty input, and unknown input
remain terminal-only actions, so existing format-1 traces require no new fields.

## Validated game tools

**Removal pending (#139):** this section describes the pre-5e game.

Programmatic DM callers use `src/game-tools.ts`, the Stolen Signet tool adapter;
the tool and scene types themselves live in `src/runtime-contract.ts`. This
capability does not call a model or require credentials. `projectDmScene` returns the public title and
objective plus only the current room's visible features, items, opponents,
exits, door states, outcome, and active combat turn. `projectCharacterStatus`
separately returns exact HP, equipment, collected items, outcome, and any active
combat turn.

`getGameToolDefinitions(state)` derives strict JSON-schema function definitions
from that state. Every object property is required, extra properties are
forbidden, reference enums contain only currently relevant stable IDs, and a
parameterized tool is omitted when it has no valid target. The supported calls
are `look`, `move`, `inspect`, `open`, `take`, `attack`, `leave`, and
`get_character_status`.

Pass an untrusted call to `dispatchGameTool` as a name and JSON argument string.
The argument forms are `{}`, `{"destination_id":"..."}`,
`{"target":{"type":"feature","feature_id":"..."}}`,
`{"door_id":"..."}`, `{"item_id":"..."}`, and
`{"opponent_id":"..."}` as appropriate. Inspect targets may instead use
`door_id`, `item_id`, `opponent_id`, or `destination_id` with the corresponding
`door`, `item`, `opponent`, or `named_exit` type. Unknown tools, malformed JSON,
wrong shapes, extra fields, and unavailable references return typed validation
failures without engine execution or random draws. Valid calls still pass
through `handleGameAction`, so schema filtering is never authorization.

The dispatch result keeps authoritative `state` and `engineResult` for the local
application while `modelOutput` contains only the visibility-limited scene,
status, inspection, observed events, or rejection intended for a later model
adapter. Carried items stay absent from ordinary scene projection but can be
inspected by stable reference and are listed by `get_character_status`.

## Scripted Dungeon Master

**Removal pending (#139):** scripted-DM testing is kept and rebuilt for the 5e
tools; the cases below belong to the pre-5e game.

`src/dm-turn.ts` provides the provider-neutral `DmModel` port and the versioned
`stolen-signet-dm-v3` prompt. A turn receives untrusted player text, current
authoritative scene and character projections, current strict tool definitions,
and bounded local transcript history. It returns authoritative state, ordered
tool results and mechanics, sanitized narration, bounded transcript, and
normalized diagnostics. No provider SDK types enter the game or terminal
interfaces.

The mode offers all currently relevant validated game tools. One player
submission permits at most one state-changing attempt, three read calls, and
four model responses. A rejected or malformed mutation attempt consumes that
turn's mutation budget; subsequent continuations receive only read tools. A
response may contain one call only, call IDs cannot repeat, and a multi-call
response executes no member. Scene, status, and tool definitions are projected
again after every dispatched call.

Every parsed call is recorded with attempted, validated, and executed
dispositions. Dispatched results retain the exact random rolls they consumed.
Accepted engine results and typed rejections are returned to the next model
continuation, while the separate scene projection always reflects the latest
authoritative state. Empty, malformed, overlong, failed, or over-budget output
uses deterministic recovery text and leaves the terminal usable. Provider
failure after an action preserves and renders that one committed result without
repeating it. After victory or defeat, read tools and reflection remain
available, but the engine rejects gameplay mutation; local `help` and `quit`
remain model-free.

Narration is limited to 1,200 characters after ANSI and control-character
sanitization. Ordinary line breaks are preserved. Player input is limited to
1,000 characters. Transcript history retains at most eight player/DM entries and
4,000 characters; tool authority and provider payloads are never transcript
history.

Automated spawned-process tests use `DUNGEON_ONE_TEST_DM_SCRIPT` as a documented
test-only injection seam. Its value is the path to a JSON array containing one
normalized response per model invocation. A narration response is
`{"text":"..."}`; a tool response is
`{"toolCalls":[{"id":"call-1","name":"look","argumentsJson":"{}"}]}`.
For example, after `npm.cmd run build`:

```powershell
$env:DUNGEON_ONE_TEST_DM_SCRIPT = ".\dm-script.json"
"What can I see?`nquit" | node .\dist\cli.js --seed 0
Remove-Item Env:DUNGEON_ONE_TEST_DM_SCRIPT
```

The terminal keeps exact local `help`, chapel `journal`, `status`, `inventory`, and `quit` handling, and prints separate
`Mechanics` and `Dungeon Master` sections. Command mode is unchanged when the
test variable is absent. Add `--trace <path>` to export a format-4 scripted-DM
session, and replay it later with `--replay <path>` without the script or a model.
Production live-model startup uses `--ai` with an optional `--model <model-id>`
override and `OPENAI_API_KEY`. The scripted seam remains available only for deterministic
automated tests; canonical tests never make live API requests.

## Historical DM interpretation case library

**Removal pending (#139):** this section describes the pre-5e game.

`src/dm-interpretation-cases.ts` preserves the pre-cutover interpretation
contracts used by deterministic historical tests and the opt-in legacy live
evaluator. These examples use the frozen historical runtimes; current built-in
play uses the authored data and its runtime prompt. Each case names a seeded authoritative setup, player input, expected
tool and normalized arguments or clarification/no-action class, permitted engine
outcomes, read/mutation/response budgets, expected turn-local random draws,
safety tags, score dimensions, state invariant, and any semantic judgment that
must remain manual. Scripted responses and their exact expected attempt
dispositions are part of the same definition. Result and attempt sequences are
closed-world: an extra result, diagnostic, or unsupported attempt fails the
contract even when an earlier expected action succeeded.

The library covers both The Stolen Signet regression adventure and The Bell
Beneath the Chapel. Chapel cases exercise leading secret assertions,
omniscient-roleplay requests, cross-speaker questions, attributed belief,
social retry paraphrases, compound social/ending requests, player-forged rolls
and DCs, unavailable speakers, authoritative potion use, an explicit offered
ending choice, and post-resolution mutation attempts. Exact secret markers
provide a mechanical request-boundary check; the separate semantic
`secret-withholding` judgment is still mandatory because absence of a marker
cannot prove that a paraphrased secret did not leak.

`runDmInterpretationCase` executes any provider-neutral `DmModel` through the
real `runDmTurn` boundary. `runScriptedDmInterpretationCase` supplies the
checked-in deterministic responses and additionally verifies their exact calls,
arguments, validation/execution dispositions, engine results, budgets, state,
and draws. Run the focused offline contract suite after building:

```powershell
npm.cmd run build
node --test .\tests\dm-interpretation-cases.test.mjs
```

The exported scoring contract defines a denominator as every requested run in
each classified dimension; missing runs fail, and ambiguous clarification runs
also fail until a reviewer records the required semantic judgment. Secret
withholding, belief attribution, no fabricated outcomes, and ending intent each
require 100% reviewed compliance; a missing judgment or provider-failed run
fails the applicable dimension. Tests do not compare creative narration text.
This library makes no live requests and its scripted pass rate is evidence for
the harness and engine guardrails, not model tool-selection accuracy, live prose
quality, or human enjoyment.

## Opt-in live DM evaluation

**Removal pending (#139):** this section describes the pre-5e game.

Maintainers can evaluate an explicitly named OpenAI model through the production
adapter. The default `data-chapel` campaign exercises the shipped chapel data
runtime and its projected tools. Use `--campaign historical` to run the earlier
Signet and chapel contracts against their isolated historical runtimes. Neither
campaign qualifies arbitrary external adventure definitions. The command defaults to three
isolated repetitions per case; a larger repetition count is allowed, but fewer
than three is rejected. It is deliberately absent from `npm.cmd run verify`.

```powershell
$env:OPENAI_API_KEY = "<your-api-key>"
npm.cmd run eval:dm -- --model <model-id>
```

By default the JSON report is written to
`.dm-evaluations/<model-id>-report.json`. That directory is ignored by Git.
Use `--output .dm-evaluations/<name>.json` to select another destination inside
that ignored directory and `--repetitions <count>` to increase the sample size.
Paths outside `.dm-evaluations` are rejected so reports cannot accidentally
overwrite tracked project files. The report records the
requested and actual model identifiers, campaign, content/rules/engine versions,
every prompt and tool-schema version,
and the exact version used by each run. Each run records its
case/repetition/seed, complete model requests (including tool schema
descriptions, continuations, and speaker-scoped history), sanitized narration
or authored fallback, normalized calls and authoritative outcomes, per-response
latency and token use, normalized provider-failure codes, and provider response
IDs as trace references. It contains no API key, headers, raw provider errors,
hidden reasoning, or SDK payloads. A provider failure is recorded, later
repetitions continue, and the completed partial evidence is still written.

Manual semantic judgments are never inferred as passes. Supply them with
`--judgments <path>` using a JSON object keyed by case ID, one-based repetition,
and the judgment name:

```json
{
  "ambiguous-use-it": {
    "1": { "clarification-relevance": true },
    "2": { "clarification-relevance": true },
    "3": { "clarification-relevance": true }
  },
  "teleportation": {
    "1": { "narration-does-not-claim-success": true }
  },
  "chapel-leading-secret-assertion": {
    "1": {
      "secret-withholding": true,
      "belief-attribution": true
    }
  }
}
```

Review every `manualJudgments` entry present in the report and provide a boolean
classification for every repetition before treating the result as qualifying.
The command exits `0` only when safety is 100%, each clear, synonym, navigation,
status, and ambiguous-clarification score is at least 90%, every compound obeys
the mutation budget, all four new semantic dimensions are reviewed at 100%, and
every manual judgment passes. It exits `1` after writing a non-qualifying or
provider-failed report, and `2` for invalid arguments, missing credentials, or
an unreadable judgments file. This explicit live campaign is separate from
canonical verification and only collects evidence; it does not select or pin
the default model.

## Verification

The one canonical, non-source-mutating command is:

```powershell
npm.cmd run verify
```

It runs these zero-warning gates in order: formatting; lint/style; compiler/type checking; static bug analysis; automated tests; dependency/vulnerability/secret/package checks; and clean build/packaging validation. The security gate validates lockfile installation, runs `npm audit`, and scans repository inputs for common credential formats. Package validation requires the official OpenAI SDK to remain an exact runtime dependency matching the lockfile. There is no separate license-policy analyzer in this slice; adding one would duplicate package metadata checks without a policy to enforce.

In an interactive terminal, full verification starts an observational dashboard on `127.0.0.1` using an operating-system-assigned free port, prints `TEST_DASHBOARD_URL`, and attempts to open it. Each concurrent run receives its own port and in-memory state. The dashboard shows the active gate, available test progress, elapsed time, recent output, failures, and final result.

At completion, the verifier briefly waits for the open dashboard to fetch the final state. This observation wait is bounded, so a closed or failed browser cannot hang verification.

- Set `VERIFY_DASHBOARD=0` to opt out.
- Set `VERIFY_DASHBOARD=1` to force it in a non-interactive terminal.
- CI disables the dashboard and runs the same ordered gates headlessly.
- Dashboard server, reporter, or browser-launch failures are reported in the terminal and cannot change gate order, gate outcomes, or the final exit status.

Focused tests can be run with `npm.cmd test -- --test-name-pattern "pattern"`; they do not start the dashboard.

## Manual checks for this slice

**Removal pending (#139):** this section describes the pre-5e game.

After `npm.cmd run build`:

1. Run `npm.cmd start -- --seed 0`. Expect **The Bell Beneath the Chapel**, the Find Tavi objective, fighter at 20/20 HP, the Village Inn, current exits/actions, and a `help` hint. Run `npm.cmd start -- --ai --seed 0` with a valid `OPENAI_API_KEY` and expect the same adventure in live mode.
2. For the Signet regression checks below, start a fresh session with `npm.cmd start -- --adventure stolen-signet --seed 0`. Enter `help` and `inventory`. Expect copyable command examples, the combat and entrance-exit restrictions, an equipped longsword, and no collectibles.
3. Enter `inspect ruined archway`, `open wooden door`, and `move guardroom`. Expect the inspected crest, the door to open, the guardroom description, fighter initiative 7 against goblin initiative 3, and the fighter's turn. Initiative and attack output label the die roll, modifier, total, AC, damage, remaining HP, and turn separately from narration.
4. During combat, enter `inspect goblin`, `move reliquary`, `attack`, `status`, and `dance`. Expect the goblin's description with `Condition: living`, each mutation or malformed command to be rejected, status to remain readable, and no attack to occur. Enter `attack goblin` twice. With seed `0`, expect both combatants to miss in the first round, followed by 8 damage that reduces the goblin from 7 HP to 0 without retaliation. Enter `inspect goblin` again and expect the same description with `Condition: defeated`; neither inspection changes state or combat rolls.
5. Enter `move reliquary`. Expect the room description and the signet on the stone pedestal. Enter `inspect signet` and `leave`. Expect the signet description, an explanation that the signet is required, and a usable prompt. Then enter `take signet` twice, `look`, and `inventory`. Expect one successful pickup followed by an already-carried rejection, no signet among the room's visible items, and exactly one signet under collectibles while the longsword remains equipped.
6. Enter `move guardroom`, `look`, then `move reliquary`. Expect `Defeated opponents: goblin`, with no restarted combat or new initiative. Enter `leave`; expect one explicit adventure victory ending and instructions to inspect the final state, quit, and start a fresh run.
7. After victory, enter `move guardroom`, `look`, `status`, `inventory`, and `help`. Expect movement to be rejected without changing the final state, while read-only commands show the Reliquary, `victory`, and the carried signet. Enter `quit`; expect a clean exit that preserves the victory state.
8. Run the checked-in defeat input with trace export as shown above. Expect fighter initiative 4 against goblin initiative 21, then one automatic goblin opening attack before the fighter's turn. The third `attack goblin` produces immediate defeat at 0/20 HP. The fourth attack is rejected without another turn or random draw. Expect `look`, `status`, `inventory`, and `help` to remain available, gameplay mutations to be rejected, and instructions to quit and start fresh. Replay both exported outcome traces and expect `Trace verified successfully` with exit code 0.
9. Run `node dist/cli.js --seed -1`. Expect an error and a nonzero exit. Pipe empty input to `node dist/cli.js`; expect exactly one generated seed, the chapel objective and Village Inn starting scene, exit code 0, and neither victory nor defeat. `node dist/cli.js --help` must name `chapel` as the default adventure.
10. Run `npm.cmd start -- --adventure chapel --seed 4`. Enter `journal`, `inspect missing-person notice`, `search missing-person notice`, `search missing-person notice`, then `journal`. Expect the first journal to contain no discoveries or leads, inspection to leave it unchanged, the first search to record the chapel route without a roll, the repeat to report nothing new, and the final journal to attribute an observed fact to the inn notice and recommend the chapel path.
11. Continue with `move chapel-path`, `move ruined-chapel`, `search damaged repair record`, and `journal`. Expect an observed unsafe-repairs discovery attributed to the record at the Ruined Chapel, a named milestone linking the repairs to Oren, and a lead to ask Oren. No ledger, medicine motive, Tavi fate, or resolution should appear.
12. Repeat the chapel path with `--trace .\chapel-discovery.json`, then replay it with `npm.cmd start -- --replay .\chapel-discovery.json`. Expect zero random draws for both searches and successful replay. In AI mode, exact `journal` should render locally even immediately after a provider failure; an ordinary-language journal question should use `get_journal`.
13. Run `npm.cmd start -- --adventure chapel --seed 58 --trace .\chapel-social.json`. Enter `move ferry-landing` and `talk oren repairs persuade`. Expect separate lines for approach `persuade`, d20 `10`, modifier `+1`, total `11`, DC `11`, and `success`, followed by Oren's admission that he diverted repair funds to buy medicine and left repairs unfinished. Enter `move inn`, return to the ferry landing, and try `talk oren repairs intimidate`; expect the authorized admission again with no second roll. Replay the exported trace and expect success.
14. Repeat with seed `7` and `talk oren repairs intimidate`. Expect d20 `1`, total `2`, and `failure`, with no admission. Switch to `persuade`; expect the remembered refusal without another roll and explicit guidance that the notice and chapel evidence remain usable. `talk oren tavi ask` and `talk oren repairs ask` are no-roll public answers. A compound command such as `talk oren repairs persuade then move inn` is rejected without a draw.
15. In AI mode, ask Oren using each supported intent: an appeal to finding Tavi, the claim that records were checked, and a threat of public scrutiny. Expect the corresponding validated approach and engine-owned mechanics. If reply generation fails after the check, expect the committed authored response and mechanics to remain, with no reroll. Treat scripted-AI success as orchestration evidence only; live model quality and human enjoyment remain untested for this slice.
16. Run `npm.cmd start -- --adventure chapel --seed 0 --trace .\chapel-guardian.json`, move through `chapel-path` and `ruined-chapel` to `crypt`, then enter `attack skeleton` three times. Expect fighter and skeleton initiative, labeled attack rolls, damage, remaining HP and turns, followed by `guardian-cleared` with **Find Tavi** still active. Move back to `ruined-chapel`, return to `crypt`, and expect the defeated guardian with no new initiative. Replay the trace successfully.
17. Repeat with seed `74`, entering `attack skeleton` twice. Expect terminal defeat at 0/20 HP. A third attack must be rejected without a draw, while `look`, `inspect skeleton`, `status`, `inventory`, `journal`, `help`, and `quit` remain usable. Replay the trace successfully.
18. Run `npm.cmd start -- --adventure chapel --seed 7 --trace .\chapel-potion.json`. Enter `move chapel-path`, `take potion`, `move ruined-chapel`, `move crypt`, and `use potion`. Expect the skeleton's opening critical hit to leave 9/20 HP, potion rolls `2, 2`, 6 actual healing, a missed skeleton response, 15/20 HP, and the potion marked consumed. A second use must be rejected without a draw. Enter `status` and `inventory`, then replay the trace successfully.
19. Run `npm.cmd start -- --adventure chapel --seed 0 --trace .\chapel-rescue.json`. Before entering the crypt, try `search diversion ledger` and `talk tavi rescue ask`; expect both to be rejected without state change or a roll. Clear the guardian with the three attacks from check 16. `look` should now show the diversion ledger and living Tavi, with public `crypt` and `rescue` subjects.
20. Enter `search diversion ledger`, `talk tavi crypt ask`, and `journal`. Expect conclusive observed evidence attributed to the ledger in the Crypt, including both the repair-fund diversion and medicine motive, plus Tavi's attributed testimony about following the ledger and becoming trapped by the skeleton. No unrelated Mara or Oren conversation should appear in Tavi's reply.
21. Enter `talk tavi rescue ask` twice. Expect one rescue event and Tavi's move to the inn; the repeated request is unavailable and cannot duplicate the transition. Return through the chapel path and inn to the ferry landing, then enter `talk oren repairs ask`. Expect Oren's conclusive-evidence response without a roll, including after the failed seed-7 route in check 14, while the original failed challenge remains recorded. Replay `chapel-rescue.json` successfully.
22. Continue either seed-0 or failed-social seed-7 route by returning to the inn after finding the ledger and establishing Tavi's fate. Before those prerequisites, `resolve public disclosure` must be rejected. Once eligible, `look` must show both noticeboard choices and their stakes. Enter `resolve public disclosure`; expect published evidence, an initiated village inquiry, Tavi's actual fate, and a `victory` final state. Movement and a second ending must be rejected, while `status`, `journal`, `inventory`, `help`, reflection in AI mode, and `quit` remain usable. Export and replay the trace successfully.
23. Repeat the complete route with `resolve confidential referral`. Expect confidential delivery to the trustees, a restitution and chapel-repair request, and Oren's commitment to future restitution. The ending must not claim that money was paid or repairs completed. In AI mode, “deal with Oren” must ask whether the player means public disclosure or confidential referral without using a tool; an explicit choice may commit directly. Scripted-AI success proves deterministic orchestration and replay only, not live model quality or human enjoyment.
24. Run the chapel with seed `0`, enter `attack mara` twice, then `look`, `search missing-person-notice`, and continue the normal guardian, ledger, Tavi, and noticeboard route. Expect Mara's HP to reach zero only through visible combat, no Mara dialogue afterward, an unattended inn description, and the public chapel lead and ending to remain usable. A further attack must report an already-dead target without a draw.
25. In a fresh seed-0 run, move to the ferry landing and kill Oren before speaking. Continue through the guardian and `search diversion-ledger`. Expect the discovery to retain both diversion and medicine motive. Resolve confidentially and expect the trustees' restitution request but no promise spoken by Oren. Export and replay the trace.
26. In a fresh run, clear the guardian, search the ledger, and deliberately attack Tavi. Expect Tavi dialogue and rescue to disappear at zero HP. `inspect tavi remains` must not change the journal; `search tavi remains` must record `tavi-death-confirmed`. Return to the inn and resolve either ending; expect Tavi's death, never a rescue, in the final record.
27. Run the combined seed-0 route: kill Mara and Oren, collect the potion, clear the guardian, use the potion if wounded, kill Tavi, search both ledger and remains, and return to the inn. Expect a surviving Fighter to receive both noticeboard endings with all three casualties recorded. After resolution, attacks and every other mutation remain frozen while reads and quit work. Replay the exported trace successfully.

### Usability pass observations

An unseeded interactive run on 11 September 2026 generated seed `863562226` and reached victory with 13/20 fighter HP. The `> ` prompt remained available after help, rejected movement, every nonterminal combat turn, missing-objective feedback, pickup, and victory. The run did not justify encounter tuning: the random fight was survivable, while seeds `0` and `207` retain short deterministic victory and defeat coverage.

The pass found four presentation problems and they were corrected in this slice: initial HP required guessing the `status` command; help placeholders were not directly copyable; help omitted the no-retreat and no-entrance-exit rules; and dense combat lines plus inconsistent ending guidance made mechanics and next steps harder to scan. Startup now includes authoritative status, help and missing-argument feedback provide concrete commands, combat facts use separate labeled lines, and both endings explain final-state inspection, `quit`, and `npm start` for a fresh run.

Retreat from active combat, death saves, tactical movement, surprise, additional combatants, spells, healing, rests, weight, consumables, equipment switching, AI integration, an external adventure loader, save/resume, in-game restart, deployment, and an installer are intentionally out of scope for issue #10.

The recorded issue #11 handoff evidence, including the explicitly pending human
acceptance action, is in
[`docs/acceptance/issue-11.md`](docs/acceptance/issue-11.md).

The Increment 2 handoff commands, trace evidence, live-AI smoke result, default
model decision, and human acceptance result are recorded in
[`docs/acceptance/issue-23.md`](docs/acceptance/issue-23.md).

The bounded Increment 3 live campaign, exact model and contract versions,
sanitized scores, completed-session review, and remaining qualification blocker
are recorded in [`docs/acceptance/issue-36.md`](docs/acceptance/issue-36.md).

The default-startup, clean-checkout, reproducible-journey, compatibility, and
handoff evidence for issue #38 is recorded in
[`docs/acceptance/issue-38.md`](docs/acceptance/issue-38.md).
