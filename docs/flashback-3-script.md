# Flashback 3 — "The lock": Script (revision 2)

Revised 2026-10-30, replacing the first draft (that one was too long and its key moments didn't land). Design context: `cutscenes-flashbacks-plan.md` (sections 6 and 7). Follows Flashback 2, where Kessler says "Then I'll cut her power by hand. The others are already in the engine room."

First person through Voss's eyes, in the Level 3 engine room (shown dry and lit), about 85–90 s with the lock, the shaking and the walk away (the build's estimate before the recordings; it is timed from their real lengths). The crew's faces are shown clearly for the first time. ARIA says nothing; she is only a light.

## What changed from the first draft

- **A faster talk.** The confession is a few short sentences, not two speeches. Lines that repeated Flashback 2 ("she knows more than all of us together…") are gone. So are Navarro's thank-you and his "That's not possible", which deflated the silence after the cut.
- **Voss is cold, with one flash of the Flashback 2 man.** On "one last chance" the manic Voss surfaces for a moment, then he goes flat again: "Guess that settles it." They rush him, and he locks them in.
- **The cold cracks once.** After he tears the lock out, his hands shake and his breathing goes ragged for a few seconds. Then he steadies and says "Stay here…". He is not a monster; he has just done something he can't take back.
- **Kessler loses her temper.** She is controlled until Voss admits he went behind her back, then she shouts. She shouts once more at the door.
- **The water line is small and quiet.** Park's confused question replaces Navarro's long warning. Voss stops dead when he hears it, does not turn, and walks on.
- **Tagged recordings.** Every line has delivery tags for the voice generator (as Flashback 2 used `[shout][insane]`). The tags are not spoken.
- **Faces and bodies act.** Anger shows as hard-down brows with creases between them (`FaceCreases`), a mouth pulled down and a lowered head. The hands and bodies act too (`story/gestures.js`): a hand to the chest, jabbing and pointing, fists, arms out, arms folded, hands on hips, hands over the face, and leaning in or back.

## Assumptions

- Voss breaks the door's lock mechanism **from the corridor side**, so the player later finds the panel in the corridor ("It's locked from out here").
- Voss has already moved ARIA to the emergency power (in another room) **before** this scene. He locks the crew in so they cannot go and cut that power too.
- The flooding is hinted only by Park's last line; its cause is never explained. His mother is not mentioned. "A few more days of research" points at his hurry without saying why.

## The set

The engine room: a big humming machine, with a thick **main feed** coupling that runs to a conduit labelled "ARIA, PRIMARY". The door behind Voss is open. A console in the corner has ARIA's light on it. Four crew stand in front of the machine: Kessler leads, with Park holding a heavy wrench, Lindqvist and Navarro beside her.

## The scene

| Beat | What happens | Lines |
|---|---|---|
| **1. Confession** | Voss stands in the doorway, still. Kessler faces the crew; at first she can't look at them. | K1, L1, P1, K2 |
| **2. Decision** | Lindqvist is the first to turn to the feed; the others follow. | K3, L2 |
| **3. The cut** | Park heaves on the wrench. The clunk, the lights flicker, the hum dies. Then a full **4 s** of silence: everyone gasps and looks up at the lights. Then ARIA's light on the console, still pulsing. | P2, *(silence)*, P3 |
| **4. The turn** | Nobody speaks. One by one they turn to the doorway and stare at him without blinking. Park takes half a step back. | K4, L3, V1 |
| **5. The argument** | Kessler, hurt turning to anger. Voss answers with a flash of mania. Lindqvist and Navarro turn on him. Park puts his hands over his face: he can't bear to watch. | K5, V2, L4, N1 |
| **6. The lock** | Voss, flat: "Guess that settles it." Lindqvist lunges first and they rush him. He backs out, swings the door shut and tears out the lock from the corridor side (sparks). Lindqvist pounds on the glass; Kessler shouts through it. The pounding stops on Navarro's "Oh no". | V3, K6, P4, N2 |
| **7. The crack** | His hands come up in front of him and shake. He looks down into them; his breath is ragged and fast, his heart pounding. A few seconds, then it dies down and he lowers them. | *(no lines)* |
| **8. The button** | Voss steps back to the window and faces them. Kessler's palms are flat on the glass. | V4 |
| **9. The water** | He walks away. As the door seals behind him, Park's small voice. On "wet" Voss **stops dead**: his head turns a little toward his shoulder, as if he would look back. He doesn't. He walks on. Cut to black. | P5 |

## Lines

The `[tags]` are delivery directions for the voice generator, not spoken text.

| # | File | Speaker | Line |
|---|---|---|---|
| K1 | `fb3-kessler-1` | Kessler | `[quiet, steadying herself]` "The B-lab scans weren't calibration. We copied your minds. Nobody asked you." `[breath]` "I signed it." |
| L1 | `fb3-lindqvist-1` | Lindqvist | `[stunned]` "You *signed* it?" |
| P1 | `fb3-park-1` | Park | `[small, understanding slowly]` "The headaches. The ones we all had after B-lab. That was…?" |
| K2 | `fb3-kessler-2` | Kessler | `[barely audible]` "Yes." |
| K3 | `fb3-kessler-3` | Kessler | `[firm]` "And ARIA's awake. Whatever she wants, it isn't what we want. She goes off tonight." |
| L2 | `fb3-lindqvist-2` | Lindqvist | `[jaw set]` "Then we do it now. Park." |
| P2 | `fb3-park-2` | Park | `[straining with effort]` "Cutting it—" |
| P3 | `fb3-park-3` | Park | `[whispering, frightened]` "…She's still on." |
| K4 | `fb3-kessler-4` | Kessler | `[hurt, hard]` "Voss." |
| L3 | `fb3-lindqvist-3` | Lindqvist | `[low growl]` "What did you do?" |
| V1 | `fb3-voss-1` | Voss | `[flat, bored]` "Moved her to the emergency supply. Two days ago." |
| K5 | `fb3-kessler-5` | Kessler | `[angry]` "Why are you doing things behind my back, Voss?!" |
| V2 | `fb3-voss-2` | Voss | `[insane]` "Look, I want to give you guys one last chance. Just a few more days of research, okay?" |
| L4 | `fb3-lindqvist-4` | Lindqvist | `[disgusted]` "Voss, you're senile." |
| N1 | `fb3-navarro-1` | Navarro | `[shouting]` "Voss, who do you think you are?!" |
| V3 | `fb3-voss-3` | Voss | `[flat, quiet]` "Guess that settles it." |
| K6 | `fb3-kessler-6` | Kessler | `[shouting, through glass]` "VOSS! Open it!" |
| P4 | `fb3-park-4` | Park | `[crying]` "Please, we're your friends—" |
| N2 | `fb3-navarro-2` | Navarro | `[quiet, realising]` "Oh no." |
| V4 | `fb3-voss-4` | Voss | `[cold, steady]` "Stay here until I finish my research." |
| P5 | `fb3-park-5` | Park | `[small, confused]` "Elena… why is the floor wet?" |

### Delivery notes

- **Kessler:** honest, guilty, controlled through beats 1–4; her voice nearly goes on "I signed it". K5 is the first time she is loud, and it should sound like it surprises her. K6 is a shout, not a scream.
- **Lindqvist:** angry, the first to react. L4 is contempt, not a shout.
- **Navarro:** N1 is the only time he shouts. N2 is almost to himself: he has just understood they cannot get out.
- **Park:** young, frightened. P3 is barely a whisper. P5 is a kid's question, not an alarm: he hasn't understood yet.
- **Voss:** cold and flat, except V2, where the manic Flashback 2 Voss breaks through for one line and is gone again. V3 is quieter than anything before it. V4 comes after the shaking: he has forced himself steady, so it has no emotion at all. He means it as a plain instruction. (His breathing in beat 7 is made in the game, not recorded.)
- **Through the glass** (K6, P4, N2, P5): recorded clean; the game muffles them. P4 may start under the end of K6, and N2 under the end of P4.

## Faces and bodies

| Beat | Kessler | Lindqvist | Navarro | Park | Voss (camera, hands) |
|---|---|---|---|---|---|
| 1 | `strained`, face turned down; eyes shut on "I signed it" | Shock turning to anger | Hurt, brows up | Slowly understanding | Still, gaze fixed |
| 2 | Firm, a leader's order | Set, turns to the feed | Follows | Nervous, goes to the feed | — |
| 3 | A gasp at the cut, eyes up | Gasp | Gasp | Effort, then fear | Looks at the lights, then at ARIA's light |
| 4 | Turns first; stares (no blinking) | Stares, furious | Stares | Half a step back, nerves rising | Barely moves |
| 5 | Hurt turning to anger on K5 | Contempt on L4 | Anger on N1 | Hands over his face | A small lean forward on V2, then still |
| 6 | At the glass, shouting | First to lunge; pounding on the glass | At the glass; goes slack on "Oh no" | Crying | Backs out; both hands tear out the lock |
| 7 | Palms on the glass | One fist resting on the glass | Staring | Hands down, crying | Hands up in front of him, shaking; breath ragged; then steadies |
| 8 | Palms on the glass | — | Staring | Crying | Faces the window |
| 9 | Watching him go | — | — | Looking down at the floor | Stops dead on "wet", half turns his head, walks on |

## Recording list: 21 files, all new

| Speaker | Files | Folder |
|---|---|---|
| Kessler (the same voice as Flashback 2) | `fb3-kessler-1` to `-6` (6) | `public/assets/audio/flashback3/` |
| Lindqvist | `fb3-lindqvist-1` to `-4` (4) | same |
| Navarro | `fb3-navarro-1`, `-2` (2) | same |
| Park | `fb3-park-1` to `-5` (5) | same |
| Voss | `fb3-voss-1` to `-4` (4) | `public/assets/audio/voss/` |

All 21 are in place and play (2026-10-30). The first draft's takes were moved out of the game to `audio-archive/flashback3-v1/`, so they can't play under the new lines. If a take is ever missing, its line shows as a timed subtitle and the mouth moves on its own. The pounding on the glass, the crowd sounds, Voss's heartbeat and breathing are effects.

**Levels.** As recorded the takes run from -29 LUFS (V3) to -15 (N1). `VOICE_GAIN_DB` in `src/level3/LockFlashback.js` brings each to about -16 LUFS through the dialogue bus (the ending's compressor and limiter), the quietest deliveries down to -18 and the two shouts up to -15.5. To re-measure a new take: `window.__chain(file, gainDb, lowpassHz)` in `scripts/confrontation/loudness.html`.

## Cost and risks

- **Four speaking faces.** Never show more than two faces in close-up at once; keep Park, Lindqvist and Navarro mostly in mid-shots; use Kessler for the closest shots. Kessler's near and close spots are off to Voss's right, so the others are seen past her.
- **Park's hands over his face**, the pointing, the fists and the folded arms are posed by IK on top of the idle clip (`story/gestures.js`), not real animation clips. They hold well in mid-shot. A full-body close-up would show they are poses.
- **The shaking hands** are the same: both hands posed in front of him, with a tremor of about ten shakes a second that dies down.

## Decided

- "Emergency supply" is enough: the emergency power room is never named and the player never visits it.
- Everyone except Kessler is called by surname (Kessler is "Elena").
- The water: Park's last line as the door seals. Voss stops when he hears it, but does not turn or answer.
- They rush him (kept from the first draft), and his hands shake after the lock.
