# Prompt for the implementing agent: Flashback 1

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`).

---

You are implementing **Flashback 1 ("The briefing")** in the Halcyon-9 game (vanilla JS, Three.js, Vite). Read these first, in this order, and treat them as the specification:

1. `docs/cutscenes-flashbacks-plan.md`: **section 0 (the implementation brief) is your task list**, then section 2 (the full design of Flashback 1). Where section 0 and a later section disagree, section 0 wins. Sections 3 to 8 are context for later work; do **not** build any of it.
2. `docs/flashback-1-recording-script.md`: the final wording and file names for all the audio.
3. `gamestate.md` ("Notable pitfalls / conventions") and, for style, `src/level2/Flashback3D.js`, `src/story/PrologueSequence.js` and `src/intro/intro-cinematic.js`.

## What to build

- **Level 1 lift photograph:** a torn, stained group photo on the lift wall with a world marker. The lift will not depart until Voss has looked at it (hook: `Game.onElevatorDepart` in `src/Game.js`; marker: `ui.waypoint`; cabin: `src/levels/liftCabin.js`, `src/levels/Level1.js`). Confirm these locations yourself before relying on them.
- **The headache transition** (blur, heartbeat, white-out) then Voss's "Ah… my head."
- **The flashback** (about 30 s, first person through Voss's eyes, Enter skips after about 2 s): a new file in `src/story/`, using the same `play()`-returns-a-Promise contract as `Flashback3D.js`. A small warm conference room, five silhouettes (Kessler, Lindqvist, Navarro, Park, and the male speaker) with blurred faces, reusing the existing human model and skeleton. No face models.
- **The audio treatment:** the speaker's clips are low-passed until inaudible, except `fb1-speaker-a` and `fb1-speaker-b`, where the filter opens and a slight wobble makes the voice shaky. Subtitles for those two only. Everything else the speaker says is never subtitled.
- **Camera movement must look natural** (plan section 2.5): head bob, wandering gaze, breathing and blinking, easing on every start and stop, real arm animation for any visible arms. No camera on rails.
- **The reveal:** shutter flash, then the photograph full screen for about 3 s, then back to the lift.
- **The photograph itself:** one rendered still (a webp of about 100 to 300 KB) of the same room from the photographer's view: five people, arms round each other, torn where Voss stood with an arm reaching into the gap, faces stained out. Use it on the lift wall and for the reveal.
- **After the flashback:** Voss's "Who were those people?", ARIA's two lines, Voss's "…Right. Relief engineer. Let's go.", then the lift is free to depart.
- **A test flag** such as `?flashback1` (as `?flashback` does for Level 2) so it can be played straight away.

## Consistency edits (plan section 0.2)

In `src/level2/Level2Lines.js`:
- `LOGS.subjects`: five names only: Kessler, Lindqvist, Navarro, Park, and Voss. Reword "RESTORED (CYCLE 9)" so he reads as a living man wiped nine times, not a copy.
- `LOGS['log-1']`: replace the text with the new one in the recording script (section 5), and **re-key its `beats`** to phrases in the new text (suggestions are in the script). The new recording is already in `public/assets/audio/logs/log-1.mp3`; check that its timing still suits the beats.
- Change "reconstructed Voss" wording in the log `who:` strings to something like "a wiped Voss".
- Leave `bunkLogA`, the rota, the letter, the directive and the research notes alone.

## Audio already in the repo

- `public/assets/audio/flashback1/`: `fb1-speaker-1`, `-a`, `-2`, `-b`, `-3`, `-photo`, `fb1-room-cheer`, `fb1-room-photo`.
- `public/assets/audio/voss/`: `fb1-voss-head`, `fb1-voss-who`, `fb1-voss-ok`.
- `public/assets/audio/logs/log-1.mp3` (replaced).
- **Not yet recorded:** `fb1-aria-1` and `fb1-aria-2` (they will go in `public/assets/audio/aria/`). Use the existing `AriaManager.speak` path so that, until the files exist, her lines show as timed subtitles, and play automatically once the files are added.
- Time the scene to the **real lengths** of these recordings (measure them), not to the guide timings in the plan.

## Rules from the project

- Relative paths only; lowercase-hyphenated file names.
- `.dispose()` everything the scene creates, so nothing leaks into Level 1 or Level 2.
- Intel UHD 620 school PCs: cheap shaders, no shadow maps, stay near 24 fps or better. Keep the added disk well under 2 MB; run `npm run optimize-models` on any new `.glb`.
- Every light must exist before a first shader compile; use `src/core/precompile.js` as other scenes do. Meshes the code finds by name must match the `KEEP_SEPARATE` patterns or `mergeStatic` will join them.
- Hard-refresh when testing (`.glb` files are cached).

## Do not

- Show any face (in the flashback or the photo), or say anything about ARIA's nature, the scans, the cycles, or Voss's mother. Passage A and B are the only content spoken clearly.
- Change the decisions in plan section 0.4.
- Build Flashbacks 2 or 3, Level 3 changes, the choice, endings or credits.
- Commit or push. Leave the changes in the working tree for review.

## Done means (plan section 0.3)

Run `npm run build`, then play it in a real browser at normal speed: Level 1 cannot be finished without looking at the photo; the flashback plays once; Enter skips it; the lift then departs; no face is visible; movement looks natural; nothing is left behind after disposal. Then report: what you built and where, anything you could not verify (say so plainly), any decision you had to make that the plan did not cover, and the frame rate you saw.
