# Prompt for agent B: The final-room confrontation (Level 3)

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`). **Start only after** (1) the Voss acting agent has finished (`docs/voss-acting-agent-prompt.md`; you need `src/entities/vossActing.js` and `docs/voss-acting-report.md`), and (2) the owner has uploaded the recordings (see "Audio"). If either is missing, stop and tell the owner.

---

You are building **the confrontation cutscene at the end of Level 3** in the Halcyon-9 game (vanilla JS, Three.js, Vite), and the **"Connect ARIA to the mainland? Yes / No" prompt** that follows it. It is a **third-person** cutscene: Voss, at the limit of his body, finally confronts ARIA in the relay control room. Treat these as the specification:

1. `docs/ending-confrontation-script.md`: **Scene A** (the 15-beat table with camera, Voss's body and face, ARIA's face, and the lines), the notes under it, **The choice**, and the **New ARIA states** table. This is the design. Everything marked "(decided)" is fixed. **Scene B (the "Yes" ending) and the narration are NOT part of your task:** leave them as clearly marked hooks (see below).
2. `docs/voss-acting-report.md` and `src/entities/vossActing.js`: the Voss actor you build on (`VossActor`, the clips `InjuredWalk`, `SadIdle`, `Stagger`, `SitDown`, `SitIdle`, `FallForward`, the transitions, `onAfterMixer`, `bone()`).
3. `docs/cutscenes-flashbacks-plan.md`, sections 4 and 6 (story rules; do not build anything else from it).
4. Reference implementations to reuse the approach of: `src/story/BriefingFlashback.js`, `src/level2/Flashback3D.js`, `src/level3/LockFlashback.js` (timeline from real recording lengths, subtitles, preload and compile, `play()` returning a Promise, Enter to skip, disposal, one render target and full-screen pass where useful). `src/entities/FaceRig.js` (Voss's face), `src/entities/AriaHead.js` and `src/entities/AriaManager.js` (ARIA's hologram head), `src/level3/Works.js` (the relay room: `PT_RelayInside`, `PT_RoomDoor`; the existing lead-in lines `l3-relay-won-1` to `-4` in `src/level3/Level3Lines.js`).

## What to build

### 1. The scene (about 2 min 15 s, third person)

Follow Scene A beat by beat, from Voss walking into the relay control room (`InjuredWalk`, planting his feet into `SadIdle`) to the choice prompt. For every beat use the table's camera, Voss's body, Voss's face, ARIA's face and the line. In particular:

- **Voss's face** is `actor.face` (a `FaceRig`): use the presets and `pose()`, `look()`, `gesture()`, `tic()`, `stare()`, `laugh()` exactly as the table says, switched per beat from a timeline (as `Flashback3D.js` does with its `acting` table). Drive his mouth from his recordings.
- **Voss's body:** `SadIdle` for most of the scene, `Stagger` for the flinch and the stagger beats, with the smooth transitions from the acting module. Add by procedural bone work through `actor.onAfterMixer`: his **free hand to the back of his head** (the gash) at beat 6, and his **free hand on the console** at beat 11 (with a settle, not a snap).
- **The cable is the main prop** (see "Assumptions" and the notes in the script): a thick optic cable he holds in his **right hand** from the first beat. It is not a static prop: a few connected segments or a curve/tube that trails from his hand to the floor and its reel/port, with a plug on the end. Its hand does something at each beat: grips (2), rattles (5), **sinks until the plug touches the floor** (9, the echo of "I put the cable down" in `log-5`), is lifted white-knuckled (11), hangs (15). Build it cheaply (a tube with a few control points updated per frame is enough).
- **ARIA** is the hologram face on a terminal in the room, through the existing `AriaHead`/`AriaManager` pipeline, with the states per beat. **Add the two new states** `broken` and `tender` to `AriaHead.js` using the start values in the script's table (tune by eye), without changing the existing states. Her light dims slowly while the choice is up.
- **Camera:** a smooth, hand-directed rig (not on rails): start behind Voss following him in, close in with each beat, cut to ARIA close-ups as the table says, and end on a high wide shot at the choice. Every move eased; no sudden snaps; slight handheld drift is fine and should be small. Never let a wall or the terminal cut through the camera.
- **Silences are part of the scene** (beats 5 and 13): hold the shot at least the length given, even if the recordings are short.
- **Voss's suit (decided).** Voss is **not** wearing the dive suit in this scene: he is in his normal clothes, with his face, hair and the gash visible (the visor's glass would hide the face the whole scene depends on). The suit **simply appears on the floor in the entrance corner** of the room, as a discarded prop he has already taken off: crumpled or slumped against the wall by the door, with the helmet beside it (the visor catching the terminal's light). It is there from the first frame, so the camera passes it as he walks in (beat 1); nothing pops in during the scene. Build it from `src/level3/DiveSuit.js` (`dressInSuit` with `empty: true`, or `rackSuit`; look at how `PrepRoom.js` shows an empty suit) and pose it lying down or slumped, not standing; if a fully limp pose is hard, use a simple slumped arrangement of its parts. Keep it cheap and dispose it. Do not carry any suit part in Voss's hands: his free hand is needed at beats 6 and 11. The player has just played this level in the suit, so the lead-in's fade or cut is where the change happens; report how you handled that join, and if the lead-in is not built, mention that it needs a short beat of him taking it off.
- **Light and room:** use the existing relay room from `Works.js` if the terminal, port and a usable open floor area exist there; if not, build a small control-room set in code (terminal with ARIA's hologram, an uplink port at its base, a console Voss leans on, the cable's reel). The room's light should go cold at beat 14 and the hum should drop to almost nothing for the choice. Report what you reused and what you built.

### 2. The choice

After beat 14 (ARIA's cold "Just make a choice already", which is her last line: there is no line after it), hold one to two seconds of silence on her face with the hum dropping, then pull to the high wide shot (beat 15) and show **"Connect ARIA to the mainland?"** with **Yes** and **No**, in the game's existing prompt style (find how other choices or prompts are shown in `src/ui/` or `Game.js` and reuse it). No timer. The camera holds the high wide shot; ARIA's light slowly dims while it is up. Selecting an option calls a hook:

```js
// TODO(owner): "Yes" plays the Save-ARIA ending (Scene B); "No" is not written yet.
onChoice(choice /* 'yes' | 'no' */)
```

Leave both as clearly marked empty hooks (log which was chosen to the console). **Do not write any ending content.**

### 3. Where it triggers

Find where Level 3's relay finale currently ends (`Level3Lines.js` has the draft lines `v-relay-won-1` to `-4`, which are not yet wired to anything, or may be wired in `KrakenFight.js`/`Works.js`/`DeckSession.js`: **find out**). The confrontation plays after that lead-in. If the lead-in is not built yet, make your scene start from a single clearly marked function `startConfrontation()` and add a test link `?level=3&confrontation` that plays it straight away, and report precisely where the owner must call it from. Do not rebuild the lead-in.

## Audio

The recordings are in **`public/assets/audio/ending/`** (mp3). The file names and the exact line for each are in the recording tables at the end of `docs/ending-confrontation-script.md` ("Recording list"). Use those names exactly. You need **Scene A only**:

| File | Beat |
|---|---|
| `end-aria-1` | 1 (**optional**: if the file is absent, leave the line out entirely, with no subtitle) |
| `end-voss-1` | 2 |
| `end-aria-2` | 3 (starts with a small false giggle, so the hologram should smile for it before her face goes `guarded`) |
| `end-voss-2`, `end-voss-3` | 4 (a held beat between the two) |
| (none) | 5: five seconds of silence, no file |
| `end-voss-4` | 6 ("Why did you do that to me, Aria!?") |
| `end-aria-3` | 7 |
| `end-aria-4` | 8 |
| `end-voss-5`, `end-voss-6` | 9 |
| `end-aria-5` | 10 |
| `end-voss-7` | 11 |
| `end-aria-6` | 12 |
| `end-voss-8` | 13 |
| `end-aria-7` | 14 (her last line; the choice prompt follows after a beat of silence) |

**Volume balance (important).** Voss's voice is recorded quieter than ARIA's, and the owner does not want the listener riding the volume control. Measure the loudness of every Scene A file (for example RMS or integrated LUFS from the decoded audio: a small script in `scripts/` or a Web Audio analysis at load) and give each line a **gain** that brings Voss's and ARIA's lines to a similar perceived loudness (target: the average of the two voices; do not simply boost Voss to clipping). Rules: apply per-file gain through a gain node, not by editing the files; use a **limiter or compressor** (`DynamicsCompressorNode`) on the dialogue bus so Voss's boosted shouts (`end-voss-4`, `end-voss-5`) and ARIA's loud takes (`end-aria-3`, `end-aria-5`) never clip or jump out; keep the intentional contrast inside a line (the broken whisper-like takes may stay quieter than the shouts, but not by more than about 6 dB between neighbouring lines); keep music and effects (the hum, the cable, the plug) clearly under the voices. Put the gains in one named table so the owner can tweak them, and report the measured levels before and after. The ARIA lines are also played through the hologram/monitor chain in other scenes: in this scene make sure that chain adds no extra loudness or filtering that undoes the balance.

Ignore `end-voss-9` to `-14`, `end-aria-9` and `end-narrator-*` in that folder: they belong to Scene B and the narration. If a Scene A file other than `end-aria-1` is missing, show its line as a **timed subtitle** (about 2.4 words a second) and have it play automatically once the file is added; keep a clearly named fallback table. Words in (brackets) in the script are directions, never subtitles. You cannot listen to the files: take wording and subtitles from the script, check each file's real length, build the timeline from those lengths, and say in your report that you did not check the performances by ear. Subtitles for every line in the game's existing subtitle style. Use or synthesise the sound effects (machinery hum that drops for the choice, the cable rattle, the plug on the floor, the hologram flicker); credit any third-party sound in `CREDITS.md`.

## Quality bar (read this)

The owner's priority is that Voss and ARIA feel **acted**, not animated: eye lines, small hesitations, a hand that does something at the right moment, the breath before a line. Check it by playing it in a real browser at normal speed, not in stills. In your report, say plainly which beats look good and which fall short. Specifically watch for: a robotic Voss (no weight shifts), feet sliding, hands passing through the console, the cable passing through his body, the mouth not matching the voice, and any camera snap.

## Rules from the project

- Relative paths; lowercase-hyphenated file names.
- `.dispose()` everything the scene creates, including on skip (Enter after about 2 s skips **to the choice prompt**, not past it).
- Every light must exist before the first shader compile; use `src/core/precompile.js` as the other cutscenes do. No shadow maps; cheap shaders; Intel UHD 620 target, about 24 fps or better. Add a frame-rate check with a simple fallback (a static ARIA hologram and the audio with subtitles) if the machine is slow.
- `mergeStatic` joins meshes by material: any mesh the code finds by name must match the `KEEP_SEPARATE` / `DECK_KEEP` patterns in the session.
- Keep added disk small; run `npm run optimize-models` on any new `.glb`. Hard-refresh when testing.
- Do not break Levels 1 to 3, the flashbacks, or the existing ARIA states. Do not commit or push.

## Do not

- Build Scene B (the "Yes" ending), the "No" ending, the narration, the restored photo or the credits hand-off.
- Change the wording of the lines or the "(decided)" items in the script. If a line cannot be said as written (for example a recording cut it off), say so in the report.
- Mention Voss's mother in the scene, or add lines. The narrator explains it later.
- Edit `l3-relay-won-*` lines (they are outdated on purpose and left alone).

## Report (write it to `docs/confrontation-report.md`)

1. How to play it (`?level=3&confrontation`) and the exact call to start it from the game.
2. What you reused (relay room, terminal, `AriaHead`) and what you built.
3. A beat-by-beat table: done / done with a compromise / not done, with what to improve.
4. The audio: which files were found, which lines are on a timed-subtitle fallback.
5. Performance (fps measured, on which machine) and the fallback.
6. The hooks left for the owner: `onChoice`, Scene B, the "No" ending.
