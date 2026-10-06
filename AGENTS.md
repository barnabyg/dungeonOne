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

## 5e and file formats

The game uses the 2024 5e rules in SRD 5.2 under [ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md). Use only SRD 5.2 names, rules and stat blocks. The pre-5e game was removed in #139; git history keeps it. Don't restore any of it.

The 5e runtime (`src/runtime-5e.ts`) implements `src/runtime-contract.ts`, and the 5e session, browser server and CLI use it directly. Shared infrastructure (the DM turn loop, the model adapters, randomness, file locking and atomic writes, the browser launcher) takes a runtime as an argument and must not import the 5e game; the `SHARED_MODULES` rule in `eslint.style.config.mjs` enforces this, and its tests use the counter runtime in `tests/fixtures/counter-runtime.mjs`.

Formats are throwaway until the owner declares a stable release in a new ADR. The character library, save, trace and adventure module files each carry one format version. When you change a format, bump its version and make the loader refuse older files with a message that names the file and tells the player to move it aside. Never delete, migrate or reinterpret an older file, and do not add compatibility shims, migrations, fallbacks or per-increment rules versions. This overrides any general instruction to keep released formats readable.

## Player testing handoff

Players use the browser; the command-line app is a testing and regression adapter. For changed player-facing behavior, give a copyable PowerShell `npm.cmd run browser` command with a concrete seed and an explicit `--characters` library path, such as `npm.cmd run browser -- --seed 0 --characters .\.scratch\<name>\characters.json`. Use a fresh library path that no earlier build has written to. List the browser actions (character creation or selection, adventure start, clicks and typed messages) separately, with the expected response at each meaningful branch. Include prerequisites (`OPENAI_API_KEY` for gameplay) and restart steps when needed. To show continuation, wait for a complete reply and enabled input, press Ctrl+C, then rerun the exact same command; the browser has no `--resume` flag. Give CLI commands only when the change is to the CLI adapter. The CLI adapter is `npm.cmd run cli` (`src/cli-5e.ts`).
