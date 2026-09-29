# Independent player continuity review for issue #71

This sheet is for a player who has not implemented the adventure. Use Node
24.x and npm 11.6.4. From a clean checkout, run `npm.cmd ci` and
`npm.cmd run build`. Play in command mode; no API key is needed. Keep the
save in a private local folder.

```powershell
New-Item -ItemType Directory -Force .scratch/issue-71-player | Out-Null
node dist/cli.js --adventure-file .\adventures\consequence-journey.json --seed 0 --save .\.scratch\issue-71-player\save.json
```

Use `look`, `help`, and offered actions to try to deliver the route register.
Speak to the guard, help Neri if you wish, inspect the raider threat, and
leave the cellar. After at least one accepted action, wait for the next `>`
prompt and press Ctrl+C. Resume with:

```powershell
node dist/cli.js --resume .\.scratch\issue-71-player\save.json
```

Continue to an ending. Then record, in your own words:

1. What changed while you were away? What on screen told you why?
2. Who knew about Neri's fate before and after you spoke at the hall?
3. Where was the tonic and what happened to the scout when you returned?
4. Could you tell whether the route was delivered before or after the raiders closed the passage?
5. Which command or response was confusing, and what wording would have helped?

Include the date, game commit, whether the route was on time, and whether
this was your first play. Do not include your save or trace in public feedback:
they contain the full adventure, including hidden facts. The project owner's
reported unfamiliar-player pass is recorded in
[`issue-71.md`](issue-71.md); no individual answers were supplied.
