# Issue 38 — Default chapel and clean-checkout handoff

The Bell Beneath the Chapel is now the no-selector startup adventure in command
and AI modes. The Stolen Signet remains available with
`--adventure stolen-signet`, and replay continues to select a runtime only from
the trace's version tuple rather than from the startup default.

## Runtime and package prerequisites

The supported runtime contract is Node.js 24.x (`>=24.0.0 <25` in
`package.json`); `.nvmrc` records the preferred 24.21.0 release. npm 11.6.4 is
locked by `packageManager`, and all production/development dependencies are
locked by `package-lock.json`.

The final verification host used:

- Node.js 24.13.0, within the supported Node.js 24.x range;
- npm 11.6.4; and
- Windows PowerShell on 20 September 2026.

## Reproducible journeys

The copyable commands are documented in the README. Their tracked inputs are:

- `chapel-public-social-fallback.txt`, seed 7: a failed intimidation check,
  evidence-based continuation, Tavi's rescue, and public disclosure;
- `chapel-confidential.txt`, seed 0: both physical discoveries, Tavi's rescue,
  and confidential trustee referral;
- `chapel-potion-defeat.txt`, seed 15: potion collection and use followed by a
  lethal guardian critical hit;
- `chapel-oren-casualty.txt`, seed 0: Oren's death followed by a confidential
  casualty-aware ending with no personal restitution promise; and
- `chapel-ai-failure-after.txt` plus its scripted provider file: a committed
  discovery followed by provider exhaustion, local journal/status/inventory/help
  recovery, quit, and model-free replay.

`tests/issue-38.test.mjs` runs every journey through the built CLI, checks its
authoritative outcome, and replays every exported format-3 trace without a
model. The public and confidential journeys intentionally omit an adventure
selector, so the same checks cover the new command-mode default. The existing
CLI regressions continue to compare explicit Signet runs against the historical
format-1/2 fixtures byte-for-byte (apart from the already-versioned prompt
compatibility adjustment), replay original tuples without adventure IDs, and
reject unsupported or tampered formats, versions, actions, rolls, state, local
reads, and endings.

## Verification evidence

On 20 September 2026, `npm.cmd run verify` passed all seven canonical gates in
order with zero warnings. The automated suite reported 280 passing tests, zero
failures, and zero skipped tests. Dependency installation/audit reported zero
vulnerabilities, and clean build/package validation reported 62 packaged files
and 154471 bytes.

The committed revision was then checked from a separate clean Git worktree.
`npm.cmd ci`, `npm.cmd run verify`, `npm.cmd run build`, default chapel startup,
explicit Signet startup, and model-free replay of a freshly exported chapel
trace all completed using tracked inputs. No generated adventure content or
private trace was needed to install or play either adventure.

## Live and human gates

A one-turn live no-selector smoke check used the configured default
`gpt-5.6-luna`, seed 0, and `chapel-human-dm-v12`. It opened The Bell Beneath
the Chapel at the Village Inn, handled “Look around.” through the production
provider, quit locally, exported an ignored private trace, and replayed it
without a model. Credentials and the trace are not part of this evidence.

The combined acceptance gate also relies on the prior increment evidence:

- mechanics, deterministic routes, failure recovery, and compatibility are
  covered by the canonical suite and issues 34–35;
- bounded live semantic qualification is recorded in issue 36; and
- two unfamiliar players completed the two resolution routes in issue 37.

Issue 37 retains its operator-approved waiver: wall-clock duration and separate
subjective questionnaire answers were not captured. This handoff does not
reinterpret those missing fields as passing evidence.

## Manual checks and expected results

1. After `npm.cmd ci` and `npm.cmd run build`, run
   `npm.cmd start -- --seed 0`, enter `help`, then `quit`. Expect the chapel
   title, Find Tavi quest, Village Inn, chapel commands, and a clean exit.
2. Run `npm.cmd start -- --adventure stolen-signet --seed 0`, enter `help`,
   then `quit`. Expect The Stolen Signet entrance and its regression command
   set.
3. Run each README handoff command. Expect public and confidential victories,
   the seed-15 potion/defeat sequence, Oren named as a casualty without a
   personal promise, provider-independent local controls, and
   `Trace verified successfully` for every replay.
4. Run `npm.cmd start -- --help`. Expect model, seed, adventure, trace, and
   replay syntax plus `Default adventure: chapel`.

## Material limitations

- Live AI requires network access, an API key, and provider availability; exact
  local controls remain available after provider failure.
- Traces are deterministic diagnostics, not saves. They contain raw player
  text and spoilers, so private traces should not be published without review.
- Scripted journeys prove authority, compatibility, and replay, not live-model
  quality or human enjoyment.
- External adventure loading, save/resume, broad improvisation, group combat,
  and additional rule systems remain deferred.
- No publication was requested. Normal-clone availability must not be claimed
  until a later authorized push places this commit on the remote default branch.
