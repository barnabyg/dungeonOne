# Playing Last Shift at Cinder Mint

## Browser playtest record

On 24 November 2026 the authored routes were played from fresh copies of the same level-5 Ada library, at seed 0 and default settings, with browser buttons and the AI DM off. Timing ran from the opening room to the ending card. The Lodge comparison followed its published bear-feeding route through to the King's Hanger. Actions include combat turns and departure. These timings measure automated input and rendering; a human two-sitting duration still needs player testing.

| Route | Distinct rooms visited | Game actions | Automated elapsed time |
| --- | ---: | ---: | ---: |
| Thornwood Lodge, feed the bear | 4 | 25 | 1.4 s |
| Cinder Mint, public hearing | 15 | 28 | 1.2 s |
| Cinder Mint, quiet barge rescue | 17 | 34 | 1.5 s |

The seed-24 acceptance scenarios also cover a server restart at the first descent, switching from evidence to the barge, leaving with loot before resolving the arrests, breaking a guarded bond seal, and firing Third Bell during an alarmed departure.

## Play it

Use a level-5 character or start with the supplied level-5 Fighter, Ada. From the repository root in PowerShell 7, the following command prepares the game and launches it with a fresh character library. Each run creates a separate playthrough. Node.js and npm requirements are in the README. Set `OPENAI_API_KEY` for the AI Dungeon Master.

```powershell
$mintLibrary = Join-Path ".scratch/cinder-mint-$([guid]::NewGuid())" 'characters.json'; New-Item -ItemType Directory -Path (Split-Path $mintLibrary) | Out-Null; Copy-Item tests/fixtures/libraries/level-5-ada.json $mintLibrary; npm.cmd ci && npm.cmd run build && npm.cmd run browser -- --seed 24 --characters $mintLibrary
```

Select Ada and **Last Shift at Cinder Mint**. Talk to Mara about the job. At the fork, the Pay Window leads to the records and the Delivery Yard leads to the barge.

- **Clear the six.** Examine the stove fender in the Paymaster's Office and take the grain invoice. Use it on the Payroll Archive's counterfoil register and take the certified order. Descend the Witness Stair, pass the Sample Lock and use the order on the Wax Press. In the Die Room, ring for a public hearing. At the Assay Chamber, listen to the six and enter the evidence. Penn records the acquittal, even if Bale has to speak for you.
- **Steal the barge.** Take the shift diagram at the Coal Scales and pass the Watch Mess. Use the winding crank on the crank socket and descend the Bullion Lift. Speak to Kit in the Stokers' Refuge. Set the Ash Lock's return selector with the diagram and take the cart crew's service key. At the Assay Chamber choose the empty-return transfer and take the docket. Use the docket on the Proof Vault's wharf release to open the cells and cast off. All six escape and their warrants remain live. If the alarm rang, use the shift diagram on the same release to signal the ferryman and pass the cordon quietly.
- **Claim the reward.** Unlock the Proof Vault with the order or the service key. Examine the foreman's drawer, take Third Bell, and draw the wharf release. Leave at the Ash Wharf. The hearing ends with **Six names restored**. The breakout ends with **The empty return**. The character keeps Third Bell with seven charges. On a fresh run, leaving the front steps immediately leaves six names in the arrest book.
- **Continue next sitting.** Wait for a complete reply and enabled input, stop the launcher with Ctrl+C and rerun `npm.cmd run browser -- --seed 24 --characters $mintLibrary` in the same shell. Select Ada's current adventure. Her leads and any choice already made survive the restart.
