## Agent skills

- **Issue tracker:** GitHub Issues. See `docs/agents/issue-tracker.md`.
- **Triage labels:** the five default canonical labels. See `docs/agents/triage-labels.md`.
- **Domain docs:** single-context layout. See `docs/agents/domain.md`.

## Git workflow

Deliver every change through a pull request into `main`. Branch from an up-to-date `main`, push the branch and open the PR with `gh pr create`. `main` is protected, and the **verify** CI check must pass before a PR merges. Run `npm.cmd run verify` before opening the PR, and merge only when the owner asks.

Use one branch per PR, and no extra branches or worktrees for verification; CI does that. After the merge, tidy the local checkout (`-D` because squash merges hide the merge from Git):

```powershell
git switch main; git pull --ff-only; git fetch --prune
git branch -D <merged-branch>
```

Remove any worktree you created with `git worktree remove <path>`.

## Choosing tests

`npm.cmd test` runs every test, as verify and CI do. While you work, run the tests your change can break. The tiers (`scripts/test-tiers.mjs`):

- `quick`: engine, rules, harness, server and script tests on fixture modules; no browser, no shipped content.
- `browser`: tests that drive a browser or start the real launcher.
- `content`: tests of the shipped modules in `adventures/5e/`, including the balance gate.

Pick by what you changed:

- **Anything, while you edit:** `npm.cmd test -- tests/x.test.mjs`, optionally with `--test-name-pattern "<pattern>"`.
- **Rules, engine, harness or server code:** `npm.cmd test -- --tier quick`. Add `--tier content` when the change can move the balance gate's numbers.
- **The browser page or launcher:** `npm.cmd test -- --tier quick,browser`.
- **One shipped module:** `npm.cmd test -- --modules <id>`. If the recorded verdicts test fails, run `npm.cmd run gate:verdicts` and commit the file.
- **Not sure:** `npm.cmd test -- --changed` runs the tiers that cover the changes since `origin/main`, or everything for a change it can't place.

Before a commit, run at least the tiers that cover it; before a push, `npm.cmd run verify`.

## 5e and file formats

The game uses the 2024 5e rules in SRD 5.2 under [ADR 0005](docs/adr/0005-start-afresh-on-5e-and-suspend-compatibility.md); [`docs/rules/README.md`](docs/rules/README.md) indexes the rules. Use only SRD 5.2 names, rules and stat blocks.

Shared infrastructure (DM turn loop, model adapters, randomness, file locking, launcher) takes a runtime (`src/runtime-contract.ts`) as an argument and must not import the 5e game; the `SHARED_MODULES` lint rule enforces this.

Formats are throwaway until the owner declares a stable release in a new ADR. The character library, save, trace, adventure module and layout sketch files each carry one format version. When you change a format, bump its version and make the loader refuse older files with a message that names the file and tells the player to move it aside. Never delete, migrate or reinterpret an older file, and add no compatibility shims, migrations, fallbacks or per-increment rules versions. This overrides any general instruction to keep released formats readable.

## Designing a module

Read [`docs/module-authoring.md`](docs/module-authoring.md) first, propose every layout as a sketch file, and check it with `npm.cmd run map -- <module-id | path>`.

## Player testing handoff

Players use the browser; the CLI (`npm.cmd run cli`) is a test adapter, so give CLI commands only for CLI changes. For changed player-facing behaviour, give a copyable PowerShell command with a concrete seed and a fresh library path no earlier build has written to, such as `npm.cmd run browser -- --seed 0 --characters .\.scratch\<name>\characters.json`. List the browser actions separately, with the expected response at each meaningful branch, and the prerequisites (`OPENAI_API_KEY` for gameplay). To show continuation: wait for a complete reply and enabled input, press Ctrl+C, and rerun the same command; there is no `--resume` flag.
