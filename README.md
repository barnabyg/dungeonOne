# Dungeon One

Dungeon One is a TypeScript game played in a local desktop browser with an AI
Dungeon Master, using the 2024 fifth-edition rules in SRD 5.2
([ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)).
Players keep persistent Fighters, Rogues, Clerics and Wizards in a character library and bring them to
adventure modules aimed at a recommended level range, earning experience and
levels as they go. The game engine rolls every die and decides every result;
the AI Dungeon Master interprets what the player types, chooses only among the
actions the engine offers, and never invents an outcome.

The [rules document](docs/character-rules.md) records the 5e rules in use, the
house rules and each rule left out because the game has no tactical grid. The
[increment 11 handoff](docs/acceptance/increment-11-release.md) records how
the 5e release was qualified, with manual test scenarios. The latest, the
[four-module handoff](docs/acceptance/four-module-release.md), plays each of
the four shipped modules at a level of the career from 1 to 5.

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

The library lists every saved character. It tags each character **On an
adventure** or **Defeated** (a defeated character's row is dimmed); a character
on an adventure has **Continue** on its row, which reopens the adventure
directly, while the rest of the row opens the sheet.

A character sheet shows the character's class, abilities, skills, hit points, features,
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

### Creating a character

Choose **Create a character**, then a class: **Fighter**, **Rogue**,
**Cleric** or **Wizard**. The six
4d6-drop-lowest rolls are saved to the library before they are shown, so
reloading, restarting or leaving the screen shows the same dice; there are no
rerolls. Choosing a class starts its choices afresh from that class's defaults.
One table, a row per ability, places the rolls (choosing a placed roll swaps
it, and each row shows its roll's four dice with the dropped one struck
through) and the background increase (+2 and +1, or +1 to three). Each score
and modifier updates from the server as you change them. Then make the class's
choices, check the derived numbers and save:

- A **Fighter** chooses two skills, a Fighting Style, a starting kit and three
  weapon masteries. Its kits are a little common gear each, worth about the
  same: _Mace and leather_, _Two daggers and leather_, or _Club, dagger and
  leather_. Each Fighting Style is tagged with whether it applies to the kit
  chosen.
- A **Rogue** (d8 hit die, Dexterity and Intelligence saves, thieves' tools)
  chooses four skills, **Expertise** in two of them (their proficiency bonus is
  doubled), a starting kit (_Shortsword, dagger and leather_ or _Shortsword and
  leather_, each with thieves' tools, worth more than the Fighter's) and two
  weapon masteries. Its thieves' tools pick locks and disarm traps, adding its
  proficiency bonus.
  Its **Sneak Attack** adds 1d6 damage once a turn to a hit with a Finesse or
  ranged weapon made with advantage, such as after a Vex hit; the engine adds
  it, so you never ask for it. Thieves' Cant is flavour only.
- A **Cleric** (d8 hit die, Wisdom and Charisma saves, light and medium armour
  and shields, simple weapons) chooses two skills, a **Divine Order**
  (_Protector_: heavy armour and martial weapons; _Thaumaturge_: a fourth
  cantrip and its Wisdom modifier on Arcana and Religion checks), its cantrips
  (Sacred Flame, Guidance, Resistance, Thaumaturgy) and four prepared spells
  (from Bless, Cure Wounds, Guiding Bolt, Healing Word, Inflict Wounds and
  Shield of Faith), and a starting kit (_Mace, two daggers and leather_ or
  _Club, shield and leather_). It casts with Wisdom from two 1st-level spell
  slots, which come back between adventures. Its sheet shows its spell attack
  bonus, save DC, slots and spells, and its prepared spells change there, with
  **Prepare spells**, only between adventures. At level 2 it gains **Channel
  Divinity** (Divine Spark and Turn Undead, which turns undead foes until they
  make the save they repeat each turn, or are hurt or attacked; with every foe
  turned it may leave them behind), and
  at level 3 the **Life Domain** (Disciple of Life, Preserve Life, and Aid,
  Bless, Cure Wounds and Lesser Restoration always prepared) with 2nd-level
  spells. At level 4 it chooses an **Ability Score Improvement** and learns a
  fourth cantrip, and at level 5 it gains **Sear Undead** (Turn Undead also
  burns the undead it turns) and 3rd-level spells (Mass Healing Word, always
  prepared, Spirit Guardians, Beacon of Hope, Bestow Curse and Protection
  from Energy). A new level's choices, cantrips and spells are made on the
  sheet before the next adventure. Thaumaturgy and Light are flavour only.
- A **Wizard** (d6 hit die, Intelligence and Wisdom saves, no armour, simple
  weapons) chooses two skills, three cantrips (from Fire Bolt, Ray of Frost,
  Shocking Grasp and Chill Touch), six 1st-level spells for its **spellbook**
  (from Magic Missile, Shield, Mage Armor, Burning Hands, Chromatic Orb,
  Thunderwave, Ray of Sickness and Ice Knife), four of those to prepare, and a starting kit
  (_Quarterstaff and dagger_ or _Two daggers_). It casts with Intelligence from
  two 1st-level spell slots, and prepares only spells in its spellbook, at
  creation and on its sheet between adventures. Its **Arcane Recovery**
  regains a spent slot on its first short rest after a long rest, by itself.
  At level 2 it gains **Scholar** (Expertise in one of Arcana, History,
  Investigation, Medicine, Nature or Religion) and at level 3 the **Evoker**
  (Evocation Savant, flavour only, and **Potent Cantrip**: a missed or saved
  cantrip still deals half) with 2nd-level spells (Scorching Ray, Shatter,
  Acid Arrow, Mind Spike, Blur and Mirror Image). Each new level
  writes two spells into its spellbook. A new level's choices are made on the
  sheet before the next adventure. At level 4 it makes an Ability Score
  Improvement and learns a fourth cantrip, and at level 5 it gains 3rd-level
  spells (Fireball, Lightning Bolt, Bestow Curse, Protection from Energy,
  Vampiric Touch, Haste and Slow) and **Memorize Spell**: a short rest may
  swap one prepared spell for another in its spellbook until the adventure
  ends. Ritual Adept is omitted, as there is no time for rituals.

Each kit shows the AC, attack and damage it gives your scores before you
choose. Better gear is found or bought in adventures. A pending creation keeps
its dice even if a character is deleted. Creation needs no OpenAI key.

### Adventure modules

- _The Abandoned Delve_ (`adventures/5e/abandoned-delve.json`, level 2, Hard):
  a long module of sixteen rooms in two regions under a ruined keep, the keep
  cellars and the crypts below, with a rest site and an exit in each. A
  Zombie that keeps getting up guards the way in, and a wolf dens in the
  fallen kitchen. Go down by the trapped shrine stair, or lower the porter's
  rope down the dry well: it frees the goblin stuck there, who then talks
  about the crypts, and opens a second way down past a flooded cistern to the
  ossuary, where Mags Corrow, a rival treasure-hunter, is prying gold teeth
  from skulls. Make too much noise in the crypts and she runs for the shaft.
  Off the way, two Skeletons hold the barracks, a Giant Spider a webbed
  crypt, and a Ghoul the lord's vault, where a stack of coffers can be
  toppled on it; the lord's sarcophagus opens by strength or by finding its
  catch, and a dead delver may come upon you as you rest. Climb out with
  loot for 600 XP, enough for level 3.
- _The Bramblecote Cider House_ (`adventures/5e/bramblecote-cider-house.json`,
  level 1, Medium): a long module of seventeen rooms in two regions, a
  hillside cider farm and the vaults cut under it, with a rest site and an
  exit in each. A little goblin gang has driven out Widow Ressa Pell and sells
  her cider to a river fence. Get past a drunk goblin in the press house and
  down its trapdoor, or past the half-wild farm dog and down the old well,
  where the cooper's rope helps the climb. Off the way, the goblin chief
  snores in the hayloft beside his runt, who may surrender the strongroom
  key; the fence's carter waits in the cart shed and the fence tallies
  barrels in the cider store; the Pells' strongroom opens by key, pick or
  force; and something walks in the flooded sump. Come out with the Pells'
  goods for 300 XP, enough for level 2.
- _The Coldwater Weirgate_ (`adventures/5e/coldwater-weirgate.json`, levels
  3–4, Medium): a long module of twenty rooms in two regions, a dead guild's
  lock-keep and the culverts under it, with a rest site, an exit and
  wandering monsters in each. River bandits toll the gate, and a goblin boss,
  Grisk, holds the gear hall below. Go down the keeper's stair, past a locked
  grate and a bell-wire deadfall, or find the keeper's crank and drain the
  culvert. Off the way, kobolds will bargain, an ogre sleeps on the guild's
  strongbox (lure it away with salt pork, flush it out with the lock paddles,
  or leave it alone), a silted tunnel loops to a drowned vault, and a weir bell
  rouses the keep if you make too much noise. The toll sergeant may sell you
  a bow off the last barge, a chained wolf and the drowned dead lie in wait,
  and you can slip past the sleeping bandits for XP. Opening the sluices
  pays 1,800 XP, enough for level 4.
- _The Thornwood Lodge_ (`adventures/5e/thornwood-lodge.json`, levels 4–5,
  Hard): a long module of sixteen rooms in two regions, a deserter
  captain's hunting lodge and the Wolfstone hillfort on the crag above it,
  joined by the hunt ride, with a rest site, an exit and a wandering beast
  in each. Brann the charcoal-burner sells weapons at the
  forest gate and Wenna the drover armour at the camp below the hillfort.
  Captain Hesk's dire wolf and a mastiff hold the kennel yard; the hall door
  is nailed shut, so the way in is the kitchen, where a haunch thrown through
  the serving hatch feeds the bear that baits in the hall (or haul it off
  its feet by its chain). The hall's trophy wall hides a jewel and its hearth
  the King's Hanger, a +1 Shortsword; a frozen hatch opens on an owlbear's
  ice house, and Hesk (a Warrior Veteran) waits in the solar beyond a
  man-trap. Up the hill, the Reaver's dire wolf guards the ditch under loose
  rampart stones; past a rusted portcullis (a crowbar helps), a bugbear
  gaoler dozes in the guardroom, a rope bridge to the keep can open or fall,
  a brown bear dens in the undercroft, and the Reaver (a Bandit Captain)
  holds the keep. Leave with loot for 3,800 XP, enough for level 5.

A sheet offers only the modules that pass the balance gate; `npm.cmd run
balance` shows each module's verdict.

### The adventure screen

The screen has fixed regions: the status strip, the scene (the room and the
fight), the action bar, and the conversation history ("What happened") with the
box for typing to the Dungeon Master. Status and scene sit on the left and the
history on the right in its own scroll area, newest at the bottom, with the
actions and the typing box beneath it, so an action and its result are on screen
together. The game is for desktop browsers: in a window smaller than 900 × 560
px the page keeps that size and the window scrolls. The history follows new
entries unless you have scrolled up to read older ones.

The status strip shows your HP as numbers and a bar with its health in words
(Healthy, Bloodied at half or fewer, Critical at a quarter or fewer, Defeated at
0), a pip for each Second Wind, Action Surge and Channel Divinity use, and
outside a fight's turns a pip for each hit die (one per level). In a fight it
adds the round, whose turn it is, and pips for your Action (two after Action
Surge), Bonus action and Reaction, filled while unused. Screen readers hear each
in words, such as "HP 6 of 11" and "Bonus action: used".

Small silhouettes sit beside the text that names a monster or an item: before
each opponent as you meet it, before its name in the lines about its blows and
its fall and in the initiative table, before an item as you find it, at the start of a line
that takes, recovers, trades, equips or drinks one, and before each item in the
room panel's lists and **You carry**, the purse and a merchant's wares. Only the engine's lines
have them, never the Dungeon Master's own words; screen readers skip them.

The room panel shows the current room, its exits, its features (with any
discovery you have made) and the items you can see, leaving out any list that
is empty. Each exit gives the way it leads on the map, a compass point or up or
down a floor ("North: Press Room", "Down: Gear Hall"), and so do its **Go**
and **Flee** buttons; you can also type "I go north" to the Dungeon Master. On
a window 1500 px wide or more the screen has three columns: your character,
the room, and the action bar with the history; narrower, your character's lists
sit under the room, with your HP held at the top. Your
character shows your HP and what you have left this turn, then **You carry**,
grouped into Worn and wielded, Consumables, Treasure (collapsed when it holds
more than four) and Other, a line per item with its buttons on the right; open
an item's name to read about it. Outside a fight, under what you carry, **Short rest**
shows the short rests (two per adventure) and hit dice you have left: choose how
many hit dice to spend and press **Rest** to heal and regain Second Wind and
Action Surge uses. A level-5 Wizard may also choose a prepared spell to forget
and a spellbook spell to prepare in its place (Memorize Spell) until the
adventure ends. Rest shows only while a rest would restore something, and is
disabled, with why, in a room with foes or after two short rests. In a room the
adventure marks as a safe place to rest, **Long rest** shows the one long rest
an adventure allows: press **Long rest** to regain every hit point, hit die and
feature use. A module may have a wandering encounter: before each rest a d100
is rolled against its chance, and if it comes the rest restores nothing and its
fight begins (it comes at most once). A region's wandering encounter table rolls
the same way before each rest there, and also as you go and when the alarm is
raised; an omen it brings lets the rest go on. In a fight the room's details stay shown below
the encounter panel, which comes first and lists each combatant in initiative
order with its roll, hit points, AC, whether it is defeated and whose turn it
is.

**Known rooms**, below the room, lists every room you have been in or seen
through an exit, grouped by region, each marked "(you are here)", "(visited)"
or "(seen)" (seen through an exit, not yet entered). Choose a
room to see what you learned there: the discoveries you made, the creatures
you talked to and what they said, its doors, the traps you found and whether
its fight was won, slipped past, fled from, ended peacefully or still waits.
Choose it again to hide the record. Choosing a room never moves you, and a
reload shows the same rooms. The AI DM sees them too, so you can ask it where
a door was, what a creature told you or the way back to a room.

**Map** in the header bar, or the M key (not while typing), opens the map: the
rooms you have been in, on their grid cells, yours outlined in gold and each
shaded by its region, and every way out of them you can see. A way to a room
you have not been in ends on that room's cell: from your room, in a dashed box
with its name, as your exits list it; from a room you have left, in an unnamed
"?". A hidden passage shows only once you find it. Marks on a way show its door (■ shut, □
open), a trap you found (!) and a way closed (✕); a room's stairs, ladders and
shafts are listed on it, up (↑) or down (↓), naming the room they lead to once
you have been there, or from your own room; otherwise "?". One floor shows at a time, opening on yours, with a tab
for each floor you have been on. Choose a room or a stair next to yours to go
there, the same move as **Go to** (the map closes; it never moves you
more than one room, and not in a fight or while the Dungeon Master answers).
Choose any other room to see its record, as in Known rooms. Escape or
**Close** shuts it. A wide map scrolls inside it.

**The action bar** holds every action the engine offers now, with a **Go**,
**Examine**, **Take**, **Drink**, **Attack** or other button (a screen reader
hears the full "Examine Rusted Lantern"). Outside a fight, what you carry is
acted on from its entry in your **You carry** list instead, with
its own **Examine** and, for a potion, **Drink**, so a full pack never crowds
the bar. An action the engine would refuse now
stays in place, disabled, with the reason beside it, such as "Full HP",
"Action used", "Bonus action used", "No uses left", "Already tried", "Already
searched" or "Already asked". After you use an action, focus stays on its
button while it is still enabled, and otherwise moves to the newest history
entry, so pressing Enter again repeats the action or does nothing; it never
drinks a potion or leaves the room.

In a fight the bar sorts the turn's options into rows, each under its name, in
a fixed order: **Attack** (each attack names its weapon, "Attack Zombie with
Mace"; against several foes each foe's attacks sit beside its name, and a
Rogue's **Cunning Strike** choice comes first), **Cast a spell** ("Sacred Flame
(cantrip) on Zombie", then **Cast**; a spell you can't cast now is greyed out
with why, "Sacred Flame (cantrip) — Action used", and the choice moves to one
you can), the class's features (**Channel
Divinity**, with the uses its actions share shown once beside the name and each
action on a line of its own, "Turn Undead every undead foe";
**Fighter features**; **Rogue features**), **Items** (potions, and the scrolls
and wands you can use), **Weapons** ("Swap Mace for Dagger", "Hold Dagger in
your other hand"), **Answer the hit** while a hit waits for a reaction (Uncanny Dodge, a reaction
spell such as Shield, or Take the hit), **Flee** (a button for each way out
you could take, named by its room, and the attacks a flight draws after them,
such as "Draws 2 attacks"), and
**End turn** on its own at the end. Your turn ends by itself once nothing is
left to do (the fight's first turn says so), so End turn only ends it early:
beside it, "Left unused: Second Wind, Hide" lists what you would give up,
naming the spells when only a few are left ("Cast a spell: Healing Word"). Tab
order follows the rows. A weapon change
that can't work with what you hold, such as a second weapon beside one that
isn't light, isn't offered.

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

Each module has a map of rooms: every room sits on a cell of a grid, on a
floor, joined by straight passages and by stairs, ladders or shafts between
floors; the **Map** pop-up (below) shows the part you have explored. The map
lays out rooms only. There is no tactical grid, so no
positions, distances or movement inside a room.

Examining a feature makes its discovery and can reveal a hidden item. A Potion
of Healing restores 2d4 + 2 HP, never above your maximum; in a fight it takes
your bonus action. A shut door blocks its exit until you **Force** it (stuck),
or **Pick**, **Break** or **Unlock** it (locked; Pick appears while you carry
thieves' tools, and Unlock while you carry its key). In a module with traps
every room has **Search**, a Perception or Investigation check, whichever you
are better at, that finds traps on its exits; a found trap has **Disarm**, with
thieves' tools where the module allows them. Going through an
armed trap springs it: a saving throw for half damage. **Talk** asks a creature
about one of its topics; some need a check. Each check is rolled once, so
retyping never rerolls it; only a module's authored retry offers **Try again**,
with its cost (such as damage) or what changed (such as a rope found) under the
button. Circumstances the module names, such as holding a rope, can give a
check advantage or disadvantage, and its card says why. Or type instead: "search the chest", "go to the
alcove", "drink the potion".

### Fighting

Entering a room with a fight begins it: every combatant rolls initiative, and
you cannot examine, take, search, talk or open a door until it is won. You can
leave only by fleeing: on your turn, with your action, **Flee to** any way out
you could otherwise take (never through a shut door or a closed way). Each foe
able to act gets one attack on you first, and the button says whose; a Rogue's
**Disengage** (a bonus action, from level 2) spares you them that turn. The
fight stays where it was: the fallen stay fallen, and the foes left standing
keep their wounds and wait for you to come back; they never follow.
Each turn has an action, a bonus action and a reaction. In a fight the action
bar holds your whole toolkit: an **Attack** button for each living opponent,
**Extra attack** for each with two light weapons (after an attack, with the
second weapon), **Drink** for each potion you carry, **Second Wind** (a bonus
action that heals 1d10 + level), **Action Surge** (from level 2) and **End
turn**, with the uses left. A Rogue has **Hide** from level 2 (a bonus action:
your Stealth against the foes' best passive Perception; on a success your next
attack has advantage, and so Sneak Attack) and **Steady Aim** from level 3 (a
bonus action for advantage on your next attack this turn); a turn has room for
only one of them. At level 3 a Rogue becomes a Thief: Sneak Attack grows to
2d6, **Fast Hands** lets the bonus action make a second weapon change in a
turn, and **Second-Story Work** climbs and jumps with Dexterity where an
adventure marks a check as a climb or a jump. A Rogue's level 4 asks for an
Ability Score Improvement on its sheet before the next adventure. At level 5
Sneak Attack grows to 3d6, and while an attack would deal it a **Cunning
Strike** choice offers **Poison** or **Trip** (each gives up a Sneak Attack
die: the target saves or is poisoned, or knocked prone) for the next attack you
click. When a foe hits a level-5 Rogue, the fight waits before the damage:
**Uncanny Dodge** halves it with your reaction (once a round), or **Take the
hit**. A Cleric casts from a spell choice beside **Cast**: each prepared
spell and cantrip that can be cast now, with its slot and target (Resistance
once for each damage type the foes deal); outside a fight it heals or casts
Guidance, whose d4 goes on your next check. A Wizard casts the same way:
Mage Armor outside a fight, and Chromatic Orb once for each damage type it can
deal. For a Fighter, from level 5, Extra Attack makes
the Attack action two attacks: after the first, each living opponent's button reads **Second
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
is under **You carry**, worn and in hand first, stowed under Other, and each piece
is acted on there: **Equip** puts on
armour (the result says how many minutes donning took), straps on a shield or
takes a second light weapon in your other hand; **Unequip** takes it off again;
**Wield** swaps the weapon you hold for a stowed one; **Drop** leaves stowed
gear in the room, where **Take** picks it back up. In a fight you can only
swap or draw a weapon, once a turn, with your object interaction. Armour your
class isn't trained with gives disadvantage on Strength and Dexterity rolls,
and a shield without training adds no AC (SRD 5.2). Your AC and
attack update at once in the status strip and the result card, and the sheet
shows your gear after the adventure. Like treasure, gear is kept only on
getting out alive: what you dropped or left behind is gone, and a defeat or an
abandoned adventure leaves you with exactly the gear you started with.

### Magic weapons and armour

A module for level 3 and up may hide one magic item: a +1 weapon, which adds 1
to its attack and damage rolls, or +1 armour or a +1 shield, which adds 1 to
your AC. It is otherwise the item it is made from, and a weapon you have
mastered keeps its mastery. Its entry under **You carry** opens to explain the bonus,
and the sheet lists it under **Magic items**. No merchant sells or buys magic
items.

### Spell scrolls and wands

A spell scroll casts its spell with no spell slot: read it from its entry under
**You carry**, or choose it in the fight's **Cast** list. Only a character whose
class has the spell on its list can read it, so a Fighter or Rogue reads none
and a Cleric can't read a Wizard spell; a spell above your spell slots needs a
check first. Reading takes the spell's usual casting time and uses the scroll up. A Wand of Magic
Missiles works for anyone: each charge casts Magic Missile a level higher, a
long rest gives some charges back, and between adventures it is fully charged.
You keep the scrolls and wands you get out with. Between adventures a Wizard can
copy a scroll's spell into the spellbook on the sheet, for 50 gp a spell level.

### Bows and crossbows

The shortbow, light crossbow and longbow are bought from merchants or found;
no starting kit has one. They need both hands and attack with Dexterity. Each
shot spends one arrow or bolt of the kind the weapon needs; with none left,
**Attack** says "No arrows" or "No bolts" until you wield another weapon.
There is no tactical grid, so a fight's first round is your opening volley; from the
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
loot_ (carrying treasure, or coin found there) or _Escaped empty-handed_. The question names the ending leaving would
bring and its XP. When leaving falls short of the module's objective, it warns in red what is unmet and which ending
award is given up, and that the XP for fights won is kept (#475). Leaving is the player's choice alone: the AI
Dungeon Master has no tool for it.

A surviving ending earns each won fight's stat-block XP and any XP the ending
itself awards. Each treasure, coin find and XP award is earned once per
character, so playing an adventure again earns nothing twice. When the adventure ends, its
ending takes the place of the action buttons and gets focus: Victory, Escaped
with loot, Escaped empty-handed or Defeat, its title and text, what it earned
(with the coin found and the purse kept, which differ once coin is spent) and
any level-up (300 XP for level 2, 900 for level 3, 2,700 for level 4, 6,500
for level 5) with
the new hit points and features (each feature shows what it does, the same
text as the sheet, open from the start; the player can fold it), and **Back
to _name_'s sheet**. The typing box is disabled with the reason,
the history stays readable, and reloading shows the same ending.

### Saved files

- The character library (`characters.json` by default) is format version 26.
- Each adventure session is saved after every action in the
  `characters-adventures` directory beside the library, in format version 62.
  Reloading the page or restarting with the same command returns to the
  adventure exactly as it was. The library frees the character and settles it
  in one write, so an interruption never loses or repeats what it holds or
  earned.
- Adventure modules (`adventures/5e/*.json`) are format version 43, and
  each of their rooms sits on a cell of the module's map, on a floor. Their
  opponents name monsters in the bestiary (`adventures/5e/bestiary.json`),
  format version 10, or author a one-off stat block inline. An opponent may
  name its own `icon` from `src/icons-5e.ts`; otherwise it has its monster's,
  or crossed swords for a one-off stat block. A module may group its rooms
  into regions, such as an upper and a lower level; the room panel then shows
  the current room's region above its name. A module may declare flags
  (#397), facts that only ever turn on, set by what the character does
  (pulling a lever, taking an item, entering a room, a fight's outcome or a
  check's band); a passage may open once a flag is set, or close once one
  is, and the room panel says so ("The way is open now."); an encounter may
  appear, vanish or move to another room once a flag is set. A feature may
  read differently while a flag is set, and a creature's topic may be offered
  only once one is set or only until one is. A feature may accept items the
  character carries: **Use … on …** in the feature's row fits the stone snake
  into the door, and the module says what it does. A feature may offer a
  fight action: in a fight, **Use the room** topples the statue onto an
  opponent, by the approach chosen, once per fight or once per adventure. A
  module may declare an alarm, a flag only noise raises (a sneak failed by 5
  or more, a long fight, a noisy check, an opponent that flees and lives):
  the room panel then shows the module's words for it, and the card of the
  action that raised it names the noise. A region may have a wandering
  encounter table of up to six entries, wandering encounters and omens (words
  only): every so many moves there, on each rest there and when the alarm is
  raised there, a d100 decides whether one comes; each wandering encounter
  comes once, and is an omen after. A module with two or more regions, each
  with a rest site, may declare itself long: the character may then take two
  short rests and one long rest in each region, and the rest
  parts count the rests left in this region. A module may declare its routes
  from the entrance to the objective, each by the rooms it must pass, and the
  balance gate then judges every route, naming any too deadly for its
  difficulty. The gate also sweeps each region of a long module, every room
  but those marked `avoidable`, one difficulty lower than the module's, and
  every room of a long module must have a way to an exit that nothing can
  close.

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
<p,p>] [--styles <style,style>] [--checks <policy>] [--classes <class,class>]
[--json] [module.json ...]`
  plays each built-in module (or the files named) through the real runtime with
  weak and strong rolled characters of every class (Fighter, Rogue, Cleric and
  Wizard) at every recommended level, in four play styles, with checks rolled
  (`seeded`, the default), always in their worst band (`always-fail`) or always
  in their best (`always-succeed`), and reports survival, HP lost and rounds per
  fight, healing, XP, treasure, one-hit-kill chances and each module's
  balance-gate verdict for every class, which plays every check policy and both
  casting policies (a caster's survival is judged from level 3).
  See
  [the rules document](docs/character-rules.md#balance-harness).
- **Recorded gate verdicts.** `npm.cmd run gate:verdicts` gates every built-in
  module for every class and records the verdicts in
  `adventures/5e/gate-verdicts.json`, which the browser reads at startup in
  place of gating them. Run it after changing a shipped module, or when
  `npm.cmd test` reports the file out of date.
- **Career simulation.** `npm.cmd run career -- [--seeds <count>]
[--required-level <level>] [--class <class>] [--json] [module.json ...]` plays
  a new level-1 Fighter (or another class, with `--class rogue`, `cleric` or
  `wizard`) through the built-in modules (or the files named) in the browser's
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
- **Mapping tool.** `npm.cmd run map -- <module-id | path>` draws a module's
  map, or a design-stage layout sketch's, as a text grid of each floor and an
  SVG in `.scratch/maps/<id>.svg`. It lists every layout error and warning and
  exits 1 on an error. See
  [the module-authoring guide](docs/module-authoring.md).
- **Live DM evaluation.** `npm.cmd run eval:dm -- --model <model-id> --live`
  evaluates the live AI DM on The Abandoned Delve's interpretation, refusal and
  narration-fidelity cases (`src/dm-evaluation-5e.ts`), within a stated call
  budget (`--max-calls`, by default four per case and repetition), and writes a
  report under `.dm-evaluations`. `--suite approaches` runs the approach
  selection cases (#283) instead, on _The Obstacle Yard_
  (`adventures/eval/obstacle-yard.json`), `--suite reactions` the reaction
  cases (#304), on _The Wary Cellar_ (`adventures/eval/wary-cellar.json`), and
  `--suite parley` the parley and toll cases (#305), on _The Bandit's Toll_
  (`adventures/eval/bandit-toll.json`), and `--suite flags` the flag cases
  (#397), on _The Winch Tunnels_ (`adventures/eval/winch-tunnels.json`), and
  `--suite items` the cases of using an item on a feature (#400), on _The
  Snake Door_ (`adventures/eval/snake-door.json`), and `--suite room` the
  fight action cases (#402), on _The Statue Cellar_
  (`adventures/eval/statue-cellar.json`), `--suite alarm` the alarm cases
  (#401), on _The Alarmed Tunnels_ (`adventures/eval/alarm-tunnels.json`),
  `--suite wandering` the wandering encounter cases (#403), on _The
  Wandering Tunnels_ (`adventures/eval/wandering-tunnels.json`), and
  `--suite memory` the known rooms cases (#406), on _The Remembered Tunnels_
  (`adventures/eval/memory-tunnels.json`), modules for the evaluation only,
  and `--suite weirgate` the release module cases (#413), on _The Coldwater
  Weirgate_ itself, played by Ada at level 3.
- **Live delve qualification.** `node scripts/qualify-delve-live.mjs --live`
  (with `--max-calls`, default 40) plays typed turns through the browser server
  for review; `--dry-run` checks the harness offline.
- **Live release run.** `node scripts/qualify-release-live.mjs --live` (with
  `--max-calls`, default 160) plays The Abandoned Delve on a route generated
  from the balance harness's cautious run (#442; seed 0 by default) from a
  saved level-2 Ada, or with `--adventure thornwood-lodge` The Thornwood
  Lodge on its generated route (#445; seed 1) from a saved level-4 Ada with
  4,100 XP, through the browser server, typing every step to the AI DM and
  pressing a step's button only when the DM's turn left it undone, and
  writes a turn-by-turn report (`src/release-run-5e.ts`); `--seed` changes the
  seed and `--dry-run` checks the harness offline. With `--generated`
  (#409) it plays any built-in module (`--adventure <id>`) on a route
  generated from the balance harness's cautious run on the seed (0 unless
  the module has its own run), from the module's saved character or else a
  saved Ada at the module's lowest recommended level, capped at 40 turns a
  room, and writes `.verify-artifacts/issue-409-live.json`.
- **Hand-written or generated release runs.** A release run can follow a
  hand-written route when it checks particular moments (a trade, a parley,
  a surrender, a retry) with phrasing chosen to test the AI DM; the live
  script has none since the modules that had one retired (#446). A module
  too long to write a route for by hand, or whose content is still changing,
  uses `generateReleaseRun` instead: the steps the harness took outside
  fights on a fixed seed and class, each with plain generated words, which
  proves the module can be played through the AI DM but not that particular
  moments happen.
- **Where the live checks write.** Both scripts write their report to
  `--output`, by default `.verify-artifacts/issue-<n>-live.json` (`<n>` is
  138 for the delve qualification, otherwise the module's issue), and keep the
  run's character library and saves in a new
  `.verify-artifacts/issue-<n>-live-*` folder, named in the report's
  `runDirectory`. A `--dry-run` plays in a temporary folder it removes and
  writes only its report, by default `.verify-artifacts/issue-<n>-dry-run.json`.
- **AI smoke test.** `npm.cmd run smoke:ai -- --model <model-id>` asks the live
  AI DM one question through the command-line adapter and fails unless it gets a
  usable reply.

## Architecture

- `src/runtime-5e.ts` is the 5e runtime, over the encounter engine in
  `src/encounter-5e.ts`, characters in `src/character-5e.ts` (each derived
  from its class's definition: what classes share in `src/class-5e.ts`, the
  Fighter in `src/fighter-5e.ts`, the Rogue in `src/rogue-5e.ts`, the Cleric
  in `src/cleric-5e.ts`, the Wizard in `src/wizard-5e.ts`), spells in `src/spells-5e.ts`, weapons,
  armour and kits in
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

`npm.cmd test` runs every test file, as verify does. To run fewer while you
work (none of these start the dashboard):

- `npm.cmd test -- tests/x.test.mjs ...` runs those files, and
  `--test-name-pattern "pattern"` only the tests it matches;
- `npm.cmd test -- --tier quick` runs the engine, rules and server tests on
  fixture modules, `--tier browser` the browser and launcher tests, and
  `--tier content` the tests of the shipped modules (tiers combine:
  `--tier quick,browser`);
- `npm.cmd test -- --modules <id,id>` runs the content tests, gating only those
  shipped modules;
- `npm.cmd test -- --changed [<base>]` runs the tiers the changes since `base`
  (by default `origin/main`) call for, or every test file when it can't tell.

`AGENTS.md` says which to run for which change.

## SRD 5.2 attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2")
by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The
SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International
License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

## Icon attribution

The icons are from [game-icons.net](https://game-icons.net) by Carl Olsen,
Caro Asercion, Delapouite, Lorc, Skoll and Willdabeast, licensed under the
Creative Commons Attribution 3.0 Unported License, available at
https://creativecommons.org/licenses/by/3.0/. `src/icons-5e.ts` names each
icon's source; the game's footer credits them too.
