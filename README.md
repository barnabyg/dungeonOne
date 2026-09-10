# Dungeon One

Dungeon One is an offline, text-first TypeScript game. The current slice of **The Stolen Signet** lets you explore the entrance, guardroom, and reliquary through explicit terminal commands. Passages are open and the goblin encounter is not yet active.

## Requirements

- Node.js 24.21.0 LTS (pinned in `.nvmrc`; supported runtime line: Node.js 24.x)
- npm 11.6.4 (pinned by `packageManager`)

All development tools are exact-version dependencies in `package.json` and `package-lock.json`. Installation and dependency auditing require registry access. Building and playing after installation do not require a network connection, AI credentials, or any external service.

## Install, build, and play

From a clean checkout:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

On macOS or Linux, use `npm` in place of `npm.cmd`. The game displays the entrance scene and a help hint. Enter `help` to list commands, `quit` to leave cleanly, or send EOF (`Ctrl+Z` then Enter on Windows; `Ctrl+D` on macOS/Linux) to close input cleanly.

## Supported commands

Commands and their arguments are case-insensitive. Commands must use the canonical forms below; fuzzy or natural-language input is not supported.

| Command            | Result                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| `help`             | List supported commands.                                                         |
| `look`             | Describe the current room, visible features, and named exits.                    |
| `inspect <target>` | Inspect a visible feature or named exit, such as `inspect ruined archway`.       |
| `move <location>`  | Walk through an open passage to a named adjacent room, such as `move guardroom`. |
| `status`           | Show the fighter's current and maximum HP and session status.                    |
| `inventory`        | Show the fixed longsword equipment separately from collected items.              |
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

1. Run `npm.cmd start`. Expect the title, entrance description, visible ruined archway, guardroom exit, and `help` hint.
2. Enter `status` and `inventory`. Expect a fighter at 20/20 HP, an equipped longsword, and no collectibles.
3. Enter `inspect ruined archway`, `move guardroom`, and `move reliquary`. Expect the inspected crest, then descriptions and named exits for both entered rooms.
4. Enter `move guardroom` and `move entrance`. Expect backtracking through both open passages.
5. Try `inspect`, `inspect pedestal`, `move`, `move cellar`, and `move reliquary` from the entrance. Expect actionable feedback after each and an unchanged location.
6. Enter a blank line and then `dance`. Expect useful feedback after each and another usable prompt.
7. Enter `quit`. Expect a clean exit with neither victory nor defeat.
8. Pipe empty input to `node dist/cli.js`. Expect the starting scene and exit code 0, with neither victory nor defeat.

Combat, collectible items, victory and defeat, AI integration, an external adventure loader, save/resume, deployment, and an installer are intentionally out of scope for issue #2.
