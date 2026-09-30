# Independent player exercise for issue #80

This sheet is for a player unfamiliar with the implementation. Use Node 24.x
and npm 11.6.4. From a clean checkout, run `npm.cmd ci` and `npm.cmd run build`.
Keep the save and optional trace private: both contain hidden adventure facts.

```powershell
New-Item -ItemType Directory -Force .scratch/issue-80-player | Out-Null
node dist/cli.js --adventure-file .\adventures\bribed-crossroads.json --seed 0 --save .\.scratch\issue-80-player\save.json --trace .\.scratch\issue-80-player\first.json
```

Try the errand in your own words. Use `look` or `help` whenever you need to.
Try at least one unexpected action, such as dealing with the guard, changing
the route, or offering an item. At a `>` prompt after an accepted action,
press Ctrl+C. Restart with:

```powershell
node dist/cli.js --resume .\.scratch\issue-80-player\save.json --trace .\.scratch\issue-80-player\second.json --previous-trace .\.scratch\issue-80-player\first.json
```

Continue to any ending. Do not type `quit` before the restart; it closes the
saved session. If you played in command mode throughout, replay the two
segments with:

```powershell
node dist/cli.js --replay .\.scratch\issue-80-player\first.json .\.scratch\issue-80-player\second.json
```

Send the project owner: date, checkout commit, first-play status, every
utterance and visible response, what you expected to happen, any wrong or
confusing consequence, how you recovered, the ending, and whether replay
reported `Trace verified successfully`. A redacted transcript is enough;
do not publish the save or traces. Scripted and implementer play cannot
substitute for this exercise.
