# Flashback 1 — Recording Script

For the recordings of Flashback 1 ("The briefing", see `cutscenes-flashbacks-plan.md`, section 2) and the rewritten `log-1`. Lines are numbered by the file name they should be saved as.

## How to record

- **Format:** mp3, mono is fine, no music or reverb (the game adds the muffle and the room sound). Leave about half a second of silence at the start and end of each file.
- **Where they go:** Voss in `public/assets/audio/voss/`, ARIA in `public/assets/audio/aria/`, everything else in `public/assets/audio/flashback1/` (a new folder). File names are lowercase and hyphenated.
- **Timing:** the scene is built around the recordings, not the other way round. Speak at a natural pace; the agent will time the scene to the real lengths. Target lengths are given only as a guide.
- **Keep the speaker's recordings in the separate files below.** The game makes some of them muffled and inaudible, so the muffled ones must be recorded too, as normal clear speech.

---

## 1. The speaker (male, a professional briefing a room, warm and slightly pleased)

The speaker is a project official who has come to congratulate the team and take their picture. He is calm and confident, like a man who has given this talk before. He never says Voss's name, any crew name, or ARIA.

### `fb1-speaker-1` — muffled, about 4 s
> "Good morning, everyone. Please, sit. I'll keep this short, because you've earned the good news."

### `fb1-speaker-a` — **audible passage A, the bacteria**, about 9 to 10 s
Said a little more slowly and with awe, as he turns to the screen. The game makes this one slightly shaky and subtitles it.
> "A bacterium, found in the vents at the bottom of the trench. It doesn't just make electricity. It answers it. Bends it. Nothing we know of does that."

### `fb1-speaker-2` — muffled, about 6 s
> "Of everyone we considered, you were chosen for the quality of your work, and because we trust every one of you. That matters more than you can know where you're going."

### `fb1-speaker-b` — **audible passage B, Halcyon-9**, about 6 to 7 s
Said with a smile, then a small pause on "All of you." The game makes this one slightly shaky and subtitles it.
> "Which is why Halcyon-9 sits right above the vent field. That's where you'll be working. All of you."

### `fb1-speaker-3` — muffled, about 4 s
He laughs a little as the room reacts.
> "Yes, yes, I know. Congratulations. Well done, all of you. Now, one more thing."

### `fb1-speaker-photo` — muffled, about 5 s
Cheerful, calling across the room, as he lifts the camera.
> "Over by the window, all of you. Closer. Arms round each other, please. On three. One, two, three..."

---

## 2. The room (can be recorded by anyone, several voices together, muffled in the game)

### `fb1-room-cheer` — about 3 s
The four crew react to the news: a warm, surprised murmur of "oh!", laughter, "yes!", someone clapping. No words that can be made out.

### `fb1-room-photo` — about 2 s
All together on the speaker's "three", happy and a little ragged: "Halcyon!"

---

## 3. Voss (the same voice as the other Voss recordings)

He does not know the people in the memory and does not believe he is crew.

### `fb1-voss-head` — about 2 s
When he looks at the photograph. A short, pained breath rather than a line.
> "Ah… my head."

### `fb1-voss-who` — about 3 s
Quietly, after the picture, to himself.
> "Who were those people?"

### `fb1-voss-ok` — about 3 s
Flat, uncertain, deciding to believe her.
> "…Right. Relief engineer. Let's go."

---

## 4. ARIA (the same voice as the other ARIA recordings)

Warm, soothing, slightly too smooth. She must sound caring, not threatening. She never mentions cycles, wipes, the crew, or what the organism does.

### `fb1-aria-1` — about 8 s
> "Voss, you've been through a hard reboot. Sudden power loss can make a mind invent pictures and put you inside them. It's common, and it will pass."

### `fb1-aria-2` — about 9 s
> "That print is only a station keepsake. You're a relief engineer, here to help us restore the station. Your file is clear. Shall we go down?"

---

## 5. Voss's log, `log-1` (rewrite)

The current `log-1` has Voss altering his colleagues' memories, which no longer matches the story (ARIA is the one who wipes memories). This replaces it. He is the living Voss, before the disaster, tense and still excited. It keeps the length and the closing beat of the original.

Save as `public/assets/audio/logs/log-1.mp3` (the agent will check how the existing logs are named and loaded).

> "Day seventy-three. We scanned the whole team this month, and Kessler isn't happy about how. The organism reacts to a living brain. Not a little: it reaches. ARIA ran the analysis in an hour that would have taken us a year. She's learning faster than we can follow. I think the team is beginning to fear the research more than they feel excited by it. I don't. I can't see why they can't see what I see."

**Direction:** keep the pace of the original and give "it reaches" a beat of wonder. The last three sentences are the point of the log: he is not sinister, he is simply not afraid, and he does not understand why the others are. Say "I don't." quietly and flatly, then let the final line carry a little puzzlement and loneliness, not menace. It sets up how differently he and Kessler see ARIA in the Level 2 flashback.

Note for the agent: the text above replaces `LOGS['log-1'].text` in `src/level2/Level2Lines.js`. The `beats` entries are keyed to phrases in the old text (`'I found ways'`, `'selectively alter'`, `'ARIA can now'`, `'I think the team'`, `"something's wrong"`) and must be re-keyed to phrases in the new one: for example `'Day seventy-three'`, `"Kessler isn't happy"`, `'it reaches'`, `"She's learning"`, `'I think the team'`, `"I don't."` and `'what I see'`. The old closing beat (frown, brows up, still) should become a small head shake and a puzzled look, not worry.

---

## 6. Checklist

| File | Folder | Needed |
|---|---|---|
| fb1-speaker-1, -a, -2, -b, -3, -photo | flashback1 | 6 |
| fb1-room-cheer, fb1-room-photo | flashback1 | 2 |
| fb1-voss-head, -who, -ok | voss | 3 |
| fb1-aria-1, -2 | aria | 2 |
| log-1 | logs | 1 |

Total: 14 recordings.
