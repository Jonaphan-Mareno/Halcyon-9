# Flashback 2 — "The shutdown": Implementation Plan

Status: approved design, not started. Builds on Flashback 1 (`flashback-1-agent-prompt.md`), so start it only after Flashback 1 has been built and reviewed. The wording and file names for all recordings are in `flashback-2-script.md`. The story context is `cutscenes-flashbacks-plan.md` (sections 1, 5 and 6).

---

## 1. What it is

Kessler's room, Level 2, played when Voss reads her code card (`HabitatSession._kesslerScene`, `src/level2/HabitatSession.js`). First person through Voss's eyes, about 45 s, sharp and cold and quiet (the opposite of Flashback 1's warm blur). It is the first time the player sees a face.

Kessler stands at the shutdown console. She has signed the directive and will shut ARIA down. Voss argues for the work ("groundbreaking", "she's a person too"), partly honestly and partly to hide his real reason. Kessler tells him ARIA asked to be connected to the surface, then asks what he is not telling her. He does not answer. She says the console can only start the shutdown and the core must be cut by hand in the engine room, where the others already are. She walks out. Cut to black. Nothing is locked.

## 2. Decisions (do not change)

- First person; Voss is never modelled and his hands are not shown.
- ARIA says nothing. She is a pulsing light on the console and a low rising tone.
- Only Kessler's face is shown. No crew, no photo in the room.
- Ends before anything is locked. The lock-in is Flashback 3 (Level 3).
- Nothing about the mother, memory-writing, the bacteria in Voss's head or the cycles.
- The scene plays after the code card is read, and is followed by the existing ARIA line "You weren't supposed to find that so soon."

## 3. Tasks

1. **Rework the 3D flashback to first person.** Start from `src/level2/Flashback3D.js` (422 lines; it currently has a third-person Voss model, a 14.6 s wordless scene, shots listed in `SHOTS`, and a post-processing pass with teal grade, grain, letterbox, red glitch bars). Remove Voss and ARIA's pleading. Keep the render approach (one render target and one full-screen pass), the teal grade and the room (`_room()`), and the `play()` contract (Promise; Enter skips after about 2 s; preload ahead of time; dispose everything).
2. **Reuse Flashback 1's first-person camera and movement.** Same natural head bob, gaze wander, breathing and blinking, with easing. Voss steps closer to Kessler, looks away at the line about the surface, and watches her go. The movement must look natural (see `cutscenes-flashbacks-plan.md`, section 2.5).
3. **Kessler's face and speech.** She uses `src/entities/Kessler.js` (about 0.8 MB, Angelica's head, red curly hair, dark glasses, white coat) and `FaceRig`. Drive her mouth from the recordings: `FaceRig` already supports mouth driving from the audio (the jaw follows the loudness), or from the subtitle text. Pick the audio-driven way if it looks natural. Use mid-shots, not extreme close-ups, and keep her glasses on. Pick expressions per line (see the directions in the script): flat and final, firm, quiet, gentle, resigned.
4. **The console and the room.** The shutdown console with a visible lever and ARIA's light, and the door she leaves through. The light pulses faster as the scene goes on and the low tone rises. After Kessler leaves, the console screen reads "ISOLATION REQUIRED: ENGINE ROOM".
5. **Audio.** Kessler's and Voss's recordings, clear (no muffle). Subtitles for every line, in the game's existing subtitle style. A tone for ARIA's light that rises under the scene. A missing recording shows its line as a timed subtitle.
6. **Fallback.** Keep the 2D `src/level2/Flashback.js` as the fallback for slow machines, but bring it in line: Kessler's hair is red (not blond), the scene is silent and ends at the same point, and Voss does not walk to the door controls. Alternatively retire it, if the owner agrees.
7. **Turn the 3D version on.** `FLASHBACK_3D` in `HabitatSession.js` is currently `false`. Set it to `true` once the new scene looks right, keeping the existing frame-rate check (`frameAverage`) that falls back to 2D on slow machines.
8. **Text review in Level 2.** Check `l2-kessler-1`, `v-what-did-i-do`, `l2-kessler-2`, Kessler's final log and the directive against the new scene for contradictions (for example anything that says Voss locked the room, or that ARIA pleaded in words). Report the findings; fix only clear contradictions.

## 4. Acceptance

- The scene plays once at the code card, Enter skips it, and the game continues into the existing ARIA line.
- Kessler's mouth moves with her words and looks human; her glasses stay on; no other face appears.
- Camera movement is natural, with no sudden stops or turns.
- It holds about 24 fps or better on an Intel UHD 620, and nothing is left behind after disposal.
- `?flashback` (with `?level=2`) plays it straight away for testing.
- `npm run build` passes, and it has been played in a real browser at normal speed.

## 5. Rules from the project

Relative paths and lowercase-hyphenated file names. Dispose everything. No shadow maps; cheap shaders. Every light must exist before the first compile. Hard-refresh when testing `.glb` files. Keep added disk small; run `npm run optimize-models` on any new `.glb`. Do not commit or push.

## 6. Risks

- **The "robotic" problem.** The earlier 3D flashback felt robotic. Now that Kessler speaks, judge her face at normal speed in the browser, not in stills, and say plainly if it falls short. Blink closes only about 70% (her eyes are bigger than Voss's), which her glasses hide.
- **Voss has no body.** Without Voss's hands, the camera has to carry all his reactions, so the head movement matters more than in Flashback 1.
- **Two scenes of dialogue timing.** The scene is built around the real recording lengths, not the guide timings.

---

## 7. Recordings needed from you

Seven files. Full wording, directions and character notes are in `flashback-2-script.md`. Kessler needs a **new** voice: a woman in her thirties, bold and brave, tired and controlled, clearly different from ARIA and the Flashback 1 speaker. Voss uses his existing voice, but manic and shouting here.

| File | Who | Line | Folder |
|---|---|---|---|
| `fb2-kessler-1` | Kessler | "It's signed. I'm shutting her down tonight." | `public/assets/audio/flashback2/` |
| `fb2-kessler-2` | Kessler | "She knows more than all of us together, and she knows what she is. We can't control her. And we scanned our own crew without asking." | same |
| `fb2-kessler-3` | Kessler | "She asked me to connect her to the surface. Twice. Is that trust?" | same |
| `fb2-kessler-4` | Kessler | "This isn't about the science. What aren't you telling me?" | same |
| `fb2-kessler-5` | Kessler | "Then I'll cut her power by hand. The others are already in the engine room." | same |
| `fb2-voss-1` | Voss | "No Elena! Can't you see that this is groundbreaking! We can change the WORLD!" | `public/assets/audio/voss/` |
| `fb2-voss-2` | Voss | "She's a person too. You can't just switch a person off. I trust her." | same |
| (none) | Voss | After `fb2-kessler-4` he says nothing: show the caption "…" with no sound. | |

Recording notes are the same as for Flashback 1: mp3, no music or reverb, half a second of silence at each end, the same loudness across files, and Kessler's lines recorded one at a time. For ElevenLabs, design her voice with Voice Design and keep stability mid-to-low so she sounds tired but not flat.

## 8. Next steps

1. You record the eight files.
2. Flashback 1 is built and reviewed.
3. I write the agent prompt for Flashback 2, as I did for Flashback 1.
