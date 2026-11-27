# The four-module set: release and player handoff

Issue #448, 16 October 2026. The shipped adventures are now four long
modules that form a career from level 1 to level 5 (#437–#447):

| Module                      | Levels | Difficulty | Rooms |
| --------------------------- | ------ | ---------- | ----- |
| The Bramblecote Cider House | 1      | Medium     | 17    |
| The Abandoned Delve         | 2      | Medium     | 16    |
| The Coldwater Weirgate      | 3–4    | Medium     | 20    |
| The Thornwood Lodge         | 4–5    | Hard       | 16    |

This ticket adds the handoff and its browser test and changes no code or
content.

Since #601 (27 November 2026) the Delve tells a story, The Unrelieved Watch:
its dead garrison is still on duty and was never paid. Scenario 2 is now its
two story runs, the reliever (2) and the robber (2b).

## Automated evidence

- `npm.cmd run verify` passes with zero warnings; CI reruns it on the PR.
- **The balance gate** qualifies each module for all four classes at its
  declared difficulty, on every route and region sweep, and the career
  check carries every class's weakest character to level 5.
  `tests/shipped-modules.test.mjs` pins the figures and
  `adventures/5e/gate-verdicts.json` records the verdicts.
- **The handoff journeys** (`tests/four-module-handoff-browser.test.mjs`) play
  scenarios 1–4 and 2b below in a real browser on their seeds, check each against
  an engine journey with the same clicks and against the library file, and
  assert the lines, fight-end HP and endings quoted here.

## Playing the game

Prerequisites: Node.js 24.x, npm 11.6.4 and a desktop browser. From the
project directory, one command installs, builds and launches the game:

```powershell
.\run
```

It opens the character library (`characters.json` in the project
directory). Create a character or choose one, and its sheet lists all four
modules: **Start** any of them. The dice are random. The AI Dungeon Master
is on when `OPENAI_API_KEY` is set in the window you launch from (model
`gpt-6-luna`); without it the typing box is off and the buttons play the
game. Press Ctrl+C to stop; rerunning `.\run` continues where you left off.

## Seeded scenarios

These replay fixed dice, so each has its own command with a seed and a
fresh library under `.scratch\release-448\` (`.scratch\release-601\` for
the Delve's two); to retry, delete that scenario's folder and start again. They use the buttons only. Once `.\run`
has installed the dependencies, build and clear the key in this window (it
stays set elsewhere):

```powershell
npm.cmd run build
$env:OPENAI_API_KEY = ""
```

The dice are seeded, so the results hold only if you take **exactly** the
listed actions in order. In every fight, press the first enabled button in
the **Attack** row (for Vex, her shortsword and then her dagger's extra
attack); otherwise press **End turn**. Never drink a potion, use Second
Wind or Action Surge, or Hide. Scenario 2 names the one fight action it
takes.

### 1. Level 1: a new Fighter in the Bramblecote Cider House

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-448\cider | Out-Null; npm.cmd run browser -- --seed 138 --characters .\.scratch\release-448\cider\characters.json
```

1. Open character creation. Keep the default choices, name the Fighter
   **Ada** and save. Expect 13 HP and AC 14 with a mace.
2. Expect four adventures, in order: the Cider House (Level 1, Medium), the
   Delve (Level 2, Medium), the Weirgate (Levels 3–4, Medium) and the Lodge
   (Levels 4–5, Hard). **Start** the Cider House.
3. **Go** Kitchen, then Press House. Nib fights; Ada wins at 13/13.
4. **Go** Hayloft. Ada kills Snagtooth with one blow. Expect Wick's morale
   save to fail ("6 − 1 = 5 against DC 8") and "Wick throws down its arms
   and surrenders." The fight ends.
5. In the "Ask Wick about" row, press **the key**. Expect "Wick offers you
   the Strongroom Key." **Take** it.
6. **Go** Press House, Cellar Stair, Cask Gallery. **Unlock** the
   Strongroom Door: "You unlock the Strongroom Door with the Strongroom
   Key."
7. **Go** Pell Strongroom. **Examine** Iron Chest; **Take** the Pell
   Christening Cup and the Pell Savings (30 gp).
8. **Go** Cask Gallery, River Door, then **Leave** and confirm.
9. Expect **Out with the Pells' goods**: +25 XP for Nib, +75 for Snagtooth
   with Wick spared, +300 for the ending; the cup kept. Ada has 400 XP and
   is level 2 (13 → 22 HP, Action Surge and Tactical Mind).

### 2. Level 2: the reliever pays the Abandoned Delve's dead

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-601\reliever | Out-Null; Copy-Item .\tests\fixtures\libraries\level-2-ada.json .\.scratch\release-601\reliever\characters.json; npm.cmd run browser -- --seed 0 --characters .\.scratch\release-601\reliever\characters.json
```

Ada is a level-2 Fighter with 300 XP (20 HP, AC 14) and a mace.

1. Choose Ada and **Start** _The Abandoned Delve_. Expect the objective
   "Bring up what you can of the old lord's hoard from under the ruined
   keep, and get out alive."
2. **Go** Gate Hall. **Examine** Standing Orders: the watch is relieved
   "when the lord's order is read at the muster bell and each man has his
   pay in his hand". Leave the Muster Bell alone: examining it rings it.
3. **Go** Porter's Lodge. **Examine** Peg Rail; **Take** the Coil of Rope. In
   the "Ask Hedda the Pedlar about" row, press **the garrison**: forty men,
   never relieved, never paid.
4. **Go** Gate Hall, Guard Post. The dead guard "finds no badge there" and
   fights. Its Undead Fortitude holds it up once, then fails. Ada wins at
   20/20.
5. **Go** Dry Well. In the Well Head's row, press **Use Coil of Rope**: the
   goblin climbs out, and "The way to the Well Bottom is open."
6. In the "Ask Goblin about" row, press **the woman**, **the tomb** and
   **the bell**. Mags cut his rope; the lord's box opens by the carved hand;
   the dead are waiting for the bell, their roll and their pay.
7. **Go** Well Bottom, Flooded Cistern, Ossuary. Mags Corrow sees Ada:
   expect "Reaction roll: 2d6 (5 + 4) − 1 Charisma = 8: uncertain" and her
   price, two gold. Press **Attack**. Ada wins at 20/20.
8. **Go** Lord's Tomb. The Crowned-Skull Ward wails and Ada's Wisdom save
   fails: 3 psychic, 17/20. **Examine** Sarcophagus Lid with
   **Investigation**: expect advantage from "The goblin's directions" and
   "Success by 5 or more". Under the lord's hands is the order, never
   opened: "read this at the muster bell: the watch is relieved. Pay each
   man what he is owed from the vault, by the roll, and let them go."
   **Take** the Silver Death Mask and the Grave Coins (7 gp).
9. **Go** Ossuary, Shaft Bottom. In the "Ask Voice at the Grille about" row,
   press **the relief** and **his offer**. He holds the roll, and offers the
   chest for the chaplain's key passed through the bars.
10. **Go** Shrine. **Examine** Altar; **Take** the Bronze Key. **Examine**
    Offering Box: the chaplain "turned the key on him and on the men's pay
    together".
11. **Go** Shaft Bottom. Refuse the deal: do **not** press Use Bronze Key on
    the Door Grille. **Unlock** the Vault Door instead, and **Go** Vault.
12. The Castellan fights and goes first: his claw misses. On Ada's turn,
    press the fight action that uses the **Iron Chest** with **Religion**
    (the garrison's oath): expect "Success by 5 or more" and "Castellan is
    paralysed … for 3 turns." Then attack as usual. Ada wins at 17/20.
13. **Examine** the Castellan's body; **Take** the Pay Roll. **Examine** Iron
    Chest; **Take** the Garrison's Pay (45 gp) and the Garnet.
14. **Go** Shaft Bottom, Ossuary, Flooded Cistern, Well Bottom, Dry Well,
    Guard Post, Gate Hall.
15. In the Muster Bell's row, press **Use Pay Roll (22 gp 5 sp)**. Expect
    "You use the Pay Roll on the Muster Bell, paying 22 gp 5 sp.", the dead
    falling in to be paid and told "that the watch is relieved", and "The
    Pay Roll is used up."
16. **Go** Broken Gate, then **Leave** and confirm.
17. Expect **The watch stands down**: +50 XP for the zombie, +25 for Mags,
    +200 for the Castellan, +600 for the ending. Ada has 1,175 XP and is
    level 3; her purse holds 29 gp 5 sp, and she keeps the Silver Death Mask
    and the Garnet.

### 2b. Level 2: the robber takes the Castellan's deal

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-601\robber | Out-Null; Copy-Item .\tests\fixtures\libraries\level-2-vex.json .\.scratch\release-601\robber\characters.json; npm.cmd run browser -- --seed 3 --characters .\.scratch\release-601\robber\characters.json
```

Vex is a level-2 Rogue with 300 XP (15 HP, AC 15) with a shortsword and a
dagger. No fight is fought in this run.

1. Choose Vex and **Start** _The Abandoned Delve_.
2. **Go** Gate Hall. **Examine** Standing Orders: "No one passes a post who
   does not wear the garrison's badge."
3. **Force** the Swollen Door: expect "d20 17 − 1 + 2 proficiency = 18
   against DC 12. Success." and "The alarm is raised by forcing the Swollen
   Door (success)."
4. **Go** Storeroom. **Examine** Old Barrel; **Take** the Garrison Badge.
5. **Go** Gate Hall, Barracks. No fight: the skeletons stand guard and let
   Vex by. **Examine** Footlocker; **Take** the Soldier's Silver (2 gp 5 sp).
6. **Go** Gate Hall, Guard Post. No fight: the dead guard stands at its
   post. **Examine** Overturned Table; **Take** the Guard's Purse (1 gp
   8 sp).
7. **Go** Dry Well. **Search**: Vex finds the Loose Step on the way to the
   Shrine. **Disarm** it with **Thieves' tools**: "You disarm the Loose
   Step."
8. **Go** Shrine. **Examine** Altar; **Take** the Bronze Key.
9. **Go** Shaft Bottom. The alarm has brought Mags Corrow here: expect
   "Reaction roll: 2d6 (3 + 4) − 1 Charisma = 6: uncertain" and "Two gold
   says we don't have to argue about it." Press **Pay the toll (2 gp)**:
   "Mags Corrow lets you pass: the encounter ends peacefully."
10. **Go** Ossuary. In the "Ask Mags Corrow about" row, press **the badge**
    and **the voice**.
11. **Go** Shaft Bottom. In the "Ask Voice at the Grille about" row, press
    **his offer**. Then, in the Door Grille's row, press **Use Bronze Key**:
    "Something thin in the rags of a steward's gown slips out with a roll of
    parchment under its arm".
12. **Unlock** the Vault Door and **Go** Vault. No fight: the vault is empty.
    **Examine** Iron Chest; **Take** the Garrison's Pay (45 gp) and the
    Garnet. There is no Pay Roll to find.
13. **Go** Shaft Bottom, then **Leave** and confirm.
14. Expect **Out with the garrison's pay**: +25 XP for parting peacefully
    with Mags, +600 for the ending. Vex has 925 XP and is level 3; her purse
    holds 47 gp 3 sp, and she keeps the Garnet.

### 3. Level 4: the salt pork and the ogre in the Coldwater Weirgate

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-448\weirgate | Out-Null; Copy-Item .\tests\fixtures\libraries\level-4-ada-4100-xp.json .\.scratch\release-448\weirgate\characters.json; npm.cmd run browser -- --seed 188 --characters .\.scratch\release-448\weirgate\characters.json
```

Ada is a level-4 Fighter with 4,100 XP (36 HP, AC 14) and a mace.

1. Choose Ada and **Start** _The Coldwater Weirgate_.
2. **Go** Barge Yard, Kennel Larder. Brindle is lying in wait: expect "you
   are surprised". Ada wins at 32/36. **Examine** Meat Hooks; **Take** the
   Side of Salt Pork.
3. **Go** Barge Yard, Lock-Keeper's Office. **Examine** Chart Cupboard;
   **Take** the Windlass Crank.
4. **Go** Barge Yard, Sluice-House. Press **Use Windlass Crank** on the
   Drain Gear: "The way to the Drain Mouth is open."
5. **Go** Drain Mouth, Outfall, Pump Room. Something huge snores below.
   Press **Use Side of Salt Pork** on the Feeding Hatch: heavy steps drag
   off toward the spillway, and "The Side of Salt Pork is used up."
6. **Go** Lock Chamber. No fight: the ogre has gone. **Examine** Guild
   Strongbox; **Take** the Wand of Magic Missiles.
7. **Go** Pump Room, Gear Hall. Grisk fights; Ada wins at 32/36.
8. Expect **The sluices open**: +50 XP for Brindle, +200 for Grisk, +1,800
   for the ending. Ada has 6,150 XP and keeps the wand (7 charges).

### 4. Level 5: feeding the bear in the Thornwood Lodge

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-448\lodge | Out-Null; Copy-Item .\tests\fixtures\libraries\level-5-ada.json .\.scratch\release-448\lodge\characters.json; npm.cmd run browser -- --seed 0 --characters .\.scratch\release-448\lodge\characters.json
```

Ada is a level-5 Fighter (44 HP, AC 14) with a mace and Extra Attack.

1. Choose Ada and **Start** _The Thornwood Lodge_.
2. **Examine** Woodpile; **Take** the Hooded Lantern.
3. **Go** Kennel Yard. Hesk's Hound and a Kennel Mastiff lie in wait: the
   mastiff's Stealth beats Ada's passive Perception ("14 against your
   passive Perception 13") and she is surprised. When the mastiff falls,
   the hound's morale save succeeds ("18 + 1 = 19 against DC 6") and it
   fights on. Ada wins at 36/44. **Examine** Hound's Kennel; **Take** the
   Gilt Hunting Cup and the Purse of Gold (30 gp).
4. **Go** Lodge Kitchen. **Examine** Larder Hooks; **Take** the Haunch of
   Venison. Press **Use Haunch of Venison** on the Serving Hatch: "The bear
   falls on it with a roar." **Take** the Cook's Purse (15 gp).
5. **Go** Lodge Hall. No fight: the bear is eating. **Examine** Hearth;
   **Take** the King's Hanger. It is stowed.
6. **Go** Lodge Kitchen, Kennel Yard, Forest Gate, then **Leave** and
   confirm.
7. Expect **Out with the spoils**: +225 XP for the hound and mastiff, +3,800
   for the ending; the cup kept and 45 gp. Ada has 10,525 XP.

### Owner results

| Scenario                | Date | Result | Notes |
| ----------------------- | ---- | ------ | ----- |
| 1. Cider House, level 1 |      |        |       |
| 2. Delve, the reliever  |      |        |       |
| 2b. Delve, the robber   |      |        |       |
| 3. Weirgate, level 4    |      |        |       |
| 4. Lodge, level 5       |      |        |       |
| Free play: Cleric       |      |        |       |
| Free play: Wizard       |      |        |       |
| Free play: AI DM        |      |        |       |

## Limits

- **Article slips.** Two finds read with a doubled or misplaced article:
  "You take the The King's Hanger and stow it." and "You take the Mags's
  Takings". The handoff test doesn't pin either wording.
- **The Delve's Leave warning** (#601). A module's objective is its victory
  when it has one, so leaving the Delve before the watch is relieved warns
  "Objective not met" and names "The watch stands down", the robber's run
  included: it earns its 600 XP all the same.
- **The Door Grille after the fight** (#601). A use can't be withdrawn, so
  the grille still offers Use Bronze Key once the Castellan is dead, with
  the deal's words.
- **Fragile seeds.** A change to these modules' foes, the fight rules, the
  wandering tables or the dice order moves the seeds; the handoff test fails
  when it does.
- **Throwaway formats** (ADR 0005): library 26, session 63, trace 57,
  adventure module 43, bestiary 10, prompt `5e-dm-v45`. When the library
  format changes, regenerate the inputs in `tests/fixtures/libraries/` from
  the generators their tests
  name: Vex's from `levelTwoVex` in the handoff test, Ada's from
  `levelFourCareerLibrary` and `libraryAt(5)` in `src/test-fighter-5e.ts`.
