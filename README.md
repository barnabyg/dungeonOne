# Dungeon One

Dungeon One is a TypeScript dungeon game played in a local desktop browser
with an AI Dungeon Master, using the 2024 fifth-edition rules in SRD 5.2
([ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md)).
Players keep Fighters, Rogues, Clerics and Wizards in a character library and
take them through adventure modules from level 1 to 5. The engine rolls every
die and decides every result; the AI Dungeon Master interprets what the player
types, chooses only among the actions the engine offers, and never invents an
outcome. The [rules document](docs/rules/README.md) records the rules in use,
the house rules and the rules left out.

## Requirements

- Node.js 24.21.0 LTS (pinned in `.nvmrc`; supported: Node.js 24.x)
- npm 11.6.4 (pinned by `packageManager`)
- A desktop browser. The browser tests use Microsoft Edge on Windows and the
  pinned Playwright Chromium elsewhere.
- `OPENAI_API_KEY`, only to type to the AI Dungeon Master. Without it the game
  is fully playable with its buttons.

## Playing

From the repository root in PowerShell, or by double-clicking `run.bat`:

```powershell
.\run
```

`run.bat` installs dependencies when `node_modules` is missing, builds, and
runs `npm.cmd run browser`, which prints the game's local address and opens it.
After pulling a dependency change, run `npm.cmd install` once yourself. Press
Ctrl+C to stop; rerunning the same command continues where you left off.
Options, which `run.bat` passes through:

- `--characters <library.json>` chooses the character library (default
  `characters.json` in the current directory).
- `--seed <0-4294967295>` fixes the startup seed for repeatable dice.
- `--no-sound` turns sound off completely. Otherwise sound is on at a
  moderate volume, with a mute button and volume slider in the header that
  the browser remembers.

```powershell
$env:OPENAI_API_KEY = "<your key>"
.\run --seed 0 --characters .\.scratch\play\characters.json
```

To play, create a character (choose a class, place its rolled abilities and
make its class's choices), then start one of the modules its sheet offers. In
an adventure, click the actions the engine offers or type what you want to do
to the Dungeon Master. Treasure, gear, coin and XP are kept only by getting out alive. A
character at 0 HP is defeated for good; there are no death saving throws.

## Adventure modules

| Module                      | File                                         | Levels | Difficulty |
| --------------------------- | -------------------------------------------- | ------ | ---------- |
| The Bramblecote Cider House | `adventures/5e/bramblecote-cider-house.json` | 1      | Medium     |
| The Abandoned Delve         | `adventures/5e/abandoned-delve.json`         | 2      | Hard       |
| The Coldwater Weirgate      | `adventures/5e/coldwater-weirgate.json`      | 3–4    | Medium     |
| The Thornwood Lodge         | `adventures/5e/thornwood-lodge.json`         | 4–5    | Hard       |

A sheet offers only the modules that pass the balance gate.

## Saved files

- The character library is `characters.json` by default.
- Each adventure is saved after every action in the `characters-adventures`
  directory beside the library.

Formats are throwaway until a stable release: a loader refuses a file in an
older format with a message naming it and asking you to move it aside.

## Testing and evaluation tools

These are for development, not play. Run each with `--help` for its options.

- `npm.cmd run cli` plays a module on the command line with Ada, a fixed
  level-1 Fighter; it records and replays traces.
- `npm.cmd run balance` runs the balance harness and gate over every module
  (see [balance](docs/rules/balance.md)).
- `npm.cmd run gate:verdicts` (no options) records the gate's verdicts in
  `adventures/5e/gate-verdicts.json`; run it after changing a shipped module.
- `npm.cmd run career` plays a new level-1 character through every module in
  order.
- `npm.cmd run estimate` estimates a fight from bestiary ids before you write
  it.
- `npm.cmd run loot` rolls monster loot into a module file (see
  [gear](docs/rules/gear.md)).
- `npm.cmd run map` draws a module's or a layout sketch's map and lists layout
  errors (see [module authoring](docs/module-authoring.md)).
- `npm.cmd run eval:dm` evaluates the live AI DM on scripted cases.
- `npm.cmd run smoke:ai` asks the live AI DM one question.
- `node scripts/qualify-delve-live.mjs` and
  `node scripts/qualify-release-live.mjs` play a module through the browser
  server with the live AI DM, or offline with `--dry-run`, and write a report
  under `.verify-artifacts/`.

## Architecture

- `src/runtime-5e.ts` is the 5e runtime. It implements
  `src/runtime-contract.ts` (create a session, project the player-safe scene,
  offer tools, resolve an action) over the encounter engine
  (`src/encounter-5e.ts`), characters (`src/character-5e.ts`, with each class
  in `src/<class>-5e.ts` over `src/class-5e.ts`), spells, equipment and checks.
- `src/session-5e.ts` saves adventures, `src/character-library-5e.ts` keeps the
  library, `src/browser-5e-server.ts` and `src/browser-5e-page.ts` serve the
  game, and `src/browser-cli.ts` is the launcher.
- `src/dm-turn.ts` runs one bounded AI DM turn against any runtime;
  `src/openai-dm-model.ts` adapts it to the OpenAI Responses API and
  `src/scripted-dm-model.ts` replays scripted responses for tests. These shared
  modules must not import the 5e game (see `AGENTS.md`).

## Verification

```powershell
npm.cmd run verify
```

It runs the zero-warning gates in order: formatting, lint, type checking,
static bug analysis, tests, dependency, security and package checks, and a
clean build. In an interactive terminal it opens a local progress dashboard;
set `VERIFY_DASHBOARD=0` to turn it off or `VERIFY_DASHBOARD=1` to force it.
`AGENTS.md` ("Choosing tests") says which tests to run while you work.

The manual test recipe is the
[four-module release handoff](docs/acceptance/four-module-release.md).

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
