## Agent skills

### Issue tracker

Issues are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

## Git workflow

Deliver every change through a pull request into `main`. Branch from an up-to-date `main`, commit there, push the branch, and open the PR with `gh pr create`. `main` is protected: GitHub rejects direct pushes and force-pushes, and the **verify** CI check must pass before a PR can merge. Run `npm.cmd run verify` locally before opening the PR, and merge only when the project owner asks.

Use one branch per PR. Do not create extra branches or worktrees for verification or publication checks; CI on the PR does that. GitHub deletes the remote branch when a PR merges. Afterwards, tidy the local checkout:

```powershell
git switch main; git pull --ff-only; git fetch --prune
git branch -D <merged-branch>
```

`-D` is needed because squash merges hide the merge from Git; it is safe once GitHub shows the PR as merged. Remove any worktree you created for the work with `git worktree remove <path>`. `git branch -vv` marks branches GitHub has deleted as `[origin/...: gone]`.

## 5e transition and file formats

The game is moving to 5e under [ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md). Use only SRD 5.2 names, rules and stat blocks. Hollow Beacon, Stonebridge, the pre-5e browser server and its single save slot, the CLI command-mode adventures, the adventure generator and every old character, character library, save and trace are removal pending (#139): don't extend them, and don't build 5e work on top of them.

Build the 5e runtime as an implementation of `src/runtime-contract.ts` and select it in the registry, `src/data-runtime.ts`. Shared infrastructure (saves, traces, replay, the DM turn loop, the browser server, the career) must not import a runtime; the `OLD_GAME_MODULES` rule in `eslint.style.config.mjs` enforces this for the pre-5e modules.

Since #137, 5e is the browser's only mode: `npm.cmd run browser` serves the 5e library (default `characters.json`) and refuses `--legacy`, `--5e`, `--save` and `--artwork`. The browser must not load or serve any part of the old game: the 5e session takes its runtime from `runtime-5e.ts` directly, and `tests/issue-137.test.mjs` checks that the launcher's static import graph holds no pre-5e module.

Formats are throwaway until the owner declares a stable release in a new ADR. The character library, save, trace and adventure module files each carry one format version. When you change a format, bump its version and make the loader refuse older files with a message that names the file and tells the player to move it aside. Never delete, migrate or reinterpret an older file, and do not add compatibility shims, migrations, fallbacks or per-increment rules versions. This overrides any general instruction to keep released formats readable.

## Player testing handoff

Players use the browser; the command-line app is a testing and regression adapter. For changed player-facing behavior, give a copyable PowerShell `npm.cmd run browser` command with a concrete seed and an explicit `--characters` library path, such as `npm.cmd run browser -- --seed 0 --characters .\.scratch\<name>\characters.json`. Use a fresh library path that no earlier build has written to. List the browser actions (character creation or selection, adventure start, clicks and typed messages) separately, with the expected response at each meaningful branch. Include prerequisites (`OPENAI_API_KEY` for gameplay) and restart steps when needed. To show continuation, wait for a complete reply and enabled input, press Ctrl+C, then rerun the exact same command; the browser has no `--resume` flag. Give CLI commands only when the change is to the CLI adapter. The 5e CLI adapter is `npm.cmd run cli` (`src/cli-5e.ts`); `npm.cmd start` is the pre-5e one until #139.
