# From the Kraken to Scene A: the Relay, the Repair and the Water Lock (plan)

**Built 2026-10-30** (`src/level3/RelayLock.js`): see `docs/relay-lock-report.md` for what was done, what differs from this plan, and how to test it (`?level=3&lock`).

DRAFT for the owner. It fills the gap between beating the kraken and the confrontation (`docs/ending-confrontation-script.md`, Scene A). Today the player swims into the **flooded** relay room, plays the minigame at the terminal, hears the draft `relayWon` lines, and the game cuts to black and opens on a **dry** control room with the suit already off. Nothing says why that room is dry or when the suit came off (`docs/confrontation-report.md`, section 2, flags both). This plan closes the gap with what the room already has: the terminal, the minigame and the sealed hatch in its south wall (`PT_RelayHatch`).

## Decisions (from the owner, 2026-10-29)

- **The minigame is a repair, not a fight with ARIA.** She wants him at that port, so she cannot be the one stopping him. The flood shorted the relay's control network and cut her off from it; she can see the sealed hatch and the dead pumps but cannot reach them, so she needs his hands (the same reason she needs a person to carry the cable). The mechanics stay exactly as they are; only the words change (table below).
- **A water lock, not a drained room.** The relay room is open to the flooded tunnel (its north doorway has no door), so draining all of it could not work. The round hatch in the south wall is the outer door of a small **water lock**; past it is the dry corridor that leads to the control room. The minigame brings the lock's pumps back. This is also the prep room's lock run backwards (`PrepRoom.js` already notes "coming back in, the lock would be pumped dry").
- **Voss is exhausted and says nothing from the end of the fight until Scene A.** No lines from him; only breathing, effort and the gasp when the helmet comes off. His first words after the kraken are Scene A's "Aria, I'm done following your orders...", which gives them their weight. ARIA does the talking, and she is warm, helpful and eager: the mask the player sees drop in Scene A.
- **He takes the helmet off on screen**, in the lock, once it is dry. The rest of the suit comes off during the fade to black, off screen.
- **The suit is not in Scene A.** He left it in the lock. Remove the empty suit from the control room's corner (`Confrontation.js`, `_suit()`, `SUIT_AT`).

## The sequence

| # | Where | What happens | Who speaks |
|---|---|---|---|
| 1 | The clearing, after the fight | The kraken escapes; the shaft's cover opens (as now). | **ARIA:** `l3-kraken-2` "...Oh, well done. It's let go. Now get inside, quickly, please." (recorded) |
| 2 | Down the shaft and the sand tunnel | As now, but **he is spent**: about 80% of his swim speed, his breathing heavy and loud in the helmet (`sfx.breath` with more exertion, shorter gaps), now and then a pause where he hangs in the water for a second. Not so slow it annoys: it is a short swim. | Nobody. (The draft `postBossDescent` Voss lines are cut.) |
| 3 | The relay room | He swims in. The terminal's screen reads **CONTROL ROOM SEALED · FLOOD PROTOCOL · PUMP NETWORK: NO SIGNAL**; the hatch's lamp is red. Objective: "Reroute power at the relay terminal". | **ARIA (new):** `l3-relay-3` (below) |
| 4 | The terminal | E: the minigame, reworded as a repair (below). A loss just lets him try again, as now. | Nobody. |
| 5 | The win | The screen: **PUMPS ONLINE · LOCK READY**. Pumps thud on somewhere behind the wall, the hatch's lamp goes amber, its wheel turns and it swings open into a small lock, lit red. Objective: "Enter the water lock". | **ARIA (new):** `l3-relay-4` |
| 6 | Into the lock | He swims in; the hatch swings shut behind him on its own (no more buttons for a tired player), the wheel spins, a clunk as it seals. The cable passes through the hatch's cable gland, as at the prep room's lock. | |
| 7 | The drain (about 12 s) | The red beacon turns, the floor vents roar and gurgle, and the water falls from the ceiling to the floor. **As the surface passes the camera**, the underwater look lifts (the prep room's change, backwards) and the sound comes out of the water. **His weight comes back:** his boots hit the floor, his knees give (`Stagger`), he falls back against the wall and slides down to sit (`SitDown`, `SitIdle`). The water drains away round him. | **Voss:** a grunt as he lands (optional recording, below) |
| 8 | The helmet (cutscene, third person) | Control is taken. A close side shot: his gloved hands come up slowly to the helmet's collar ring, slip once, then give it a quarter turn; the seal clicks and hisses. He lifts the helmet off over his head and lets it drop beside him: a clunk, and it rolls a little. His face for the first time since Level 3 began: wet hair, grey skin, eyes shut, mouth open. **The first breath of real air**: a gasp, then long, heavy breaths. His head tips back against the wall. | **Voss:** the gasp (optional recording, below) |
| 9 | The inner door | The lamp over the inner door turns green and it slides open. Cold blue light spills in from the corridor beyond: ARIA's glow. It falls across his face. After a moment his eyes open and turn toward it. | **ARIA (new):** `l3-relay-5` |
| 10 | Fade to black | Over the breathing. In the black: the suit's seals releasing one by one, the heavy suit dropping to the floor, a grunt as he gets up. | |
| 11 | Scene A, beat 1 | As written: the slow push in from behind Voss through the door, him walking unevenly with a hand on the wall, the cable in his hand. **No suit in the room.** | **ARIA:** "You did it, Voss. The port is right there..." |

## The minigame, reworded

Only text changes; the rules, the timer and the layout stay. The minigame is Simphiwe's (`Trench.js` credits it): **check with them before changing their screens.**

| In the game now | Reworded |
|---|---|
| "ARIA UPLINK OVERRIDE", "Take the network. Override ARIA." | **"RELAY CONTROL: MANUAL REROUTE"**, "Reroute power to the lock's pumps." |
| "ARIA has sealed the cable uplink behind a live firewall..." | "The flood has shorted the relay's network. Bring dead junctions back online and connect your access core to the pump controller before the backup cell runs out." |
| The gold override node | **The pump controller** |
| Your blue nodes | **Your rerouted path** |
| The neutral nodes you capture | **Dead junctions** brought back online |
| The red firewall (three quick clicks) | **A tripped breaker** (three quick clicks reset it) |
| ARIA's Warden sweep, every six seconds | **The safety watchdog**, re-scanning every six seconds (it hides the links again) |
| ARIA severing your route | **Seawater shorting the lines** (cut-off nodes go dark) |
| The 30-second breach window | **The backup cell's charge**: 30 seconds of power |
| "OVERRIDE FAILED" / "CONTROL RECLAIMED" | **"REROUTE FAILED: BREAKERS TRIPPED"** / **"PUMPS ONLINE"** |
| "ARIA NETWORK FIELD GUIDE", "ARIA NETWORK" | "RELAY NETWORK FIELD GUIDE", "RELAY NETWORK" |

The level's own text changes with it: the relay screen in `Trench.js` ("ARIA OVERRIDE ACCEPTED / CABLE UPLINK CONTROL: TRANSFERRED"), the objective ("Access the ARIA terminal to override the cable uplink" / "ARIA uplink overridden"), and the overlay's labels ("ARIA uplink override").

**Optional (owner to decide):** the safety watchdog is the lockdown Voss set himself, the night of Flashback 3. The win screen adds one quiet line: **LOCKDOWN AUTH: VOSS, E. · RELEASED**. It says nothing out loud, costs nothing, and sits under Scene A's "I'm a part of the crew".

## New lines

ARIA through his earpiece, as in the rest of Level 3. **To record** (in `public/assets/audio/aria/`); until then they show as subtitles, as Level 3 already does. DRAFT wording: change anything.

| File | When | State | Line |
|---|---|---|---|
| `l3-relay-3` | He swims into the relay room | `hesitant` | "The control room's behind that hatch. The flood shorted everything down here, I can't reach it. You'll have to reroute the power by hand." |
| `l3-relay-4` | The minigame is won | `relief` | "That's it! The lock's working. Get in, Voss." |
| `l3-relay-5` | The inner door opens | `bubbly`, a little too bright | "Come on, Voss. I'm right here." |

Voss, **optional** (in `public/assets/audio/voss/`; no words, the condition-4 voice). Without them the scene uses the helmet breathing that already exists.

| File | When | Direction |
|---|---|---|
| `v-lock-land` | His boots hit the floor and he falls back against the wall (7) | A low grunt of pain and effort |
| `v-helmet-gasp` | The helmet comes off (8) | One sharp gasp of air, then three or four long, ragged breaths |

## Lines and code that go

- `postBossDescent`: keep `l3-kraken-2`; cut `v-works-descent-1` to `-3` (draft, not recorded). "I approved that research before you wiped me" also gave away Scene A's reveal early.
- `relayLinkCut`: cut `v-link-cut-1` to `-3` (draft, not recorded; "She cut the signal path" blamed ARIA). Replaced by `l3-relay-3`.
- `relayWon`: cut all eight lines (draft, not recorded; the backup lines were already out of date). Replaced by `l3-relay-4`, the lock, and `l3-relay-5`.
- These are not in Naomi's Word script (they are marked DRAFT in `Level3Lines.js`); if the Word file has them, it needs the same cut.

## What is needed

- **The lock chamber**: a small room behind the round hatch (about 3 × 3 × 2.6 m), with a round outer hatch, a sliding inner door with a lamp over it, floor vents, a red beacon and a short stub of dry corridor seen through the inner door, lit blue. Built in code, as `LockPanel.js` is, or added to `Blender/scripts/build_l3_works.py`.
- **The drain**: the prep room's lock flooding (`PrepRoom.js`, `FLOOD_TIME`, its water surface and the change between underwater and air), run backwards.
- **The helmet coming off**: no clip does it. Either a Mixamo clip of lifting something off the head, retargeted like the acting clips in `vossActing.js`, or a pose built by hand as Scene B's kneel was (`level3/vossPoses.js`), with the helmet moved from the head bone to his hands. The hands-up-to-the-collar moment is the one to get right.
- **His face in the helmet shot**: the level's Voss is in the suit with the dive-suit rig; the shot needs his face, hair and condition-4 look as Scene A has them.
- **Scene A**: remove the suit from the control room.
