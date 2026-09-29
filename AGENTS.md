## Agent skills

### Issue tracker

Issues are tracked in this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default canonical labels. See `docs/agents/triage-labels.md`.

### Domain docs

Domain documentation uses a single-context layout. See `docs/agents/domain.md`.

## Player testing handoff

For changed player-facing behavior, give a copyable PowerShell start command with a concrete adventure, seed, and save path where relevant. List the commands to type inside the game separately, with the expected response at each meaningful branch. Include prerequisites and restart steps when needed. For resumable saves, wait for the next `>` prompt after an action, press Ctrl+C, then show the exact `--resume` command; `quit` closes the saved session.
