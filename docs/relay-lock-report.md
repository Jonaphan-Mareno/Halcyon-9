# The Relay, the Repair and the Water Lock: Report

What was built from `docs/relay-lock-plan.md`, on branch `cut-scenes`, 2026-10-30. Nothing is committed.

## 1. How to play it

| Link | What it does |
|---|---|
| `?level=3&relay` | As before: starts in the relay room, the kraken beaten, the terminal ready. Now the room's south wall has the water lock's hatch in it, the terminal says the control room is sealed, and winning the reroute opens the lock. |
| `?level=3&lock` | **New.** The reroute won, the hatch open, Voss already in the lock: the scene starts at once and hands off to the confrontation. |
| `?level=3&confrontation` | Unchanged: straight into Scene A (now with no suit in the room). |

In play: after the fight, `l3-kraken-2`, the shaft and the tunnel (he is spent), the room (`l3-relay-3`), the terminal (the reroute), `l3-relay-4` and the hatch opening, into the lock, the scene, the black, Scene A. The scene ends by calling `DeckSession.startConfrontation({ veil })` with its own black, which Scene A takes away as it starts drawing, so there is one black, not two.

`node scripts/relay-lock/game.mjs <dir> [lock|relay] [seconds]` plays either link in a headless Chrome and takes screenshots at set moments of the scene (`SHOTS=` the scene times, `TRACE=1` to log its state every two seconds).

## 2. The steps

Checked in a headless Chrome (software rendering, about 20 fps when the machine is free) with `scripts/relay-lock/game.mjs`, by screenshots at set moments. **Not checked by ear**: I could not listen to the recordings or the mix.

| # | Step | Status | Notes |
|---|---|---|---|
| 1 | After the fight | Done | `l3-kraken-2` as before. |
| 2 | The spent swim down | Done, not seen in play | 80% speed, a pause every 9 to 14 s of swimming, harder breathing (`SPENT` in `Trench.js`). Tune by feel: it must read as tiredness, not lag. |
| 3 | The relay room | Done | `l3-relay-3` on entering; the screen and the red lamp on the hatch. The old painted hatch disc is gone and the new hatch sits in a real doorway. |
| 4 | The reroute | Done | Text only (section 3). A loss lets him try again, as before. |
| 5 | The win | Done | Screen, `l3-relay-4`, the pumps thud on, amber then green, the wheel turns, the hatch swings into the room; objective "Enter the water lock". |
| 6 | Into the lock | Done | Swimming a metre in starts the scene; the hatch swings shut behind him on its own and its wheel spins. The cable is hidden for the scene rather than run through the hatch (it never shows in its shots). |
| 7 | The drain | Done, with a compromise | 12 s. The water falls past his helmet and then past the camera, and the fog, the colour and the sound come out of the water there. He floats (the level's own body, treading water), turns to the camera, drops onto his boots when the water is at his waist, and **under a cut** the copy of him staggers and sits down against the wall (`Stagger`, `SitDown`, `SitIdle`). Compromise: his knees "giving" is the mild `Stagger` flinch, and the sit is the slow, deliberate `SitDown`, not a slide down the wall. |
| 8 | The helmet | Done | Hands up to the collar ring, a slip, a quarter turn, the seal's click and hiss, up over his head, out to his right, down, let go: it drops and rolls. His face (grey, tired, the wound) shows; eyes closed, mouth open in the gasp, then slow heavy breaths with his head tipped back against the wall. |
| 9 | The inner door | Done | Its lamp goes green, it slides open, the corridor's cold blue light comes in across him, `l3-relay-5`, then his eyes open and his head turns to the light. |
| 10 | The black | Done | 1.6 s fade over his breathing; in the black (4.6 s) the seals, the suit dropping, him getting up. |
| 11 | Scene A | Done | `startConfrontation({ veil })`: one black, no jump; Scene A starts with "Aria, I'm done following your orders..." and no suit in the room. |

Enter after 2 s skips the scene to a short black and the confrontation.

## 3. The minigame's text (for Simphiwe)

Only strings changed: no rules, no timer, no layout, and the `halcyon-submarine-hack-won` message is untouched.

| Where | Was | Now |
|---|---|---|
| `submarine-hack.html` title | ARIA Uplink Override | Relay Manual Reroute |
| HUD label | ARIA UPLINK OVERRIDE | RELAY CONTROL: MANUAL REROUTE |
| Timer tooltip | Take control of ARIA's uplink before the 30-second breach window closes. | Power the lock's pump controller before the backup cell's 30 seconds run out. |
| Field guide heading | ARIA NETWORK FIELD GUIDE | RELAY NETWORK FIELD GUIDE |
| Field guide: objective | ARIA has locked the uplink behind her network firewall... | the flood has shorted the relay's network. Connect the gold pump controller to your blue access core and keep it powered. |
| Field guide: expand | one click captures a neutral node beside your powered network. | one click brings a dead junction beside your powered path back online. |
| Field guide: break through | Break through: click a red firewall... clears breach progress. | Reset breakers: click a red tripped breaker... lets it trip again. |
| Field guide: sonar | ...ARIA's Warden sweep hides them again every six seconds. | ...The safety watchdog re-scans and hides them again every six seconds. |
| Tutorial kicker | ARIA NETWORK · 30 SECOND OVERRIDE | RELAY NETWORK · 30 SECONDS OF BACKUP POWER |
| Tutorial title | Take the network. Override ARIA. | Reroute power to the lock's pumps. |
| Tutorial summary | ARIA has sealed the cable uplink behind a live firewall... | The flood has shorted the relay's network. Bring dead junctions back online and connect your access core to the pump controller before the backup cell runs out. |
| Step 01 | Build an access route... across ARIA's network. | Build a path. Bring dead junctions back online... across the relay's network. |
| Step 02 | Break the firewall... resets your breach. | Reset the breakers... lets it trip again. |
| Step 03 | ...ARIA's Warden sweeps every six. | ...the safety watchdog re-scans every six. |
| Step 04 | Hold your connection. If ARIA severs your route... | Keep it connected. If seawater shorts your path... |
| Start button | BEGIN OVERRIDE | BEGIN REROUTE |
| Footnote | The timer and AI start when you do. | The timer and the shorts start when you do. |
| End screen (HTML and `ui/hud.js`) | ARIA NETWORK / OVERRIDE FAILED; won: ARIA UPLINK OVERRIDE / CONTROL RECLAIMED | RELAY NETWORK / REROUTE FAILED: BREAKERS TRIPPED; won: RELAY CONTROL: MANUAL REROUTE / PUMPS ONLINE |
| End messages (`ui/hud.js`) | The uplink override is powered. ARIA's cable relay is under your control. / ARIA's counter-intrusion cut off your access core. / The breach window closed before you could take control of the uplink. | The pump controller is powered. The water lock to the control room is cycling. / Seawater shorted the lines back to your access core. / The backup cell ran out before the pumps had power. |
| Node tooltips (`main.js`, `describeNode`) | ARIA FIREWALL · OVERRIDE NODE, OVERRIDE NODE · OFFLINE, ARIA OVERRIDE NODE, UPLINK ACCESS CORE, ARIA FIREWALL NODE, UNKNOWN ARIA SIGNAL, ARIA FIREWALL, SEVERED · OFFLINE, UNCLAIMED RELAY (and their texts) | PUMP CONTROLLER · BREAKER TRIPPED, PUMP CONTROLLER · NO POWER, PUMP CONTROLLER, RELAY ACCESS CORE, SHORTED JUNCTION, UNKNOWN SIGNAL, TRIPPED BREAKER, DEAD · OFFLINE, DEAD JUNCTION (texts to match: shorts, breakers, junctions) |

In the level (`Trench.js`): the terminal's prompt is "Reroute power at the relay terminal" (was "Access ARIA uplink terminal"); its screen reads CONTROL ROOM SEALED / PUMPS: NO SIGNAL · FLOOD PROTOCOL, then PUMPS ONLINE / WATER LOCK: READY (was UPLINK RELAY 3 / ARIA TERMINAL: ACCESS LOCKED, then ARIA OVERRIDE ACCEPTED / CABLE UPLINK CONTROL: TRANSFERRED); the overlay's labels are "Relay manual reroute"; the objective is "Reroute power at the relay terminal", then "The water lock is opening", "Enter the water lock".

The optional third line, **LOCKDOWN AUTH: VOSS, E. · RELEASED**, is built and off: set `RELAY_LOCKDOWN_LINE = true` at the top of `src/level3/Trench.js`.

## 4. The lock

Built in code: `src/level3/RelayLock.js` (no change to the Blender script or the `.glb`).

- **The doorway.** The relay room's south wall is a single face in the model and in its collision. At load, `RelayLock` cuts out every triangle lying wholly in a thin slab at that wall (the wall's face, the dark stripe along it and the old painted hatch disc) from the works' meshes, and rebuilds the room's collision (`COL_WorksRoom`) without them. `Works.js` now keeps each collider with its node (`works.colliders`) so it can be rebuilt. The wall is then built again as a 25 cm extruded slab with a rounded doorway through it, steel frames both sides, a hazard sill, the stripe in three pieces round the frame, a lamp and a sign.
- **The outer hatch** is a rounded leaf on the room's side (the sea's pressure seats it on the frame), hinged on its east edge, with a wheel. It swings into the room to open.
- **The lock**: 3 × 3 × 2.6 m, two floor vents with grates over the sump, pipes, a junction box, a caged ceiling lamp, a turning red beacon, a sign, the inner door (it slides east) with its lamp and panel. Box colliders for every wall.
- **The corridor** beyond: 4 m of dry corridor turning east at its end, where ARIA's blue light comes from (a glowing panel round the corner and a borrowed light). Hidden until the inner door opens.
- **The water**: a second `Water` (as the prep room's lock has), full over the ceiling until the pumps start.
- **The drain reuses the prep room's lock run backwards**: the same `Water` surface, seen from both sides; `PrepRoom._underwater()` switches the fog and the tint off once the camera is above the lock's water (`RelayLock.inAir`), `DeckSession` takes the grade and the headlamp's beam off, and `Level3Audio` lifts its under-water low-pass and stops the sea's sounds, so the sound comes out of the water as the surface passes the camera.
- **The lights**: the level's four borrowed lights become the lock's while he is in it (`Trench._lights`, region `lock`: the lamp, the beacon, ARIA's light, a fill). No new lights.

## 5. The helmet

No clip: built. The copy of Voss in the suit (a `VossActor` made from the level's own body, so it wears the same suit) lifts it with both arms through `ArmIK` reaches whose grips are worked out each frame from the helmet's collar ring. The helmet turns a quarter on his shoulders, comes off the bone into the scene (`Object3D.attach`, so nothing jumps), lifts up over his head, out to his right and down, and is let go: it drops and rolls a little. The face is the actor's `FaceRig` with two new held values, `shut` (eyes) and `gape` (mouth), added to `FaceRig.js` and eased; nothing else about the face changed. The rifle on his back is hidden on the copy.

What to look at in a real browser: the moment the surface passes the camera (it is a dark band for a frame or two, with the helmet lamp in it), the cut from the floating body to the copy (it is meant to hide the jump to the wall), and whether the sit is slow enough to feel spent rather than calm.

## 6. Scene A without the suit

Removed from `Confrontation.js`: `SUIT_AT`, `HELMET_AT`, `_suit()` and its call, its mixer and its disposal, the `DiveSuit` and `SkeletonUtils` imports, and the comments about it. Kept, as Scene B needs them: `_bodyHook`, every `VOICE_GAIN_DB` entry, and the `export { FACE, HOLO, PORT, DESK, ROOM, CABLE_R, keepInside, pushOut }`. Scene B never used the suit. Beat 1's camera was not changed (the report's compromise was about panning onto the suit by the door; with it gone a pan could be tried, but the script's shot works as it is). Beats 4, 11 and 13 simply show the empty corner now.

## 7. Lines

Added (ARIA, recorded by the owner, renamed from `I3-relay-…` to `l3-relay-…`, the lowercase L the rest of Level 3 uses): `l3-relay-3` (entering the room, `hesitant`), `l3-relay-4` (reroute won, `relieved`), `l3-relay-5` (inner door, `bubbly`). Their subtitles are the plan's wording: **check them against the recordings**, which I could not listen to.

Cut (none were recorded, and no other code used them): `v-works-descent-1` to `-3`, `v-link-cut-1` to `-3`, `v-relay-won-1` to `-4`, `l3-relay-won-1` to `-4`. Talks: `postBossDescent` is now only `l3-kraken-2`; `relayLinkCut` is renamed `relayEnter` (`l3-relay-3`); `relayWon` is `l3-relay-4`; `lockOpen` (`l3-relay-5`) is new. Naomi's Word script may need the same cut if it has them.

Optional, not recorded: `public/assets/audio/voss/v-lock-land.mp3` (a grunt as he lands) and `v-helmet-gasp.mp3` (the gasp). The scene loads and plays them if they are there; without them, his breathing and a hiss of air for the gasp.

Levels (`scripts/confrontation/loudness.mjs`, which now measures Level 3's ARIA lines too): `l3-relay-3` -19.9 LUFS, `l3-relay-4` -18.4, `l3-relay-5` -20.2, against her other Level 3 lines at -19.1 to -20.2 (`l3-relay-1` is the odd one, -24.1). So no gain was needed: they go through the level's usual ARIA path as they are.

## 8. Other changes

- `Game.js`: a new state, `CUTSCENE` (the level goes on updating; the music is silent), used by the scene.
- `level3.css`: `body.l3-cutscene` hides the game's panels during the scene but keeps ARIA's subtitle and the black.
- `Swim.js`: the scene has him from the hatch shutting (no swimming, no cable); spent, he breathes harder.
- `Trench.js`: the spent swim after the fight (80% speed, a pause of about a second every 9 to 14 s of swimming, harder breathing; `SPENT`), the safety net knows the lock, the lights, the objective.
- `DiveSuit.js` and `Harpoon.js`: the helmet and the slung rifle are named (`SuitHelmet`, `SlungRifle`) so the copy can find them.

## 9. Performance and what is left

- About 20 fps in software rendering (swiftshader) at 960 × 540 through the scene, the same as the room around it. On the real target (Intel UHD 620) it should be at least as good: the lock adds a few dozen boxes, one water sheet, a copy of Voss that shares his materials, and no lights. Not measured on real hardware.
- **For the owner:** check the subtitles of `l3-relay-3` to `-5` against what you recorded; record `v-lock-land` and `v-helmet-gasp` if you want his voice in it; decide on `RELAY_LOCKDOWN_LINE`; tell Simphiwe about the wording (section 3).
- **Not done:** the cable is hidden in the lock rather than passing through the hatch; the stagger and the sit are the existing clips (no slide down the wall); the confrontation's beat 1 camera was left as it was.
