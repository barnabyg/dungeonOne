# Issue #11 tester handoff evidence

This record covers the agent-executable acceptance work for GitHub issue #11.
The unfamiliar-human playtest remains pending and therefore Increment 1 is not
yet declared complete.

## Clean-checkout verification

Run date: 11 September 2026  
Platform: Windows, PowerShell 7  
Runtime: Node.js 24.21.0, npm 11.6.4

The candidate was cloned to a new directory with no copied build output,
dependencies, traces, or other ignored files. The pinned tools were provided by
npm's temporary package environment because the host had no Node version
manager. These were the exact commands; the project inputs after cloning were
all tracked files:

```powershell
npx.cmd --yes --package=node@24.21.0 --package=npm@11.6.4 npm ci
npx.cmd --yes --package=node@24.21.0 --package=npm@11.6.4 npm run verify
npx.cmd --yes --package=node@24.21.0 --package=npm@11.6.4 npm run build
'' | npx.cmd --yes --package=node@24.21.0 --package=npm@11.6.4 npm start -- --seed 0
```

Outcomes:

- `npm.cmd ci` installed 98 packages from the lockfile and reported 0
  vulnerabilities.
- `npm.cmd run verify` passed all seven ordered gates with zero warnings. The
  automated test gate passed 71 tests with no failures, skips, or todos.
- `npm.cmd run build` completed successfully.
- The seeded launch exited successfully on end-of-input after printing seed
  `0`, random algorithm `mulberry32-v1`, the objective, 20/20 HP, `playing`
  status, and the Entrance scene. It reported neither victory nor defeat.

## Reproducible playthroughs and replay

The checked-in input files are executable acceptance scripts rather than save
files. From a built checkout, run:

```powershell
Get-Content .\docs\acceptance\inputs\victory.txt | npx.cmd --yes --package=node@24.21.0 --package=npm@11.6.4 npm start -- --seed 0 --trace .\winning-trace.json
npx.cmd --yes --package=node@24.21.0 --package=npm@11.6.4 npm start -- --replay .\winning-trace.json

Get-Content .\docs\acceptance\inputs\defeat.txt | npx.cmd --yes --package=node@24.21.0 --package=npm@11.6.4 npm start -- --seed 207 --trace .\defeat-trace.json
npx.cmd --yes --package=node@24.21.0 --package=npm@11.6.4 npm start -- --replay .\defeat-trace.json
```

The victory run exited zero and demonstrated: rejection at the closed
door; read-only and invalid actions during combat without an extra attack;
opening and traversing the door; fixed initiative; two-round combat; explicit
missing-signet rejection; pickup and duplicate-pickup rejection; an empty
pedestal and one carried signet; the defeated goblin visible on a return visit
without combat restarting; explicit `leave` victory; a rejected post-victory
mutation; readable final status; clean quit; and trace export.

The defeat run exited zero and demonstrated goblin-first initiative, immediate
defeat at 0/20 HP after the third fighter attack, no later turn or random draw,
a rejected post-defeat attack, readable final status, clean quit, and trace
export. Both replay commands reported `Trace verified successfully` and exited
zero.

The complete commands, simplified combat rules, trace semantics, expected
results, and fresh-run guidance are maintained in the project README.

## Human acceptance — pending

An unfamiliar human tester has not yet supplied evidence. An agent or scripted
run cannot satisfy this criterion. Before Increment 1 can be declared complete,
someone unfamiliar with the implementation must, without developer
intervention:

1. follow the README from a clean checkout and complete a winning run;
2. run or observe seed `207` and explain that defeat is terminal, final state
   remains readable, and a new process starts a fresh run; and
3. record the date, runtime/platform, whether any instructions were unclear,
   any developer intervention, the winning outcome, and their understanding of
   the losing run in this section or a linked issue comment.

## Remaining work and limits

- Obtain and record the unfamiliar-human evidence above. This is the only
  pending issue #11 acceptance item.
- If that test uncovers confusing feedback or encounter tuning, open a narrow
  follow-up issue and preserve deterministic victory and defeat coverage.
- Deployment, publishing, AI integration, external adventures, and save/resume
  remain outside Increment 1.
