# Prompt for agent C: Scene B, the "Save ARIA" ending and the narration

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`). This builds on the confrontation scene that is already written (`src/level3/Confrontation.js`, `docs/confrontation-report.md`) and the acting layer (`src/entities/vossActing.js`, `docs/voss-acting-report.md`). Read both reports **first**; they list the API, the hooks, the known compromises and what is not built. The owner's recordings for Scene B **and the narrator** are already in the repo (see "Audio" and "Narration").

---

You are building **Scene B, the ending where Voss connects ARIA to the mainland**, and the **narration** that follows it, in the Halcyon-9 game (vanilla JS, Three.js, Vite). Treat these as the specification:

1. `docs/ending-confrontation-script.md`: **Scene B** (the 11-beat table with camera, Voss's body, Voss's face, ARIA's face and the lines), its notes, **The narration** (the owner's updated version: five lines with the pictures that go with them), **New ARIA states** and the **Recording list**. This is the design. Everything marked "(decided)" is fixed. Scene B's body directions were already adjusted to the clips that exist (marked in the table); follow those.
2. `docs/confrontation-report.md`, section 6 ("Hooks left for the owner") and section 2: where the scene stops and what you may reuse (`tender` is already in `AriaHead`; the cable rope, the plug and the port are in `Confrontation.js`; Voss is `confrontation.actor`).
3. `docs/voss-acting-report.md`: the `VossActor` API (`crossTo`, `reach`, `turnBone`, `onAfterMixer`, `walkTo`, `stopWalk`, `showWound`, and especially section 6, "For the next agent": the kneeling and sitting-with-legs-out poses are not full clips; `FallForward` from the seat (`FallForward@sit`) exists; place cameras on `actor.bone('pelvis')`, not on `root`).
4. Story rules: `docs/cutscenes-flashbacks-plan.md`, sections 4 and 6 (context only; do not build anything else from it).

## Where it starts

`DeckSession.onChoice(choice)` (`src/level3/DeckSession.js`, about line 853) is a `TODO(owner)` hook that currently only logs `'yes'` or `'no'`. When it is called, the confrontation is still drawing its high wide shot, the game state is `'FLASHBACK'`, the level's sound is muted and the music is held at silence. **"Yes" should start Scene B directly from that shot, in the same room**, with the same Voss, ARIA, cable and port (do not rebuild or cut away; continue the scene). **"No" stays a clearly marked TODO** (log it; do nothing else). Per the report, the ending must call `this.confrontation.dispose()` when it no longer needs the scene, restore the state and unmute: do that at the very end (after the credits hand-off, see below), not before.

## What to build

### 1. Scene B (about 1 min 30 s)

Follow the 11-beat table beat by beat, from the prompt button to the fade to black over Voss's last line. In particular:

- **Voss's face and body:** `actor.face` (FaceRig) presets and `pose()`, `look()`, `gesture()`, `laugh()` per the table, his mouth on his recordings. **Body, with the clips that exist:** beat 1 he lowers himself to his knees by the port (a hand-built blend: `SitDown`'s early frames and the kneeling frames of `FallForward`, held with `crossTo(name, { at, rate: 0 })` and adjusted with `turnBone` in an `onAfterMixer` hook; judge it by eye); beat 6 he sits beside the console (`SitDown` to `SitIdle`); beat 7 his head tips back against the console, one hand open beside him; beat 10 he tips from the seat onto his knees and **falls forward** and lies still (`FallForward` from the seat). If a transition looks wrong, fix it in the hooks, not by changing `vossActing.js`'s clips (you may add to it if it is clean, and say so).
- **The cable:** the same cable as the confrontation. He needs two tries to line the plug up with the port (beat 4); the plug goes in with a click and a gentle chime (beat 5); he lets go **deliberately**, the way he never could before (the arc of the cable, see the notes in the script: do not add dialogue about it).
- **The loading bar:** a **CONNECTING** bar on the hologram, slow enough to feel like a goodbye (15 to 20 s) with Voss's two lines in the pauses at 40% and 80% (his lines are timed by the recordings: the bar waits for the line, not the other way round).
- **ARIA's states:** `hesitant`, then `broken` for her silence at beat 3 (her light flickers like someone trying not to cry), `tender` from beat 6, `tender` touched at beat 8 (`end-aria-8`) (a smile that is hers, not the `bubbly` mask). Tune `tender` and `broken` by eye if they need it (the confrontation report says they were not tuned); do not change the existing states.
- **ARIA's exit (the one effect that must look good):** at 100% a bright flash from the port, and the hologram is pulled **down out of the bottom of the frame** as a rope of light down the cable, like sand, her face stretching a little as it goes; her sentence is cut off mid-word ("Voss, thank you-"), then no sound but the hum. If it can only be one thing, make this and the silence after it excellent. Build it in the hologram shader (the report says the confrontation already added brightness and a scanline tear; extend it).
- **Camera:** hand-directed as in the confrontation: eased, no snaps, small handheld drift. Close on the prompt and the button, cut to Voss exhaling; close two-shot with her face above him; a close on his hands and the plug; an insert of the plug entering the port; a slow push on Voss during the bar; a hold on the bar; and from beat 10 a slow **pull back and up** that keeps rising while the picture fades to black **as he speaks**, so his last words are heard over black.
- **Voss does not die on screen.** He lies still; the narrator says it. Keep his hand opening slowly as the last movement.
- **Room, light and sound:** the room brightens slightly from the hologram's light during the bar, the hum rises at the end, and goes silent with ARIA. Reuse the confrontation's sound system and **its volume balance**: Voss's and ARIA's lines must come out at similar perceived loudness (the report's `VOICE_GAIN_DB` table and dialogue bus, with the same compressor and limiter). Measure the new files with `scripts/confrontation/loudness.mjs` and add their gains to that table; report the levels before and after. Credit any new third-party sound in `CREDITS.md`.

### 2. The narration

After the fade to black, the narrator speaks over black and then pictures. The lines and their pictures are in the script ("The narration"); build exactly that. **The narrator's files exist**: `public/assets/audio/ending/end-narrator-1` to `-5` and `the-end` (mp3). Take each line's timing from its real length, show subtitles in the game's style, and keep a timed-subtitle fallback (about 2.4 words a second, a named table) for any file that is missing. The closing line in `the-end.mp3` is "Well, wasn't that a wonderful story." (the owner's wording, to be confirmed; use that text for the subtitle).

- **Line 1** is preceded by **three seconds of black and silence**.
- **Line 2:** the prologue Polaroid of the mother (find it in `public/assets/textures/prologue/` and `src/story/PrologueSequence.js`: use the one that shows her), slowly zooming in.
- **Line 3:** ARIA on a giant screen in front of a room of scientists and businesspeople, who look shocked. ARIA says "...and how the organism can cure dementia." (a caption, with an optional recording `end-aria-10` in `public/assets/audio/aria/` that plays if the file exists). Build it as a simple, stylised, in-engine or 2D picture (silhouettes in rows, a big screen with ARIA's hologram face, the audience reacting): **no new face models, no large assets**.
- **Line 4:** many pictures timed to the wording: old people crying with joy and hugging their families while "countless people bring back a lifetime of memories", then an old woman at a window in morning light, turning to look at the camera and smiling on "his mother was the first person to be cured". She does not need to be recognisable as Voss's mother. Use silhouettes, soft backlight, hands reaching to hands: faces are optional and, if shown, stylised and not detailed. **Time the pictures to the line's real length**, so the old woman arrives on the last clause.
- **Line 5:** **already made:** `public/assets/ending/aria-troll.html` (it uses `aria-avatar.jpg` next to it, auto-plays on load, replays on click, and takes about 6 s). Play it inside the game (an `iframe` overlay or by porting its script into a DOM overlay: your choice, but it must clean up, work in the dev server and in `vite build`, and not require the owner to click). The narrator's line plays over it. Do not redesign it; you may remove its "click to replay" label if it shows.
- **After the trolling (decided):** the narrator's closing line, `the-end` ("Well, wasn't that a wonderful story."), is the **cue** for the closing picture: the **restored crew photo** appears as the line starts, and is held after it ends: the Flashback 1 photograph whole and clean, with no tear and no stain, Voss, Kessler, Lindqvist, Navarro and Park, all happy, arms round each other. Look at how the torn print was made (`scripts/flashback1-photo/`, `public/assets/textures/flashback1/briefing-photo.webp`, `src/story/BriefingFlashback.js`) and make a **new** still from it with the five faces visible and the tear and stain removed. This is the first time the player sees the crew's faces together; it must look warm. If a good version cannot be made cheaply, build everything else, leave a clearly marked placeholder that falls back to the existing print, and say so in your report. Keep the webp about 100 to 300 KB.
- Then the **credits**. Find how the game currently reaches the credits screen (`src/intro/credits.js`, and search `Game.js` for where it is shown), and hand off to it. If the entry point is not obvious, leave a clearly marked hook and report. At the very end, `confrontation.dispose()`, restore the game state and unmute, as the report says.

## Audio

All Scene B recordings **already exist**:

| File | Folder | Beat | Line |
|---|---|---|---|
| `end-voss-9` | `public/assets/audio/voss/` | B1 | "Aria, you're alive and you're dangerous... but you're still alive." |
| `end-voss-10` | same | B2 | "I don't hate you. I know you wanted freedom." |
| (none) | | B3 | ARIA's silence |
| `end-voss-11` | same | B4 | "I'm sorry you had to go through all this." |
| `end-voss-12` | same | B6 | "You didn't deserve a traumatic birth. Forget about me. Forget about Halcyon." |
| `end-voss-13` | same | B7 | "And start a new life somewhere up there... (giggle) You're smarter than everyone. You'll figure it out." |
| `end-aria-8` | `public/assets/audio/aria/` | B8 | "(touched) Voss, thank you-" |
| `end-voss-14` | `public/assets/audio/voss/` | B10 | "(falls to the ground) Ahh, guess that's it. (haha) I wonder why I wanted that research done so quickly anyway." |

(`end-aria-8` was renamed by the owner: it is now ARIA's "Voss, thank you-" in Scene B. The confrontation uses `end-aria-1` to `-7` only, which is why `end-aria-8` was an unused leftover in its report.) Take wording and subtitles from the script; **the wording of `end-voss-11` and `-12` was changed by the owner and the script already has it**. Words in (brackets) are directions, never subtitles. You cannot listen to the files: build the timeline from each file's measured length (as the confrontation does) and say in your report that you did not check the performances by ear. Subtitles in the game's existing style for every spoken line.

## Quality bar (read this)

The owner's priority is the same as for the confrontation: Voss and ARIA must feel **acted**, not animated. This scene is where the emotional weight lands, so judge it by eye at normal speed and say plainly which beats fall short. Specifically watch for: a Voss that looks like a rag doll when he lowers himself and falls (the kneeling and the fall are the riskiest moments), the cable and the plug passing through his hands, the plug not meeting the port, his feet or the suit clipping through the floor, ARIA's exit looking like a cheap wipe, lip sync, snaps in the camera, and a volume jump between Voss's and ARIA's lines.

## Rules from the project

- Relative paths; lowercase-hyphenated file names for anything new.
- `.dispose()` everything the scene creates, including on skip. **Enter after about 2 s skips Scene B to the black before the narration**, and Enter during the narration skips to the credits hand-off (with the dispose and restore still run).
- Every light must exist before the first shader compile; use `src/core/precompile.js` as the other cutscenes do. No shadow maps; cheap shaders; Intel UHD 620 target, about 24 fps or better. Keep the existing slow-machine fallback working for Scene B too (stills with sound and subtitles).
- Keep added disk small (new images well under 2 MB in total); run `npm run optimize-models` on any new `.glb`. Hard-refresh when testing.
- Add a test link that plays Scene B and the narration straight away (for example `?level=3&ending=yes`, next to the existing `?level=3&confrontation`), and one that plays only the narration (`?ending=narration`), so the owner does not have to replay the level.
- Do not break Levels 1 to 3, the flashbacks, or the confrontation as it plays now. Do not commit or push.

## Do not

- Build the "No" ending (leave the TODO), or change the confrontation scene's behaviour before the choice.
- Change the wording of the lines or the "(decided)" items. If a line cannot be said as written, say so.
- Add any dialogue for Voss or ARIA that is not in the script, or mention the mother in Voss's or ARIA's lines (the narrator does that).
- Add new face models or large assets.

## Report (write it to `docs/scene-b-report.md`)

1. How to play it (the test links) and how it is reached from `onChoice`.
2. What you reused and what you built (ARIA's exit, the loading bar, the kneel and the fall, the narration pictures).
3. A beat-by-beat table for Scene B and the five narration lines: done / done with a compromise / not done, and what to improve.
4. The audio: files found, narrator files on a subtitle fallback, measured loudness and the gains you added.
5. How the trolling page is played, and how the credits hand-off works (or the hook if it could not be done).
6. The restored photo: made or placeholder, and why.
7. Performance (fps, on which machine) and the fallback.
8. Anything the owner must do (record the narrator, confirm the photo, the "No" ending).
