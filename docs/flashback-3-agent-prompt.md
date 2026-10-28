# Prompt for agent 2: Flashback 3 (and the new bodies in Flashback 1)

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`). **Start only after the crew-models agent has finished** (`docs/crew-models-agent-prompt.md`): you need `public/assets/models/lindqvist.glb`, `navarro.glb`, `park.glb`, `src/entities/CrewMember.js` and `docs/crew-models-report.md`. If they are missing, stop and tell the owner.

---

You are implementing **Flashback 3 ("The lock")** in the Halcyon-9 game (vanilla JS, Three.js, Vite), and then putting the new crew bodies into **Flashback 1**. Flashbacks 1 and 2 are already built; you build on them. Treat these as the specification:

1. `docs/flashback-3-script.md`: the scene beat by beat, all the lines (wording, direction, file names), the assumptions and the cost notes. **This is the design.** Its "Decided" section is fixed.
2. `docs/cutscenes-flashbacks-plan.md`: sections 1, 6 and 7 (story rules and context only; do not build anything else from it).
3. `docs/crew-models-report.md`: the new models, their clips, morphs and any known problems.
4. The reference implementations: `src/story/BriefingFlashback.js` (Flashback 1: first-person camera at Voss's eyes with a real walk bob, a headless Voss with arms posed by `ArmIK`, a single render target and a full-screen pass, a timeline built from the recordings' real lengths, subtitles, preload and compile, disposal) and `src/level2/Flashback3D.js` (Flashback 2: Kessler speaking, first person, her mouth driven from her recordings). Reuse their approach. If it is cleaner, extract shared first-person pieces into a module they all use, **without changing how Flashbacks 1 or 2 play**.
5. Level 3 as it is: `src/level3/DeckSession.js` (the engine-room window, `PT_Window`, the "Look through the window" interactable, `_seeCrew`, the corridor and door at its end), `src/level3/DrownedCrew.js`, `src/level3/Level3Lines.js` (`v-window-2`, `l3-window-1`).

## Part 1: Flashback 3

A first-person flashback, about 80 s, through Voss's eyes, in the engine room (shown dry and lit). Kessler confesses the scans and warns the crew about ARIA; they take her side; they cut the main feed but ARIA's light stays on; Voss, **cold** (a still camera, slow breathing, almost no sway, his gaze fixed), tells them he moved her to emergency power. They rush him; he steps out and tears out the door's lock from the corridor side (his hands visible, sparks); they hammer on the glass and plead; he says "Stay here until I finish my research" and walks away; as the door seals, Navarro calls out that there is water in the corner; he does not turn or answer (one tiny hitch in his stride). Cut to black.

- **The four crew** (Kessler, Lindqvist, Navarro, Park) are the first faces the player sees besides Kessler's in Flashback 2: show them clearly, with lip-sync driven from their recordings (`FaceRig`). Use `CrewMember` for the new three and Kessler's own model for Kessler. **Never more than two faces in close-up at once**; keep Lindqvist, Navarro and Park mostly in mid-shots; use Kessler for the closest shots. Choose expressions per line from the directions in the script.
- **ARIA says nothing:** she is only the light on the corner console. It stays on after the main feed is cut. No other voice.
- **Trigger in Level 3.** Today the player reaches the engine-room window and sees the drowned crew; Voss says in `v-window-2` "Kessler. Lindqvist. Navarro… Park. It's locked from out here. Someone shut them in." Add a **broken, sparking lock panel on the corridor side of the engine-room door** (a prop placed in code, not by rebuilding `l3-drowned.glb`) with an interactable. Using it starts the flashback. Find out how the current flow works (is the window interaction first? is the panel reachable?) and decide where the new interactable sits so that the story order works: window and the line first, then the panel. Report what you chose. The existing "Look through the window" behaviour must still work.
- **After the flashback:** fade back to the corridor and return control. **Do not write any new lines** for Voss or ARIA afterwards: the aftermath is not written yet. Leave one clearly marked hook (a TODO comment and an empty function) where it will go.
- **Sound:** synthesise or reuse the existing effects for the heavy clunk and the dying hum, the sparks, the pounding on the glass, and the muffled water; third-party sounds must be credited in `CREDITS.md`. Crowd and glass effects can be simple.
- **Recordings** are in `public/assets/audio/flashback3/` (`fb3-kessler-1…7`, `fb3-lindqvist-1…4`, `fb3-navarro-1…4`, `fb3-park-1…4`) and `public/assets/audio/voss/fb3-voss-1…4`. **They may not all be there yet:** the owner is still recording. Build the timeline from the real lengths where a file exists, and estimate the rest from the word count (about 2.4 words a second) with a clearly named fallback table; show a missing line as a timed subtitle; and play automatically once the file is added. You cannot listen to the files: take the subtitles and wording from the script and say in your report that the wording was not checked by ear.
- **Cost and performance:** Intel UHD 620 school PCs: cheap shaders, no shadow maps, about 24 fps or better with four animated faces; add a frame-rate check that falls back to a simple version (a static still and the audio with subtitles) if the machine is slow. Add nothing large to disk. Dispose everything created.
- A test link (for example `?level=3&flashback3`) that plays it straight away.

## Part 2: new bodies in Flashback 1

Replace the Voss-copy bodies of **Lindqvist, Navarro and Park** in `BriefingFlashback.js` with the new models (Kessler already has her own; the unnamed speaker stays a Voss copy). **Every face in Flashback 1 must still be hidden:** the blurred, blank-face treatment stays exactly as it is, and no face may be visible in the flashback or in the photograph. If the group photo (`scripts/flashback1-photo/`, `public/assets/textures/flashback1/briefing-photo.webp`) was rendered from the old bodies, re-render it with the new ones if that is straightforward, keeping the tear, the arm reaching into the gap and the stained-out faces; if it is not straightforward, leave the photo as it is and say so. Flashback 1's timing, audio and behaviour must not change.

## Rules from the project

- Relative paths; lowercase-hyphenated file names.
- `.dispose()` everything the scene creates, including on skip.
- Every light must exist before the first shader compile; use `src/core/precompile.js` as the other flashbacks do.
- `mergeStatic` joins meshes by material: any mesh the code finds by name must match the `KEEP_SEPARATE` / `DECK_KEEP` patterns in the session.
- Hard-refresh when testing (`.glb` files are cached).

## Do not

- Mention Voss's mother, the cycles, or what caused the water, and do not name the emergency power room or add a visit to it.
- Change the "Decided" items in the script or the lines' wording.
- Change `DrownedCrew.js` (the drowned crew) unless trivial; mention anything you notice.
- Break Flashbacks 1 or 2.
- Commit or push. Leave the changes in the working tree for review.

## Done means

Run `npm run build`, then play it in a real browser at normal speed (the test link, and through the real route in Level 3): it plays once, Enter skips it, control returns to the corridor, four faces speak with believable mouths and none looks "robotic" at normal speed, Voss's movement is natural and cold, the lock-tearing shows his hands, nothing is left behind after disposal, and Flashback 1 still plays with the new bodies and no visible face. Then report: what you built and where, where you put the trigger and why, anything you could not verify (say so plainly, in particular the faces and the recordings), any decision the script did not cover, and the frame rate you saw.
