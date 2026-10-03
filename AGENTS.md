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

## Player testing handoff

Players use the browser in its default character-library mode; the command-line app is a testing and regression adapter, and `--legacy` keeps the single save slot for released Hollow Beacon v4–v11 saves. For changed player-facing behavior, give a copyable PowerShell `npm.cmd run browser` command with a concrete seed and an explicit `--characters` library path, such as `npm.cmd run browser -- --seed 0 --characters .\.scratch\<name>\characters.json`. List the browser actions (character creation or selection, adventure start, clicks and typed messages) separately, with the expected response at each meaningful branch. Include prerequisites (`OPENAI_API_KEY` for gameplay) and restart steps when needed. To show continuation, wait for a complete reply and enabled input, press Ctrl+C, then rerun the exact same command; the browser has no `--resume` flag. Starting over is **Abandon adventure**, **Rest between adventures**, then a new start. Give CLI or `--legacy` commands only when the change is to those adapters.
