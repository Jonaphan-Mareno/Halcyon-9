# Prompt for the implementing agent: Flashback 2

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`).

---

You are implementing **Flashback 2 ("The shutdown")** in the Halcyon-9 game (vanilla JS, Three.js, Vite). Flashback 1 has just been built by another agent; you build on it. Read these first, in this order, and treat them as the specification:

1. `docs/flashback-2-plan.md`: the task list, decisions, acceptance and risks. **Section 2 (decisions) is fixed.**
2. `docs/flashback-2-script.md`: the scene beat by beat, and the exact wording of every line.
3. `docs/cutscenes-flashbacks-plan.md` sections 1, 5 and 6 (the story rules), for context only. Do not build anything else from it.
4. `src/story/BriefingFlashback.js` (about 1,600 lines): Flashback 1, your reference. Reuse its approach: first-person camera at Voss's eyes with a real walk bob, a headless Voss copy whose arms are posed by `ArmIK`, Kessler as her own model on Voss's skeleton (`_dressKessler`), the single render target with one full-screen pass, a timeline built from the recordings' real lengths, the subtitle overlay, preload and compile, and disposal. Where it is cleaner, extract the shared first-person rig into a module both flashbacks use, **without changing how Flashback 1 plays**.
5. `src/level2/Flashback3D.js` (the existing, switched-off third-person version of this scene) and `src/level2/Flashback.js` (the 2D fallback), and `HabitatSession._kesslerScene` in `src/level2/HabitatSession.js` (where it is played).

## What to build

Rework the Level 2 flashback in Kessler's room (played when Voss reads her code card) into a **first-person, about 45 s** scene, sharp, cold and quiet, the opposite of Flashback 1's warm blur. It is the first time the player sees a face.

- Kessler (red curly hair, dark glasses, white coat; `kessler.glb`) stands at the shutdown console and turns to Voss. Her face is shown clearly. **Only her face is shown.** No other person, no photo in the room.
- Voss is never seen. His hands are not shown. The camera is his head: it steps closer, looks away at the line about the surface, and watches her go. Movement must look **natural** (head bob, wandering gaze, breathing and blinking, easing on every start and stop, no camera on rails).
- ARIA says nothing. She is a pulsing light on the console; the pulse quickens and a low tone rises under the scene, peaking as Kessler reaches for the lever.
- At the end Kessler walks out through the door. The console reads "ISOLATION REQUIRED: ENGINE ROOM". Cut to black. **Nothing is locked.** Afterwards the game's existing ARIA line plays ("You weren't supposed to find that so soon").
- Subtitles for every line, in the game's existing subtitle style. After `fb2-kessler-4` Voss says nothing: show a "…" caption for Voss with no sound.
- Drive Kessler's mouth from her recordings. `FaceRig` supports driving the mouth from audio loudness, or from the subtitle text; use whichever looks more natural. Use mid-shots rather than extreme close-ups, keep her glasses on, and choose expressions per line (see the directions in the script).
- Keep the 2D fallback working for slow machines, but bring it in line: Kessler's hair is red (it is blond there), it is silent, it ends at the same point, and Voss does not walk to the door controls.
- Turn the 3D version on (`FLASHBACK_3D` in `HabitatSession.js` is `false`) once it looks right, keeping the existing frame-rate check that falls back to 2D on slow machines.
- Keep the `?flashback` test link (with `?level=2`) working so it can be played straight away.

## Audio already in the repo

- Kessler: `public/assets/audio/flashback2/fb2-kessler-1.mp3` to `-5.mp3`.
- Voss: `public/assets/audio/voss/fb2-voss-1.mp3` and `fb2-voss-2.mp3`. Their wording (which the subtitles use): `fb2-voss-1` "No Elena! Can't you see that this is groundbreaking! We can change the WORLD!" (shouted, manic) and `fb2-voss-2` "She's a person too. You can't just switch a person off. I trust her." (quieter, earnest). You cannot listen to them: confirm each file's length and say in your report that the wording was taken from the script and not checked by ear.
- The wording of every line is in `docs/flashback-2-script.md`; take the subtitles from there.
- Build the timeline from the **real lengths** of the files, as Flashback 1 does, with fallback lengths if a file cannot be decoded. If a file is missing, show its line as a timed subtitle.

## Also

Read `l2-kessler-1`, `v-what-did-i-do`, `l2-kessler-2`, Kessler's final log and the directive in `src/level2/Level2Lines.js` against the new scene, and report any contradiction (for example anything that says Voss locked the room, or that ARIA pleaded in words). Fix only clear contradictions and list what you changed. Do not touch the Flashback 1 edits.

## Rules from the project

- Relative paths; lowercase-hyphenated file names.
- `.dispose()` everything the scene creates, including on skip.
- Intel UHD 620 school PCs: cheap shaders, no shadow maps, about 24 fps or better. Keep added disk small (Kessler is already about 0.8 MB); run `npm run optimize-models` on any new `.glb`.
- Every light must exist before the first shader compile; use `src/core/precompile.js` as Flashback 1 does.
- Hard-refresh when testing (`.glb` files are cached).

## Do not

- Show any face other than Kessler's, or mention the mother, memory-writing, the bacteria in Voss's head, or the cycles.
- Build Flashback 3, Level 3 changes, the choice, endings or credits.
- Change the decisions in section 2 of `flashback-2-plan.md`.
- Break or alter Flashback 1's behaviour.
- Commit or push. Leave the changes in the working tree for review.

## Done means

Run `npm run build`, then play it in a real browser at normal speed (`?level=2&flashback`, and through the real code-card route): it plays once, Enter skips it, the game continues into the ARIA line, Kessler's mouth moves with her words and looks human, no other face appears, movement is natural, nothing is left behind after disposal, and the 2D fallback still works. Then report: what you built and where, anything you could not verify (say so plainly, in particular whether her face reads as human or "robotic" at normal speed), any decision the plan did not cover, any contradiction you found in the Level 2 text, and the frame rate you saw.
