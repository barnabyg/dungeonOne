# Issue 87: survive the road threat

Hollow Beacon v7 adds the first threat to the shorter Ridge Trail. A raider
demands supplies; the slower Valley Road avoids the fight. The visible fallen
cart offers one rules-owned choice: **Brace cover (1 action)**. It spends your
action without a player attack or brace check, grants +4 AC against exactly one
enemy attack, then collapses. Natural 20 still hits. Each attack, healing or
brace action in combat spends one action and zero days. The enemy responds
once before the Fighter's turn returns, unless someone is defeated.

The tuple is content 7, schema 12, rules `chapel-clues-rules-v13`, engine
`chapel-clues-engine-v17`, prompt `chapel-clues-dm-v20`, tools
`chapel-clues-tools-v17`. Released Hollow Beacon v4-v6 files and digests are
unchanged. Existing browser slots continue automatically under their own tuple.
New game uses v7. Earlier CLI attacks, healing, saves and traces retain their
rules. The final expanded adventure ending remains outside this ticket.

## Browser player checks

Prerequisites: Node 24.x, dependencies installed with `npm.cmd ci`, a desktop
browser, and a valid `OPENAI_API_KEY` in the launch environment. For a fresh
seeded slot, from `C:\docs\git\dungeonOne`:

```powershell
npm.cmd run build
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-87-player\slot.json
```

Open the printed `http://127.0.0.1:<available-port>` URL and select **Start
adventure**. Use an empty slot or explicitly confirm New game on a disposable
slot. Wait for each complete reply and enabled composer.

1. Select **Ridge Trail (2 days)** or type `Travel to Ridge Trail`.
   Expect Day 2, the raider demanding supplies, initiative d20s and turn order
   in the engine card. The persistent Combat field shows Fighter's turn and
   enemy HP 18/18. Exits remain visible but travel is unavailable in combat.
2. Select **fallen cart**, read the public stakes, and select **Brace cover
   (1 action)**. Alternatively type `Brace the fallen cart` in a fresh seed-0
   run. Expect one enemy attack against AC 20, no player attack or brace die,
   cover expiry, unchanged Day 2, and the Fighter's turn returned. Character
   reports cover spent with no active bonus. The brace offer disappears.
3. Type `Brace the fallen cart` again. Expect no committed action or dice.
   Type `Travel to Beacon Tower`: travel remains unavailable until combat ends.
4. Stop the launcher with Ctrl+C after the complete reply. Relaunch exactly:

```powershell
npm.cmd run browser -- --seed 0 --save .\.scratch\issue-87-player\slot.json
```

5. Open the newly printed URL. Expect automatic continuation, identical HP,
   enemy HP, spent cover and saved history; startup adds no enemy attack.
   Select **ridge raider**, then **Attack (1 action)**, or type `Attack ridge
raider`. Repeat one action per complete reply until the raider falls.
   Cards show action cost, attack d20s, damage dice/modifiers and remaining HP.
   Seed 0 with this exact route survives at 14/20 HP after four player attacks.
6. Select **discarded supply sack**, then **Search**, or type `Search discarded
supply sack`. Journal records **Supplies taken from the road**, attributed
   to the sack; it explains the ambush without identifying a beacon culprit.
   Continue via the broken marker or Beacon Tower. Restart again to confirm
   the aftermath remains saved and the raider does not return.

For defeat, use a fresh directory and seed 3:

```powershell
npm.cmd run browser -- --seed 3 --save .\.scratch\issue-87-defeat\slot.json
```

Repeat the ridge, brace and attack sequence. Expect 0/20 HP, defeat and Review
mode with disabled gameplay. Restart with the same command: exact history and
defeat remain readable in Character and the persistent HP display.

Keep another tab open before a combat action. Submitting its old offer must
show a stale-position rejection and refreshed state without another turn.
If a reply is lost, read current state before retrying; the saved engine result
is authoritative. A provider narration failure after commit reports saved
progress and preserves the result card rather than repeating combat.

## CLI regression adapter

No AI configuration is needed for command mode:

```powershell
npm.cmd start -- --adventure-file .\adventures\hollow-beacon-threat.json --seed 0 --save .\.scratch\issue-87-cli.json
```

Type these separately inside the game:

```text
move ridge-trail
brace cart
attack raider
attack raider
attack raider
attack raider
search supply-sack
journal
```

To restart in combat, wait for the next `>` after `brace cart`, then Ctrl+C.
`quit` closes the session. Resume exactly:

```powershell
npm.cmd start -- --resume .\.scratch\issue-87-cli.json
```

## Automated evidence and limits

`tests/issue-87.test.mjs` uses the public runtime, command/scripted-AI CLI and
real Edge (Windows) or Playwright Chromium (other systems). It covers the
observable hit-to-miss change, natural-20 exception, once-only cover, invalid,
hidden, compound and out-of-turn requests, both seeded fight outcomes,
split-session command and AI trace replay, typed/clicked equality, saved defeat
Review mode and the aftermath clue. Real browser/HTTP/storage checks reject
stale and duplicate combat submissions, fail post-commit narration, lose an
HTTP reply, kill and relaunch a separate server process during its reply, and
compare saved state and RNG to uninterrupted command play. Persistent HP and
Character reflect the verified saved result.

The existing canonical tests retain earlier combat/healing/history contracts.
The progression analyzer reports inherited social-check limitations and the
new combat route as unsupported analysis; executable seeded route checks above
provide evidence. Provider paraphrase quality is not qualified by the offline
model. No live AI calls or unfamiliar-player acceptance are claimed.
