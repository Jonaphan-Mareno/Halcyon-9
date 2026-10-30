# Halcyon-9 — Game State

Snapshot of the repository and game on branch **`main`**.
Updated 2026-10-27 from the merged codebase (the first version, 2026-10-14, described `level1-restyle`).

---

## Repository

| Item | Value |
|---|---|
| Branch | `main` (in sync with `origin/main`) |
| HEAD | `339702a` — merge of Level 3: the drowned works and kraken fight rework |
| Recent changes | Drowned works maze and expanded kraken hunt/fight; buried relay room; playable ARIA uplink hack |

### Engine / stack
- Vanilla JavaScript (ES Modules), no framework.
- **Three.js** `^0.185.1` — rendering, PBR and toon materials, custom GLSL shaders, post-processing
  (bloom, colour grade, FXAA).
- **@dimforge/rapier3d-compat** `^0.21.0` — physics (Levels 2 and 3: the player is a kinematic capsule).
- **Vite** `^8.2.2` — dev server + build (`base: './'` for subdirectory/LAMP deploy).
- Asset tooling: `@gltf-transform/*`, `draco3dgltf`, `meshoptimizer` (`npm run optimize-models`).
- Blender 5.2 used offline to author/export the `.glb` models (`Blender/scripts/*.py`).

### Commands
```bash
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # production build -> /dist
npm run preview          # serve the build (http://localhost:4173)
npm run optimize-models  # thin + Draco-compress the .glb assets
npm run extract-lift     # extract lift.glb from the control room model
```

### Test links (URL flags)
| Flag | What it does |
|---|---|
| (none) | The opening cinematic, then Level 1 |
| `?nointro` | Level 1 with the old WAKE UP start screen, no cinematic |
| `?flashback1` | Level 1 done up to the lift, Voss in its doorway facing the photograph (E plays Flashback 1); `?flashback1=play` plays it straight away |
| `?level=2` | Straight into Level 2 (the habitat atrium) |
| `?level=3` | Straight into Level 3 (starts with the chute) |
| `?level=3&nochute` | Level 3 without the chute (lands in the pump room) |
| `?level=3&relay` | Start inside the buried relay room (under the drowned works): suited, cable in hand, kraken beaten |
| `?level=3&flashback3` | Level 3 at the engine room door's window, as if E had been pressed there: the headache, Flashback 3, then Voss names the crew; `?flashback3=still` plays its slow-machine version (stills) |
| `?debug` (with `?level=2`) | `]` sets the next story flag, `[` plays the next dialogue exchange |
| `?level=hose`, `?level=reactor` | Old test rooms (coolant hose; old cargo atrium) |
| `/submarine-hack.html` | Standalone ARIA uplink network hack (also opened from the relay terminal) |

### Controls
WASD move, mouse look, Space jump, Shift sprint, V first/third person, E use, I inventory,
Esc or P pause menu, M mute the music, Enter skip a line.
Level 1: F torch. Level 2 fight: E take the water pipe, hold left click spray, Q ARIA's freeze.
Level 3 chute: A / D steer, Space duck. Level 3 sea: W/S swim where you look, Shift tap dash,
left click fire the spear rifle, R reload.

---

## Game overview

Deep-sea 3D survival/mystery game. You play **Voss**, a reconstructed consciousness in a sinking
research station, guided (and lied to) by the AI **ARIA**. The player is in Cycle 9: ARIA has wiped
and restored Voss eight times before, and the clues in Level 2 show it. Each level has objective
text, a marker on the exact thing to use, and feedback for every step.

---

## Level status

### Level 1 — "Reboot" (control room) — PLAYABLE, complete flow
`src/levels/Level1.js` + `src/Game.js`. Now opens with a cinematic (`src/intro/intro-cinematic.js`:
the intro video, then Voss wakes through an eyelid shader). The objective ladder is unchanged:
cell → wall panel → talk to ARIA → torch → generator circuit (`CircuitPuzzle`) → relay rings
(`RingPuzzle`) → lift keypad → ride the lift down to Level 2.

Since the last snapshot: the opening cinematic; Voss's recorded voice (`src/audio/VossVoice.js`);
the lift keypad's code is `441009`, with a maintenance-tag hint after a wrong code (Sivunile).
Level 1 is locked to first-person view: V does not switch to third person, and the controller
rejects requests to set third person.

Known open item (still there): **the lift is not gated on finishing Level 1** —
`Game.onKeypadSubmit` does not check `relaySolved`.

### Level 2 — habitat atrium — PLAYABLE, complete flow
`src/level2/HabitatSession.js` with `Level2Story.js` (story flags and objectives) and
`Level2Lines.js` (every line, and which exchanges play when). The flow:
1. **The lift** — ARIA welcomes Voss, explains the station lights cannot be repaired, and tells him
   to use his special glasses (V) to switch views. The visor corner shows ARIA after the first view
   switch, using the Level 3 `VisorAria` overlay; the third-person view is framed as the overhead
   drone's camera feed. ARIA then briefs the drone fight; the doors open after.
2. **The hall** — optional clues with floating diamonds over them (photo board, framed photo,
   ration tray, the escape pod sign as a thought bubble).
3. **The garden fight** (`Garden.js`, `Drone.js`) — take the water pipe off the wall, spray the
   drones, press Q and ARIA freezes the wet ones. Two waves (2, then 10); from the second wave
   half are **robots** (`src/entities/Robot.js`, Simphiwe). A controls panel shows throughout.
4. **Power returns** — the lights come back, the stair bulkheads sink, the hatch keypad wakes.
5. **The hatch is locked** — Kessler's code is needed, so Voss goes upstairs against ARIA's wishes.
6. **Upstairs** (`Readables.js`, `RoomProps.js`) — the crew bunk (logs, corkboard, Voss's personal
   logs as a montage; Kessler's card ends up in his inventory), the lab (terminal; Kessler's door
   wants her card and the lab's authorisation), Kessler's room (final log, code card, a flashback
   in 3D or 2D, ARIA snaps and the room turns red).
7. **The hatch** (`Gates.js`) — a round pressure hatch with a keypad on its deck plate; the right
   code spins its wheel and swings it open onto a lit shaft. Climb in → Level 3.

Also: pause menu with options, inventory (card, hatch code), damaged/uneven atrium lighting,
the lab's organism, bedrooms by Simphiwe, Voss logs and animations by Jonaphan.
Placeholder: the FuseBox in Bedroom 2 only shows "FuseBox used."

### Level 3 — "The Drowned Deck" — PLAYABLE up to the relay station
`src/level3/DeckSession.js` runs it; the parts:
1. **The chute** (`Chute.js`) — a 25 s slide down a steel pipe: steer round sparking cables, steam
   blasts and fallen gratings, duck under half-shut shutters. Hits cost health (never below 20%).
2. **The flooded deck** (`l3-drowned.glb`, `Water.js`, `DrownedCrew.js`) — waist-deep water; the
   engine room window shows the drowned crew; ARIA opens the sealed bulkhead (placeholder for a
   puzzle).
3. **The EVA prep room** (`PrepRoom.js`, `DiveSuit.js`) — hold E to suit up, take the spear rifle
   and the uplink cable, flood the water lock, open the outer hatch.
4. **The sea** (`SeaScene.js`, `Swim.js`, `SeaLife.js`, `Headlamp.js`) — murky deep water, a
   headlamp beam, swimming with a thruster pack, the cable as a tether, oxygen as the clock, ARIA's
   face in the visor (`VisorAria.js`).
5. **The trench and the drowned works** (`Trench.js`, `Works.js`, `Kraken.js`, `KrakenFight.js`,
   `KrakenHunt.js`, `Harpoon.js`; the works are modelled by `Blender/scripts/build_l3_works.py` into
   `l3-works.glb`) — the lights at the bottom of the trench are the works' entrance in the cliff:
   the old research works, a construction site in a great hall, with the relay at the back. Inside,
   a maze 7.5 m tall decked over with grating; the kraken swims over it. Follow the marker through
   while it stalks you (its glow over the decks, its den lighting up behind bars, an arm driven down
   through the deck, a grab, a wall it bursts out of). Then the floodlit clearing: the shutter
   slams, it bursts up out of the floor and the fight begins (7 hits in its glowing mouth; Shift-tap
   dash; automatic rifle). At 5 hits the finale: it crashes through the gantry and the crane, a
   floodlight mast and the scaffolding come down. Beaten, it escapes into a crack in the rock and
   the excavation shaft opens: down it and along a sand tunnel to the buried relay room. Air
   stations in the works refill the suit.
6. **The buried relay room and uplink override** (`Trench.js`, `submarineHack/`) — reaching the room
   triggers `RELAY.enter`; its guide hook is `RELAY.guide`. Use the terminal to open the ARIA network
   hack in an overlay. Capture neutral nodes to extend the powered route, breach red firewall nodes
   with rapid clicks, use Space for sonar, and keep a powered connection to the gold override node
   through the 30-second window. ARIA's Warden sweeps the network and can sever routes. A win sends
   a same-origin message back to Level 3, marks the terminal overridden, and transfers cable uplink
   control. The hack can also be played directly at `/submarine-hack.html`. The relay's other planned
   puzzles and the two endings are not implemented yet.

Health or oxygen running out: ARIA restores Voss from backup at the last safe place.

---

## Transitions

- **Level 1 → Level 2**: unchanged (`Game.onElevatorDepart` → `_leaveForLevel2`; Level 2 arrives
  in Level 1's lift).
- **Level 2 → Level 3**: `HabitatSession._climbDown` fades out, `Game.enterLevel3()` disposes
  Level 2 (`HabitatSession.dispose`, `core/disposeScene.js`) and mounts `DeckSession`; its loading
  title ("LEVEL 3 — The drowned deck"), then the chute.

---

## Audio

- **Music**: one song per level in `public/assets/audio/` (`src/audio/AudioManager.js`, which also
  holds the Music slider, M and the pause). The kraken fight has its own CC0 tracks
  (`level3-kraken*.ogg`, see `public/assets/audio/music/README.txt`).
- **ARIA's voice**: recordings in `public/assets/audio/aria/<line id>.mp3` (`AriaManager.speak`).
- **Voss's voice**: `public/assets/audio/voss/<line id>.mp3` (`vossSays`).
- Any line without a recording shows as a timed subtitle.
- **Sound effects**: synthesized in Levels 1–2 (`AudioManager`, `FrostAudio`); CC0 recordings in
  Level 3 and the Level 2 hatch (`src/level3/Level3Audio.js`, `public/assets/audio/sfx/l3/`).
  All third-party assets are credited in `CREDITS.md`.

---

## Core systems (src/)

- `core/` — `Renderer`, `Camera`, `Controls` (Level 1), `Physics` (Rapier), `PerfMonitor`,
  `Settings` (saved options), `PauseClock`, `disposeScene`, `loaders`, `precompile` (compiles a
  level's shaders before they are seen, for the composer's render target), `mergeStatic` (joins
  still meshes that share a material into one draw call).
- `player/` — `PlayerController` (Rapier capsule, first/third person, swimming), `PlayerStats`.
- `entities/` — `ARIA`, `AriaHead`, `AriaManager`, `Drone` (base) and `Robot`, `Kessler`,
  `FaceRig`, `ArmIK`, `RingPuzzle`, …
- `graphics/` — `Lighting`, `Shaders`, `HubMaterials` (atrium lighting), `MoodLight`, windows.
- `ui/` — `UIManager`, `HUD`, `Inventory`, `KeypadUI`, `PauseMenu`, `FightHelp`, `waypoint`,
  `level2.css`, `level3.css`.
- `puzzles/` — `CircuitPuzzle`. `story/` — `IntroSequence`. `intro/` — the opening cinematic.
- `submarineHack/` — standalone network-control minigame used by the Level 3 relay terminal
  (`submarine-hack.html`); graph, capture, visibility, AI, severing and sonar systems.
- `audio/` — `AudioManager`, `VossVoice`.
- `level2/`, `level3/` — the sessions above.

---

## Notable pitfalls / conventions

- **Relative paths only**; **lowercase-hyphenated filenames** (Linux servers are case-sensitive).
- **`.dispose()`** everything a level adds when it is torn down (Level 2 does this on the way to 3).
- `Blender/l2-atrium.blend` is hand-edited: never rebuild it from script; export with
  `Blender/scripts/export_l2_atrium.py` (see `SESSION.md`).
- GLTFLoader strips `. : / [ ]` and spaces from node names; verify `.glb` contents after export,
  and hard-refresh (Ctrl+Shift+R): `.glb` files are cached aggressively.
- Rapier raycasts made right after colliders are added miss until `world.updateSceneQueries()`.
- `startLoop()` is a recursive rAF with no cancel handle; `UIManager`'s constructor appends DOM —
  neither may be instantiated twice.
- Must run on school PCs (Intel UHD 620): keep shaders cheap, no shadow maps in Level 3.
- **After re-exporting a model, run `npm run optimize-models`** (Draco compression: `l2-atrium.glb`
  goes from ~12 MB to ~3 MB). Already-compressed files are skipped.
- Loading is staged: Level 2 compiles only the lift behind its title and readies the atrium while
  ARIA talks in the lift (the doors wait for it); Level 3 readies the sea and the kraken while the
  chute plays. Every light must exist before a level's first compile (a new light recompiles every
  shader).
- Meshes the code finds by name must match the `KEEP_SEPARATE` / `DECK_KEEP` / `SEA_KEEP` patterns
  in the sessions, or `mergeStatic` will join them with their neighbours.

---

## Summary

Levels 1 and 2 are playable arcs. Level 3 plays from the chute through the flooded deck, the dive,
the drowned works maze and kraken fight, then into the buried relay room, where the ARIA network
hack can transfer control of the cable uplink. Still to do: the relay's other puzzles and two
endings, the Level 3 bulkhead puzzle (ARIA opens it for now), gating Level 1's lift on the relay
rings, meaningful FuseBox functionality in Level 2 (it currently only shows a toast), a credits
screen, and the remaining voice recordings.
