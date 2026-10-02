# Issue 91: three truthful final warnings

Hollow Beacon v11 ends the expanded investigation at the final warning board.
Control and board review are required. The three currently eligible choices and
their public stakes appear in the browser and bounded `resolve_quest` tool:

- **Verified safe signal** requires observed alignment evidence (setting plate or
  sighting frame) and the fitted component. Commitment aligns and lights the
  fitted lamp at the observed approved fork alignment; no rescue is invented.
- **Slower human warning** posts a warning for travellers and human messengers.
  It requires no component, including after failed persuasion or a late arrival.
  Dispatch costs 0 days; slower delivery remains unconfirmed and the lamp is not repaired.
- **Urgent risky signal** raises an emergency shutter warning immediately without
  verifying direction or repairing the lamp. It may attract pursuers as well as
  travellers; no rescue or safe passage is guaranteed.

All commitments cost 0 days and no dice. Before Day 3 issuance is on time;
Day 3 or later records the missed caravan turn and cannot undo it. Keeper,
caravan and refugee survival remains unconfirmed without corresponding events.
Recorded camp help/refusal, watch caution, provisional hold/light/refusal/departure,
alignment evidence, peaceful control and actual casualties survive in the final
record. Only a recorded ridge victory claims that raider's defeat; other raiders
remain unresolved. A dead runner does not deliver a message: the player issues it.
Completion means the warning choice was made, not that every person was saved.

## Browser player checks

Prerequisites: Node 24.x, `npm.cmd ci`, installed desktop browser, and a valid
`OPENAI_API_KEY` in the launch environment. Use a new disposable slot:

```powershell
npm.cmd run build
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-91-player\slot.json
```

Open the printed loopback URL, select **Start adventure**, then type separately,
waiting for each complete reply:

```text
Travel to Watch Loft
Travel to Signal Records Room
Search beacon setting plate
Take spare signal component
Travel to Watch Loft
Travel to Watch Yard
Travel to Valley Road
Travel to Ridge Shelter
Travel to Drainage Walk
Travel to Beacon Tower
```

Expect Day 5, 20/20 HP, two bypassed living enemies, Vey and the work order.
Select the work order and **Search**, then Vey and **Present the work order and
setting plate**. Expect control without a fight. Select the component/socket and
**Fit signal component**; expect one consumed component, unchanged HP/day and no rescue.
Select final warning board and **Search**. **Ending choices** now exposes all
three choices and stakes. Type “Warn them”: expect clarification without an
ending or world mutation. Explicitly type “Resolve Verified safe signal” or
click **Verified safe signal**. Expect a late final record and **Review mode**.

Composer and further AI questions are disabled. Inspect Journal, Character,
Inventory, final scene, Day 5 and 20/20 HP; history and result cards remain readable.
Hints explains that further AI interaction is closed. Stop with Ctrl+C after the
reply, rerun the same browser command and open its new URL: Review and history
return. **New game**, **Cancel** preserves the completed slot. **New game**,
**Confirm** replaces progress/history and both hint caches with a new v11 opening.
A second tab's old choice rejects and refreshes without changing the new game.

Repeat in another disposable slot without taking/fitting the component: safe
signal is absent; slower human warning and urgent risky signal remain eligible.
They produce different final records and neither claims lamp repair or rescue.

## CLI regression adapter and seeded routes

[Named seeded witnesses](issue-91-seeds.json) cover all choices, Day 2/Day 5,
failed Vey persuasion, unavailable component, Vey casualty and bypassed fights.
The on-time force route carries the recorded ridge and sentry defeats and Vey's
actual death. Run its commands from that file separately inside:

```powershell
npm.cmd start -- --adventure-file .\adventures\hollow-beacon-finale.json --seed 0 --save .\.scratch\issue-91-cli.json
```

Expected final state is victory/Review with a human warning, Day 2, 16/20 HP and
Vey's casualty; no completed lamp repair or rescue. For a resumable checkpoint,
wait for the next `>` prompt after an action, press Ctrl+C, then use exactly:

```powershell
npm.cmd start -- --resume .\.scratch\issue-91-cli.json
```

`quit` closes the saved session. After completion, `look`, `journal`, `inventory`
and `status` remain readable; a second resolve, attack, wait or move rejects
without state/RNG changes.

## Compatibility and evidence

New content uses content 11 / schema 16 / `chapel-clues-rules-v17` /
`chapel-clues-engine-v21`, prompt `chapel-clues-dm-v24`, tools
`chapel-clues-tools-v21`. New browser slots and confirmed New game select v11.
Released v4-v10 content, digests, saves/history and older CLI adventures retain
original semantics; completed v4 watch decisions stay completed historical saves,
not retrospective evidence of this finale. No migration occurs.

`tests/issue-91.test.mjs` verifies seeded public commands, frozen final reads and
mutations, command/scripted-AI save/resume and linked replay with exact state/RNG,
all released Hollow Beacon definitions, and real Edge page/API/storage typed and
clicked endings with lost post-commit narration, retry, restart into Review,
readable panels, Cancel/confirmed New game and stale requests. Existing browser
qualification suites retain generation/delayed-reply and hint-cache regression
coverage. Offline provider fixtures qualify engine orchestration, not live
provider wording or unfamiliar-player comprehension. No live-provider evaluation
or human playthrough is claimed.
