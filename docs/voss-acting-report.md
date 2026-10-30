# Voss acting: report

The animation layer for a third-person Voss in the ending (agent A of `docs/voss-acting-agent-prompt.md`). Nothing is committed.

## 1. What was built, and the API

**`src/entities/vossActing.js`**: the retarget and a standalone actor.

```js
import { loadVossActing, VossActor, ACTING_CLIPS, TRANSITIONS } from './entities/vossActing.js';

const clips = await loadVossActing(player);   // the Player (after load) or any Voss model; lazy, cached
const actor = new VossActor(player, clips, { preset: 'resigned', wound: true });
scene.add(actor.root);                         // a Group; Voss faces +Z inside it (so root.lookAt(p) aims him), 1.8 m tall
// every frame:
actor.update(dt);
```

**Loading.** `loadVossActing(src)` loads the six FBX files (about 3.9 MB) the first time it is called and never at game start. It retargets them, disposes the FBX scenes, meshes and skeletons, and returns 7 `AnimationClip`s named `InjuredWalk, SadIdle, Stagger, SitDown, StandUp, SitIdle, FallForward`. Later calls share the same promise. Each clip carries `userData`:

- `loop`
- `travel`, `start`, `end`: the hips' xz in model metres; multiply by 1.29 for world metres
- `InjuredWalk` adds `stride` and `stops`
- `FallForward` adds `fromSit` and `fromSeat`

The whole load takes about 0.3 s of download and parse, plus 0.4 to 1.7 s of retarget and floor measuring, measured headless on SwiftShader, which is slower than a real GPU PC. It all runs once on the main thread, so **call it a few seconds before the cutscene** (for example on entering the relay room), not on the cutscene's first frame. No baked file was needed.

**`VossActor`** is a `cloneSkinned` copy of the given Voss. It shares the Player's toon materials, worn face texture and geometry; `dispose()` leaves those alone and frees only the mixer and the copy's skeletons. It has its own `FaceRig` (`actor.face`, blinking on, default preset `resigned`) and its own `ArmIK`s, and it is reset to rest when built, whatever the source was doing.

| Member | What it does |
|---|---|
| `play(name, opts)` / `crossTo(name, opts)` | Crossfade to a clip. `opts`: `fade` (seconds; default from `TRANSITIONS`), `at` (start time), `rate`, `restart`, `then` (a clip to cross to when this one-shot ends; that fade is timed to finish as the clip ends), `thenFade`. Replaying a one-shot that still shows uses a twin action, so it fades from itself instead of snapping. |
| `update(dt)` | Order: undo last frame's procedural turns → stop or `walkTo` logic → weights → mixer → face → idle life → hands off the floor → reaches → `onAfterMixer` hooks. |
| `isFinished(name)` | A one-shot has reached its end (it holds the last frame), or a loop has played through once. |
| `weight(name)`, `weights()` | Blend weights now. They always sum to exactly 1, so no rest pose ever leaks in. |
| `walkSpeed` (get/set), `naturalWalkSpeed` | 0.55 m/s at the clip's own pace. Setting a speed changes the clip's rate (0.4× to 1.8×) so the feet don't slide. |
| `moveSpeed` (read) | How fast to move `root` along its facing this frame: 0 unless walking, and it slows through a stop. The clips play in place; the caller moves the root. |
| `stopWalk(then = 'SadIdle')` → Promise | Keeps walking to the walk's next planted-foot frame, slowing to 45% of its pace on the way, holds that frame and fades to `then`. Resolves when the fade is done. |
| `stopDistance()` | How far he will still travel if told to stop now. |
| `walkTo(worldPoint, { then, turn })` → Promise | Turns to face the point, walks there and plants on it. In the preview it stops within a few mm. |
| `bone(short)` | `pelvis, spine, spine1, spine2, spine4`/`chest, neck, head`, and `left`/`right` + `Clavicle, UpperArm, Forearm, Hand, Thigh, Calf, Foot, Toe, Ulna, Bicep` (for example `rightHand`), or a full bone name. |
| `onAfterMixer(fn)` → remove() | `fn(actor, dt)` runs every frame after everything above, before render. |
| `turnBone(bone, worldQuat)` | Turns a bone about its pivot by a world rotation. It is undone automatically before the next frame's clips, so procedural work never accumulates or fights the mixer. Use it inside hooks. |
| `reach(side, grip, { fade, weight })` | Eases a hand (`'L'`/`'R'`) to an `ArmIK` grip, then back with `reach(side, null)`. `grip` may be a function returning a grip each frame (a moving target such as his own head). Only `wrist` is required; `fingers`, `palm`, `pole`, `curl` and `thumb` default from the clip's pose. `reachWeight(side)` reports the current weight. The preview's "hand to head" button is a working example for beat 6 (`backOfHead()` in `src/dev/voss-anim-preview.js`). |
| `breathing`, `weightShift`, `headDrift`, `faceHead`, `handsOnFloor` | Switches; all default on. Idle life is scaled by the idle clips' weight. `faceHead` applies `FaceRig`'s head motion (`look`, `gesture('nod'/'shake')`, `tic`, sway) to the neck and head; it is on during every clip, so face acting shows on the body. |
| `setFacePreset(name)`, `face` | The `FaceRig`. |
| `showWound(bool)` | Shows the gash on the actor (default on). |
| `dispose()` | Frees the mixer and the copy's skeletons, and removes `root` from the scene. |

**Retarget method, and why not `SkeletonUtils.retargetClip`.** The two rigs' rests differ too much:

- Mixamo's arms are level in a T; Voss's hang about 50° down (an A pose).
- Mixamo's bones run along +Y; the Valve bones run along +X.

Copying rotations relative to rest therefore puts his arms half a turn wrong. Instead, each frame is copied **in world space**:

- Each Mixamo bone's turn away from its own rest is applied to Voss's bone as it would stand in Mixamo's rest.
- That rest correction turns his bone to point where Mixamo's does, with a second axis (the palm, the knee or the side of the foot) so the twist matches too.
- The pelvis, spine, neck and head keep Voss's own posture, with no correction.
- Voss's `Spine1` (he has four spine bones to Mixamo's three) takes half of Mixamo's `Spine` and half of `Spine1`.
- Fingers are mapped (thumb → `Finger0*`, index → `Finger1*` and so on) and look clean.
- Extra bones (quadriceps, biceps, ulnas, `neck1`, glasses) are not animated and follow their parents at rest.
- Bone lengths are always Voss's own.

**Hip height.** The hips' travel is scaled by the leg-length ratio (thigh to ankle, Voss over Mixamo), plus a 2.5 mm lift so his shoes meet the floor. Standing and walking, the lowest point stays within −0.6 to +0.9 cm of the floor (SadIdle +0.2 cm).

**Floor clips.** `SitIdle`, `StandUp`, `SitDown` and both falls are checked when they load:

1. A two-bone leg IK raises any foot whose heel, ball or toe tip would go below the floor.
2. The skinned mesh is posed every 0.1 s and the hips are lifted by as much as the body goes through the floor, smoothed. The hands are left out of this measure: they push on the floor and would float him.

## 2. The clips

Times are clip seconds. Travel is in world metres.

| Clip | Duration | Starts on, ends on | Root motion | Left over |
|---|---|---|---|---|
| `InjuredWalk` | 1.63 s, loop | Two steps dragging the right leg, his right arm held across his middle | Mixamo's was already in place; centred, loop closed (any end-to-start difference spread over the cycle), facing +Z | Feet within ±1 cm of the floor; no pop at the loop. Stride measured from the planted foot: 0.55 m/s at rate 1. Planted-foot stop frames at 0.67 s and 1.57 s. |
| `SadIdle` | 4.00 s, loop | Slumped, head down, arms hanging | Centred in place, loop closed | Very still on its own; the idle-life layer adds breathing, the hip shift and head drift. |
| `Stagger` (`Reacting.fbx`) | 3.67 s, one-shot | Starts standing; hands come up and he leans back and looks aside, then settles | Anchored at its first frame; ends where it starts | A mild, surprised flinch, not a big stagger: right for beat 7's half-step flinch, small for beat 11's stagger. |
| `StandUp` | 6.07 s, one-shot | Seated on the floor → rocks back onto his back for momentum → onto his knees → stands | **Travel kept in the clip** (no teleport): the body moves 0.10 m from the seat to the standing spot. Its standing end is on the actor's origin, facing +Z; its seated start is SitIdle's spot. Its first 0.5 s eases from SitIdle's first frame. | Fingertips touch the floor while he pushes up (the hand layer keeps the finger joints 3 cm above it). |
| `SitDown` | 4.77 s, one-shot | `StandUp` reversed from standing to the moment his seat meets the floor, then eased over 0.8 s into SitIdle's first frame | Mirror of StandUp: starts on the origin, ends on SitIdle's spot | See section 4. |
| `SitIdle` | 10.87 s, loop | Sitting on the floor hugging his knees, head bowed | Placed where StandUp starts (0.06/0.04 model m back and to the side of the origin), turned as it is, loop closed, raised (by the floor measure) to sit on the floor rather than in it: his seat is deeper than Mixamo's | It barely moves (0.006 rad over the loop), so the idle-life layer matters here. |
| `FallForward` | 2.57 s, one-shot, clamps its last frame | Staggering, onto his knees (0.7 s), face down at 1.1 s, still | **Travel kept**: the hips end 0.58 m forward and 0.57 m to his left (Mixamo's own diagonal: he twists as he falls). The actor's root does not move. | Lying, his body is 0.1 cm above the floor. During the drop the hips are lifted up to 7 cm at one moment so a knee doesn't go through. |
| `FallForward` after `SitIdle` (automatic, hidden clip `FallForward@sit`) | 2.54 s | From the seat he gets to his knees, then collapses face down where he sat | Baked: 0.8 s from SitIdle's pose into the fall's kneeling frame (0.83 s), then the rest of the fall, on the seat's spot | Dips at most 5 cm into the floor for a frame mid-collapse. See below. |

**Facing.** Every clip faces +Z, like `Idle`. Walks and idles use the mean pelvis facing. One-shots use their first frame. `StandUp` uses its standing last frame, and `SitIdle` matches StandUp's seated start.

## 3. Transitions (`TRANSITIONS`, seconds)

The weights ease with a smoothstep and always sum to exactly 1. A clip picked up again while it is fading out continues from its current time instead of restarting.

| From > to | Fade | Why |
|---|---|---|
| InjuredWalk > SadIdle | 0.35 | Only through `stopWalk`: the walk first reaches a planted-foot frame (the swing foot near where the idle puts it) and holds it, so only the swing foot moves in the fade. |
| SadIdle > InjuredWalk | 0.4 | Easing into a slow walk. |
| SadIdle > Stagger | 0.15 | A flinch has to land at once. |
| InjuredWalk > Stagger | 0.2 | |
| Stagger > SadIdle | 0.5 | A slow recovery. With `then: 'SadIdle'` the fade ends as the stagger does. |
| SadIdle > SitDown | 0.5 | The sit-down starts in a neutral stand. |
| Stagger > SitDown | 0.45 | |
| SitDown > SitIdle | 0.3 | Invisible: the sit-down already ends on SitIdle's first frame. |
| SitIdle > StandUp | 0.3 | The stand-up starts on SitIdle's first frame, and SitIdle hardly moves. |
| StandUp > SadIdle | 0.4 | |
| SadIdle / Stagger / InjuredWalk > FallForward | 0.25 | The fall starts standing. |
| SitIdle > FallForward | 0.6 | Plays the baked from-the-seat version, which starts on the seated pose. |
| anything else | 0.35 | |

## 4. What `StandUp` stands up from, and the reversed sit

**From the floor, not a chair.** Both `Standing Up.fbx` and `Sitting Idle.fbx` start with the hips about 12 cm off the ground.

In the stand-up he sits with his knees up, rocks back onto his back with his legs out for momentum, swings forward onto his feet in a squat, and rises. Played backward in full, that rocking became "squat, roll onto his back, sit up", which reads as a rewind. So `SitDown` is the reverse of only the part from standing until his seat meets the floor (`SIT_CUT` = 1.3 s into the stand-up). Then it settles over 0.8 s into the sitting idle's first frame.

Reversed like this it reads as a tired man lowering himself: a slow bend, a crouch, the seat down, and a settle into hugging his knees. Time order is reversed properly, with quaternion signs kept continuous, and it is a normal one-shot, not a negative `timeScale`.

**Leftover mismatch.** The two sits are different poses: on average 0.45 rad (26°) apart, and no frame pair is closer. So the junction is made inside the clips (both ends are eased onto SitIdle's frame 0), and leg IK keeps the feet out of the floor during that easing. Before that easing, the hips were 1.2 cm apart and the bones 26° on average; after it, the two clips meet on the same frame, and the 0.3 s crossfade shows no visible change.

## 5. What was checked in a real browser, and what only numerically

I ran it all in **headless Chrome with SwiftShader (software WebGL)**, driven by `scripts/voss-acting/check.mjs`. I did not watch it at normal speed with my own eyes on a GPU.

- **Contact sheets** of every clip (side, front and three-quarter views, with the lowest point printed on each frame) and of the transitions run through the actor itself: walk then stop, sad > stagger > sad, sad > sit down > sit idle, sit idle > stand up > sad, sit then fall, and a hand-clearance close-up. I looked at all of them. No twisted forearms, no collapsed shoulders, no limb inside the body when sitting, and the fall ends on the floor.
- **The preview page `?voss-anim`** loaded in headless Chrome. I pressed the "walk then stop" and "sit then fall" buttons and took screenshots at intervals: the walk arrives and plants exactly on its target, the seated fall ends face down, there are no console errors, and the wound shows. Frame rate there was 11 to 12 fps, which is SwiftShader's and says nothing about the UHD 620. The page is one skinned character with no shadows, so it should run at full speed.
- **Checked only numerically:** floor contact per frame (the lowest skinned vertex), the walk's planted-foot speed and stop frames, loop seams (closed by construction), the junction pose distance, and load and build time.
- **Not checked:** foot sliding at normal speed while moving at `walkSpeed`, judged by eye; the measured stride makes it right in principle. Also the feel of the timings. **Please open `npm run dev` → `http://localhost:5173/?voss-anim`** (hard refresh) and judge: walk then stop, sad > stagger > sad, sit then fall, and the time-scale slider.
- The game itself (`?nointro`, `?level=3`) still starts and reaches PLAYING with no new errors. `vite build` passes, and the preview is not in the build.

## 6. Changes outside `vossActing.js`, and notes for the next agent

**Changed:**

- `src/entities/Player.js`: `Animator` is now exported. Its behaviour is unchanged.
- `src/main.js`: in dev builds only, `?voss-anim` imports the preview instead of starting the game; `game` is `null` then. Production builds drop it.

**New:**

- `src/dev/voss-anim-preview.js`: the preview, with buttons per clip and per transition, toggles for the wound, breathing, weight shift, head drift, face head, hands-off-floor and camera follow, a time-scale slider, a face preset, face gestures, and a readout of the clip, weights and speeds.
- `scripts/voss-acting/check.{html,js,mjs}`: the contact-sheet and measurement tool (dev only): `node scripts/voss-acting/check.mjs <out dir> [sheets.json]`.
- The six FBX files are used as they are. Add them to git with the rest; they are still untracked.

**For the next agent:**

- Moving him is the caller's job: use `walkTo`, or move `root` by `actor.moveSpeed` along its facing. `FallForward`, `StandUp` and `SitDown` move the **body** within the clip (travel above), so after the fall the body lies about 0.8 m from `root`. Place cameras on `actor.bone('pelvis')`, not on `root`.
- Kneeling (scene B, beat 1) and sitting back against the console with legs out (beats 6 and 7) are **not** among these clips. `SitIdle` is knees-up hugging. `StandUp` held at about 0.6 s is a leaning-back, legs-out pose, and `FallForward` at about 0.75 s is kneeling: either can be held with `crossTo(name, { at, rate: 0 })` as a pose and adjusted with `turnBone` in a hook.
- The cable hand, the hand to the back of his head and the hand on the console are `reach()` (or `ArmIK` through `turnBone`) on top of `SadIdle`. `InjuredWalk` holds his right arm across his middle, so a cable in his right hand means a reach for that hand while he walks.
- Turns to the neck and head should go through `actor.face.look()` and `gesture()` (applied every frame) or `turnBone`, never by setting bone quaternions directly.
- `isFinished` on a loop means "has played through once".
- Glasses: the actor shows whatever the Player's body shows (his glasses are on).
- Deliberately not done: suit or helmet support (as decided), and Blender (the glb was never re-exported).
