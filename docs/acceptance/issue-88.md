# Issue 88: recover and bypass the second threat

Hollow Beacon v8 adds Ridge Shelter between either road and the tower. A visible
route board explains two independent onward routes: Tower Approach starts a
sentry fight immediately for 0 days; Drainage Walk avoids the sentry for 1 day,
without requiring a clue, item, ally or check. Both reach Beacon Tower and the
Tower Runner's provisional signal instructions. The detour from the ridge's
Day 2 crosses the caravan's Day 3 deadline. This is a time/HP tradeoff, not a
hidden prerequisite. Searching the board records the same public lead in Journal;
the search is optional.

The visible dressing station at Ridge Shelter holds one camp dressing per
session. Outside combat while injured, **Recover (one dressing)** restores
exactly `min(8, missing HP)` HP for 0 days, consuming the dressing without dice
or a carried item. Full HP rejects treatment and preserves it. The engine saves
the spent resource as a quest milestone; resume, paraphrases and provider retries
cannot restore it. Scene, result card, Character, Inventory, Journal and public
hints expose the offer or the consumed resource as appropriate.

At 0 HP the session ends in defeat and browser Review mode. There is no retreat
or surrender once either fight starts. Both policies and the safe alternative
are declared before entering the sentry's location. Combat actions still cost
one action and 0 days, with at most one enemy response.

The new tuple is content 8, schema 13, rules `chapel-clues-rules-v14`, engine
`chapel-clues-engine-v18`, prompt `chapel-clues-dm-v21`, tools
`chapel-clues-tools-v18`. New slots and confirmed New game use v8. Released
v4-v7 content/digests, saved histories and earlier CLI adventures are preserved.
The final keeper/caravan resolution remains outside this ticket; reaching the
tower supplies a playable next act, not a rescue claim.

## Browser player checks

Prerequisites: Node 24.x, `npm.cmd ci`, a desktop browser, and a valid
`OPENAI_API_KEY` in the launch environment. Start from `C:\docs\git\dungeonOne`
with an empty disposable slot:

```powershell
npm.cmd run build
npm.cmd run browser -- --seed 9 --save .\.scratch\issue-88-fight\slot.json
```

Open the printed loopback URL, select **Start adventure**, and wait for each
complete reply and enabled composer. Type these separately:

```text
Travel to Ridge Trail
Brace fallen cart
Attack ridge raider
Attack ridge raider
Attack ridge raider
Travel to Ridge Shelter
Search tower route board
```

Expect victory over the first raider at 3/20 HP on Day 2, followed by a visible
dressing station and two onward exits. The board's Journal entry gives the
same onward lead and cost as the scene. Select **camp dressing station**, read
the prerequisites, one-use limit, exact HP effect and 0-day cost, then select
**Recover (one dressing)**. Expect 11/20 HP, unchanged Day 2 and inventory,
one consumed dressing, and disappearance of the recovery offer. Character,
Inventory and Journal show the consumed dressing. Type `Rest at camp dressing
station`: expect no additional recovery or commitment.

Continue the fight route, typing these separately:

```text
Travel to Tower Approach
Attack tower sentry
Attack tower sentry
Travel to Beacon Tower
```

The approach begins combat immediately; travel, recovery, retreat and surrender
are unavailable. Expect sentry victory and tower arrival at 6/20 HP, Day 2.
Select the Tower Runner to see provisional instruction subjects. These keep
the investigation open and do not assert a keeper or caravan rescue.

For avoidance, start a separate empty slot:

```powershell
npm.cmd run browser -- --seed 9 --save .\.scratch\issue-88-avoid\slot.json
```

Repeat the first fight, shelter and recovery, then type separately:

```text
Travel to Drainage Walk
Travel to Beacon Tower
```

Expect no second combat, no extra dice or required clue, 11/20 HP and Day 3.
The missed-deadline flag changes the public clock stage; the tower and its
runner remain reachable. The sentry remains alive on the unused approach.

At each checkpoint—after the first fight, after recovery, or immediately after
entering Tower Approach—stop the launcher with Ctrl+C after the complete reply.
Relaunch with the **same** browser command and save path. Open the new printed
URL: HP, dressing use, day, enemy HP/turn and exact conversation return without
another provider call or enemy attack. Browser continuation has no `--resume`
flag. Keep another tab open before recovery or a sentry attack; its old click
must show a stale-position rejection and refresh without repeating the action.

For first-fight defeat, use seed 3 in a new slot and repeat ridge/brace/attacks.
Expect 0 HP and saved Review mode; restarting preserves defeat. A lost reply
or narration failure after commitment preserves the result card and onward
exits. Read current state before trying another action.

## CLI regression adapter

Command mode needs no provider configuration:

```powershell
npm.cmd start -- --adventure-file .\adventures\hollow-beacon-recovery.json --seed 9 --save .\.scratch\issue-88-cli.json
```

Type these separately inside the game:

```text
move ridge-trail
brace cart
attack raider
attack raider
attack raider
move ridge-shelter
recover station
move tower-approach
attack sentry
attack sentry
move beacon-tower
```

Expected HP/day outcomes match the browser route above. For avoidance, replace
the approach and two sentry attacks with `move drainage-walk`. To resume at any
checkpoint, wait for the next `>` prompt, then press Ctrl+C; `quit` closes the
session. Resume exactly:

```powershell
npm.cmd start -- --resume .\.scratch\issue-88-cli.json
```

## Automated evidence

The [recorded seeds](issue-88-seeds.json) retain exact commands and four
checkpoints for fight and avoidance on seeds 0, 5, 8, 9 and 10. All ten reach
the tower alive without searching for a required clue. Fight-route final HP
is respectively 20, 17, 14, 6 and 10; avoidance keeps recovered HP 20, 20, 19,
11 and 10. First-fight defeat on seed 3 and optional-fight defeat at 0 HP are
also tested; these samples do not promise survival for every seed or strategy.

`tests/issue-88.test.mjs` exercises public command/runtime tools, scripted AI,
save storage and trace replay at the first-fight, optional-encounter and recovery
checkpoints. Real Edge/Playwright page, HTTP and storage journeys cover both
routes, clicked/typed recovery, strict intent/argument validation, full-HP and
clamped healing, duplicate/stale recovery and attack, narration failure, lost
HTTP reply, process kill after an enemy response and automatic continuation.
The canonical suite also retains all v4 browser baseline, reset, review, hints
and earlier save/replay checks. Tests use isolated temporary slots and port 0.

The canonical command is `npm.cmd run verify`; verification and independent
Standards/Spec review results are recorded at implementation handoff. Live
provider paraphrase quality, unfamiliar-player acceptance and the unfinished
adventure finale are untested or out of scope. Browser tests use an offline
deterministic provider and spend no live API credits.
