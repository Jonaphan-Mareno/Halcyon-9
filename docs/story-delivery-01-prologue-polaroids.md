# Story Delivery Plan — Part 1: The Polaroid Prologue

Status: planning. Nothing here is built yet.
Series: this is idea 1 of several ways to let the player piece the story together. Later parts go in sibling files (`story-delivery-02-*.md`, ...).

---

## 1. Goal of the whole series

Let the player *work out* the story instead of being told it. Every delivery method should:

- give a fragment, never the full picture;
- be understandable on its own but richer once other fragments are found;
- stay cheap on disk and bandwidth, because the game runs from the school server. "Something that runs beats something prettier that doesn't."

Rule of thumb for subtlety: **show the emotion and the facts, withhold the meaning.** The prologue tells the player *who Voss loves and why he is desperate*. It does not tell them what the organism is, what Halcyon-9 did, or who ARIA is.

## 2. The prologue in one line

Before Voss wakes in the cell, the player sees a six-photo life story of Voss and his mother, then hears the last day he spent with her. Then Level 1 begins.

## 3. Format decision

| Option | Cost | Verdict |
|---|---|---|
| In-engine 3D scene | Models, rigs, animation, load time, GPU | Rejected: overkill, heavy for the school server |
| Short video | Several MB, codec issues | Rejected: size |
| **Six still images + one audio clip + subtitles** | ~0.5 MB total | **Chosen** |

The prologue plays on top of the existing welcome/start flow, before `IntroSequence`/the opening cinematic, and ends by handing off to Level 1 as normal.

## 4. Visual style: "instant photos left to dry"

Each image is a Polaroid-style print: white border, thicker at the bottom, slightly crooked, on a dark surface.

- **Development effect:** each photo fades in from a pale milky blank to full colour over ~3 s, like a print developing. Pure CSS (`opacity` + `filter: contrast/saturate/sepia`), no extra assets.
- **Colour grade:** warm, faded, slightly yellow in the early photos. It cools and desaturates as the story turns.
- **Handwriting:** a short caption on the white strip of each photo (the "Sharpie on a Polaroid" look). Captions carry quiet storytelling, see the shot list.
- **Transition:** the previous photo slides/drops away or is picked up and a new one slides in. Slight paper rustle sound. Keep it simple: one animation reused six times.
- **Not a slideshow:** photos arrive on the beat of the audio, not on a fixed timer.

## 5. The six images (shot list)

All images are painted/illustrated in one consistent style (same mother, same boy at different ages). The mother ages visibly across the set.

| # | Moment | What the picture shows | Caption on the strip | Mood |
|---|---|---|---|---|
| 1 | Baby | Mother, young, holding baby Voss, both squinting at the light | *"Our little Voss"* | Warm, bright |
| 2 | Child | Voss about 6–7, gap-toothed, on the floor with a toy submarine or a science kit, mother laughing behind him | *"He wants to be an explorer"* | Warm |
| 3 | Teenager | Voss about 15, a science fair or a model on a table, mother proud beside him, first grey hairs | *"Top of the class again"* | Warm, a little tired |
| 4 | Graduation | Voss in cap and gown, mother standing next to him holding the certificate, older, smiling | *"Dr. Voss"* or the year | Peak happiness |
| 5 | Collapse | Mother on the floor of a kitchen or hallway, Voss kneeling over her in panic. Photo is crooked, partly blurred, as if taken by accident or by someone else | none, or a scribbled-out caption | Turn: cold, desaturated, harsh flash |
| 6 | Hospital | Mother in a hospital bed, frail, Voss's hand in hers at the edge of frame. A banner or chart in the background | see section 6 | Quiet, cold blue-grey |

Notes:

- Photo 5 breaks the style on purpose: the white border is torn or stained, the print is unevenly developed. The *medium* tells the player something went wrong.
- Photo 6 should be the stillest image. No smile, no caption. The development effect is slower and never fully completes (stays slightly washed out).
- Keep Voss recognisable as the same face the player will see in the game's logs and flashbacks (see `HANDOVER_Voss_Kessler_VideoLogs_Flashback.txt`).

## 6. Parkinson's or dementia?

**Recommendation: dementia.**

- Your script has her forgetting how old Voss is ("you're still a wee boy"). That is dementia, not Parkinson's. Parkinson's mainly affects movement and only sometimes leads to dementia.
- Her collapse can still be explained: a fall is common in dementia patients.
- It gives Voss a clock he cannot beat. She is losing *herself*, which is exactly why a "reconstructed consciousness / saving a mind" story lands later.

Avoid a giant on-the-nose banner reading "DEMENTIA". More subtle options for photo 6:

- a hospital wristband and a bedside chart where the word *Dementia* or *Alzheimer's* is legible only on close look;
- a whiteboard behind the bed with the date and "Where am I?" written on it for her;
- a ward sign such as "Memory Care Unit".

Pick one. The player should *notice* it, not be told it.

## 7. The audio

Plays over a **black screen between and under the photos**. Subtitles at the bottom. The photos appear on the lines marked below, so the audio is the spine.

Draft script (your lines, lightly structured):

| t (approx.) | Photo | Line |
|---|---|---|
| 0:00 | none, black | *Quiet room tone, a clock, soft music box or piano.* |
| 0:03 | 1, 2, 3, 4 appear quickly, one every ~2 s over the music alone, no dialogue | *Montage, music only (or her humming).* |
| 0:12 | black | **Mother:** "Vossy, where are you going?" |
| 0:15 | | **Voss:** "Work, Mom." |
| 0:17 | | **Mother:** (laughs) "Haha, but you're still a wee boy." |
| 0:21 | | **Voss:** (gently, a little sad) "Mom... I'm twenty-five." |
| 0:25 | | *A cup or a plate hits the floor. A thud.* |
| 0:26 | 5 | **Voss:** "Mom?!" (panic) |
| 0:29 | 5 | *Breathing, a phone dialling, then a siren far away.* |
| 0:35 | 6 | *Hospital: a heart monitor, steady beeping, a quiet corridor.* |
| 0:40 | 6 | **Voss:** (teary, resolute, close to the mic) "I'll save you. We found a new organism... and I'll find a way to save you." |
| 0:50 | black | *Heart monitor holds, then cuts to the cell's humming silence.* Level 1 begins. |

Direction notes:

- **"I'm twenty-five" vs the graduation photo.** A graduation at 25 and "Dr." in photo 4 fits a PhD. Make sure photo 3 and 4 ages feel close to 25, and that the "wee boy" mix-up is believable.
- **The last line is the hook** and the only mention of the organism. It lines up with the glowing organism in Level 2 without explaining it. Do not add a name for it here.
- Short pauses matter more than extra words. Resist adding explanation lines.
- Record Voss and his mother in the same session if possible so the room sounds match. Use the same Voss voice actor as the in-game lines.
- Keep the music to a single looping cue that the mother's hum or a music box carries; it can *return later* (see section 10).

## 8. Subtitles

- Same subtitle component as the existing intro dialogue (check `src/story/IntroSequence.js` and `src/audio/VossVoice.js` for the timed-subtitle fallback that already exists).
- Speaker is shown by colour or a short label ("MOM", "VOSS"), not a name box. Sound effects in italics in brackets: *[a plate shatters]*.
- Since text is the fallback for everything, the prologue stays fully understandable with sound off.

## 9. Technical plan and size budget

| Asset | Spec | Size |
|---|---|---|
| 6 images | WebP, ~1024 px on the long side, quality ~75 | ~40–80 KB each, ~0.4 MB |
| 1 audio file | Ogg Vorbis mono, ~64 kbps, ~50 s (dialogue + sfx + music premixed) | ~0.4 MB |
| Polaroid frame | CSS (border, box-shadow, rotation), no image | 0 |
| Handwriting font | Subset Google Font or system cursive fallback | <30 KB, or 0 |
| Total | | **about 1 MB** |

Implementation outline:

1. New `src/story/PrologueSequence.js`. It exposes `play(): Promise<void>`, like `Flashback.js` does, and takes the same `ui` the intro uses.
2. Data-driven: an array of `{ image, caption, atSeconds }` cues plus a subtitle track `{ atSeconds, speaker, text }`. All timing lives in one place so you can retime without touching code.
3. A single audio element drives the clock. Cues fire from `audio.currentTime`, not `setTimeout`, so photos never drift from the voices.
4. Preload: start loading the images and audio while the title/welcome screen is showing.
5. **Fallback:** if the audio fails to load, run the same timeline on a timer with subtitles (the same approach `IntroSequence` uses for missing clips).
6. **Skip:** always skippable (*Enter* or a "Skip" prompt), for developers and returning players. No "seen" flag is stored: the prologue plays on every page load, so anyone who skips by accident just refreshes to see it again.
7. Hook-in: call it from the welcome flow in `Game.js` before Level 1 starts (and respect restart-without-reload).
8. Accessibility: audio has a mute-safe subtitle track; photo animations respect `prefers-reduced-motion` (no slide, just fade).

## 10. How the prologue pays off later (keep it subtle)

These are *echoes*, not explanations. The aim is for the player to feel a click, not receive a lecture.

- **The music box / mother's hum** returns faintly in a late-game moment (ARIA's reveal, a log, Level 3). The player recognises it before they know why.
- **A Polaroid frame in the world.** One photo (not all six) appears pinned inside Voss's quarters in Level 2. Same white border, same handwriting. Players who remember the prologue connect it; others just see a photo.
- **The handwriting** in photo captions matches a note in his quarters. Implies who wrote them.
- **ARIA's behaviour.** ARIA never mentions the mother. If she ever says "you were so determined to save someone", it should *land* because the player already knows who.
- **"A new organism."** The only line linking the prologue to the station. Level 2's organism room should echo it without naming it.
- **Kessler's logs** could mention Voss "calling his mother every night" without further context.

## 11. What we are deliberately *not* telling the player here

- Whether Voss succeeded.
- How long ago this was.
- That the player-Voss is a reconstruction (the prologue memory is presented neutrally, as if it's *his* memory, which also quietly sets up the later question of whose memory it really is).
- What ARIA's role was.
- What the organism does.

## 12. Open questions for you

1. Do you paint the six images yourself, or should I draft prompts/briefs for an image generator? (Section 5 can be turned into per-image prompts.)
2. Who records the mother's voice?
3. ~~Skippable?~~ Decided: always skippable, replays on refresh (section 9).
4. Should the very first thing the player sees be the title screen then the photos, or the photos before anything?
5. Does the photo from section 10 appear in Level 2 quarters? If yes it needs a texture added to the Voss room.

## 13. Next steps

1. You confirm the answers in section 12 and the dementia choice.
2. Finalise the audio script (section 7) and record.
3. Make/commission the six images.
4. Build `PrologueSequence.js` and wire it before Level 1.
5. Move on to idea 2 (to be added as `story-delivery-02-*.md`).
