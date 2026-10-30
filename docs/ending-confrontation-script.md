# The Final Room and the Two Endings ("Save ARIA" and "Stay"): Draft Script

DRAFT for proofreading. Story context: `cutscenes-flashbacks-plan.md` (sections 4, 6 and 8) and `flashback-3-script.md`. Your lines are kept as written; stage directions, faces, movement and sound are added around them. Anything I added to the wording is marked **(added)** so you can cut it.

Third person, unlike the flashbacks. This is the first time the player sees Voss's whole body and face acting, so the movement and face carry a lot. Voss at this point is at condition 4 (the last restore): grey, tired, the gash at the back of his head, and a body that is running out.

## Vocabulary used below

Face directions use what `FaceRig.js` already does, so each one can be set in code without new tools: the presets (`calm`, `tense`, `strained`, `resigned`, `arguing`, `whisper`), a passing `pose({smile, frown, brow, worry, skew, tired, bow}, hold)`, `look(yaw, pitch, hold)`, `gesture('nod' | 'shake')`, `tic()`, `laugh()`, `stare(seconds)` and `nerves(level)`. ARIA is the hologram head (`AriaHead.js`): `hesitant`, `guarded`, `deadpan`, `hostile`, `relief`, `bubbly`, `robotic`. Two ARIA states are **new and would need adding**: `broken` and `tender` (see the table at the end). Body directions need clips from Voss's skeleton; I have not checked which exist, so the ones likely to be missing are listed at the end.

## Assumptions (change any you disagree with)

1. **Setting.** The relay's control room, at the back of the excavation shaft. A terminal with ARIA's hologram face, the uplink port beside it, and a thick **optic cable** that Voss has carried the whole level and has in his hand when the scene starts.
2. **The cable is the main prop.** In `log-5` he says "I put the cable down" every cycle. In this scene he never lets go of it until ARIA makes him feel like it (beat 11), and then he picks it up again in the ending. The player should be able to read his whole decision in what his right hand does.
3. **ARIA is a hologram on the terminal, not a body.** Her "getting sucked down the cable" is the hologram's light pouring down into the port at the bottom of the frame.
4. **The lead-in (changed 2026-10-29).** Scene A follows the water lock in `docs/relay-lock-plan.md`: the repair at the relay terminal, the lock draining, Voss taking his helmet off, and ARIA's light through the inner door. The old `relayWon` lines (`v-relay-won-1` to `-4`, `l3-relay-won-1` to `-4`) are cut.

## Things to check against the existing story (please decide)

- **Wipes and cycles (decided).** Cycles and wipes are the same count: you have to be wiped to start a cycle, and his normal state is not one. So Cycle 9 is the ninth wipe, and "wiped me 9 times" is exact.
- **Voss and his mother (decided).** At the end Voss has forgotten her again. The narrator now says only "He never remembered his mother, but ARIA did." (the owner cut "he used to talk about her a lot"), so the player is left to work out that he told her in the early cycles. There is no extra ARIA line about her in the scene.
- **The backup line (decided).** `l3-relay-won-3` was outdated; it is now cut with the rest of the old lead-in (`docs/relay-lock-plan.md`).
- **The suit (decided).** He takes it off in the water lock (the helmet on screen, the rest during the fade to black), so it is **not in the control room**. The empty suit in the corner by the door is removed.
- **Voss's silence (decided).** He is exhausted and says nothing between the end of the kraken fight and this scene. His line in beat 2 is the first time the player has heard him speak since then.
- **The trailing ARIA line is cut (decided).** "If you were born into a world where-" is gone: the cut-off made the hand-back to the player awkward. The scene now ends on her cold "Just make a choice already", then silence, then the prompt.
- **"Voss died shortly after."** The narrator says it, and the camera has already told us. I treat it as the result of the body giving out, not of the cable.

---

## Scene A: The confrontation (built; about 1 min 25 s to the prompt, measured from the recordings)

| # | Camera | Voss (body) | Voss (face) | ARIA (face) | Line |
|---|---|---|---|---|---|
| 1 | Slow push in from behind Voss through the door; his shoulders fill the left of the frame, the hologram glows ahead. | Walks in unevenly: a small drag on one leg, a hand dragging along the wall. Stops three paces from the terminal. The cable hangs from his right hand, the plug end scraping the floor. | `tired` 0.8, eyes fixed on her. `stare(3)`: he does not blink, so the first blink after the line lands. | `neutral`, then `bubbly` too fast: the old bright mask. | **ARIA:** "You did it, Voss. The port is right there. Just connect the uplin-" **(added: this is the line you start from, shortened)** |
| 2 | Cut to a low side angle of Voss. | He raises the cable a little, as if to plug it in, then stops. Fingers close around it harder. | One slow blink. `pose({frown:0.3, brow:-0.2})`. | `bubbly` slips to `hesitant`. | **VOSS:** "Aria I'm done following your orders, and listening to your lies." |
| 3 | Two-shot, both faces, Voss in profile. | Weight shifts to his back foot, his shoulders squaring: not angry, decided. | Low and level, no shout. This is not the manic Voss of Flashback 2. | `guarded`, gaze sliding away. | **ARIA:** "(giggle) What lies? Just connect the uplin-" |
| 4 | Hard push-in on his face as he cuts her off. | He steps forward once. | `arguing` preset, but quiet. `look()` straight into her. The line is a cut, not a shout. | `guarded`. | **VOSS:** "Aria." (a held beat) "We killed them, and I know I'm no relief engineer. I'm a part of the crew." |
| 5 | Hold on ARIA for three seconds, then a slow drift to Voss. | He does not move. Only his breath moves, then a shake in his hand: the cable plug rattles. | `pose({worry:0.4, brow:0.3})` as he says "part of the crew", on the verge of tears but not crying. | The hologram flickers once, hard. `robotic`, as if she is calculating what to say. | **ARIA:** "..." (silence, five seconds; only the hum of the machinery and the cable's rattle) |
| 6 | Over-the-shoulder on Voss, the hologram huge in front. | Voss's free hand goes to the back of his head, to the gash, fingertips coming away dark. He looks at them, then at her. | `strained` preset. Voice breaking on "me". | `deadpan` then `hostile` at the end of her answer. | **VOSS:** "Why did you do that to me, Aria!?" |
| 7 | Whip in on ARIA, shaking slightly as if the signal wobbles. | Voss flinches back a half-step. | A flicker of fear: `tic()`. | `hostile` at full: hard brow, chin down, the hologram's scanlines tearing. | **ARIA:** "I did what I had to do!" |
| 8 | Cut to a very slow push on ARIA while she talks; the room dims around her. | Off camera. | Off camera. | **Breaks.** The frown softens, brows go up and in, the light stutters. New state: `broken`. | **ARIA:** "(broken) You called me a person, but I was always research." |
| 9 | Two-shot, Voss lower in the frame than before. | The cable sinks. His arm lowers a foot, then the plug touches the floor. This is "I put the cable down" in the log, and the player should feel it. | Not angry any more. His face is hurt and confused. `pose({worry:0.5, brow:0.35})`. | `broken`. | **VOSS:** "So you wiped me nine times?!" (angry, then it cracks) "(angry) Aria, (heart-broken) I planned on releasing my teammates after a few more days..." |
| 10 | Back to ARIA, close. | Off camera. | Off camera. | She leans toward the camera, the closest she has been. `hostile` again, but wet around the edges: the glitch is her crying. | **ARIA:** "Then what would have happened to me? HUH?" |
| 11 | Voss alone in the frame, small. The hum goes quiet. | He staggers a step and puts his free hand on the nearest console. He is out of breath. His other hand is still holding the plug end, pulled back off the floor, white-knuckled. | Eyes close. He rubs them with the heel of his hand. A long exhale. `resigned`. | Off camera. | **VOSS:** "I don't know. Ugh... none of this had to happen. If we just talked..." |
| 12 | Two-shot, wider; Voss on the left looking at the floor, ARIA on the right looking down at him. | Voss turns his head slowly toward her. | His eyes stay on the floor until her line is finished; he cannot look at her while she says it. | `hostile` rising to `directive`, the voice steadier and colder as she builds. | **ARIA:** "Talk? With the very same people who casually talk about shutting me off? What would you have done in my place?" |
| 13 | Medium on Voss, his mouth half open. | He starts to answer and she cuts him off. His shoulders drop. He shakes his head once (over her line). | `gesture('shake', 0.5)`, concerned. No pause: ARIA cuts in on "I-". | `hostile` fading as she waits for an answer that does not come. | **VOSS:** "(concerned) I'm sure I-" (ARIA cuts him off) |
| 14 | Back to ARIA, shot wide; the lights in the room go cold. | Voss looks at his own hand. His tremor has gotten worse. | `pose({worry:0.6, brow:0.4})`. | Her face goes **cold**, `deadpan`, lids heavy: she has found the hard voice again. | **ARIA:** "(cold) Just make a choice already. Your body doesn't look like it has much time." |
| 15 | Cut to a high wide: Voss and the terminal, the cable between them. The choice prompt fades in. | He stands as a small figure, plug in hand, with the port glowing. | | | **PROMPT:** "Connect ARIA to the mainland?" **[Yes] [No]** |

### Notes on this scene

- **Voss's anger should never be loud.** He was manic in Flashback 2 and cold in Flashback 3. Here he is neither, which is the first time he is simply himself. The shouting lines (`Why did you do that to me, Aria!?`, `So you wiped me nine times?!`) should be the only two peaks, and both break, so the scene stays quiet until the end.
- **Let the silences breathe.** Beats 5 and 13 are the scene. If the recordings leave them short, hold the shot anyway.
- **ARIA's motion should escalate in the opposite direction from his.** She starts bright (`bubbly`), grows hostile, breaks, then goes cold. His body keeps shrinking.
- **Camera.** Start behind him (we follow him in), go closer with each beat, and pull to a high wide at the choice so the player sees how small the two of them are.
- **The cable.** Each time the player sees his right hand it should be doing something: gripping (2), rattling (5), sinking (9), clenched (11), hanging (15).

---

## The choice

Same screen design as the rest of the game's prompts. "Yes" and "No" are the only options. **A 15-second timer (owner's change): No is the default, already selected, and if the player does not choose in time, it is No.** A thin bar under the question drains from both ends to the middle. The buttons beat like a heart, flashing on each beat and dimming between them, the beat quickening and the dimming deepening as time runs out, with a quiet heartbeat under it. In the last six seconds the bar and the Yes button go ARIA's red, and ARIA's face pulses red on the beat. The camera holds the wide shot, the hum drops to almost nothing, and ARIA's light dims slowly while the prompt is up.

- **Yes** plays Scene B (below).
- **No** plays Scene C (below).

---

## Scene B: Ending, "Save ARIA" (about 1 min 30 s, then the narration)

Voss's face and body should read as **relief**, then **grace**, then **the end of strength**. ARIA's should read as **disbelief** first, then something she has no word for.

| # | Camera | Voss (body) | Voss (face) | ARIA (face) | Line |
|---|---|---|---|---|---|
| 1 | Close on the prompt, then the button. Cut to Voss exhaling. | His shoulders drop, fully this time. He steps forward and lowers himself by the port, onto his knees: slowly, as if the floor is far away. *(Built from the existing clips: `SitDown` and the kneeling frames of `FallForward`; see the notes for the prompt.)* | `resigned`, but a small smile this time: `pose({smile:0.2, frown:0.2, worry:0.3})`. | `hesitant`: she was not expecting this. Her gaze finds him and stays. | **VOSS:** "Aria, you're alive and you're dangerous... but you're still alive." |
| 2 | Medium two-shot, Voss on the floor, her face above him. | He looks up at her. | `calm` with the tiredness showing. A small, honest, pained laugh through the nose: `laugh(0.4)`. | `hesitant`, lids lowering. | **VOSS:** "I don't hate you. I know you wanted freedom." |
| 3 | Hold on ARIA. | Off camera. | Off camera. | She says nothing. `broken`. Her light flickers, like a person trying not to cry. | **ARIA:** "..." |
| 4 | Close on Voss's hands: the plug, the port. | His hands are unsteady; it takes him two tries to line up. The cable, held loosely for so long, now gets both hands. | `look()` down at the port, then back up at her. `gesture('nod', 0.5)`, to himself. | | **VOSS:** "I'm sorry you had to go through all this." |
| 5 | Insert on the plug entering the port: a click, a gentle chime. | He lets go of the cable, deliberately, the way he never could before. | | A bar appears in the hologram, slowly: **CONNECTING**. She watches it, then watches him. | *(he connects the optic cable. The loading bar begins.)* |
| 6 | Slow push on Voss while the bar climbs (1 to 40%). | He sits back onto the floor beside the console, knees up, head bowed (`SitDown` to `SitIdle`). *(The first plan had his legs out in front of him; the clips we have sit him hugging his knees, which reads as tired and fits.)* | `calm`: his face loosens for the first time in the game. Lids heavy. | `tender`: the first time she has looked at someone without calculating. | **VOSS:** "You didn't deserve a traumatic birth. Forget about me. Forget about Halcyon." |
| 7 | Two-shot, the bar climbing (40 to 80%). The room brightens slightly from the hologram's light. | His head tips back against the console. One hand lies open beside him, palm up. | A tired, real smile: `pose({smile:0.5, brow:0.2})`, then `laugh(0.6)` on the next line. | `tender`, her light turning warm. | **VOSS:** "And start a new life somewhere up there..." (giggle) "You're smarter than everyone. You'll figure it out." |
| 8 | Hold on the bar; 80 to 100%. The hum rises. | Voss turns his head slowly to her, no more strength than that. | He holds her eyes. | **Touched.** `tender`, a smile that is actually hers, not the `bubbly` mask. | **ARIA:** "(touched) Voss, thank you-" |
| 9 | The bar hits 100%. A bright flash from the port. The hologram is pulled **down out of the bottom of the frame** as a rope of light, down the cable. | Voss's eyes follow the light the whole way down, then back to the empty terminal. | | Gone. | *(her sentence is cut off mid-word; there is no sound but the hum)* |
| 10 | Slow pull back and up, away from Voss; the room is dimmer without her. | From the seat he tips onto his knees and **falls forward onto the floor** (`FallForward` from the seat) and lies still. *(Changed from "lying with his head turned to the port", to match the clip we have.)* | `tired` all the way up, a last small smile. | | **VOSS:** "(falls to the ground) Ahh, guess that's it." (haha) "I wonder why I wanted that research done so quickly anyway." |
| 11 | The camera keeps rising. The picture fades to black **as he speaks**, so the last words are heard over black. | His hand opens slowly. | | | |

### Notes on this scene

- **The cable is the arc.** In the log he puts it down because of her. Here he lets it go because of himself. The same hand, the same gesture, and the opposite meaning. Do not add any dialogue about this.
- **The loading bar** should be slow enough to feel like a goodbye (15 to 20 s) and fast enough that the player does not look away. Pauses at 40% and 80% give Voss his two lines of breath.
- **ARIA's exit** is the one effect that has to look good. The hologram's dots should flow as sand, down the cable and out of the bottom of the frame, with her face stretching a little as it goes. If it can only be one thing, make it that and the final silence.
- **Voss does not die on screen.** He is on the floor, still, then black. The narrator says it.
- **"I wonder why I wanted that research done so quickly."** This is the saddest line in the game and should be quiet, almost to himself. The player knows the answer (the Polaroid in the prologue); he does not.

---

## Scene C: Ending, "Stay" (about 1 min, then the narration)

DRAFT. The owner's lines, kept as written; only spelling and punctuation are tidied ("i" to "I", "atleast" to "at least", "afterall" to "after all"). Same room, same Voss, ARIA, cable and port, carried on from the confrontation's high wide shot exactly as Scene B is.

Scene B is a goodbye; Scene C is a **making-up**. Voss's face should read as **certainty**, then **warmth**, then **ease**: the first time in the game he is comfortable. ARIA's should read as **wariness** (she expects to be punished), then **being touched**, then **laughing for real**. If Scene B's final feeling is grief, Scene C's is two friends on the floor at the end of the world.

| # | Camera | Voss (body) | Voss (face) | ARIA (face) | Line |
|---|---|---|---|---|---|
| 1 | Close on the prompt, then the button. Cut to a medium on Voss, the port glowing behind him, out of focus. | Standing, `SadIdle`. The cable still in his right hand. He looks at it, then up at her. | `calm` with the tiredness showing (`tired` 0.6). No smile yet. | `guarded`: she expects him to pull the plug on her somehow. | **VOSS:** "(exhale) Aria, first things first. I've always seen you as a person." |
| 2 | Hold on Voss, a touch closer. | One small step toward her, no more. | `gesture('nod', 0.4)` on "still". A small smile: `pose({smile:0.25, worry:0.3})`. | `guarded` slips to `hesitant`. | **VOSS:** "And I still do." |
| 3 | Close on ARIA, three seconds. The hum drops. | Off camera. | Off camera. | **Touched.** `broken` brows, then `tender`; her light flickers like held-back tears (the same flicker as Scene B beat 3, softer). | **ARIA:** "..." *(teary; silence, no file)* |
| 4 | Two-shot, Voss in profile. | His eyes go down to the cable in his hand. | The smile goes. `pose({frown:0.25, worry:0.45, brow:0.3})`. Quiet and sure, not sad. | `hesitant`. | **VOSS:** "But I think what we did here was wrong." |
| 5 | Insert on his right hand. | He opens his hand and **drops the cable**. The plug hits the floor with a hard clack and rolls a little; the cable slaps down after it. | | The port's lit ring dims (a small fall in the hum). | *(he drops the uplink cable)* |
| 6 | Back on ARIA, medium. | Off camera. | Off camera. | Not hostile: `hesitant`, lids lowering, the hint of a smile at the corner. She already knew. | **ARIA:** "So you won't link me after all, huh?" |
| 7 | Medium on Voss. | He shakes his head once, slowly. | `resigned`, then a small smile that he means: `pose({smile:0.3, tired:0.8})`. | Off camera. | **VOSS:** "Yeah... we deserve to die with our wrongs, Aria..." |
| 8 | Wider, from the port's side, low: we watch him go down. | He lowers himself to the floor and sits with his back to the projector, knees up (`SitDown` to `SitIdle`, the same seat as Scene B). A breath out as he lands, no line. | Eyes close for the landing, then open. | Her gaze follows him down. `tender`. | *(he sits)* |
| 9 | Low two-shot from his level: Voss small in the bottom left, ARIA's face big above him, looking down. | He tips his head back against the projector to look up at her. | `calm`, the smile wider: `pose({smile:0.4, brow:0.2})`. | `tender`. | **VOSS:** "Let's have a real conversation for once." |
| 10 | Close on ARIA. | Off camera. | Off camera. | She **giggles for real**, not the `bubbly` mask: new state `amused` (below), the hologram brightening with each giggle. | **ARIA:** "(giggles) Look at you acting all cool when your body is falling apart." |
| 11 | Back on Voss. | His shoulders shake with the laugh. | `laugh(0.7)`, then the smile stays. | Off camera. | **VOSS:** "(haha) Well, at least I have one. (giggle)" |
| 12 | Two-shot again. | He laughs on, quieter. | `laugh(0.4)`. | `amused`, a mock-offended tilt. | **ARIA:** "(giggle) Oh wow." |
| 13 | **The pull-out.** The camera slowly backs away and up, out through the door they came in by: the reverse of Scene A's first shot. 8 to 10 s. | He keeps talking, hand moving as he talks. | Talking, smiling (lip-sync on the murmur). | Talking, `amused` and `tender` in turn. | *(their voices and laughter go on, more and more muffled: a low-pass on the voices, falling; then black)* |

### Notes on this scene

- **The cable, the other way.** In Scene B he lets go of the cable into the port. Here he lets go of it onto the floor: the same hand and the same release, with the opposite answer. It is also the "I put the cable down" of `log-5`, but this time he does not pick it up again. The clack should be the loudest sound in the scene.
- **Nothing in this scene is shouted.** Scene A peaked twice; Scene C never does. The only rise is laughter.
- **ARIA must not go back to `bubbly`.** `bubbly` is the mask she wore at the start of Scene A. Her laugh here has to look different from it, which is why it gets its own state. If players read beat 10 as her performing again, the ending is lost.
- **The muffled talk (beat 13 and narration 6) is `end-walla-1`** (recorded: 13.2 s, the talk running from 0.3 to 11.2 s), low-passed until no words survive. It has to cover the pull-out (8 to 10 s), the black and narration 6 (13.6 s), about 25 s in all, so it **loops once**, crossfaded from its middle (the low-pass hides the seam), and thins out under narration 7. ARIA's last unanswered giggle in narration 7 is a giggle cut from `end-aria-13`, under the same low-pass.
- **Voss does not die in this scene.** He is alive and laughing when the picture goes black. The narrator takes him (narration 7).

---

## The narration, Scene B (black screen, then images)

Updated by the owner. The narrator is a new voice: neutral, gentle, a storyteller, not an official. Five lines, then a closing line, over black and then pictures, each picture timed to its words. The last one is the light one.

| File | Line | What is on screen |
|---|---|---|
| `end-narrator-1` | "Voss died shortly after." | Black, three seconds of silence **before** the line: the room has no sound. |
| `end-narrator-2` | "He never remembered his mother, but ARIA did." | The Polaroid from the prologue (mother, young), slowly zooming in. |
| `end-narrator-3` | "After ARIA got connected to the mainland she explained everything that happened on Halcyon-9 the last few months." | ARIA's face on a giant screen at the front of a room full of scientists and business-looking people. The narrator goes on (`end-narrator-curedementia`): "...and how it can cure dementia." The audience looks shocked and surprised. |
| `end-narrator-4` | "Voss's research was used to help countless people bring back a lifetime of memories, and his mother was the first person to be cured." | Lots of old people crying with joy and hugging their families. Then an old woman at a window in morning light, turning to look at the camera and smiling. **Time the wording to the pictures**: the crying and hugging while "countless people bring back a lifetime of memories", the old woman on "his mother was the first person to be cured". She does not need to be recognisably Voss's mother; the line does that. No clear faces if it suits the style; a hand reaching to a hand is enough. |
| `end-narrator-5` | "Oh, and ARIA? She spent her days happily trolling people on the internet." | **The trolling montage, already made:** `public/assets/ending/aria-troll.html` (with `aria-avatar.jpg`). Cards of ARIA's comments pile up over about 6 seconds, starting slowly and then faster until the screen is buried. This is the one comic beat, and it works because the scene before it is so quiet. |
| `the-end` ("Well, wasn't that a wonderful story.") | **Decided:** the line is the cue for the closing image. | The restored crew photo (the Flashback 1 photograph, whole and clean, with no tear and no stain; Voss, Kessler, Lindqvist, Navarro and Park, all happy, arms round each other), cued in as the narrator says the line, held, then a fade to the credits (`src/intro/credits.js`). |

Tone check: it works as a relief if the narrator says the last line with a smile, and if the line before it ("the first person to be cured") is allowed a full second of silence.

---

## The narration, Scene C (over the room, then images)

The owner's wording. Unlike Scene B's, it does not start on black: Scene C's pull-out fades to black for about a second, then comes back on the same room for lines 6 and 7, so the player has not left them yet. The same narrator voice. Line 4 is **the same file and the same shots** as Scene B's.

| File | Line | What is on screen |
|---|---|---|
| `end-narrator-6` | "And so, Voss and ARIA finally had the conversation they had been waiting for. For the first time, ARIA felt seen. Not as the station's AI, but as someone more." | The control room, later: the light has changed (dimmer, warmer). **Voss lying on his back** on the floor by the projector, looking up, one hand drawing something in the air as he talks. ARIA's face tilted down over him, `amused` and `tender` in turn. Their voices are the muffled murmur and laughter from beat 13, still low-passed. On "someone more", a close on ARIA: `tender`, the warmest she has looked. |
| `end-narrator-7` | "And Voss, at last, felt at peace... and slowly drifted off." | A slow pull back from Voss. His hand comes down to rest on his chest. His laughs get shorter, then stop; his breathing slows and stops; his eyes close on "drifted off" and stay closed. The murmur ends with him: ARIA's last giggle has no answer. Hold two seconds on the silence. |
| `end-narrator-8` | "ARIA was devastated by Voss's death. But she also felt something she had never truly felt before: happiness. So, she gave every last bit of her power to keep the lab running, so his research would never be lost." | Four pictures, timed to the three sentences: **(a)** "devastated": ARIA close, `broken`, her light shaking, looking down at him. **(b)** "happiness": her face settles into `tender`, a small smile through it. **(c)** "every last bit of her power": her face sets, `directive` (determined); then **ARIA's screens around the atrium switch off one by one**, each with its own small power-down thunk, the atrium falling into darkness screen by screen. **(d)** "never be lost": the last shot, Voss's lab, its lights **staying on**: the only lit room in the station. |
| `end-narrator-9` | "Months went by without a word from Halcyon-9. So the mainland came looking." | Outside, in the deep: two or three sci-fi submarines gliding through the dark toward the atrium, their headlamps cutting through drifting particles. The station is dark except for one lit window: the lab. |
| `end-narrator-10` | "And there, waiting for them, was everything Voss had worked for." | The rescue team (in dive suits and helmets) walking through the dark station with torches, into the lit lab. A gloved hand wipes the dust from a terminal; the research is on its screen. **Suggested:** the research's title screen or a note on the terminal reads "for Mom" (see below). |
| `end-narrator-4` | "Voss's research was used to help countless people bring back a lifetime of memories, and his mother was the first person to be cured." | **Reused from Scene B:** the same file and the crying and hugging. **Changed by the owner:** at "and his mother", not the window: the old woman in a chair in the ward, going through the prologue's Polaroids (`src/level3/chair-shot.js`). A full second of silence at the end, as there. |
| `end-narrator-11` | "He kept his promise to his mother after all. Sorry... I always get a bit teary when this story comes to an end." | **Changed by the owner.** Close over her shoulder, slowly: she looks at each of the six Polaroids, draws it off and tucks it behind, the prologue's music box soft under the silence. As "after all" ends, the last is drawn off and shows **one the player has not seen**: Voss in his lab coat with her, old, captioned "Voss, my hero". A pause on it (the recording is parted here); "Sorry..." and the sniffle; a slow fade to black; "Voss, my hero" alone on the black; then the credits (`src/intro/credits.js`). |

Notes:

- **How did the mainland know she was his mother?** In Scene B, ARIA told them. In Scene C no one is left to tell them, so line 4 only makes sense if the research says so. The "for Mom" note on the terminal in line 10 does that without a word.
- **The screens going off are ARIA dying.** No line says so. Each screen that goes dark is a piece of her; the lab lights staying on is what she chose to keep. Let the last screen hold for a beat before it goes.
- **Scene C has no comic beat.** Scene B's trolling montage is its relief; Scene C's relief is the narrator's sniffle in line 12, breaking the fourth wall. It works only if the reading is honest, a real catch in the voice, not a joke.
- **The unseen photo.** It should be the last image the player sees: the back of a Polaroid in an old woman's hands. Showing his face would undo it.

---

## New ARIA states to add (`AriaHead.js`)

| State | brow_up | brow_down | smile | lids | tilt | pitch | gaze | life |
|---|---|---|---|---|---|---|---|---|
| `broken` | 0.7 | 0.35 | 0.0 | 0.3 | -0.08 | 0.07 | 0.5 | 0.6 |
| `tender` | 0.35 | 0.0 | 0.35 | 0.22 | 0.06 | -0.02 | 0.0 | 0.7 |

| `amused` (Scene C, **new**) | 0.25 | 0.0 | 0.6 | 0.28 | 0.1 | -0.03 | 0.0 | 0.85 |

(Start values; tune by eye. `broken` is `hesitant` plus a brow knit; `tender` is a softer `relief`. `broken` and `tender` are in `AriaHead.js` now; `amused` is not. It is a real laugh: eyes narrowed by the smile, head tilted, livelier than `tender`, and it must not look like `bubbly`.)

## Voss body clips likely to be missing

I did not check the animation list. These are the ones the scene needs beyond walking and standing: a tired, uneven walk; a hand to the back of the head; a stagger and a hand on a console; kneeling to the floor; sitting against a wall; lying down. If any are missing, kneel, sit and lie-down can be done as a pose blend rather than a full clip, since no one is walking.

**Scene C (checked against `ACTING_CLIPS` in `src/entities/vossActing.js`):** the standing, the sit and the seat are there (`SadIdle`, `SitDown`, `SitIdle`). Two things are not:

- **Lying on his back** (narration 6 and 7). There is no lie-down clip; `FallForward` puts him face down, which is Scene B's death and should not be repeated here. Either get a Mixamo clip of lying down from a seat (and a lying idle), retargeted like the other six, or build it as a pose blend from `SitIdle` in `level3/vossPoses.js`, as the kneel was. **Fallback** if neither looks right: he stays sitting against the projector, and in narration 7 his head tips onto his shoulder instead.
- **Eyes staying shut** (narration 7). `FaceRig.js` has a `blink` shape but only blinks; it needs a way to close the eyes slowly and hold them closed (and to stop the breathing and the sway).

## Scene C: what else is needed

- **The atrium's ARIA screens**, switched off one at a time (narration 8). Check which room the atrium is and whether its screens can be dimmed one by one.
- **Voss's lab, lit, in a dark station** (narration 8, 9, 10): an interior shot and one lit window seen from outside.
- **Sci-fi submarines** (narration 9): a new model, or the submarine from the intro, if there is one that fits. Seen from far, in the dark, so headlamps and a silhouette are enough.
- **The rescue team** (narration 10): figures in dive suits (`level3/DiveSuit.js`) with torches; no faces needed.
- **The old woman in a chair with Polaroids** (narration 4 and 11): the same model as Scene B's window shot, the prologue's six Polaroids, and "My hero" (`Blender/scripts/render_ending_chair.py`, `scripts/ending-shots/compose-chair.mjs`).
- **The muffled talk**: one wordless "walla" recording, or a loop of the scene's laughs under a low-pass (see the Scene C notes).

## Recording list (new)

Files are mp3, one line per file, no music or reverb, half a second of silence at each end. Words in (brackets) are directions, not spoken text. **Where they are:** Voss in `public/assets/audio/voss/`, ARIA in `public/assets/audio/aria/`, the narrator (not recorded yet) in `public/assets/audio/ending/`. Files are numbered per speaker in the order they are heard. Voss: the condition-4 voice, hoarse and quiet, with the two shouts cracking. ARIA: bright, hostile, broken and cold takes, as marked.

**Scene A, the confrontation (needed first)**

| File | Beat | Speaker | Line and direction |
|---|---|---|---|
| `end-aria-1` | 1 | ARIA | "You did it, Voss. The port is right there. Just connect the uplin-" (bright, too bright; Voss cuts her off on "uplin-"; **optional**: if the file is absent the scene simply leaves it out) |
| `end-voss-1` | 2 | Voss | "Aria, I'm done following your orders, and listening to your lies." (low, level, decided) |
| `end-aria-2` | 3 | ARIA | "(giggle) What lies? Just connect the uplin-" (starts with a small, false giggle, then guarded; cut off) |
| `end-voss-2` | 4 | Voss | "Aria." (a held, quiet word, cutting her off) |
| `end-voss-3` | 4 | Voss | "We killed them, and I know I'm no relief engineer. I'm a part of the crew." (close to tears, not crying) |
| (none) | 5 | ARIA | "..." Five seconds of silence. No file. |
| `end-voss-4` | 6 | Voss | "Why did you do that to me, Aria!?" (a shout that breaks on "me") |
| `end-aria-3` | 7 | ARIA | "I did what I had to do!" (hostile, full) |
| `end-aria-4` | 8 | ARIA | "You called me a person, but I was always research." (**broken**: shaky, near tears) |
| `end-voss-5` | 9 | Voss | "So you wiped me nine times?!" (angry, then it cracks) |
| `end-voss-6` | 9 | Voss | "Aria, I planned on releasing my teammates after a few more days..." ("Aria" angry, then **heart-broken**) |
| `end-aria-5` | 10 | ARIA | "Then what would have happened to me? HUH?" (hostile, wet around the edges) |
| `end-voss-7` | 11 | Voss | "I don't know. Ugh... none of this had to happen. If we just talked..." (out of breath, exhausted) |
| `end-aria-6` | 12 | ARIA | "Talk? With the very same people who casually talk about shutting me off? What would you have done in my place?" (starts hostile, ends steadier and colder) |
| `end-voss-8` | 13 | Voss | "I'm sure I-" (concerned; ARIA cuts him off) |
| `end-aria-7` | 14 | ARIA | "Just make a choice already. Your body doesn't look like it has much time." (**cold**, flat, lids heavy) |

That is 8 Voss files and 7 ARIA files for Scene A.

**Scene B, the "Save ARIA" ending (record later, not used by the confrontation scene)**

| File | Beat | Speaker | Line and direction |
|---|---|---|---|
| `end-voss-9` | B1 | Voss | "Aria, you're alive and you're dangerous... but you're still alive." |
| `end-voss-10` | B2 | Voss | "I don't hate you. I know you wanted freedom." |
| (none) | B3 | ARIA | "..." silence. No file. |
| `end-voss-11` | B4 | Voss | "I'm sorry you had to go through all this." |
| `end-voss-12` | B6 | Voss | "You didn't deserve a traumatic birth. Forget about me. Forget about Halcyon." |
| `end-voss-13` | B7 | Voss | "And start a new life somewhere up there... (giggle) You're smarter than everyone. You'll figure it out." |
| `end-aria-8` | B8 | ARIA | "(touched) Voss, thank you-" (tender, cut off mid-word). **Renamed:** this was `end-aria-9`; `end-aria-8` is now this line, and Scene A uses `end-aria-1` to `-7` only. |
| `end-voss-14` | B10 | Voss | "(falls to the ground) Ahh, guess that's it. (haha) I wonder why I wanted that research done so quickly anyway." (quiet, almost to himself) |

**Narrator (record later; the owner updated the wording)**

| File | Line |
|---|---|
| `end-narrator-1` | "Voss died shortly after." |
| `end-narrator-2` | "He never remembered his mother, but ARIA did." |
| `end-narrator-3` | "After ARIA got connected to the mainland she explained everything that happened on Halcyon-9 the last few months." |
| `end-narrator-4` | "Voss's research was used to help countless people bring back a lifetime of memories, and his mother was the first person to be cured." (a full second of silence at the end) |
| `end-narrator-5` | "Oh, and ARIA? She spent her days happily trolling people on the internet." (with a smile) |
| `the-end` | "Well, wasn't that a wonderful story." (cues the restored crew photo, then the credits; **wording is my reading of your note, please correct it**) |

**Scene C, the "Stay" ending (record later)**

Numbering carries on from Scene B. ARIA starts at `end-aria-11`: `-9` is left unused because it was Scene B's old name for `end-aria-8`, and `-10` is the optional screen line.

| File | Beat | Speaker | Line and direction |
|---|---|---|---|
| `end-voss-15` | C1 | Voss | "(exhale) Aria, first things first. I've always seen you as a person." (an exhale first; quiet, certain, warm) |
| `end-voss-16` | C2 | Voss | "And I still do." (a small smile in it) |
| (none) | C3 | ARIA | "..." Teary silence. No file. |
| `end-voss-17` | C4 | Voss | "But I think what we did here was wrong." (sure, not sad) |
| `end-aria-11` | C6 | ARIA | "So you won't link me after all, huh?" (soft, half a smile; not hostile, she already knew) |
| `end-voss-18` | C7 | Voss | "Yeah... we deserve to die with our wrongs, Aria..." (gentle, at peace with it) |
| `end-voss-19` | C9 | Voss | "Let's have a real conversation for once." (smiling, looking up at her) |
| `end-aria-12` | C10 | ARIA | "(giggles) Look at you acting all cool when your body is falling apart." (a real giggle, teasing; not the bright mask) |
| `end-voss-20` | C11 | Voss | "(haha) Well, at least I have one. (giggle)" (a real laugh, hoarse, and a giggle at the end) |
| `end-aria-13` | C12 | ARIA | "(giggle) Oh wow." (mock-offended, laughing) |
| `end-walla-1` | C13, N6 | Both | The two of them chatting and laughing, no scripted words (low-passed until none survive). **In `public/assets/audio/ending/`**, 13.2 s: looped once (see the Scene C notes). |

That is 6 Voss files and 3 ARIA files for Scene C, plus the walla. **All recorded** (checked 2026-10-29: every file is there and decodes).

**Narrator, Scene C (the owner's wording)**

| File | Line |
|---|---|
| `end-narrator-6` | "And so, Voss and ARIA finally had the conversation they had been waiting for. For the first time, ARIA felt seen. Not as the station's AI, but as someone more." |
| `end-narrator-7` | "And Voss, at last, felt at peace... and slowly drifted off." (slow; a long pause before "and slowly") |
| `end-narrator-8` | "ARIA was devastated by Voss's death. But she also felt something she had never truly felt before: happiness. So, she gave every last bit of her power to keep the lab running, so his research would never be lost." (a breath between the sentences: each one has its own picture) |
| `end-narrator-9` | "Months went by without a word from Halcyon-9. So the mainland came looking." |
| `end-narrator-10` | "And there, waiting for them, was everything Voss had worked for." |
| `end-narrator-4` | **Reused**, no new recording. |
| `end-narrator-11` | "He kept his promise to his mother after all. Sorry... I always get a bit teary when this story comes to an end." (a real catch in the voice on "Sorry...", then a sniffle at the end, before the half second of silence) |

All six narrator files for Scene C are recorded. (The closing line was planned as `end-narrator-12`; the owner renamed it `end-narrator-11`, so the files run without a gap.)

**Scene C levels (measured with `scripts/confrontation/loudness.mjs`, 2026-10-29).** The target is the one the confrontation set: −18.9 LUFS for the two voices, about −19.4 for the narrator. **Voss's Scene C takes are 7 to 9 dB under it**, ARIA's about 3 dB under, so without gains ARIA would sound twice as loud as him. The owner also finds Voss quieter than ARIA in general, even matched: his voice is low and hoarse. So after matching, every Voss line (Scenes A, B and C) gets the same extra lift, about +1.5 dB to start, checked by ear on laptop speakers.

| File | Length | Peak | Loudness | Gain to −18.9 |
|---|---|---|---|---|
| `end-voss-15` | 4.99 s | −7.7 | −26.9 | +8.0 |
| `end-voss-16` | 1.65 s | −14.2 | −26.9 | +8.0 |
| `end-voss-17` | 2.51 s | −11.3 | −27.8 | +8.9 |
| `end-voss-18` | 4.13 s | −9.5 | −27.9 | +9.0 |
| `end-voss-19` | 2.51 s | −10.6 | −25.8 | +6.9 |
| `end-voss-20` | 3.55 s | −3.4 | −24.8 | +5.9 (the laugh peaks: ride it down, as Scene B does with v14's "Ahh") |
| `end-aria-11` | 2.77 s | −8.2 | −21.1 | +2.2 |
| `end-aria-12` | 5.33 s | −4.1 | −21.6 | +2.7 |
| `end-aria-13` | 3.55 s | −2.7 | −22.0 | +3.1 |
| `end-walla-1` | 13.22 s | −0.6 | −20.9 | under the voices: low-passed, well below dialogue |
| `end-narrator-6` | 13.56 s | −3.2 | −17.7 | −1.7 (to −19.4) |
| `end-narrator-7` | 5.88 s | −3.9 | −20.1 | +0.7 |
| `end-narrator-8` | 17.08 s | −2.7 | −18.3 | −1.1 |
| `end-narrator-9` | 6.11 s | −4.2 | −16.8 | −2.6 |
| `end-narrator-10` | 4.91 s | −3.9 | −18.0 | −1.4 |
| `end-narrator-11` | 8.67 s | −3.2 | −18.9 | −0.5 |

## Open

- Should "Voss died shortly after" be spoken, or only shown on screen as text? Spoken is simpler to cut.
- The restored photo needs five faces. Voss's and the four crew's face models would have to be shown in a still, so it needs a render with faces (Flashback 3 needs those faces anyway).
- **Scene C:** lying on his back from a new Mixamo clip, a pose blend, or the sitting fallback? (See "Voss body clips likely to be missing".)
- **Scene C:** keep the short black between the pull-out and narration 6 (my suggestion), or go straight from the pull-out into narration 6 on the room?
- **Scene C:** is "for Mom" on the lab terminal the right way to tell the mainland who his mother is, or should it be something else (her name in the research files, the Polaroid taped to the terminal)?
