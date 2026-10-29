# Flashback 2 — Script and Recording List

Draft for approval. Design: `cutscenes-flashbacks-plan.md`, section 5. First person through Voss's eyes, in Kessler's room (Level 2), about 45 s. Only Kessler and Voss speak. ARIA says nothing.

## What the player sees

The same camera as Flashback 1 (natural movement, breathing, a wandering gaze), but now everything is sharp, cold, teal and quiet. Kessler is the only person on screen: red curly hair, dark glasses, white coat. She stands at the shutdown console. ARIA is a pulsing light on the console, and a low tone rises as the scene goes on. Voss never appears and does not use his hands.

## The scene

| Time | What happens |
|---|---|
| 0–4 s | Cut in from black. Kessler at the console, her back half to us, then she turns to Voss: her face, shown for the first time. |
| 4–10 s | Kessler tells him it is signed. Voss steps closer and answers. |
| 10–22 s | Kessler gives her reasons. Voss argues back. The light on the console pulses faster. |
| 22–30 s | Kessler: ARIA asked to be connected to the surface. Voss looks away. |
| 30–36 s | Kessler: "This isn't about the science." He does not answer. A long silence; the tone rises. |
| 36–45 s | Kessler says she will cut the power by hand. She walks past him out of the door. Voss watches her go, then looks at the console, which reads "ISOLATION REQUIRED: ENGINE ROOM". Cut to black. |

Nothing is locked in this scene. After the black, the game's existing ARIA line plays ("You weren't supposed to find that so soon").

## Lines

**Kessler** — tired, controlled, never shouting. She cares about him; she is trying to reach him. Her voice is a woman in her thirties, bold and brave.

| File | Line |
|---|---|
| `fb2-kessler-1` | "It's signed. I'm shutting her down tonight." |
| `fb2-kessler-2` | "She knows more than all of us together, and she knows what she is. We can't control her. And we scanned our own crew without asking." |
| `fb2-kessler-3` | "She asked me to connect her to the surface. Twice. Is that trust?" |
| `fb2-kessler-4` | "This isn't about the science. What aren't you telling me?" |
| `fb2-kessler-5` | "Then I'll cut her power by hand. The others are already in the engine room." |

Directions: `-1` flat and final. `-2` firm, with a small breath before "And we scanned". `-3` quiet, the line she has been holding back. `-4` gentle, not an accusation; she really wants to know. `-5` after a silence, resigned, as she picks up her things.

**Voss** — the living Voss, but in this scene fanatical, shouting and nearly manic, the opposite of Kessler's control. He is telling the truth, but not the whole truth. (Recorded with the tags [shout][insane] and [pleading][insane]; the tags are not spoken text.)

| File | Line |
|---|---|
| `fb2-voss-1` | "No Elena! Can't you see that this is groundbreaking! We can change the WORLD!" |
| `fb2-voss-2` | "She's a person too. You can't just switch a person off. I trust her." |
| (no recording) | After `fb2-kessler-4` he says nothing. Show the caption "…" with no sound. |

Directions: `-1` a shout that cracks into pleading and ends on "WORLD" with real fervour. `-2` quieter and earnest, closer to pleading; this is the line the player should half-believe.

## Recording list

| File | Folder |
|---|---|
| fb2-kessler-1 to -5 | `public/assets/audio/flashback2/` |
| fb2-voss-1, -2 | `public/assets/audio/voss/` |

Total: 7 files. Record each Kessler line separately, clear and normal (no muffling this time). Kessler's voice must be clearly different from ARIA and from the Flashback 1 speaker.

## Notes for the implementer (later)

- The scene is built around the real recording lengths; the guide times above will move.
- Kessler's mouth is driven by her recordings. Use mid-shots, not extreme close-ups, and keep her glasses on.
- The existing `l2-kessler-1`, `v-what-did-i-do`, Kessler's final log and the directive need a read-through against these lines (the final log says "with or without Voss's agreement", which fits).
