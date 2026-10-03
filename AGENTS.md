## Agent skills

### Issue tracker

Issues are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

## Player testing handoff

Players use the browser in its default character-library mode; the command-line app is a testing and regression adapter, and `--legacy` keeps the single save slot for released Hollow Beacon v4–v11 saves. For changed player-facing behavior, give a copyable PowerShell `npm.cmd run browser` command with a concrete seed and an explicit `--characters` library path, such as `npm.cmd run browser -- --seed 0 --characters .\.scratch\<name>\characters.json`. List the browser actions (character creation or selection, adventure start, clicks and typed messages) separately, with the expected response at each meaningful branch. Include prerequisites (`OPENAI_API_KEY` for gameplay) and restart steps when needed. To show continuation, wait for a complete reply and enabled input, press Ctrl+C, then rerun the exact same command; the browser has no `--resume` flag. Starting over is **Abandon adventure**, **Rest between adventures**, then a new start. Give CLI or `--legacy` commands only when the change is to those adapters.
