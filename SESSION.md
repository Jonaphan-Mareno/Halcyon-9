# TODO: Kessler Bedroom Robo Arm and Fusebox Minigame

## Goal

When Kessler's door is unlocked, her bedroom's robotic arm becomes an active hazard. The player must use the bedroom fusebox minigame to shut the arm down before reading the room logs. The minigame should add a timing challenge distinct from Level 1's existing turn-to-align ring puzzles.

## Existing timing prototype

The original prototype code is recorded in [docs/conversation_transcript.txt](Halcyon-9/docs/conversation_transcript.txt). This is a standalone 2D Canvas game with four continuously rotating rings, a fixed target at the top, three lives, and a 30-second timer. The player taps to lock the active ring; success advances outer-to-inner, and a miss costs a life.

Core behavior from the prototype (code only; the conversation prompt is not repeated here):

```js
const targetAngle = Math.PI * 1.5; // top of the circle
const targetTolerance = 0.18;      // radians on either side
const maxTime = 30;
let lives = 3;
let activeRingIndex = 0;

function handleInput() {
  const ring = rings[activeRingIndex];
  let angle = ring.angle % (Math.PI * 2);
  if (angle < 0) angle += Math.PI * 2;

  let diff = Math.abs(angle - targetAngle);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;

  if (diff <= targetTolerance) {
    ring.angle = targetAngle;
    ring.locked = true;
    activeRingIndex++;
    if (activeRingIndex >= rings.length) gameOver(true);
  } else {
    lives--;
    if (lives <= 0) gameOver(false);
  }
}

function update(dt) {
  timeLeft -= dt;
  for (const ring of rings) {
    if (!ring.locked) ring.angle += ring.speed * dt * 60;
  }
}
```

## Proposed minigame changes

- [ ] Rebuild the prototype in Three.js as an in-world fusebox display. Keep the rings face-on with a fixed camera so perspective does not make timing harder to read; use depth, lighting and materials for atmosphere.
- [ ] Contextualize the prototype so it feels relevant to the fusebox, Kessler's bedroom, and Halcyon-9: replace generic arcade wording and UI with in-world labels, visuals, sounds, and feedback that fit the station and explain why solving it shuts the arm down.
- [ ] Keep the continuous rotation and click/tap-to-stop timing mechanic so this feels different from the existing puzzles, which ask the player to turn stationary rings into alignment.
- [ ] Use a 20-second round instead of 30 seconds.
- [ ] Randomize which ring is active next rather than always progressing outer-to-inner. Make the active ring visually obvious.
- [ ] Give each ring a different target position rather than always targeting the top. Keep the target zone visible before and during each attempt.
- [ ] Increase the speed by about 5% after each successful lock for a gentle ramp. Confirm the final speed and target tolerance during playtesting.
- [ ] Keep the prototype's three lives unless playtesting shows that the timer and speed ramp already provide enough difficulty.
- [ ] On success, signal completion to the fusebox interaction. On timeout or exhausted lives, allow a retry without shutting down the arm.

## Robo arm animation — asset work done

- The Bedroom 2 action was reworked on the `RoboArmAture.001` rig and exported to `public/assets/models/l2-atrium.glb` as `KesslerRoboArmSwing`.
- The three joint rotations change together: `RoboArm00` Y from 360° to 300°; `RoboArm01` and `RoboArm02` X from -20.385° to 84.615°. The motion reaches its endpoint at frame 13 and returns at frame 25: a one-second out-and-back at 24 fps.
- The optimized GLB contains the one-second clip, 21 channels, and both RoboArm skins. The new clip's tracks target Bedroom 2's `.001` rig. Re-export after any future Blender animation edits, then run `node scripts/optimize-models.mjs l2-atrium.glb`.

## Runtime animation and hazard work

- [ ] Preserve the GLB animation list when loading the atrium in `src/level2/HabitatSession.js`; the current loader extracts the scene but does not retain the clips.
- [ ] Create a mixer for the atrium and select `KesslerRoboArmSwing`. Start the action only when Kessler's door is unlocked; loop it while the hazard is active.
- [ ] Update the mixer every frame with delta time. Stop the action and disable the hazard only after successful fusebox completion.
- [ ] Build the arm hitbox to extend a little beyond the visible RoboArm geometry and cover its full animated sweep. It should hit only while the arm is active and the player is in range; tune the extra margin in playtesting.
- [ ] On a hit, use the game's existing damage/knockback response and prevent rapid repeated hits from one overlap.

Example Three.js playback pattern using the exported clip name:

```js
const gltf = await loader.loadAsync('./assets/models/l2-atrium.glb');
const atrium = gltf.scene;
const mixer = new THREE.AnimationMixer(atrium);
const clip = gltf.animations.find((item) => item.name === 'KesslerRoboArmSwing');
const action = mixer.clipAction(clip);
action.setLoop(THREE.LoopRepeat, Infinity);

// When Kessler's door is unlocked:
action.reset().play();

// Each frame, while updating the level:
mixer.update(deltaSeconds);

// After the fusebox minigame succeeds:
action.stop();
```

The loader must keep `gltf.animations` available to this code. Add null handling if the named clip is absent.

## Fusebox, logs and state

- [ ] Make the Bedroom 2 fusebox interaction open the timing minigame. Connect to its completion result rather than duplicating puzzle logic in the room code.
- [ ] Block Kessler's bedroom logs while the arm is active and communicate that the room is unsafe.
- [ ] Only successful minigame completion shuts down the arm, disables its hitbox and unlocks the logs. Exiting or failing the minigame leaves the arm active and logs blocked.
- [ ] Keep the shutdown state after leaving and re-entering the room; prevent repeated minigame launches after success.

## Acceptance checks

- Unlocking Kessler's door starts the arm; loading the atrium does not.
- The arm loops back and forth, and its slightly extended hitbox covers the visible sweep without hitting players outside the intended range.
- The minigame uses Three.js, has randomized ring order and target positions, a 20-second timer, and a clearly indicated active ring.
- Logs remain inaccessible until the player completes the fusebox minigame successfully.
- After shutdown, the arm stays still, cannot hit the player, and the logs remain accessible after leaving and returning.

## Relevant files

- `public/assets/models/l2-atrium.glb` — exported arm rigs and `KesslerRoboArmSwing` clip.
- `Blender/scripts/keyframe_kessler_roboarm_swing.py` — Blender helper used to create the Bedroom 2 action.
- `src/level2/HabitatSession.js` — atrium loading, Kessler door unlock, fusebox and log interactions.
- `docs/conversation_transcript.txt` — original prototype code and proposed design changes.

The animation asset has been exported. The runtime mixer, hazard, hitbox, fusebox minigame integration and log gating remain planned work; this document does not implement them.
