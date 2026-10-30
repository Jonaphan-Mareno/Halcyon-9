# The confrontation: report

This is the Level 3 confrontation (Scene A of `docs/ending-confrontation-script.md`) and the "Connect ARIA to the mainland?" choice that follows it, built as `docs/confrontation-scene-agent-prompt.md` asked. Nothing is committed.

**Read this first.** Everything below was checked in **headless Chrome on SwiftShader** (software WebGL), using stills, contact sheets, frame-by-frame camera traces and one full in-game run. **I have not watched it at normal speed on a GPU, and I cannot hear the recordings.** The timing comes from the files' measured lengths, not from listening to the performances. Before judging the acting, please play it once in a real browser (section 1).

## 1. How to play it

- **In the game:** `npm run dev`, then open `http://localhost:5173/?level=3&confrontation` (hard refresh) and click WAKE UP. This skips to the relay with the kraken beaten and starts the scene at once.
- **With the slow-machine stills forced:** `?level=3&confrontation=still`.
- **On its own, at normal speed with sound:** `http://localhost:5173/scripts/confrontation/preview.html?play`, then click once (the browser wants a click before it plays sound). This is the quickest way to watch it.
- **Enter**, after the first 2 s, skips to the choice. The screen goes to black, the rest of the scene is run out of sight so every prop ends in the right state, and the picture comes back up on the high wide shot.

**Where it is called from (already wired).** `Trench._openHack` (`src/level3/Trench.js`) is where the uplink hack is won. It plays the existing lead-in, then starts the scene:

```js
this.s.say('relayWon').then((done) => { if (done) this.s.startConfrontation?.(); });
```

`DeckSession.startConfrontation()` (`src/level3/DeckSession.js`) is the single entry point. It goes to black, plays the scene, and passes the answer to `onChoice`. The scene is preloaded as he enters the relay room (`this.s.preloadConfrontation?.()` in `Trench`). That preload loads Voss's acting clips and a fresh copy of him, which takes a second or two.

## 2. What was reused and what was built

**Reused:**

- **ARIA's face:** `AriaHead` and the hologram shader from `AriaManager`. I copied the shader and added three things:
  - a brightness control (for her flickers and the dimming at the choice);
  - a scanline tear (hostile at full, and her crying);
  - a plane with 48 rows of vertices, so the tear can shear it.
- **Voss:** `VossActor` and its clips from `src/entities/vossActing.js`, and his `FaceRig` (`actor.face`).
- **The suit:** `dressInSuit(..., { empty: true })` from `DiveSuit.js`.
- **The scene contract:** the same as `LockFlashback.js`:
  - `preload`, `warm`, `play()` returning a Promise, and `render()` drawing the scene instead of the level;
  - the post pass, subtitles in the flashbacks' style, the skip hint, and the slow-machine stills;
  - `precompile`.
- **The choice:** the pause menu's confirm panel (`pm-panel`, `pm-confirm-text`, `pm-btn` from `pause.css`).
- **Sound:** Level 3's own CC0 clips.

**Not reused: the relay room in `Works.js`.** In the game that room is **flooded**: he swims in it (`setSwimming(true)` in `?relay`). He has to be out of the suit for this scene, with his face, hair and gash showing. So `src/level3/Confrontation.js` builds a small **dry control room** in code:

- a corridor and door at the south, with a cable reel at the corridor's end;
- the projector at the north, with ARIA floating over it in a dark recess and the lit **UPLINK** port in its front;
- the console on his left that he leans on;
- racks along the east wall.

It uses boxes merged by material, Lambert shading and six lights, all created before the compile.

**Built:**

- **`Confrontation.js`:**
  - the room and the hologram;
  - Voss: the walk in along a path, face acting from a timeline table, an eye line, hand tracks and body work done through `onAfterMixer`;
  - the cable;
  - the suit;
  - the hand-directed camera;
  - the sound and the volume balance;
  - the choice and the skip.
- **The cable:**
  - from his fist to the plug, a Verlet rope that stays off the floor and out of his right leg and hips; its last segment *is* the plug, so on the floor it tips over;
  - from his fist back to the reel, a tube that runs down behind him and along the floor where he walked, out of the door;
  - both tubes are rebuilt in place every frame.
- **`AriaHead.js`:** the two new states, `broken` and `tender`, with the script's starting values. I did not tune them by eye; `broken` is shown at beats 8 and 9. I also added `attachAnalyser()`. No existing state was changed.
- **`AriaManager.js`:** a `headReady` promise. Nothing else changed.
- **Dev scripts in `scripts/confrontation/`:**
  - `loudness.mjs` and `.html`: measures the recordings' loudness;
  - `preview.html`: the scene on its own;
  - `check.mjs`: frames and contact sheets at any time, with a close-up camera override;
  - `trace.mjs`: camera speed frame by frame, which finds snaps;
  - `prof.mjs`: CPU cost per frame;
  - `game.mjs`: the full in-game run.

**The suit and the join with the lead-in.** The lead-in (`relayWon`) plays in the flooded room with him in the suit. The scene then fades to black and opens in the dry room, with the suit already off and slumped against the wall by the door, its helmet beside it. So the cut to black *is* the change. **It needs a short beat of him taking the suit off**, and a reason the room is dry: either a different room, or an air pocket. That belongs to the lead-in, which I did not rebuild.

## 3. Beat by beat

| # | State | Notes, and what to improve |
|---|---|---|
| 1 | Done, with a compromise | The walk in works: along the corridor with his left hand on the wall, into the room, planting his feet in front of her. He holds a `stare(3)`, and the first blink lands after her line. **Compromise:** the camera does not pass the suit on the way in. From behind him, the corner by the door stays behind the camera. Two attempts to pan onto it read as a lurch, so the suit is seen in the backgrounds of beats 4, 11 and 13 instead. Moving the door or the suit would fix it. |
| 2 | Done | Low side angle. The cable rises toward the port, stops, and his grip tightens. He glances at the port, then back at her, and blinks once, slowly. |
| 3 | Done | Two-shot. She smiles through the giggle, then turns guarded, her gaze sliding away. His shoulders square and his weight goes back. His face is `calm`, low and level. |
| 4 | Done | A hard push in on his face as he cuts her off, and one step forward (`walkTo`). `arguing`, quiet. |
| 5 | Done | 5.9 s of silence: a tight hold on her face (`robotic`, one hard flicker with a zap), then a slow drift back over his shoulder. The cable rattles: his hand trembles, the plug shakes, and you hear ticks. |
| 6 | Done | Over the shoulder. His left hand goes to the gash, comes away round the side of his head, and his darkened fingertips are held up and looked at before he looks back at her. `strained`. **Check:** the blood is two tiny dark dots on his fingertips. In a contact sheet they are too small to see, so they probably need to be bigger. |
| 7 | Done | A whip in on her past his right side, with the camera shaking. `hostile`, red, the scanlines tearing. He flinches (`Stagger`) with a `tic()`. |
| 8 | Done | A very slow push on her. `broken`, pale, her light stuttering, the room dimmed. |
| 9 | Done | Two-shot from high, with him low in the frame. "Angry, then it cracks". The cable sinks until the plug lies on the floor, with a knock (seen close up: it lies by his foot). |
| 10 | Done | Close on her. She leans in, hostile, glitching like crying. |
| 11 | Done, with a compromise | He staggers toward the console, his left hand settles onto it and his weight comes on, and he heaves for breath. His eyes close, and the hum goes quiet. On "Ugh..." the heel of his hand goes to his eyes, then back to the console. The cable is pulled up off the floor, white-knuckled. **Compromise:** `Stagger` is a mild flinch, not a real stagger, so the step is a small slide of 11 cm toward the console during the clip. Watch for foot sliding there. |
| 12 | Done | Wider two-shot: him on the left, her on the right. His eyes stay on the floor until she has finished, then his head turns slowly to her. She goes `hostile` to `directive`. |
| 13 | Done | Medium on him. "I-", then his mouth stays a little open. His shoulders drop and he shakes his head. A 3 s beat. |
| 14 | Done | Back to her, wide, pushing in. The room and her light go cold (`deadpan`). He looks at his own left hand, and the tremor is at its worst. 1.7 s of silence on her face as the hum falls away. |
| 15 | Done | An eased 3.2 s pull to the high wide shot. The plug hangs in his hand, he looks at the glowing port, and her light dims slowly while the prompt is up. |

**Camera.** All moves are eased, and every jump in the trace is a deliberate cut. The fastest move without a cut is the beat 7 whip, a smooth bell-shaped curve peaking at about 6 m/s. Three snaps found by the trace were fixed:

- a jump at the door, where the corridor and room clamps disagreed;
- a 180° drift in beat 5;
- the whip passing through his head.

The camera is clamped to the room and corridor, kept out of the furniture, and pushed out of a capsule around his body, so it can never pass through him.

**Things to watch for when you play it:**

- **Robotic Voss:** there are weight shifts, breathing and head drift from the acting layer, plus the squared shoulders, the lean and the drop.
- **Foot sliding:** the stop and the beat 11 slide.
- **Hands passing through things:** the eye rub (the hand in front of his face), and the hand on the console (it looked right in a close-up).
- **The cable crossing his body:** the rope stays out of his right leg, but the trailing part is only routed behind him, not checked against him.
- **Lip sync:** both mouths follow analysers on the recordings, but I could not judge the sync by ear.

## 4. Audio

**Files.** All 15 Scene A files were found, including the optional `end-aria-1`. They are in **`public/assets/audio/aria/`** and **`public/assets/audio/voss/`**, not in `audio/ending/` as the prompt said. The code uses those paths. No line is on a timed-subtitle fallback.

The fallback still exists (`FALLBACK_LENGTHS` in `Confrontation.js`, at 2.4 words a second): a missing file shows its subtitle for that long, and plays once the file is added. If `end-aria-1` is missing, its line is left out entirely, with no subtitle. Bracketed directions are not subtitled.

**The timeline** is built from where each recording's speech ends, measured at load. The files have up to 0.4 s of silence at their tails. With the real lengths the scene runs **about 1 min 25 s to the prompt**, not the script's estimated 2 min 15 s. I did not pad the scene to reach that; the silences at beats 5 and 13 are held as asked.

**Loudness and gains.** I measured integrated loudness (BS.1770, gated) with `node scripts/confrontation/loudness.mjs`:

- Voss averages −20.2 LUFS and ARIA −17.5. The target is their mean, −18.9.
- Voss is mainly quieter on `end-voss-1`, `-7` and `-8`. His shouts were already loud.

The gains are in one table, **`VOICE_GAIN_DB`** in `Confrontation.js`, with the before and after values in a comment:

- The shouts sit 1.5 dB over the target, and the broken or spent takes 0.5 to 3 dB under it.
- No two neighbouring lines are more than about 3 dB apart.
- `end-voss-8` ("I-") is lifted 6.4 dB, to −21.9.

Each line has its own gain node. They feed one bus with a gentle compressor (−20 dB, 3:1), a limiter (−3 dB, 20:1) and 1.5 dB of makeup. The mouths read the signal before the gains.

**No extra loudness from the hologram chain.** ARIA's lines here do **not** go through `AriaHead.attachAudio`, whose fixed 1.8× gain would undo the balance. Effects go on their own bus under the voices (effects volume × 0.8).

**Sound effects:**

- Reused CC0 clips (now credited in `CREDITS.md`): the machine hum, a click (the rattle), a clank (the plug landing), a punch and a slide (his steps and the dragged foot).
- Synthesised: the hologram's zap, the plug scraping the floor, and the low hum's tone.

The hum is quiet at beat 11, comes back at 12, and falls to almost nothing for the choice.

## 5. Performance

- **CPU:** about 1 ms of scene logic per frame (measured with `prof.mjs`, across the whole timeline).
- **GPU:** one skinned Voss, one static skinned suit, about 30 draw calls, six point lights, no shadows, plus ARIA's head rendered into a 512×288 target.
- **Not measured:** the frame rate on a real GPU or the Intel UHD 620. The only figure I have is SwiftShader's, about 6 fps, which is meaningless for a GPU.
- **The fallback works in the game.** On SwiftShader the scene judged itself slow in its first seconds and switched to stills: a new picture, with ARIA's face, only at each new line or beat, while the voices, sound and subtitles carried on. The test reported 1,117 frames with no errors.
- **When it falls back:** under about 22 fps in its first 2.5 s, or under about 18 fps for 2 s later on. It also starts as stills if the level itself was already running slowly.

## 6. Hooks left for the owner

- **`DeckSession.onChoice(choice /* 'yes' | 'no' */)`:** marked `TODO(owner)`. For now it only logs the choice.
  - "Yes" should play Scene B; "No" is not written.
  - When it is called, the scene is still drawing its high wide shot, the game state is `'FLASHBACK'`, the level's sound is muted and the music is held at silence.
  - The ending takes over from there. It must call `this.confrontation.dispose()`, restore the state, and unmute.
- **Scene B (the Save-ARIA ending):** not built. Useful pieces:
  - `tender` is in `AriaHead`;
  - the cable rope, the plug and the port are in `Confrontation.js`;
  - Voss is `confrontation.actor`; the report for the acting agent lists the kneel and sit poses.
- **The "No" ending, the narration, the restored photo and the credits hand-off:** not built.
- **The lead-in:** needs the beat of him taking the suit off, and the dry room (see section 2).

## Changes outside the new files

- **`src/entities/AriaHead.js`:** the states `broken` and `tender`, and `attachAnalyser()`.
- **`src/entities/AriaManager.js`:** `headReady`.
- **`src/level3/DeckSession.js`:**
  - the import;
  - `?confrontation`;
  - the render hook;
  - `preloadConfrontation()`, `startConfrontation()` and `onChoice()`;
  - disposal.
- **`src/level3/Trench.js`:** the start after `relayWon`, and the preload on entering the room.
- **`CREDITS.md`:** the clips the scene uses.

The production build (`vite build`) passes. The game and the earlier flashbacks were not otherwise touched. Apart from the in-game run with `?level=3&confrontation`, I did not replay Levels 1 to 3.

## Changes after the first viewing

- **The hand on his head (beat 6):** the palm now faces his head, so from behind you see the back of his hand, with the fingertips on the gash. The palm used to face away from his head.
- **Subtitles:** the speaker's name is on the same line as the words, and both sit centred inside the bottom bar. "Enter: skip" moved to the top bar.
- **ARIA flashes red when she's angry.** In the `hostile` and `directive` states she flashes red as each line starts. While she speaks, the red follows how loud her voice is, and it fades back afterwards. The red covers her face, halo, beam and light. Without sound (fallback lengths), it pulses on its own instead.
- **Cut-offs:** the `CUTS` table names the lines that cut in on the line before. The interrupting line starts that many seconds before the other line's speech ends. The other line fades out over 40 ms at that point, and its mouth and subtitle stop there. For this, the start of each recording's speech is now measured, as its end already was. In the table now: `v2` "Aria." over "uplin-" (0.3 s), and `a6` "Talk?" over "If we just talked..." (0.3 s). "I-" (`v8`) is not cut in on, because beat 13's three-second silence is in the script.
- **More cut-offs, and two new takes (owner's changes):**
  - Voss now cuts in on ARIA's first "uplin-" (`v1`). Her first line is timed so that it ends just after he lifts the cable, at 11.3 s. It starts at 6.9 s, while he is still walking in.
  - `end-voss-6` is now "Aria, I planned on releasing my teammates after a few more days..." and `end-voss-8` is "I'm sure I-". ARIA cuts in on "I-" (`a7`), so the three-second pause in beat 13 is gone. His shoulders drop, he shakes his head and he looks at his hand over her line, and the picture cuts to her on her first word.
  - Both new takes are quieter than the old ones, so their gains were measured again (+3.0 and +5.3 dB).
  - The scene now runs 80.2 s to the prompt.
- **ARIA's last line flashes red** too ("Just make a choice already…"): it flashes as she cuts in and follows her voice, even though the room is going cold.
- **The choice has a 15-second timer; if time runs out, it is Yes** (`CHOICE_SECONDS`).
  - The clock runs on frame time, so it stops whenever the game stops drawing (pause, hidden tab). Each frame counts for at most 0.25 s, so slow machines keep true time.
  - A thin bar under the question drains from both ends toward the middle.
  - The buttons beat like a heart: they flash on each beat (lub, dub) and dim between beats. The heart rate rises from 54 to 132 a minute and the dimming gets deeper as time runs out, with a quiet heartbeat (`_thump`) on the effects bus.
  - 6 s from the end, the bar, the panel's border and the Yes button switch to ARIA's red within about a second. Her face pulses red on the beat, and the No button fades.
  - When the time runs out, Yes lights up solid and is chosen. `onChoice('yes')` is called as for a click.
  - The timer also runs when there is no UI layer, so the scene still ends.
