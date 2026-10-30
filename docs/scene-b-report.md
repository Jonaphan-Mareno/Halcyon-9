# Scene B, the narration and the credits: report

This is the "Save ARIA" ending (Scene B of `docs/ending-confrontation-script.md`), the narration after it and the hand-off to the credits, built as `docs/scene-b-agent-prompt.md` asked. Nothing is committed.

**Read this first.** I checked everything with contact sheets, numbers and camera traces in headless Chrome, plus one full run in the game. I measured the frame rate on this machine's own GPU. **I have not watched it at normal speed, and I cannot hear the recordings.** The timing comes from the files' measured lengths and pauses, not from listening to the performances. Please play it once in a real browser with sound before judging the acting (section 1).

## 1. How to play it

| Link (`npm run dev`, hard refresh) | What it plays |
|---|---|
| `http://localhost:5173/?level=3&ending=yes`, then WAKE UP | The real path. The confrontation runs through out of sight (as its skip does), the prompt shows for 1.4 s, Yes is chosen, then Scene B, the narration and the credits. |
| `http://localhost:5173/?ending=narration`, then click | Only the narration, then the credits. |
| `http://localhost:5173/scripts/scene-b/preview.html?play`, then click | Scene B on its own, with sound. Add `&narration` to go on into the narration. |
| `http://localhost:5173/scripts/scene-b/narration.html`, then click | The narration on its own. |

- **Enter**, after Scene B's first 2 s, goes to black and on to the narration.
- **Enter** during the narration goes straight to the credits.
- In the credits, Enter, Esc or CLOSE closes them; they also close by themselves 4 s after the roll ends.

**How it is reached.** `DeckSession.onChoice('yes')` calls `playEnding()`. Scene B continues in the confrontation's room from its high wide shot, with the same Voss, ARIA, cable, port, sound and look; nothing is rebuilt and there is no cut away. Scene B and the narration are readied while the confrontation plays (`_preloadEnding()`, called just after `scene.play()`).

**The order at the end**, as the confrontation report asked:

1. Scene B goes to black.
2. The narration plays over black.
3. The credits come up, and the narration and Scene B are freed behind them.
4. When the credits close: `confrontation.dispose()`, the game state back to `'PLAYING'`, the level unmuted.
5. `_afterCredits()`, a `TODO(owner)` that for now reloads to the title.

**"No"** only logs the choice. A marked `TODO(owner)` in `onChoice` says where it goes.

## 2. What was reused and what was built

**Reused from the confrontation:**

- the room, Voss (`conf.actor`), his face and reaches;
- the cable's rope and tubes, the plug and the port;
- ARIA's head, her hologram shader and its uniforms (brightness, tear, red);
- the camera, the render target and the post pass;
- the subtitle bar and skip hint;
- the sound context, effects bus and hum;
- the `_click`, `_thump`, `_knock`, `_footstep` and `_zap` sounds;
- the slow-machine judgement (`conf._judge`, `conf.still`).

**New files:**

- **`src/level3/SceneB.js`:** the scene.
- **`src/level3/vossPoses.js`:** poses the clips don't have, built on a held clip in a hook: the kneel, the lean back against the projector, the hand opening.
- **`src/level3/endingAudio.js`:** the dialogue bus, with the confrontation's exact settings, plus file decoding and speech edges and pauses.
- **`src/level3/EndingNarration.js`:** the narration and its drawn pictures.
- **`src/ui/EndCredits.js`:** the credits roll.

**ARIA's exit, built in the hologram shader.** At preload, Scene B derives its own copy of the confrontation's hologram material, sharing the same uniform objects, and adds the drain to it. It swaps the copy onto a finer plane (24 × 48 rather than 1 × 48) when the scene starts. All its shaders are compiled at preload; there are no new lights.

- **The flash.** At 100%: a sprite at the port, a white lift in the post pass, a surge in ARIA's light and the room's.
- **The cut.** Her face is frozen mid-word, and her line is cut with a 12 ms ramp.
- **The dots let go.** They go from the bottom of her face up to the top of her head, grainy and from the sides in. Each brightens as it is about to go. Her face stretches down and narrows toward the port as it goes.
- **The sand.** One point per hologram dot (128 × 72 = 9,216, drawn only where the face is lit). Each falls from where its dot was into the plug, faster and faster, gathering into a rope. It then runs along the cable as it lies at that moment: down from the plug, across the floor and out toward the door, which is out of the bottom of the frame.
- **The silence.** The hum swells while she goes and stops when the last light has gone, about 3.3 s after the flash. Then there is nothing, for 3.3 s, before he falls.

**The loading bar.** It is drawn in the hologram's own dot-matrix style under her face. It climbs unevenly:

| Stretch | Time | What happens |
|---|---|---|
| 1 to 40% | 6.2 s | He sits down |
| Wait at 40% | | His line, `end-voss-12` |
| 40 to 80% | 5.0 s | His head goes back and his hand opens |
| Wait at 80% | | `end-voss-13` |
| 80 to 100% | ≥ 4.6 s | Her line is placed so that its cut-off lands on 100% |

The bar waits for the lines, not the reverse. In all, it climbs for about 16 s, out of about 29 s on screen. There is a very soft blip every 10%, and the bar drains away first when she goes.

**The kneel (beat 1).** There is no kneeling clip. `StandUp` passes through a squat, and `FallForward` at 0.75 s is a sideways lunge on one knee. So the kneel is built on `SitDown` held at its crouch (driven frame by frame, slowly, from its standing frames). In a pose hook:

1. the pelvis is lowered to 0.6 m;
2. a two-bone IK puts both knees on the floor, the shins flat behind, up on his toes;
3. the back is eased to a set lean: nearly upright while he talks, over the port while he plugs in.

One bug was found and fixed by measuring: the spine turns move the measured lean only about half as much, so it is corrected in three passes. His left hand rests on his thigh throughout, because otherwise the crouch clip's arm swings up to horizontal.

**I added a hook stage to `vossActing.js`:** `onPose(fn)`. It runs after the clips but before the reaches, so the hands land on the body where the kneel puts it. The existing `onAfterMixer` runs after the reaches, which made it unusable for this. No clip was changed.

**The sit and the fall.** The sit is `SitDown` to `SitIdle`, his back against the projector beside the port. He is turned a little west so that `FallForward@sit` takes him out into the room, clear of the racks. `leanBack` tips his back and head against the panel. The fall is `FallForward` from the seat, with his right hand opening slowly at the end.

**The narration pictures.**

- **Line 2:** the prologue's `photo1` ("My little Voss", his mother young), slowly zooming in.
- **Line 3 (changed 2026-10-30, at the owner's request):** drawn live by `src/level3/ConferenceScene.js`. It is Flashback 1's conference room, with ARIA's face on its screen as hologram dots. Six new people are in the room, three men and three women in suits and lab coats, nobody from the crew (`public/assets/models/conf-man-1` to `-3` and `conf-woman-1` to `-3`, 1.9 MB in all, built by `Blender/scripts/build_conference_people.py`). On her caption the picture cuts to their faces: brows up, mouths open, two hands to mouths, one man half out of his chair, two turning to a neighbour. It has its own small renderer, compiled during the opening black: 60 fps at 1280 × 720 on this machine's Intel UHD. If it cannot start, the line plays over black. This replaces the planned hall renders (`conference-wide.webp` and `conference-react.webp`), which were never made and left the line black; `render_ending_conference.py` is deleted.
- **Line 4:** three warm, backlit reunions, all silhouettes seen from behind:
  - an old man and his daughter on a bench;
  - a grandmother between her son and her granddaughter;
  - an old hand and a young hand reaching for each other.

  Then, cut at the **measured pause** in the recording (before "and his mother..."), the old woman at a window in morning light. She turns and smiles; her face is a few stylised strokes. The hold after the line is about a second.
- **Line 5:** the trolling page in an iframe, restarted on the line's cue, its "click to replay" label removed. It works in the dev server and in `vite build`, because it is served from `public/`.
- **Closing line:** the restored crew photo (section 6) comes in on "Well, wasn't that a wonderful story." It is held 4 s, then black, then the credits.

## 3. Beat by beat

**Scene B** runs about 1 min 18 s from the click on Yes to black.

| # | State | Notes, and what to improve |
|---|---|---|
| 1 | Done, with a compromise | "Close on the prompt, then the button" is a 1.2 s zoom of the prompt panel onto Yes. Then a cut to him breathing out, with a breath sound and his shoulders dropping further. He walks to the port, turns square to it as he bends (his feet pivot about 0.5 rad), and lowers himself onto his knees over about 3 s. **The riskiest moment.** In stills the knees are on the floor and the back reads upright. The crouch-to-kneel blend has not been watched at speed: please judge it for rag-doll. |
| 2 | Done | Two-shot from his side: him kneeling in profile, her face above. A small laugh through the nose. Her face is seen at an angle from here. |
| 3 | Done | Hold on her, low, from his eye line. `broken`, with irregular dips in her light, a few scanline tears and one soft zap: trying not to cry. |
| 4 | Done, with a compromise | Seen from his left, low by the projector. Both hands go to it: the left takes the plug from above, the right holds the cable, with slack between them. The first try knocks on the collar's edge (a click) and comes back. He looks up at her, says his line and nods, and the second try goes in. **Compromise:** the left hand holds the plug's back end; its fingers do not wrap the housing convincingly at the closest framing. |
| 5 | Done, with a compromise | Insert from below the hands: the plug's gold ferrule goes into the lit ring, with a click and a gentle chime. Then a cut to his right side: the left hand comes away, the right opens, and the cable falls from the port to the floor with a knock. **Compromise:** the cable is a shade lighter in Scene B (`0x323a40`), or it disappears against the projector's black front. The bar fades up in her hologram. |
| 6 | Done, with a compromise | She watches the bar, then him. **The turn from kneeling to sitting (180°) happens while the picture is on her**; the cut back lands on the last of `SitDown` into `SitIdle`. Then a slow push on him, knees up, head bowed. Doing that turn on camera would need a clip. |
| 7 | Done | Two-shot: him at the projector's foot, her and the bar above. His back and head ease back against the panel, and his right hand goes onto the floor beside him, open, palm up. A real smile, and a laugh on the giggle, which is found from the pauses in the recording. |
| 8 | Done | A hold on the bar and her, then a low frontal shot of her with him in the corner, looking up. `tender`, then "touched" (a bigger smile, set on top of `tender`). Her line is cut off exactly at 100%. |
| 9 | Done | The flash and the drain (section 2), framed with her face at the top and the port at the bottom. His eyes follow the light down, then come back to the empty terminal in a close shot, in silence. **Check:** in the wide shot his legs hide much of the light's run along the floor, so mostly its fall into the port is seen. |
| 10 | Done | A cut to his right side. He tips from the seat to his knees and falls forward (`FallForward@sit`), then lies still. The camera pulls back and up slowly. His "Ahh" is ridden down 5.2 dB (section 4). |
| 11 | Done | The picture fades to black as he speaks, black about half a second after "I wonder..." starts. His right hand opens slowly through the fade; it is the last movement. |

**The narration** runs about 51 s.

| Line | State | Notes |
|---|---|---|
| 1 | Done | 3 s of black and silence, then the line over black. |
| 2 | Done | The Polaroid, slowly closer. |
| 3 | Done | The conference room and its screen. "...and how it can cure dementia." is the narrator's own line (`end-narrator-curedementia`, added by the owner, gain -2.9 dB). The cut to their shocked faces comes halfway through it. |
| 4 | Done | Reunions while "countless people bring back a lifetime of memories". The old woman arrives at the pause, before "his mother was the first person to be cured", and turns and smiles on it. |
| 5 | Done | The trolling, from the line's start. All 32 cards come down in about 5 s, and the closing line follows 0.7 s after line 5 ends. |
| Closing | Done | The photo comes in on the line and is held after it, then black, then the credits. |

**Camera.** All moves are eased. The trace (`scripts/scene-b/trace.mjs`) found two snaps, both fixed:

- shot 1 followed his facing as the walk turned him (13.6 m/s);
- the pull-back eased in from a close-up (2.3 m/s); it is now a cut.

The fastest move inside any shot is now 0.8 m/s, as he walks. All other jumps are cuts.

## 4. The audio

**Files.**

- All seven Scene B recordings and all six narrator files were found.
- `end-aria-10` is no longer used: that line is now the narrator's (`end-narrator-curedementia`).
- No line is on a subtitle fallback. The fallbacks still exist (`FALLBACK_B` in `SceneB.js`, `NARRATION_FALLBACK` in `EndingNarration.js`, at 2.4 words a second): a missing file shows its subtitle for that long.
- Bracketed directions are never subtitled. Two lines change subtitle at their measured pause: `end-voss-13` at the giggle, `end-voss-14` before "I wonder...".

**Loudness.** Measured with `scripts/confrontation/loudness.mjs` (BS.1770, gated). I extended it to the new files, and it now also profiles a file's pauses. The gains are in `VOICE_GAIN_DB` (`Confrontation.js`), with the before and after values in its comment. They go through the same bus as the confrontation: compressor −20 dB 3:1, 1.5 dB makeup, limiter −3 dB.

| Line | Measured (LUFS) | Gain (dB) | After (LUFS) |
|---|---|---|---|
| `end-voss-9` | −27.4 | +7.0 | −20.4 |
| `end-voss-10` | −28.9 | +8.5 | −20.4 |
| `end-voss-11` | −28.2 | +7.8 | −20.4 |
| `end-voss-12` | −27.6 | +7.2 | −20.4 |
| `end-voss-13` | −26.7 | +6.8 | −19.9 |
| `end-aria-8` | −27.6 | +7.7 | −19.9 |
| `end-voss-14` (after the "Ahh") | −29.5 | +8.1 | −21.4 |
| `end-voss-14`, its "Ahh" (first second) | −11.6 | −5.2 | −16.8 |
| narrator 1 to 5, `the-end` | −16.8 to −19.9 | −2.6 to +0.5 | −19.4 |

- **The Scene B takes were recorded much quieter** than Scene A's, close to a whisper. They sit at the level of Scene A's spent and broken takes (−20.4), and Voss and ARIA end up within 0.5 dB of each other.
- **`end-voss-14` opens on a loud "Ahh"** (−11.6 LUFS over its first second, against −29.5 for the rest). One gain could not fit both, so the "Ahh" is ridden down to −16.8, just over Scene A's shouts, and the last sentence sits lowest, "almost to himself".
- **Please listen** for the noise floor: the quiet takes are lifted 7 to 8.5 dB.

**Sound effects.** All are synthesised or Level 3's existing CC0 clips, already credited: the breath, the knee and body knocks, the plug's click on the collar, the click and chime of the insertion, the bar's blips, and the cable landing. The hum is the confrontation's own. **No new third-party sound**, so `CREDITS.md` needs no change from me.

## 5. The trolling page and the credits

- **The trolling page** is an iframe of `public/assets/ending/aria-troll.html`, mounted (hidden) when the narration starts. On its cue the narration removes the "click to replay" label, takes away the page's click handler and calls the page's own `play()`, so it starts from empty. It is not clickable, and it is removed with the narration. The page itself was not changed.
- **The credits.** The game had no credits screen of its own; the only one is inside the opening menu (`intro-cinematic.js`). So `src/ui/EndCredits.js` rolls the same `CREDITS_HTML` (from `src/intro/credits.js`, so it always matches `CREDITS.md`) in the same look, under "HALCYON-9 / Thank you for playing", ending on "THE END". The wheel and the arrow keys scroll it by hand.
- **After the credits** comes `DeckSession._afterCredits()`, a `TODO(owner)`. For now it reloads to the title.

## 6. The restored photo: made

`public/assets/textures/ending/crew-photo.webp` (111 KB), made by `scripts/ending-photo/` (`node scripts/ending-photo/render.mjs`):

- It renders Flashback 1's own room at the same moment (the flash) from the same camera as the torn print.
- Everyone's real face shows, through a new opt-in `faces` option on `BriefingFlashback`. Its default is unchanged, so the flashback still blanks every face.
- Voss stands at the end of the line where the tear was, with his clean face (rested lids, no wound) and his glasses.
- All five smile through `FaceRig`. They are arm in arm, as in the flashback's pose.
- It is printed warm and clean: no stain, no tear, no water ring.

**Please check the smiles.** They go as far as the face morphs allow (gain 1.7), which is a mild smile; Park looks nearly neutral at full size. Their hands hang a little stiffly, as in the flashback's photo pose. If the photo file is missing, the narration falls back to the torn print.

## 7. Performance and the fallback

- **Measured on this machine's GPU** (`scripts/scene-b/perf.mjs`): Intel UHD Graphics (device 0x46A3, a 12th-gen laptop GPU), Chrome on D3D11, 1280 × 720.

  | Moment | fps | Slowest 5% of frames (ms) |
  |---|---|---|
  | The walk | 58.4 | 21.2 |
  | The plug | 60.4 | 17.4 |
  | The bar | 59.7 | 17.4 |
  | The drain | 60.1 | 17.1 |
  | The fall | 60.2 | 17.1 |

  60 fps is the display's cap. **Not measured on the UHD 620**, which is slower than this GPU; I expect it to hold well over 24 fps, but have not seen it.
- **What Scene B adds:** 9,216 points (cheap shaders), the bar plane, a sprite and its own post pass. There are no new lights and no shadows. The narration and credits draw a cleared black canvas under the DOM.
- **The fallback works in the game.** On SwiftShader the confrontation's judgement went to stills ("4 fps in its first seconds"). Scene B carried on in stills: a new picture at each shot, line or beat, with the voices, sound and subtitles going on as normal. The full in-game run (`scripts/scene-b/game.mjs`) went from Scene B to the narration to the credits to the title, with no errors.

## Changes of 2026-10-30, at the owner's request

- **The families (line 4):** three renders of old people and their young families hugging replace the drawn silhouettes (`Blender/scripts/render_ending_families.py`; `family-1.webp` to `-3`, 58 KB in all). The six people are built by `build_conference_people.py -- family <dir>` and do not ship. **Known limits:** their eyes stay open or half shut, since these faces' lids do not close fully, and their smiles are mild.
- **Music:** tried and removed at the owner's request; the narration has no music.
- **His mother at the window:** a smaller window, snug around her. `mom-window.webp` is now rendered (19 KB), by `Blender/scripts/render_ending_window.py`, with white hair, the teal cardigan she wore when young, a cream scarf and a smile, looking out. **Known limit:** her face is the younger head with lines drawn on, so her hair does most of the ageing.

- **ARIA's mouth:** her own lips on the conference room's screen now part and close all through her telling, by syllables with a breath between phrases (`ARIA_SCREEN` in `ConferenceScene.js`: the picture is pulled apart along the line of her mouth; nothing is drawn on top of her face). It follows no recording, since the narrator is the one heard. The picture cuts closer to the screen 3.6 s in, so it can be seen.
- **The crew photo:** it now has a Polaroid's paper under the picture, captioned "We will change the world! :)" in the prologue's handwriting (`scripts/flashback1-photo/caption.js`), and comes in slowly out of the dark. It starts as Level 1's torn print on the closing line, then heals into the whole photo over 4 s as the line ends, and is held 3.5 s more. The caption is centred. The torn print in Level 1's lift and Flashback 1 has the same caption, and the tear cuts off its end (the owner's choice).

## 8. What the owner must do

1. **Watch and listen at normal speed**, especially the kneel (beat 1), the plug in his hands (beats 4 and 5), the drain and the silence (beat 9), the fall (beat 10), the lip sync, and the levels of the quiet takes.
2. **Confirm the closing line's wording**, "Well, wasn't that a wonderful story.", which is used as the subtitle.
3. **Confirm the wording of `end-narrator-curedementia`:** the subtitle says "...and how it can cure dementia."
4. **Confirm the restored photo**, especially the smiles. To re-render it: `node scripts/ending-photo/render.mjs`.
5. **The "No" ending:** the `TODO(owner)` in `DeckSession.onChoice` (another session is planning it in `docs/scene-c-agent-prompt.md`).
6. **What comes after the credits:** `DeckSession._afterCredits()` reloads to the title for now.
7. **Add to git** the new files: `src/level3/SceneB.js`, `EndingNarration.js`, `endingAudio.js` and `vossPoses.js`, `src/ui/EndCredits.js`, `public/assets/textures/ending/`, `scripts/scene-b/` and `scripts/ending-photo/`.

## Changes outside the new files

- **`src/entities/vossActing.js`:** a new `onPose(fn)` hook stage, after the clips and before the reaches. Nothing else changed.
- **`src/level3/Confrontation.js`:** three small additions, made while another session was editing the file and coordinated with it:
  - `this._bodyHook` keeps the remover of its body hook, so Scene B can take it off;
  - the Scene B and narrator entries in `VOICE_GAIN_DB`, with their measurements;
  - a few layout constants and helpers exported at the end.

  Scene A's behaviour is unchanged.
- **`src/story/BriefingFlashback.js`:** the opt-in `faces` option; the default is unchanged.
- **`src/level3/DeckSession.js`:**
  - the imports and the `?ending=yes` test;
  - the render hook for `this.ending`;
  - `_preloadEnding()`, `_testChoice()`, `playEnding()` and `_afterCredits()`;
  - `onChoice` calling it for "yes";
  - disposal of Scene B and the narration.
- **`src/main.js`:** `?ending=narration`.
- **Dev tools:**
  - `scripts/confrontation/loudness.{mjs,html}` measure the new files, plus a pause profile;
  - `scripts/scene-b/`: preview, frames (`check.mjs`), camera trace, GPU timing, the in-game run, the pose probe, and the narration's preview and frames;
  - `scripts/ending-photo/`.

`vite build` passes. The confrontation still plays as before up to the choice: Scene B only takes over after it. I did not replay Levels 1 to 3. The in-game run started straight in the relay (`?level=3&ending=yes`).
