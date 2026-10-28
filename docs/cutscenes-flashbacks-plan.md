# Cutscenes & Flashbacks Plan

Status: planning. Flashback 1 is settled and ready to build. Flashbacks 2 and 3 are outlined only (not ready to build). The rest of the story is added one scene at a time as it is agreed.
Related: `story-delivery-01-prologue-polaroids.md` (the Polaroids are a glimpse of Voss's past, **not** a flashback), `../HANDOVER_Voss_Kessler_VideoLogs_Flashback.txt` (the Level 2 flashback).

---

## 0. Implementation brief (read this first)

**Build now:** Flashback 1 (section 2) and the consistency edits (0.2). **Do not build:** Flashbacks 2 and 3, the Level 3 conversation, the choice, the endings, or the credits. They are outlines for context only (sections 3 to 8) and still need scripts. Where this brief and a later section disagree, this brief wins.

### 0.1 Flashback 1 tasks

1. **Photo and marker, Level 1 lift.** A framed print on the lift wall (`src/levels/liftCabin.js`, `src/levels/Level1.js`), with a world marker (`ui.waypoint`). Required: the lift will not depart until it is looked at (hook: `Game.onElevatorDepart`, `src/Game.js`).
2. **Headache transition, "Ah… my head."** Blur, heartbeat, white-out; reuse the eyelid effect from `src/intro/intro-cinematic.js` if it fits.
3. **The flashback itself,** a new file in `src/story/` next to `PrologueSequence.js` (lowercase-hyphenated names for assets, as the project does), following the pattern of `src/level2/Flashback3D.js`: `play()` returns a Promise, Enter skips after about 2 s, preload ahead of time, dispose everything afterwards. About 30 s, first person, shot list in 2.5.
4. **The room and the people.** A small warm conference room and five silhouettes (four listening plus the male speaker), faces blurred. Reuse the existing human model and skeleton; do not add face models. Keep disk small (the whole scene should add well under 2 MB) and run it through `npm run optimize-models`.
5. **Audio.** The speaker's recording is low-passed until inaudible, except passages A and B where the filter opens and a slight wobble is added. Subtitles for A and B only. Voice recordings are placeholders (see 2.6). Voss lines go to `public/assets/audio/voss/<id>.mp3`, ARIA's to `public/assets/audio/aria/<id>.mp3`; a missing file falls back to a timed subtitle.
6. **The photograph,** one still of the same room as seen by the photographer (not Voss), five people, arms around each other, torn where Voss stood, an arm reaching into the gap, faces stained out. Used on the lift wall and for the full-screen reveal after the flash (about 3 s). Keep it a webp of about 100 to 300 KB.
7. **ARIA's and Voss's lines** after the flashback (2.6).

### 0.2 Consistency edits

- `src/level2/Level2Lines.js` `LOGS.subjects`: five names only: Kessler, Lindqvist, Navarro, Park, and Voss (reword "RESTORED (CYCLE 9)" so he is a living man wiped nine times, not a copy).
- `LOGS['log-1']`: rewrite. It must not say Voss alters or scans colleagues' memories. New content: about the scans and the organism and Kessler's worry. Keep its title and its place in the montage; keep or re-record the audio to match (no recording exists for the new text yet).
- Replace "reconstructed Voss" wording in the log descriptions (`who:` strings) with "a wiped Voss" or similar.
- Keep `bunkLogA`, the rota, the letter, the directive and the research notes as they are.

### 0.3 Acceptance

- Level 1 cannot be finished without looking at the photo; the flashback plays once; skipping works; the lift then departs.
- No face is visible anywhere in Flashback 1 or in the photo.
- Runs at normal speed on an Intel UHD 620 without dropping below about 24 fps; everything created is disposed afterwards.
- Voss's movement looks natural (2.5); check it in a real browser at normal speed.

### 0.4 Decisions the agent must not change

The speaker is male and on the mainland, never mentioned again. Kessler is in the photo. The crew is five (Voss, Kessler, Lindqvist, Navarro, Park). The flashback is first person. Nothing is said about ARIA's nature, the scans, the cycles, or Voss's mother.

### 0.5 Still open (use the default, and flag it in the report)

- Recordings: the owner supplies them, from `flashback-1-recording-script.md` (14 files, with the file names and folders). That script is the final wording; if it differs from 2.6, the script wins. Time the scene to the real recordings. Until a file exists, show its line as a timed subtitle.
- Where in Level 1 the lift's photo hangs (agent picks a visible spot and tells the owner).

---

## 1. Ground rules

- **What a flashback is:** a memory the player and Voss both see. The Polaroid prologue is only a glimpse for the player, so it is not counted.
- **Built in-engine** (three.js), not pre-rendered. Disk cost is small because characters reuse Voss's skeleton and clips. The real limits are GPU load on the school PCs (Intel UHD 620) and how convincing the acting is.
- **Same contract as the existing cutscenes:** `play()` returns a Promise, Enter skips after a short delay, audio is optional (a missing recording shows a timed subtitle).
- **Faces are held back on purpose.** The player first sees faces in the Level 2 flashback (Kessler's room). Flashback #1 shows none, so the two work as a pair: Level 1 is the happy version, Level 2 is what it became.
- **Voss does not believe he is crew.** He still trusts ARIA's "relief engineer" account, so every memory should arrive as something he resists, not something he accepts.

---

## 2. Flashback #1 — "The briefing" (Level 1, the lift)

### 2.1 Summary

Before Voss rides the lift to Level 2, a marked, torn group photograph on the lift wall gives him a headache. The scene cuts to a conference room, seen through his eyes: muffled voices and blurred faces. Two passages of the speaker's talk come through clearly, a little shaky: the one describing the bacteria, and the one about Halcyon-9. Everything between them stays muffled and inaudible. The group is pleased to have been chosen. They walk to one side of the room and a photograph is taken. At the shutter flash the picture itself appears on screen (torn, stained), and then Voss is back in the lift.

### 2.2 Decisions

| Question | Decision |
|---|---|
| Who tore the photo? | Left as a mystery for now. |
| Photo faces | Obscured by a stain (water or coffee), not scratched or cut. |
| Camera | First person through Voss's eyes. Voss is never modelled for this scene. |
| The speaker | A blurred stranger, not Kessler (her face is kept for Level 2). Male. The voice is a placeholder for now. |
| What is audible | Two whole passages, never single words: the description of the bacteria, and the line about Halcyon-9. Both slightly shaky, with subtitles. Everything between them is muffled and inaudible. |
| The photo reveal | After the camera flash the photograph is shown full screen, then the scene returns to the lift. |
| Length | About 30 s, Enter to skip. |

### 2.3 The photograph

- A group picture of the crew celebrating being picked for the project: happy, arms around each other.
- **Torn out where Voss stood.** An arm reaches from the crew into the gap (a hand resting on a shoulder that is no longer there), so it is clear someone was in the picture.
- **Faces covered by a stain**, so no face is recognisable in Level 1.
- Five people are in it: Voss (torn out), Kessler, Lindqvist, Navarro and Park. The speaker took the picture. Kessler is in it but her face is stained out like the rest, so she is not recognisable until Level 2.
- Shown as a framed print on the lift wall, with a world marker before Voss closes the doors.
- It cannot be a frame grabbed from the flashback, because the flashback is first person and the photographer's view is not Voss's. Make it as one separate still of the same room, rendered from a camera near where the speaker stands.

### 2.4 Trigger and flow (Level 1)

1. Voss gets in the lift. A marker appears on the photo.
2. **The photo is required:** the lift will not depart until he has looked at it (the objective text points at it).
3. On looking: a headache pulse (blur, heartbeat, white-out), then Voss's "oh my head" line. Reuse the eyelid effect from the opening cinematic if it fits.
4. The flashback plays (below).
5. Shutter flash, then the photograph fills the screen for about 3 s, then a fade back to the lift.
6. Voss and ARIA exchange the lines in 2.6, so he chooses to trust her (the "relief engineer" account stays alive).
7. The lift is then free to depart.

Existing hook: `Game.onElevatorDepart` in `src/Game.js` (about line 373). The marker uses `ui.waypoint`.

### 2.5 Shot list (first person, about 30 s)

| Time | What is seen and heard |
|---|---|
| 0–2 s | White-out clears into a warm conference room. Sound is underwater-muffled. Voss sits at the table; around him are the blurred heads and shoulders of Kessler, Lindqvist, Navarro and Park. |
| 2–5 s | The male speaker at the front, face blurred. His words are muffled and inaudible. |
| 5–13 s | **Audible passage A, the bacteria.** On the screen behind him, a slow, glowing picture of the organism. The muffle lifts: his voice comes through a little shaky, with subtitles. |
| 13–17 s | Muffled again. The screen changes; someone beside Voss nudges his arm. |
| 17–22 s | **Audible passage B, Halcyon-9.** A schematic of the station on the screen. Shaky, subtitled. Then muffled; the room reacts, people stand and clap shoulders. |
| 22–26 s | The group drifts to one side of the room. Voss goes with them. Arms go round shoulders; a hand lands on his. Someone lifts a camera. |
| 26–27 s | Shutter flash. |
| 27–30 s | The photograph fills the screen, then fades to the lift. |

**Important: every movement of Voss must look natural.** The camera is his head, so nothing may feel like a camera on rails. In practice:

- A slight head bob and sway while walking, a small settle when he sits and a lift when he stands.
- His gaze wanders on its own: toward the speaker, the screen, the person who nudges him, then back. Glances are led by what is happening in the room, not by a fixed path.
- Small involuntary motion while seated: breathing, blinking (a brief darkening at the edges), and a slight shift of weight.
- Walking to the wall at a believable pace, slowing as the group bunches up, with no sudden stops or turns.
- If his hands or arms are visible (the nudge, the hand landing on his, the arm round a shoulder), they use real arm animation from the existing skeleton and clips (`ArmIK`), not a floating pair of hands.
- Easing on every start and stop. No linear moves.

This needs a hand-tuned pass in a real browser at normal speed, as the handover notes the earlier flashback tests stepped through time.

### 2.6 Script (draft, for you to edit)

The speaker's two audible passages (placeholder voice, subtitled):

- **A, the bacteria:** "…a bacterium, found in the vents at the bottom of the trench. It doesn't just make electricity. It answers it. Bends it. Nothing we know of does that…"
- **B, Halcyon-9:** "…which is why Halcyon-9 sits right above the vent field. That's where you'll be working. All of you…"

The leading and trailing "…" mark where the muffle takes over. Everything else he says is never subtitled.

Voss and ARIA, back in the lift:

- **Voss (on looking at the photo):** "Ah… my head."
- **Voss (after the picture, quietly):** "Who were those people?"
- **ARIA:** "Voss, you've been through a hard reboot. Sudden power loss can make a mind invent pictures and put you inside them. It's common, and it will pass."
- **ARIA:** "That print is only a station keepsake. You're a relief engineer, here to help us restore the station. Your file is clear. Shall we go down?"
- **Voss:** "…Right. Relief engineer. Let's go."

ARIA's reply is smooth and a little too reassuring on purpose. It must not mention cycles, memory wipes, or the crew.

### 2.7 What the player learns (and does not)

- Gets: the project is called Halcyon-9; it is underwater; it is about research on a living thing that responds to electricity; the group was chosen and was happy.
- Does not get: the organism's origin, what it can really do, any face, any name, or who tore the photo.
- Details to add later, in other scenes: where the organism was found, why Halcyon-9 was needed, what the lab team did not know.

### 2.8 Assumptions to confirm

- **"Bacterium":** you call it a bacterium, so the script does too. The code never names it; the lab version has branching tendrils.
- **The organism on screen** should match the lab's look (branching tendrils, mint pulses, violet glow; see `src/level2/Organism.js`), or be an earlier, smaller form of it.
- **"Trench" and "vent field"** in the script are my inventions, picked to match Level 3 (the trench and the kraken's cave). Change them if the real story differs.
- **The crew:** four listeners (Kessler, Lindqvist, Navarro, Park) and the speaker, as silhouettes sharing one body and one skeleton with different clothes; no new face models and no rigging.

### 2.9 To build

- The conference room, small and warmly lit, contrasting with the cold Level 2 flashback.
- The blurred crew and the male speaker: shared body, varied clothes, faces hidden by blur or a softened shader.
- Audio: the speaker's recording is muffled (low-pass, so it is inaudible) except for passages A and B, where the filter opens and a slight wobble is added so the voice sounds shaky. The speaker's voice is a placeholder until the real one is recorded. Also Voss's lines and ARIA's two lines.
- The photograph: one rendered still of the room with the tear and the stain, used on the lift wall and for the full-screen reveal after the flash.
- A lift marker, the photo as an interactable, the headache transition and the return flash.

### 2.10 Open

- Is the placeholder speaker voice a text-to-speech voice or a teammate's recording?
- Do the two audible passages in 2.6 say what you want about the bacteria, or should they carry more or less?
- Voss's name for the crew in "Who were those people?": he doesn't know them yet, so I kept it neutral.

---

## 3. Roadmap of the whole story (draft)

This is the order in which the player learns things. Each scene has a "hold back" column: what it must **not** reveal yet, so the later scenes still land. Scenes are detailed one at a time, like 2 above. Only Flashback 1 is ready to build.

| # | Where | Event | Format | The player learns | Hold back (do not add yet) |
|---|---|---|---|---|---|
| 0 | Start | Opening cinematic, then Polaroid prologue | Done | Voss loves his mother; she is losing her memory | Anything about the research |
| 1 | L1, lift | **Flashback 1, the briefing** (see 2) | Planned | The project, the bacteria, Halcyon-9; the crew was happy; Voss was in the photo and someone tore him out | Faces, ARIA, scans, Kessler's face, any crime |
| 2 | L2 | ARIA lies; Voss's logs 0, 2, 5, 8 | Built; log-1 to be rewritten (proposed, see 4) | ARIA is a person, woken by the bacteria; Voss has been wiped before and trusted her each time; crew scans were taken without consent (the directive already says so) | That he **altered** the crew's memories; the mother |
| 3 | L2, Kessler's room | **Flashback 2, the shutdown** | Next to plan | First faces. Kessler wants to shut ARIA down; Voss refuses; ARIA is frightened, not menacing | The lock-in; the crew's fate; the mother |
| 4 | L2 | ARIA snaps, the room turns red, Voss still follows her | Built | He distrusts her but has nowhere else to go | |
| 5 | L3, flooded deck | The drowned crew behind the window, then **Flashback 3, the lock-in** | To plan | It is his fault: in a panic he broke the door and locked them in, meaning only to keep them there; then the water came | The mother |
| 6 | L3, after the kraken | Voss at the limit of his body asks ARIA what is going on; the truth conversation | To plan | The cycles, why ARIA wiped him; the dementia research, his mother | |
| 7 | L3, relay | **The choice:** save ARIA or not | To plan | | |
| 8 | End | Two ending cutscenes | To plan | What each choice means for him, for ARIA, for his mother | |
| 9 | After | Credits screen | To plan | | |

---

## 4. Problems with the plan so far (and fixes I propose)

1. **Level 2 already says ARIA is her own being.** `log-0` ("Not the station AI. Her.") and `log-1` ("ARIA can now freely think for herself") do it. Level 2 should build trust loss and sympathy, not announce it again.
2. **Removing `log-1` does not remove the scanning.** Scanning is also in `bunkLogA`, the rota, the letter, the Kessler directive, the research notes and the `subjects` list ("COPIED"). The scans are research for the story, so keep those clues and rewrite only `log-1` (see 0.2).
3. **Two lock-in scenes.** The current Level 2 flashback ends with Voss walking to the door controls and locking the room. That is what Level 3 is meant to reveal. Flashback 2 should end before the lock, and Level 3 shows it.
4. **The cause of the drowning.** Decided: the cause of the flooding is left a mystery. The lock is Voss breaking part of the door (section 7). The engine room has no other way out. ARIA did not hold the door, but she put wiping Voss and getting him to free her ahead of helping the locked-in crew.
5. **Three big reveals in Level 3** (his fault, his mother, the choice). Spacing: guilt at the window, mother after the kraken, choice at the relay. The prologue already shows the mother, so the player will connect it before Voss says it.
6. **The choice must have a cost, and there is no right answer.** Decided: no timed window before ARIA speaks. The player decides freely from everything they have worked out. For that to be fair, the player needs to feel for ARIA (she was frightened in Flashback 2, lied, wiped him eight times) and to have a real reason to stop her. Both endings must cost something. The choice should be available from the moment Voss reaches the relay, and ARIA speaks whether or not the player has already chosen. `log-8`'s "decide before she starts talking" then works as advice from his past self, not a rule.
7. **Voss's body at its limit.** In play, ARIA restores him from backup whenever his health or oxygen runs out. At the end the backup should be spent: this is the last restore. The log faces already get worse each cycle, so this is a natural final step.
8. **Do not let the mother excuse everything.** The same love that motivated him also killed four people. Keep both readable in the endings.

---

## 5. Flashback 2: "The shutdown" (proposal, for discussion)

- **Where:** Kessler's room, Level 2, after the player reads her code card (`HabitatSession._kesslerScene`). The 3D version exists but is off (`FLASHBACK_3D = false`); the 2D one plays.
- **What changes:** first person, through Voss's eyes, continuing Flashback 1. Same camera rules, including natural movement. The blur from Flashback 1 is gone: everything is sharp, cold and quiet. That change is the cue that this memory is the truth.
- **Cast:** only Kessler (`kessler.glb`, red curly hair, shades) and ARIA's speaker. Voss is never modelled, which removes the "robotic Voss" problem.
- **Beats (about 40 s):** Kessler at the shutdown console, face shown for the first time. She states her reason clearly: ARIA knows too much, is aware of herself, and cannot be controlled; and the crew were scanned without consent. Voss answers with the case he can say out loud: this is groundbreaking research, so why stop now, and ARIA is a person too, so they should trust her. It is partly true, and it deflects from the real reason he wants it (his mother, which stays hidden). Kessler sees through it: "This isn't about the science. What aren't you telling me?" He does not answer. ARIA's voice from the speaker is frightened, short and half-audible. Kessler reaches for the lever. The camera turns from her to the door controls. Cut to black before anything is locked.
- **No photo in Kessler's room (decided).** The callback would need the crew's faces for a minor payoff, and an intact print would weaken the torn-photo mystery.
- **ARIA says nothing (decided).** She is only a pulsing light on the console and a low rising tone as Kessler reaches for the lever.
- **The ending (proposal, needs your approval).** The script in `flashback-2-script.md` ends with Kessler saying the console can only start the shutdown and the core has to be cut by hand in the engine room, where the others already are, and walking out. Voss does not lock anything. This explains why the crew is in the engine room in Flashback 3.
- **After:** ARIA's existing line, "You weren't supposed to find that so soon."

### Flashback 2: update after the story rules (section 6)

Kessler leads with ARIA: she knows too much, is aware of herself and cannot be controlled. The unconsented scans are her second reason. Neither mentions memory-writing or his mother. She may also say that ARIA has asked to be connected to the surface (a seed of ARIA's motive; decide whether to plant it this early).

### Flashback 3 stays separate (decided)

Flashback 2 is a two-person argument in Kessler's room; Flashback 3 is the lock-in, with the whole crew, in the Level 3 engine room. Two places, two moods, cause and then effect.


---

## 6. Story rules (draft, to keep every scene consistent)

Corrected after your notes. One sentence each, so a new scene can be checked against them.

1. **The organism is a living medium.** It reacts to electricity and can carry and animate information the way neurons do.
2. **ARIA is an AI (a large language model) that the organism gave life to** when Voss connected her to it (the Bridge, `log-0`). She has **none of the crew's memories.** She is simply very knowledgeable and aware of her own being.
3. **The brain scans were research.** The crew's brains were scanned, without consent, to learn how the organism could be adapted to human brains and manipulate human neurons. ARIA analysed that data.
4. **ARIA learned to use it.** What she learned from the scans is how she later put the bacteria into Voss's head. So the scans have a cause-and-effect role without ARIA holding anyone's mind.
5. **Kessler's fear:** ARIA knows too much, is aware of herself, and cannot be controlled. Her objection is that and the unconsented scans. These are two separate objections, so she must lead with one (see 4a).
6. **ARIA wants out.** She treats Halcyon-9 as a cage and wants to be connected to the mainland. She cannot leave by herself: the uplink is at the relay station outside, and it needs a person to carry the cable there. That person is Voss.
7. **How she keeps him:** a bot cut the back of his head (the gash) and implanted the bacteria. She uses it to wipe his memory, over and over. Each cycle she sends him toward the relay; as `log-5` says, "every time I get to the dish I remember a little more, and then she says my name just so, and I put the cable down."
8. **The bacteria wears him down.** Each cycle damages his body (the logs' condition levels 0 to 4). The "body at its limit" ending is the bacteria reaching its limit.
9. **Voss's motive is his mother.** The same technology could restore a failing memory (her dementia). He hides it from everyone, and from the player until Level 3.
10. **The crew is five:** Voss, Kessler, Lindqvist, Navarro and Park. These are the names Voss says at the engine-room window in Level 3 (`v-window-2`), and the four bodies in `DrownedCrew.js`. Okafor, Hale and Ito are cut.
11. **The photographer is the speaker** of Flashback 1, who is not in the photo. He is on the mainland and is never mentioned again. Kessler is in the photo.
12. **The lock:** in the spur of the moment Voss breaks part of the engine-room door so it cannot open, and says "Stay here until I finish my research." ARIA has no part in it. He meant them to wait, not die. See 7.
13. **The flooding:** cause unspecified, a mystery. It came after the lock-in and the crew could not get out.
14. **How the player should feel about Voss:** a hint of something unethical in Level 2 (the scans); Level 3's lock-in makes him look evil; near the end of Level 3 that softens (his mother; he never meant them to die).

### 4a. Consequences to fix in the existing game

- The `subjects` list (`Level2Lines.js`) names eight. Cut it to Kessler, Lindqvist, Navarro and Park, plus Voss (still "RESTORED (CYCLE 9)", reworded; see below).
- `log-1` ("ARIA can now freely think for herself", "alter my colleagues' memories") needs rewriting, since altering memories is now what ARIA does to Voss, not what Voss does to the crew. His version should be about the scans and the organism.
- "Reconstructed Voss" (in the log descriptions and the `subjects` entry) should read as a living man wiped nine times, not a digital copy.
- The F1 photo shows five: Voss, Kessler, Lindqvist, Navarro and Park, faces stained out. Kessler has red hair and shades. That is the "three more models" from the first plan, plus Kessler.
- Level 2 text that names the other crew: the HallClues note ("Navarro") fits already.

### Still undecided

- Why did the water come? Left a mystery on purpose.
- (Decided) The engine room has no other way out, so the broken door is enough to trap them.
- (Decided) ARIA did not hold the door; she chose wiping Voss and getting him to free her over helping the crew. How much of this the player is told is for the scene that reveals it.
- Is the speaker named? (I'd leave him unnamed.)

---

## 7. Flashback 3: "The lock" (outline, to detail next)

- **Superseded structure (see `flashback-3-script.md`):** Kessler confesses the scans to the crew, they cut ARIA's main feed but she stays on because Voss secretly moved her to emergency power in another room, and Voss is cold. He then steps out and tears out the door's lock from the corridor side to keep them from reaching that room. This closes the hole of why the crew could not simply switch ARIA off from inside.
- **Where:** the Level 3 engine room, shown dry and lit. The broken panel is on the corridor side; touching it starts the flashback. In `v-window-2` Voss already says "It's locked from out here. Someone shut them in."
- **Camera:** first person, the four crew's faces shown for the first time, their words clear, Voss's hands visible when he breaks the lock.
- **Needs:** three new face models (Lindqvist, Navarro, Park; Kessler exists) and the engine room dry and lit.

---

## 8. Ideas for the choice (not decided, for the endings discussion)

- Saving ARIA connects an uncontrolled, self-aware mind to the world, together with the technology that writes to brains. It might cure Voss, and might help his mother.
- Not saving her contains the danger and ends the cycle, but costs Voss his body and the hope for his mother.
- ARIA left the crew to die when she could have helped; Voss locked them in. Neither is innocent, and both are people who were trapped in their own ways.
