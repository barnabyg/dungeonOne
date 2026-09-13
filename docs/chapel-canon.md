# The Bell Beneath the Chapel: authoring boundary

This table is the content authority for later chapel tickets. Runtime projections expose only facts whose reveal condition has been met. Ticket #25 exposes the missing-person notice and public route; it does not yet implement conversations or substantive discoveries.

| Canon | Source | Reveal condition | Durable fallback |
| --- | --- | --- | --- |
| Tavi, an apprentice, is missing and the ruined chapel is the public search lead. | Mara and the inn noticeboard | Public at startup | The notice remains available if Mara cannot speak. |
| Unsafe chapel repairs were left unfinished. | Physical repair evidence | Search the ruined chapel in a later discovery ticket | Physical evidence does not depend on an NPC. |
| Oren diverted chapel repair money to buy medicine. | Oren's account and the ledger | An authored social success or discovery of the ledger in later tickets | The ledger establishes both diversion and motive if Oren cannot speak. |
| Tavi followed the ledger into the crypt and was trapped behind its guardian. | Tavi's testimony and crypt evidence | Defeat the guardian and establish Tavi's fate in later tickets | Crypt evidence establishes the fate if Tavi cannot speak. |

| NPC | Knows or believes | Wants | Allowed reveal boundary | Fallback |
| --- | --- | --- | --- | --- |
| Mara, innkeeper | Knows Tavi disappeared; believes Tavi may have gone toward the ferry. | Find Tavi. | The disappearance and her attributed ferry belief; never Oren's motive. | Inn notice gives the chapel lead. |
| Oren, ferryman | Knows the diversion, medicine motive, unsafe repairs, and chapel route; does not know Tavi's condition. | Protect the medicine recipients and avoid exposure. | Public route freely; guarded account only after its authored condition. | Chapel evidence and ledger bypass cooperation. |
| Tavi, apprentice | Knows what happened while following the ledger into the crypt. | Escape the crypt and report what they found. | Crypt experience after access; never unrelated village conversations. | Crypt evidence records Tavi's fate. |
| A skeleton guardian blocks access beyond the crypt entrance. | Direct observation | Enter the crypt after the guardian ticket is implemented. | This exploration slice states the boundary and offers no fight, ledger, rescue, or completion action. |
| One healing potion can be found before the guardian encounter. | Direct observation | Search the chapel path after the item ticket is implemented. | Guardian balance cannot depend on finding or using it. |
| The player may expose the diversion publicly or refer it confidentially for restitution. | Ledger evidence and Tavi's established fate | Discover the ledger, establish Tavi's fate, and return to the inn in later tickets. | The noticeboard offers both endings even if an NPC cannot speak. Each ending must describe Tavi's actual fate and never give a dead NPC dialogue. |
