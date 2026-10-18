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

## Automated evidence

- `npm.cmd run verify` passes with zero warnings; CI reruns it on the PR.
- **The balance gate** qualifies each module for all four classes at its
  declared difficulty, on every route and region sweep, and the career
  check carries every class's weakest character to level 5.
  `tests/shipped-modules.test.mjs` pins the figures and
  `adventures/5e/gate-verdicts.json` records the verdicts.
- **The handoff journeys** (`tests/issue-448-browser.test.mjs`) play
  scenarios 1–4 below in a real browser on their seeds, check each against
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
fresh library under `.scratch\release-448\`; to retry, delete that
scenario's folder and start again. They use the buttons only. Once `.\run`
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
Wind or Action Surge, or Hide.

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

### 2. Level 2: a Rogue down the Abandoned Delve's well

```powershell
New-Item -ItemType Directory -Force .\.scratch\release-448\delve | Out-Null; Copy-Item .\tests\fixtures\libraries\level-2-vex.json .\.scratch\release-448\delve\characters.json; npm.cmd run browser -- --seed 190 --characters .\.scratch\release-448\delve\characters.json
```

Vex is a level-2 Rogue (15 HP, AC 15) with a shortsword and a dagger.

1. Choose Vex and **Start** _The Abandoned Delve_.
2. **Go** Gate Hall, Porter's Lodge. **Examine** Peg Rail; **Take** the Coil
   of Rope.
3. **Go** Gate Hall, Guard Post. The zombie fights; its Undead Fortitude
   save fails on the last blow. Vex wins at 15/15.
4. **Go** Dry Well. In the Well Head's row, press **Use Coil of Rope**.
   Expect the goblin to climb out, "The Coil of Rope is used up." and "The
   way to the Well Bottom is open."
5. In the "Ask Goblin about" row, press **the woman**, then **the tomb**.
   The goblin names Mags in the bone room, and tells how the old lord's box
   opens.
6. **Go** Well Bottom: **Examine** Silted Floor, **Take** the Wishing Coins
   (6 gp). **Go** Flooded Cistern: **Examine** Drowned Delver, **Take** the
   Jasper.
7. **Go** Ossuary. Mags Corrow fights; Vex wins at 15/15. **Examine** Mags's
   Satchel; **Take** both finds (15 gp and the Turquoise).
8. **Go** Shaft Bottom, then **Leave** and confirm.
9. Expect **Out with the loot**: +50 XP for the zombie, +25 for Mags, +600
   for the ending. Vex has 975 XP and is level 3; her purse holds 21 gp.

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
New-Item -ItemType Directory -Force .\.scratch\release-448\lodge | Out-Null; Copy-Item .\tests\fixtures\libraries\level-5-ada.json .\.scratch\release-448\lodge\characters.json; npm.cmd run browser -- --seed 190 --characters .\.scratch\release-448\lodge\characters.json
```

Ada is a level-5 Fighter (44 HP, AC 14) with a mace and Extra Attack.

1. Choose Ada and **Start** _The Thornwood Lodge_.
2. **Examine** Woodpile; **Take** the Potion of Healing and the Hooded
   Lantern.
3. **Go** Kennel Yard. Hesk's Hound and a Kennel Mastiff fight. When the
   hound falls, the mastiff's morale save succeeds ("7 + 1 = 8 against
   DC 8") and it fights on. Ada wins at 40/44. **Examine** Hound's Kennel;
   **Take** the Gilt Hunting Cup and the Purse of Gold (30 gp).
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
| 2. Delve, level 2       |      |        |       |
| 3. Weirgate, level 4    |      |        |       |
| 4. Lodge, level 5       |      |        |       |
| Free play: Cleric       |      |        |       |
| Free play: Wizard       |      |        |       |
| Free play: AI DM        |      |        |       |

## Limits

- **Article slips.** Two finds read with a doubled or misplaced article:
  "You take the The King's Hanger and stow it." and "You take the Mags's
  Takings". The handoff test doesn't pin either wording.
- **Fragile seeds.** A change to these modules' foes, the fight rules, the
  wandering tables or the dice order moves the seeds; the handoff test fails
  when it does.
- **Throwaway formats** (ADR 0005): library 26, session 63, trace 57,
  adventure module 43, bestiary 10, prompt `5e-dm-v45`. When the library
  format changes, regenerate the inputs in `tests/fixtures/libraries/` from
  the generators their tests
  name: Vex's from `levelTwoVex` in the handoff test, Ada's from
  `levelFourCareerLibrary` and `libraryAt(5)` in `src/test-fighter-5e.ts`.
