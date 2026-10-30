# The devlog video: how it is built

The video follows `devlog/script.md`. Its timeline is `timeline.js`: every line, who says it, and what is on screen under it.

## The pieces

| File | What it does |
|---|---|
| `timeline.js` | The beats: the line, the speaker, the footage (`gp` ranges of `gameplaypart1.mp4`, a Blender render, an old version), the code card, the diagram, and the handoff gags |
| `doodles.js` | The six of us as doodles (from `devlog/doodles/team-sheet.html`) |
| `overlay.html` + `overlay.js` | The drawn layer: the doodles and gags, code cards, the Blender interface, tags, titles and diagrams, rendered frame by frame |
| `blender_turntable.py` | Renders a `.blend` file (or a `.glb`) in Blender's viewport look: an orbit, a view from inside the room, a dollhouse cutaway, a "build" where objects appear one by one, or shape keys sliding |
| `capture-old.mjs` | Checks an old commit out into a worktree, runs it, and films it (the "before" shots) |
| `build.mjs` | Puts it all together: the footage cut to each beat, the game's sound with the gags' sound effects, the drawn layer on top |

## Building

You need ffmpeg on the PATH, Chrome or Edge, Node 22+, and Blender (for the renders). From the repo root:

```bash
node devlog/video/build.mjs <scratch dir> data base audio overlay compose
```

It writes to `devlog/out/`:
- `halcyon9-devlog-clean.mp4`: no text, for the voices to go on
- `halcyon9-devlog-prompter.mp4`: each line on screen with its speaker, to read from while recording
- `cues.md`: every line with its time, grouped by person

Each beat's length comes from its words at 2.8 words a second, plus a breath. After everyone has recorded, the lengths can be set from the real recordings and the video rebuilt to fit the voices exactly.

Render outputs go in the scratch dir, not the repo:
- `blender/<name>/`: the Blender renders
- `old/<name>/`: the old versions
- `build/`: the segments, overlay frames and audio
