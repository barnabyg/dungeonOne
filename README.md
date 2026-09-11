# Dungeon One

Dungeon One is an offline, text-first TypeScript game. The current slice of **The Stolen Signet** lets you open the watchtower entrance, fight the guardroom goblin, explore the entrance, guardroom, and reliquary, recover the stolen signet, and explicitly escape through the reliquary's far exit.

## Requirements

- Node.js 24.21.0 LTS (pinned in `.nvmrc`; supported runtime line: Node.js 24.x)
- npm 11.6.4 (pinned by `packageManager`)

All development tools are exact-version dependencies in `package.json` and `package-lock.json`. Installation and dependency auditing require registry access. Building and playing after installation do not require a network connection, AI credentials, or any external service.

## Install, build, and play

From a clean checkout:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start -- --seed 0
```

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

## Session trace format

Trace format version `1` is JSON and is a compatibility contract. It records
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

Replay supports exactly trace format `1`, rules version
`stolen-signet-rules-v1`, built-in adventure `stolen-signet` version `1`, and
random algorithm `mulberry32-v1`. Every identifier is validated before replay;
an unknown version fails explicitly and is never interpreted as a supported
ruleset. Replay starts from the built-in initial state and the trace's initial
seed, reparses each recorded raw input, and sends it through the same
authoritative action boundary used by live play. Recorded actions, rolls,
rejections, ordered mechanical events, per-action states, and completion are
expectations only; replay never loads them as game state. Narration and
timestamps are not compared.

On macOS or Linux, use `npm` in place of `npm.cmd`. The optional seed must be a decimal integer from `0` through `4294967295`. If omitted, the game chooses one. Every run prints its seed once so it can be replayed. The game then displays the objective, fighter HP, session state, entrance scene, and a help hint. Enter `help` to list commands, `quit` to leave cleanly, or send EOF (`Ctrl+Z` then Enter on Windows; `Ctrl+D` on macOS/Linux) to close input cleanly.

## Deterministic randomness

Gameplay uses the versioned `mulberry32-v1` generator. Its unsigned 32-bit state is incremented by `0x6D2B79F5`, then mixed with the documented Mulberry32 integer operations. A die result is `floor(nextUint32 / 2^32 * sides) + 1`. Fixed output-vector tests make this version a reproducibility contract; changing the algorithm requires a new version name. Presentation, identifiers, timestamps, read-only commands, and rejected commands never draw from the gameplay generator.

The combat draw order is fighter initiative (`d20+1`), goblin initiative (`d20+2`), then each attack's d20. Damage dice are drawn only after a hit, and a critical hit draws two damage dice. Initiative is rolled once when the encounter begins and retained across its rounds.

Seed `0` is a short reproducible victory over the goblin in two attacks. Seed `207` gives the goblin the opening turn and reproducibly defeats the fighter in three fighter attacks.

### Simplified combat rules

Entering the Guardroom while the goblin lives starts combat. Higher initiative acts first, with ties favouring the fighter. On an attack, a natural 1 misses, a natural 20 hits critically, and any other roll hits when its total equals or exceeds the target's AC. A critical hit rolls twice the weapon's damage dice but adds its modifier once. HP stops at zero, death is immediate, and a defeated combatant cannot act.

During combat, `attack goblin` is the only command that advances a turn. Read commands and rejected input do not spend a turn or consume a random roll. Retreat, healing, death saves, and tactical movement are not part of this game.

## Supported commands

Commands and their arguments are case-insensitive. Commands must use the canonical forms below; fuzzy or natural-language input is not supported.

| Command            | Result                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| `help`             | List supported commands.                                                         |
| `look`             | Describe the current room, visible features and items, and named exits.          |
| `inspect <target>` | Inspect something visible or a carried item, such as `inspect signet`.           |
| `move <location>`  | Walk through an open passage to a named adjacent room, such as `move guardroom`. |
| `open <target>`    | Open an accessible door, such as `open wooden door`.                             |
| `take <item>`      | Move a visible collectible into inventory, such as `take signet`.                |
| `attack <target>`  | Attack the living guardroom goblin with the fighter's longsword.                 |
| `status`           | Show the fighter's current and maximum HP and session status.                    |
| `inventory`        | Show the fixed longsword equipment separately from collected items.              |
| `leave`            | Attempt to complete the objective through the reliquary's far exit.              |
| `quit`             | Leave the game cleanly without victory or defeat.                                |

## Verification

The one canonical, non-source-mutating command is:

```powershell
npm.cmd run verify
```

It runs these zero-warning gates in order: formatting; lint/style; compiler/type checking; static bug analysis; automated tests; dependency/vulnerability/secret/package checks; and clean build/packaging validation. The security gate validates lockfile installation, runs `npm audit`, and scans repository inputs for common credential formats. There are no runtime dependencies and no separate license-policy analyzer in this slice; adding one would duplicate package metadata checks without a policy to enforce.

In an interactive terminal, full verification starts an observational dashboard on `127.0.0.1` using an operating-system-assigned free port, prints `TEST_DASHBOARD_URL`, and attempts to open it. Each concurrent run receives its own port and in-memory state. The dashboard shows the active gate, available test progress, elapsed time, recent output, failures, and final result.

At completion, the verifier briefly waits for the open dashboard to fetch the final state. This observation wait is bounded, so a closed or failed browser cannot hang verification.

- Set `VERIFY_DASHBOARD=0` to opt out.
- Set `VERIFY_DASHBOARD=1` to force it in a non-interactive terminal.
- CI disables the dashboard and runs the same ordered gates headlessly.
- Dashboard server, reporter, or browser-launch failures are reported in the terminal and cannot change gate order, gate outcomes, or the final exit status.

Focused tests can be run with `npm.cmd test -- --test-name-pattern "pattern"`; they do not start the dashboard.

## Manual checks for this slice

After `npm.cmd run build`:

1. Run `npm.cmd start -- --seed 0`. Expect the seed and algorithm, title, objective, fighter at 20/20 HP, playing session state, entrance description, and `help` hint.
2. Enter `help` and `inventory`. Expect copyable command examples, the combat and entrance-exit restrictions, an equipped longsword, and no collectibles.
3. Enter `inspect ruined archway`, `open wooden door`, and `move guardroom`. Expect the inspected crest, the door to open, the guardroom description, fighter initiative 7 against goblin initiative 3, and the fighter's turn. Initiative and attack output label the die roll, modifier, total, AC, damage, remaining HP, and turn separately from narration.
4. During combat, enter `move reliquary`, `attack`, `status`, and `dance`. Expect each mutation or malformed command to be rejected, status to remain readable, and no attack to occur. Enter `attack goblin` twice. With seed `0`, expect both combatants to miss in the first round, followed by 8 damage that reduces the goblin from 7 HP to 0 without retaliation.
5. Enter `move reliquary`. Expect the room description and the signet on the stone pedestal. Enter `inspect signet` and `leave`. Expect the signet description, an explanation that the signet is required, and a usable prompt. Then enter `take signet`, `look`, and `inventory`. Expect one successful pickup, no signet among the room's visible items, and the signet under collectibles while the longsword remains equipped.
6. Enter `move guardroom`, then `move reliquary`. Expect the defeated goblin not to respawn and combat not to restart. Enter `leave`; expect one explicit adventure victory ending and instructions to inspect the final state, quit, and start a fresh run.
7. After victory, enter `move guardroom`, `look`, `status`, `inventory`, and `help`. Expect movement to be rejected without changing the final state, while read-only commands show the Reliquary, `victory`, and the carried signet. Enter `quit`; expect a clean exit that preserves the victory state.
8. Run `npm.cmd start -- --seed 207` and enter the guardroom. Expect fighter initiative 4 against goblin initiative 21, then one automatic goblin opening attack before the fighter's turn. Enter `attack goblin` three times. Expect deterministic mechanical output and immediate defeat at 0/20 HP. Expect `look`, `status`, `inventory`, and `help` to remain available, gameplay mutations to be rejected, and instructions to quit and start fresh.
9. Run `node dist/cli.js --seed -1`. Expect an error and a nonzero exit. Pipe empty input to `node dist/cli.js`; expect exactly one generated seed, the objective and starting scene, exit code 0, and neither victory nor defeat.

### Usability pass observations

An unseeded interactive run on 11 September 2026 generated seed `863562226` and reached victory with 13/20 fighter HP. The `> ` prompt remained available after help, rejected movement, every nonterminal combat turn, missing-objective feedback, pickup, and victory. The run did not justify encounter tuning: the random fight was survivable, while seeds `0` and `207` retain short deterministic victory and defeat coverage.

The pass found four presentation problems and they were corrected in this slice: initial HP required guessing the `status` command; help placeholders were not directly copyable; help omitted the no-retreat and no-entrance-exit rules; and dense combat lines plus inconsistent ending guidance made mechanics and next steps harder to scan. Startup now includes authoritative status, help and missing-argument feedback provide concrete commands, combat facts use separate labeled lines, and both endings explain final-state inspection, `quit`, and `npm start` for a fresh run.

Retreat from active combat, death saves, tactical movement, surprise, additional combatants, spells, healing, rests, weight, consumables, equipment switching, AI integration, an external adventure loader, save/resume, in-game restart, deployment, and an installer are intentionally out of scope for issue #10.
