# Prompt for agent A: Voss's acting animations (retarget and transitions)

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`). This agent must finish **before** the confrontation-scene agent (`docs/confrontation-scene-agent-prompt.md`) starts, because that agent builds on its module.

---

You are building a small, reliable **animation layer for a third-person Voss** in the Halcyon-9 game (vanilla JS, Three.js, Vite). Voss is currently only ever seen in third person with generic clips (Idle, Walk, Run, Crouch, Jump, Fall, Land). The game's ending needs him to *act*: walk in tired and hurt, stand sadly, flinch, sit, and fall. The owner has downloaded six Mixamo clips. Your job is to get them onto Voss's skeleton so they look right, and to make the transitions between them smooth. You do **not** build any cutscene.

Context to read first (short): `docs/ending-confrontation-script.md` (the scene these clips are for; read the beat tables to see what each clip is used for), `src/entities/Player.js` (Voss's model, `Animator`, `_mixamoClip`, `toonFrom`), `src/entities/FaceRig.js`, `src/entities/ArmIK.js`, `src/core/loaders.js`, and `HANDOVER_Voss_Kessler_VideoLogs_Flashback.txt` (note section on Voss's rig: **never round-trip Voss's glb through Blender's glTF importer, it changes bone rest orientations**).

## The clips (in `public/assets/models/`)

| File | Use | Notes |
|---|---|---|
| `Walkinginjured.fbx` | `InjuredWalk`: Voss enters the final room, dragging one leg | Looping. |
| `Sad Idle.fbx` | `SadIdle`: standing through the argument | Looping. |
| `Reacting.fbx` | `Stagger`: a surprised reaction with him looking away; used as the stagger/flinch | One-shot. |
| `Standing Up.fbx` | `StandUp`, and **reversed** as `SitDown` | One-shot; the owner wants sitting to be this clip played backwards. Find out what it stands up *from* (floor? chair?) and report it. |
| `Sitting Idle.fbx` | `SitIdle` | Looping. |
| `Falling Forward Death.fbx` | `FallForward`: Voss collapses at the very end | One-shot; holds its last frame. |

These were exported from Mixamo's **default character**, so their bones are named `mixamorig1:...`, **not** Voss's `ValveBiped.Bip01_...` names. That is why the existing `_mixamoClip` (which binds tracks by name onto Voss's own rig, used for `Sprint.fbx` and the swim clips) **cannot be used as it is**. You must retarget.

## Task

1. **Retarget all six clips onto Voss's rig** (`human_scientist_v2.glb`, 67 joints, `ValveBiped.*` bone names). Suggested approach: three.js `SkeletonUtils.retargetClip` with a bone-name map (Mixamo to ValveBiped for hips, spine chain, neck, head, clavicles, arms, forearms, hands, thighs, calves, feet, toes; fingers if they map cleanly, otherwise leave them in their rest pose). Voss's rig has extra bones (quadriceps, twist bones, etc.): leave those untouched. If `retargetClip` does not give clean results because of the rest-pose difference, write your own retarget that works in local space with a per-bone rest-pose correction, and explain why. Whatever you choose, **fix these three problems explicitly**:
   - **Proportions and hip height.** Voss is `MODEL_HEIGHT` 1.394 m and not Mixamo-proportioned. Scale the hip translation by the leg-length ratio so his feet neither float nor sink. Check this separately for the walk (feet on the ground), the sit (pelvis at the right height for the pose) and the final fall (body ends on the floor, not inside it).
   - **Root motion.** Some of these may travel (the walk, the fall, the stand-up). Walks and idles must play **in place** and loop without drifting or snapping (the same job `_mixamoClip` does for Sprint: read how it centres the pelvis and drops horizontal travel). The **fall** and the **stand-up/sit** must **not** teleport: either keep their travel as a returned displacement the caller can apply, or bake it out, and say which you chose.
   - **Facing.** The final clips must face the same way as Voss's existing clips (forward = +Z or whatever the rig uses; match `Idle`).
2. **Reversing `StandUp` into `SitDown`:** reverse the tracks properly (reverse the time order and keep the quaternions continuous: do not just play with a negative `timeScale`, because a one-shot with a clamped end behaves differently). Then **match its final pose to the first frame of `SitIdle`**: if they differ, crossfade over the last few frames, or adjust the hip height, until the junction is invisible. Report any leftover mismatch.
3. **A small, clean API** in a new file `src/entities/vossActing.js`:
   - `loadVossActing(playerOrRoot)`: lazily loads the six FBX files (only when called, never at game start), retargets them, returns the clips named exactly `InjuredWalk`, `SadIdle`, `Stagger`, `SitDown`, `StandUp`, `SitIdle`, `FallForward`. Cache the result; dispose the loaded FBX scenes and skeleton helpers after retargeting (only the clips are kept).
   - `class VossActor`: a **standalone third-person Voss** (a `cloneSkinned` copy of the loaded Voss model, with `toonFrom` materials as `Player.js` does, and a `FaceRig` attached) usable in any scene without the player controller. Methods: `play(name, opts)`, `crossTo(name, {fade})`, `update(dt)`, `isFinished(name)`, `bone(name)` (returns a bone by its short name: `head`, `rightHand`, `leftHand`, `pelvis`, `spine2`, etc.), `setFacePreset()` / `face` (the `FaceRig`), and `dispose()`. Reuse the existing `Animator` (export it from `Player.js` if needed, without changing its behaviour).
   - **Smooth transitions** (the part the owner cares most about): every transition between two clips must be crossfaded with a duration suited to the pair (a table: for example InjuredWalk to SadIdle about 0.35 s and ending the walk **on a foot-planted frame** rather than mid-stride; SadIdle to Stagger about 0.15 s; Stagger back to SadIdle about 0.5 s; SadIdle to SitDown about 0.5 s; SitDown to SitIdle about 0.3 s; SitIdle to FallForward about 0.25 s). The walk to idle should plant the feet: let the walk finish its current step (use the walk's foot-contact phase) before blending. Never snap, never T-pose for a frame, never let two clips both leave their weights short of 1.
   - **Idle life.** On top of any idle, add the small things that stop him looking like a statue: slow breathing (a few millimetres of chest/shoulder motion), a very slow weight-shift, and a light head drift. They must be switchable (`actor.breathing = true`) and tiny. In `FaceRig`, keep blinking on.
   - **A layering hook for procedural bone work** that other code can use on top of the clips: `actor.onAfterMixer(fn)` called every frame after the mixer and before render, with the actor, so the next agent can bend an arm to the back of his head, hold a cable, or lower a hand without fighting the clips. Optionally wrap `ArmIK` so a hand can be pulled to a world point with a weight from 0 to 1 and eased in and out.
   - **A tired-walk gait helper:** playing `InjuredWalk` at a speed that matches its stride (compute the stride so that moving the actor at `v` m/s does not slide the feet; expose `actor.walkSpeed`).
   - **No dive suit (decided).** In the cutscene Voss is out of his suit (it lies on the floor as a prop, built by the next agent), so `VossActor` is the plain Voss in his normal clothes with his head and hair showing. `showWound` (from `Player.js`) must work on the actor, because the gash at the back of his head matters in the scene. Do not add suit or helmet support.
4. **A preview page** so the owner can judge it in a real browser at normal speed: `?voss-anim` (add it the way the other test links such as `?flashback` are handled in `src/main.js` / `Game.js`; find the existing pattern). It shows one lit Voss (toon look as in-game, with a toggle for the wound) on a floor, with an orbit camera, buttons for each clip and for each transition (including "walk then stop", "sit then fall"), a slider for time scale, and an on-screen readout of the current clip and blend weights. Keep it dev-only and cheap.
5. **Check it properly.** Render a contact sheet (frames across each clip and across each transition) and look at it, and also play it in the preview at normal speed. Things to check: no foot sliding in the walk loop, no loop pop, no twisted forearms or collapsed shoulders, no limb inside the body in the sit, the fall ends on the floor, the reversed sit looks like a person sitting (not rewinding), and the junction at every transition. If you cannot run a browser, say so plainly and list what you could only check numerically.

## Rules from the project

- Relative paths; lowercase-hyphenated file names for anything new.
- `.dispose()` everything created (geometry, materials, mixers, render targets), including the temporary FBX scenes.
- No shadow maps; cheap shaders; Intel UHD 620 target, about 24 fps or better.
- Keep added disk small: do **not** add new large assets. If the six FBX files together are too heavy to load at once on a school PC, bake the retargeted clips into one compact file at build time (`scripts/`) and load that instead, and say so.
- Hard-refresh when testing (`.glb`/`.fbx` are cached).
- Do not change how the existing player, flashbacks or Level 3 play. Do not commit or push.

## Do not

- Round-trip `human_scientist_v2.glb` through Blender's glTF importer or re-export it.
- Replace the existing `Sprint.fbx`, `Swimming.fbx`, `Treading Water.fbx` workflow.
- Build any cutscene, lines, camera work or props: that is the next agent.
- Download or add more animations; use only these six. If one is unusable, say so in the report instead of substituting.

## Report (write it to `docs/voss-acting-report.md`)

1. What you built, with the API (so the next agent can use it without reading your code).
2. For each clip: duration, what it starts and ends on, whether it needed root-motion handling, and any visible problem left.
3. The transition table you chose (durations and why).
4. What `StandUp` stands up from, and how the reversed sit looks.
5. What you verified in a real browser and what you only checked numerically.
6. Anything you changed outside `vossActing.js`, and anything the next agent must know (for example the `Animator` export).
