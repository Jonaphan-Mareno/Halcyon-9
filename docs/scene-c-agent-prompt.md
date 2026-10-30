# Prompt for agent D: Scene C, the "Stay" ending and its narration

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`). **Run it only after Scene B is finished** (`docs/scene-b-report.md` exists): Scene C carries on from the same confrontation, reuses Scene B's narration player and one of its narration shots, and must not be built in parallel with it. All of Scene C's recordings, the narrator's and the walla are already in the repo (see "Audio").

---

You are building **Scene C, the ending where Voss refuses to connect ARIA** ("No" at the choice), and the **narration** that follows it, in the Halcyon-9 game (vanilla JS, Three.js, Vite). Treat these as the specification:

1. `docs/ending-confrontation-script.md`: **Scene C** (the 13-beat table with camera, Voss's body, Voss's face, ARIA's face and the lines), its notes, **The narration, Scene C** (seven lines with the pictures that go with them, and its notes), **New ARIA states** (`amused`), **Voss body clips likely to be missing** (the Scene C paragraph), **Scene C: what else is needed**, the **Recording list** (Scene C and the narrator's Scene C table, with the **measured levels**), and the three Scene C questions under **Open**. This is the design. Everything marked "(decided)" is fixed.
2. `docs/scene-b-report.md` and `src/level3/SceneB.js`: **the pattern to follow.** Scene B shows how an ending continues from the confrontation's high wide shot in the same room, with the same Voss (`conf.actor`), ARIA, cable, plug, port, sound and post pass; how its timeline is built from the recordings' real lengths; its slow-machine stills; its skip; and the narration player and the credits hand-off. Reuse all of that rather than writing a second version. If something you need from Scene B is private, make it shared cleanly (export it, or move it into a small shared module) without changing how Scene B plays.
3. `docs/confrontation-report.md` (sections 2 and 6) and `docs/voss-acting-report.md` (the `VossActor` API and section 6, "For the next agent").
4. Story rules: `docs/cutscenes-flashbacks-plan.md`, sections 4 and 6 (context only; do not build anything else from it).

## Where it starts

`DeckSession.onChoice(choice)` (`src/level3/DeckSession.js`): `'yes'` calls `this.playEnding()`, which plays Scene B (`SceneB.js`), then the narration (`EndingNarration.js`), then the credits (`showEndCredits()` in `src/ui/EndCredits.js`); after the credits close it runs `conf.dispose()`, sets the state back to `PLAYING`, unmutes, and calls `_afterCredits()` (which reloads to the title: a TODO for the owner). The `'no'` branch is a TODO comment in `onChoice`: **put Scene C there**, following `playEnding()`'s shape (a Scene C version of it, or `playEnding()` taking the choice; keep Scene B's path exactly as it is). Also follow what Scene B added: `startConfrontation` calls `this._preloadEnding()` just after the confrontation starts playing (preload Scene C there too, or only the ending that can still be chosen), and the render hook checks `this.ending?.running` before drawing the confrontation. **"No" should start Scene C directly from the high wide shot, in the same room**, exactly as Scene B does for "Yes", and end the same way (the same credits, dispose, restore and `_afterCredits()`). Note that the confrontation's choice has a timer that picks "yes" when it runs out (`CHOICE_SECONDS` in `Confrontation.js`); leave that as it is.

Scene B's test links are `?level=3&ending=yes` and `?ending=narration` (in `main.js`); add Scene C's next to them. Scene B's narration uses the ids `n1` to `n6` in `VOICE_GAIN_DB` (`n6` is `the-end`); it does not use `end-narrator-6` to `-11` or `end-walla-1`, which are Scene C's. `BriefingFlashback` has an opt-in `faces` option for the restored crew photo (`scripts/ending-photo/`); Scene C does not need it.

## What to build

### 1. Scene C (about 1 min)

Follow the 13-beat table beat by beat, from the prompt button to the black after the pull-out. In particular:

- **Voss's body, with the clips that exist:** standing in `SadIdle` with the cable in his right hand (beats 1 to 7), one small step toward her (beat 2), the **drop** (beat 5), then lowering himself to the floor and sitting against the projector, knees up (`SitDown` to `SitIdle`, **the same seat as Scene B**, beat 8), his head tipped back against the projector to look up at her (beat 9), shoulders shaking as he laughs (beats 11 and 12), a hand moving as he talks (beat 13).
- **The cable drop is the key moment of the scene.** He opens his hand; the plug falls, hits the floor with a hard clack and rolls a little, and the cable slaps down after it. Use the confrontation's cable rope and plug (the rope must fall with the plug and lie on the floor, not float or pass through it). The port's lit ring dims as it lands. The clack is the loudest sound in the scene. He does not pick it up again.
- **Voss's face:** `actor.face` presets, `pose()`, `gesture()` and `laugh()` per the table; his mouth on his recordings, including the **exhale** at the start of `end-voss-15` (no speech shapes on the exhale: a breath out, the mouth a little open) and the **giggle** at the end of `end-voss-20`.
- **ARIA's states:** `guarded`, `hesitant`, then `broken` going to `tender` for her teary silence at beat 3 (her light flickering like held-back tears, softer than Scene B's), `hesitant` with the hint of a smile at beat 6, `tender` as he sits, and **`amused`** for her giggles (beats 10, 12, 13). `amused` is new: add it to `AriaHead.js` from the start values in the script and tune it by eye. It must read as a real laugh and **must not look like `bubbly`** (the mask from the start of Scene A); say in your report how you made sure of that. Do not change the existing states.
- **Camera:** hand-directed as in Scenes A and B: eased, no snaps, small handheld drift. Beat 9's low two-shot from his level (Voss small in the bottom left, her face big above him) is the scene's picture. **Beat 13 is the reverse of Scene A's first shot**: the camera backs slowly away and up, out through the door they came in by (8 to 10 s), while they go on talking and laughing.
- **Sound:** Scene A's and B's sound system (the context, the effects bus, the hum). The hum drops at beat 3. The muffled talk is `end-walla-1` (below).
- **Voss does not die in this scene.** He is alive and laughing when the picture goes black.

### 2. The narration

Reuse Scene B's narration player (its subtitles, its timed-subtitle fallback, its skip, its credits hand-off). Build the seven lines and their pictures exactly as "The narration, Scene C" describes:

- **The black between the scene and line 6** is about a second, then the picture comes back on **the same room** for lines 6 and 7 (the player has not left them yet). This is the script's suggestion and an open question for the owner: make the length of the black a named constant.
- **Lines 6 and 7: Voss lying on his back** by the projector, ARIA's face over him. There is no lie-down clip (see "Voss body clips likely to be missing"); `FallForward` must not be used here, because face down is Scene B's death. Try, in this order: (a) a pose built from `SitIdle`, as Scene B's kneel was built (`level3/vossPoses.js`); (b) a Mixamo clip of lying down from a seat and a lying idle, retargeted like the other six in `vossActing.js` (check its licence the way the others were, and add it to `CREDITS.md`); (c) the fallback in the script: he stays sitting and his head tips onto his shoulder in line 7. Judge by eye and say which you used and why.
- **Line 7: he drifts off.** His hand comes to rest on his chest, the laughs get shorter and stop, his breathing slows and stops, his eyes close on "drifted off" and **stay closed**. `FaceRig.js` only blinks: add a clean way to close the eyes slowly and hold them, and to stop the breathing and the head sway (for example `sleep(seconds)`), without changing how the face behaves anywhere else. ARIA's last giggle has no answer; hold two seconds on the silence.
- **Line 8, four pictures** timed to its three sentences (the file is 17.1 s): ARIA `broken`; then `tender` with a small smile; then `directive`; then **ARIA's screens around the atrium switching off one by one**, each with a small power-down sound, the last one holding a beat before it goes; then **Voss's lab with its lights staying on**, the only lit room in the station. Find the atrium and its ARIA screens, and Voss's lab, in the existing levels (search for `atrium` in `src/`), and reuse them as backdrops if you can; if they cannot be loaded cheaply in the ending, build simple stand-ins and say so.
- **Line 9:** two or three sci-fi submarines gliding through the dark toward the station, headlamps cutting through drifting particles; the station dark except one lit window (the lab). Seen from far, so silhouettes and headlamps are enough. Reuse the sea from Level 3 (`SeaScene.js`, `SeaLife.js`, `Water.js`) if it fits. **No large new models.**
- **Line 10:** the rescue team in dive suits (`level3/DiveSuit.js`) with torches, walking through the dark station into the lit lab; a gloved hand wipes the dust from a terminal with the research on it. The script suggests the research's title screen or a note reading "for Mom" (an open question for the owner: build it, keep the text in one named constant, and say so).
- **Line 4: reused from Scene B.** The same file (`end-narrator-4`) and **the same shots**, not a copy of them: call Scene B's code for that shot.
- **Line 11 (`end-narrator-11`):** the same old woman as line 4's window shot, the same model and morning light, at a table going through a box of old Polaroids, the prologue's Polaroid among them (`public/assets/textures/prologue/`, `src/story/PrologueSequence.js`). On "Sorry..." she stops on one and holds it up: **the player only ever sees its white back** (it is Voss in his Halcyon-9 uniform; do not make or show the front). Fade to black on the sniffle's tail, then the credits, as Scene B hands off.

## Audio

Every file **already exists**. Words in (brackets) are directions, never subtitles. Take the wording from the script.

| File | Folder | Beat | Line |
|---|---|---|---|
| `end-voss-15` | `public/assets/audio/voss/` | C1 | "(exhale) Aria, first things first. I've always seen you as a person." |
| `end-voss-16` | same | C2 | "And I still do." |
| (none) | | C3 | ARIA's teary silence |
| `end-voss-17` | same | C4 | "But I think what we did here was wrong." |
| `end-aria-11` | `public/assets/audio/aria/` | C6 | "So you won't link me after all, huh?" |
| `end-voss-18` | `public/assets/audio/voss/` | C7 | "Yeah... we deserve to die with our wrongs, Aria..." |
| `end-voss-19` | same | C9 | "Let's have a real conversation for once." |
| `end-aria-12` | `public/assets/audio/aria/` | C10 | "(giggles) Look at you acting all cool when your body is falling apart." |
| `end-voss-20` | `public/assets/audio/voss/` | C11 | "(haha) Well, at least I have one. (giggle)" |
| `end-aria-13` | `public/assets/audio/aria/` | C12 | "(giggle) Oh wow." |
| `end-walla-1` | `public/assets/audio/ending/` | C13, N6, N7 | The two of them chatting and laughing, no scripted words |
| `end-narrator-6` to `-11` | `public/assets/audio/ending/` | narration | The lines in the script (`-4` is Scene B's, reused) |

- **The walla is 13.2 s** (talk from 0.3 to 11.2 s) and has to cover the pull-out, the black and line 6: about 25 s. Loop it once with a crossfade from its middle, under a low-pass that falls during the pull-out until no words survive, and let it thin out and stop under line 7. ARIA's last, unanswered giggle in line 7 is cut from `end-aria-13`, under the same low-pass.
- You cannot listen to the files: build the timeline from each file's measured length, as Scenes A and B do, and say in your report that you did not check the performances by ear.
- **Ids:** the confrontation's gain table already uses `n6` for `the-end`. Give Scene C's narrator lines ids that cannot collide (for example `c-n6` to `c-n11`, or rename consistently), and say what you chose.

### Volume: equalise Voss and ARIA (the owner's priority)

**Voss's recordings come in quieter than ARIA's, and the owner says this hurts the experience.** Every Voss line must be as easy to hear as every ARIA line, in all three scenes.

1. **Match by loudness.** `scripts/confrontation/loudness.mjs` now measures Scene C's files too; run it. The script doc's "Scene C levels" table has the measurements and the gains to the confrontation's target (−18.9 LUFS for the voices, about −19.4 for the narrator). Voss's Scene C takes are **7 to 9 dB under** the target and ARIA's about 3 dB under; add every Scene C gain to `VOICE_GAIN_DB` (or Scene C's equivalent, through the same dialogue bus, compressor and limiter).
2. **Then lift Voss.** Even matched, his low, hoarse voice sounds quieter than ARIA's, especially on laptop speakers. Add one named constant for an extra Voss lift (start at **+1.5 dB**) applied to **every Voss line in Scenes A, B and C**, not just Scene C's. Raise it if Voss still reads as quieter. This is the one change you may make to Scene A's and B's sound; nothing else in them changes.
3. **Watch the peaks.** The big gains push some peaks above full scale before the limiter: `end-voss-15` (−7.7 dB peak, +8 dB) and the laugh in `end-voss-20` (−3.4 dB peak). Ride the loud laugh down over its own few hundred milliseconds, as Scene B does with `end-voss-14`'s "Ahh" (`AHH_DB`), rather than lowering the whole line, and check that the limiter is not pumping on the giggles.
4. **Check it, and report it:** the levels before and after for every Voss and ARIA line in the three scenes, the lift you settled on, and whether any line is still more than about 1 dB from its neighbours.

## Quality bar (read this)

Scene C must feel as **acted** as Scene B, and its feeling is different: two friends on the floor at the end of the world, not a goodbye. Judge it by eye at normal speed and say plainly which beats fall short. Watch for: the cable floating, passing through his hand or the floor, or landing without weight; Voss looking like a rag doll as he sits and as he lies down; his feet or the suit clipping the floor; ARIA's `amused` reading as the old `bubbly` mask; the laughs not matching his shoulders and her light; the eyes popping open after he drifts off; the walla's loop seam being audible; snaps in the camera; and **any jump in volume between Voss and ARIA**.

## Rules from the project

- Relative paths; lowercase-hyphenated file names for anything new.
- `.dispose()` everything the scene creates, including on skip. **Enter after about 2 s skips Scene C to the black before the narration**, and Enter during the narration skips to the credits hand-off (with the dispose and restore still run), as in Scene B.
- Every light must exist before the first shader compile (`src/core/precompile.js`). No shadow maps; cheap shaders; Intel UHD 620 target, about 24 fps or better. A slow-machine fallback (stills with sound and subtitles) as Scene B has.
- Keep added disk small (new images well under 2 MB in total); run `npm run optimize-models` on any new `.glb`. Hard-refresh when testing.
- Add test links next to Scene B's: one that plays Scene C and its narration straight away (for example `?level=3&ending=no`) and one that plays only its narration (for example `?ending=narration-no`).
- Do not break Levels 1 to 3, the flashbacks, the confrontation, or Scene B and its narration. Do not commit or push.

## Do not

- Change the confrontation before the choice, or Scene B (except the shared Voss lift above, and making its code shared without changing what it does).
- Change the wording of the lines or the "(decided)" items. If a line cannot be said as written, say so.
- Add any dialogue for Voss or ARIA that is not in the script.
- Show the front of the last Polaroid, or Voss's face in it.
- Use `FallForward` for Voss lying down in Scene C.
- Add new face models or large assets.

## Report (write it to `docs/scene-c-report.md`)

1. How to play it (the test links) and how it is reached from `onChoice`.
2. What you reused from Scene B and what you built (the cable drop, `amused`, the lie-down, the eyes closing, the screens going off, the submarines, the rescue team, the Polaroids).
3. A beat-by-beat table for Scene C and the seven narration lines: done / done with a compromise / not done, and what to improve.
4. The audio: the walla loop, the ids you chose, the measured levels before and after for **every Voss and ARIA line in Scenes A, B and C**, the gains, and the Voss lift you settled on.
5. Which lie-down option you used, and why.
6. Performance (fps, on which machine) and the fallback.
7. Anything the owner must decide or do (the three Scene C questions under "Open" in the script, anything that sounded wrong by its numbers).
