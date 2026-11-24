# Playing The Well of the Hollow Moon

The well is a 32-room expedition for one level-5 character. Each floor has its own rest site and way out. Taking the silver moon completes the objective when you leave by any exit. Returning with lesser finds lets you keep them.

From the repository root in PowerShell 7, use this command to prepare and launch a fresh level-5 Fighter at seed 24. Use Node.js 24 and npm 11 as specified in the README. Set `OPENAI_API_KEY` for narrated gameplay. The actions below also work with the browser buttons alone.

```powershell
$wellLibrary = Join-Path ".scratch/hollow-moon-$([guid]::NewGuid())" 'characters.json'; New-Item -ItemType Directory -Path (Split-Path $wellLibrary) | Out-Null; Copy-Item tests/fixtures/libraries/level-5-ada.json $wellLibrary; npm.cmd ci && npm.cmd run build && npm.cmd run browser -- --seed 24 --characters $wellLibrary
```

Select **Ada** and **The Well of the Hollow Moon**. At the Well Mouth, drop a pebble and watch what happens to the silver crescent.

- **A short expedition.** From Echo Lip, visit Gnawed Tithe Box. Defeat the rats, examine the chewed drawer, take the rat purse and return to the Well Mouth. Leaving there gives **The well keeps its moon** and banks 8 cp and 2 sp.
- **Explore the upper works.** Visit Split Basin. Take the horn scoop and use it on the model basin to open the slab to Lip Stair. Take the detour by Tilted Gauge and read the water marks. They help with a trap on the bottom floor.
- **Choose a route through the siphons.** From Drip Landing, go to White Seam. Wind the lure before visiting Silk Curtain for a clear passage to Chalk Shelf, Siphon Bell and Sluice Stair. For the filter route, go from White Seam through Blind Spout to Spider Loom. A giant spider guards two finds there. Sluice Stair is on the far side.
- **Scout the packs.** From Sluice Foot, compare the tracks at the ford with the dry path over Rib Bridge. High Rib leads to Daylight Fissure or Wind Pocket, and both lead to Chain Stair. The ford and Winter Den hold the richer caches on this floor.
- **Recover the moon.** Descend to Chain Foot. Examine the float cradle in Stillwater Cell and take the brass pilot float. Return through Chain Foot to Moon Dial and use the float on the pilot cup. The inspection hatch stays open. Alternatively, examine the worn pivot and attempt to release it by hand. A failed check still leaves the float available. The wide arch through the owlbear's nest is the dangerous route to the same prize.
- **Get back out.** Follow Balance Tube to Moon Cup. Lift the float from the stone cup. The lifting fork exposes a coral and a tourmaline under the moon. Take the moon and any gems you want to keep. Retrace the tube to Moon Dial, then take Blind Overflow and leave. The ending is **A moon in daylight**. The trophy and gems you took remain on Ada's sheet.
- **The guarded approach.** In a separate fresh run at seed 9, Ada can take the quiet upper route described above and go straight from Moon Dial into Nest of White Feathers. Winning that fight lets her examine the reed bed, take the gold star chart and enter Moon Cup through the dry arch. She can leave by the cleared nest and Blind Overflow with both trophies.
- **Resume later.** Wait for the reply to finish and input to become available. Press Ctrl+C and rerun `npm.cmd run browser -- --seed 24 --characters $wellLibrary` in the same shell. Choose Ada's current adventure to continue from the saved room.
