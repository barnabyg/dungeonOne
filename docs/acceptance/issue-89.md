# Issue 89: carry and fit a signal component

Hollow Beacon content v9 uses schema 14, rules `chapel-clues-rules-v15`,
engine `chapel-clues-engine-v19`, prompt v22 and tools v19. Earlier content
files and tuples remain unchanged. The spare signal component starts once on
the setting plate in Signal Records Room. Taking transfers it to inventory;
fitting spends it permanently at the visible beacon socket outside combat.
Cost: one component, zero days, zero dice, zero HP recovered. The socket,
journal observation and light instruction eligibility update together.

The Tower Runner's existing provisional **Light the beacon** instruction now
requires the fitted socket. Hold, refusal and departure remain available without
it. These instructions continue the investigation; a rescue or complete caravan
finale is not introduced by this ticket. Browser Review mode for previously
completed adventures is preserved.

## Browser player checks

Prerequisites: Node 24.x, npm 11.6.4, installed dependencies, a desktop browser,
and `OPENAI_API_KEY` configured in the launcher environment. Use a new disposable
save path; an occupied older slot continues its original release.

```powershell
Set-Location C:\docs\git\dungeonOne
npm.cmd run build
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-89-player\slot.json
```

Open the printed loopback URL and select **Start adventure**. Each instruction
below is a separate turn; wait for the complete reply and enabled composer.

1. Click **Watch Loft (0 days)**, then **Signal Records Room (0 days)**.
   Select **spare signal component** and **Inspect**. Expect its allowed socket,
   one-component cost, zero days/dice and no healing described. Select **Take**.
   The room item disappears and the Inventory panel describes ownership/use.
2. Type `Use component at setting plate`. Expect a rejection or clarification,
   with ownership, HP and day unchanged. Taking it again cannot duplicate it.
3. Follow the messages below. This avoids both fights, costs five days and
   crosses the caravan deadline; the component costs no extra time.

```text
Travel to Watch Loft
Travel to Watch Yard
Travel to Valley Road
Travel to Ridge Shelter
Travel to Drainage Walk
Travel to Beacon Tower
```

4. Select **Tower Runner**. The Light instruction is absent before fitting;
   Hold, refusal and departure remain available. Open **Hints**: currently
   available fitting has public target, cost and consequence. Hints/panels are
   local reads without provider calls, dice or time.
5. Select **spare signal component** in the inventory interactions, or select
   **beacon socket**. Choose **Fit signal component** after reading the stakes.
   Expect the authoritative fitted-socket result, saved notice, unchanged HP
   and day, empty carried Inventory and **Signal component fitted** in Journal.
   Inspect the socket: it now contains the component. The runner now offers
   **Light the beacon**. No rescue is established.
6. Type `Fit spare signal component in beacon socket` again. Expect no second
   committed action or consumption. A second tab opened before fitting rejects
   its old fitting offer and refreshes to the committed scene.
7. Stop the launcher with Ctrl+C after a completed reply. Restart exactly:

```powershell
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-89-player\slot.json
```

Open its new printed URL. Expect exact saved history, fitted socket, empty
Inventory and eligible light instruction. Repeat with a fresh disposable slot
or confirmed **New game**, substituting the typed fitting message for step 5.
Both routes must produce the same state. A narration failure after fitting must
retain the saved authoritative result; reload before trying any further action.

## CLI regression adapter

```powershell
node .\dist\cli.js --adventure-file .\adventures\hollow-beacon-component.json --seed 0 --save .\.scratch\issue-89-cli.json
```

Type these game commands separately:

```text
move watch-loft
move signal-records
inspect component
take component
use component at setting-plate
move watch-loft
move watch-yard
move valley-road
move ridge-shelter
move drainage-walk
move beacon-tower
use component at socket
journal
inventory
```

Wrong-target use explains the failure and preserves inventory. Correct use fits
once without healing, dice or time; Journal records the socket observation.
To check continuation while carrying, stop after `take component`: wait for the
next `>` prompt and press Ctrl+C. Resume with:

```powershell
node .\dist\cli.js --resume .\.scratch\issue-89-cli.json
```

Then continue the commands above. Do not type `quit` to test continuation; it
closes the saved session.

## Verification and limits

`tests/issue-89.test.mjs` covers engine legality, strict AI intent, single
ownership/placement, hidden/missing/spent/wrong/combat/terminal rejection,
healing isolation, schema/reference validation, command/scripted AI continuation
and chained trace replay. Real Edge/Chromium tests exercise typed and contextual
click play through HTTP and saved storage, local descriptions/hints, light
eligibility, narration failure, lost reply, stale tabs/API retries and process
restart. Providers are offline fixtures; live model paraphrase quality and
unfamiliar-player acceptance are untested. Existing canonical tests cover the
general automatic continuation, atomic reset, recovery and completed Review
contracts. No push or remote delivery is claimed.
