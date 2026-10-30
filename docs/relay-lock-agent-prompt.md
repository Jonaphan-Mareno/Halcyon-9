# Prompt: the relay, the repair and the water lock (from the kraken to Scene A)

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`). It can run alongside Scene C's agent, but **not at the same time as any other agent editing `src/level3/Trench.js`, `DeckSession.js`, `Level3Lines.js` or `Confrontation.js`**.

---

You are building the stretch of Level 3 between **beating the kraken** and **the confrontation (Scene A)** in the Halcyon-9 game (vanilla JS, Three.js, Vite). Treat these as the specification:

1. `docs/relay-lock-plan.md`: **the design**. The decisions, the 11-step sequence, the minigame's new wording, the new lines and what is cut. Everything under "Decisions" is fixed.
2. `src/level3/Trench.js`: how the way down after the fight works now (`_down`, stage `'down'` and `'inside'`, the `RELAY` hooks, `_openHack()` and its `message` handler, `_sign()`, the objective in `guide`), and its header comment.
3. `src/level3/PrepRoom.js`: the water lock that floods on the way out. **The drain is this, run backwards**: its water surface, `FLOOD_TIME`, its sounds, the red beacon, the hatches, and the change between underwater and air (the grade, the swimming, the breathing).
4. `docs/confrontation-report.md` (sections 2 and 6) and `docs/voss-acting-report.md` (the `VossActor` API, the acting clips, section 6): how the confrontation starts (`DeckSession.startConfrontation`), and the clips you can use (`Stagger`, `SitDown`, `SitIdle`, `StandUp`).
5. `docs/ending-confrontation-script.md`, Scene A beat 1 (context: where your sequence must hand off).

## What to build

### 1. The exhausted swim down (plan step 2)

After `l3-kraken-2`, Voss says nothing until Scene A. On the way down the shaft and the tunnel he is spent: about 80% of his swim speed, heavier and more frequent breathing in the helmet (the existing `sfx.breath`, with more exertion), and now and then a pause of about a second where he hangs in the water. Make the numbers named constants. It must read as exhaustion, not as lag or a bug, and must not make the swim tedious.

### 2. The relay room and the minigame, as a repair (steps 3 to 5)

- Play `l3-relay-3` (new, ARIA, `hesitant`) as he swims in. The terminal's screen and the hatch lamp as the plan says.
- **Reword the minigame** (`submarine-hack.html`, `src/submarineHack/`) exactly as the plan's table says. **Change only text** (titles, intro, field guide, end screens, labels, `aria-label`s); do not change its rules, its timer, its layout or its `halcyon-submarine-hack-won` message. It is Simphiwe's work: keep your edits to the strings and list every one in your report.
- Reword the level's own text to match: the relay screen (`_screenText`), the objective, the overlay's labels.
- On a win: the screen as the plan says, `l3-relay-4` (new, ARIA, `relief`), the pumps, the hatch's lamp, its wheel turning and the hatch swinging open. Objective: "Enter the water lock".
- The **optional** "LOCKDOWN AUTH: VOSS, E. · RELEASED" line: build it behind one named flag, **off**, and say how to turn it on.

### 3. The water lock and the drain (steps 6 and 7)

- **The lock chamber** behind the round hatch (`PT_RelayHatch` in the relay room's south wall): about 3 × 3 × 2.6 m, the round outer hatch, a sliding inner door with a lamp over it, floor vents, a red beacon, and through the inner door a short stub of dry corridor lit cold blue. Build it in code (as `LockPanel.js` is) unless the Blender script is clearly the better place, and say which. Its collision must keep him inside. Check there is room behind the wall (the works' rock and the tunnel) and that nothing outside can be seen through it.
- When he is inside, the hatch swings shut on its own, the wheel spins, it seals. The uplink cable must pass through it cleanly (as at the prep room's lock); it must not be cut or float through the door.
- **The drain** (about 12 s, a named constant): the beacon turns, the vents roar and gurgle, the water falls from ceiling to floor. **As the surface passes the camera**, the underwater look lifts and the sound comes out of the water (the prep room's change, backwards). **His weight returns**: swimming ends, his boots hit the floor, his knees give (`Stagger`), he falls back against the wall and slides down to sit (`SitDown` to `SitIdle`). Optional `v-lock-land` grunt.

### 4. The helmet (steps 8 and 9): a short cutscene in third person

- Take control away and direct the camera as the confrontation does: eased, no snaps, small handheld drift. A close side shot of him sitting against the lock wall.
- **The helmet comes off on screen.** No clip does it: first look for a Mixamo clip of lifting something off the head and retarget it as `vossActing.js` does (check its licence the way the others were, and add it to `CREDITS.md`); otherwise build the pose by hand as Scene B's kneel was (`level3/vossPoses.js`). His gloved hands come up slowly to the collar ring, slip once, give it a quarter turn (a click, a hiss); he lifts the helmet over his head and drops it beside him (a clunk, a short roll). Move the helmet from the head bone to his hands for the lift; it must not pass through his head or hands.
- **His face** as Scene A has it (condition 4: grey, wet hair, tired): he is in the dive suit with only the helmet off. Eyes shut, mouth open, then the **first breath of real air** (optional `v-helmet-gasp`, else a gasp from the existing breathing) and long heavy breaths, his head tipping back against the wall (FaceRig: `resigned`, `tired` high).
- **The inner door** (step 9): its lamp turns green, it slides open, cold blue light falls across his face, `l3-relay-5` (new, ARIA, `bubbly`, a little too bright), and after a moment his eyes open and turn toward the light.
- **Fade to black** over the breathing; in the black, the suit's seals releasing, the suit dropping, a grunt as he gets up. Then start the confrontation (`DeckSession.startConfrontation`) so Scene A's first shot comes up out of that black. The confrontation's own fade must not add a second black or a jump in sound.

### 5. Scene A: remove the suit

In `src/level3/Confrontation.js`, remove the empty suit and its helmet from the control room's corner (`SUIT_AT`, `_suit()`, its mixer, what loads only for it) and its mentions in the file's header comment. Nothing else in the confrontation changes. Then check beats 4, 11 and 13 (where the suit was seen in the background) and beat 1 (the report's compromise about the camera not passing the suit: it may now be free to do what the script wanted; say whether it is).

### 6. Lines

In `src/level3/Level3Lines.js`: add `l3-relay-3`, `-4`, `-5` (ARIA, the plan's wording, as DRAFT) and the optional Voss sounds; cut `v-works-descent-1` to `-3`, `v-link-cut-1` to `-3` and the eight `relayWon` lines, and change the talks that used them (`postBossDescent` keeps only `l3-kraken-2`). Until a recording exists, ARIA's new lines show as subtitles, as Level 3 already does. None of the cut lines are recorded; check that no other code uses them.

## Volume

ARIA's new lines will be recorded at whatever level the owner records them. Through the level's normal ARIA voice path they must sound as loud as her other Level 3 lines, and the breathing and the gasp must not be louder than speech. The owner finds Voss's recordings quieter than ARIA's in general: if you add the optional Voss sounds, match them by ear and by `scripts/confrontation/loudness.mjs` (add the files to `loudness.html`).

## Quality bar

The owner wants Voss to feel **exhausted** and the helmet beat to feel **real**. Judge it by eye at normal speed and say plainly what falls short. Watch for: the swim reading as lag; the water surface popping instead of falling; the camera seeing the water from both sides at once as the surface passes it; Voss floating after the water is gone, or dropping like a rag doll; the helmet passing through his head or hands; his face looking wrong when it first shows; the cable cut by the hatch; and a second black or a sound jump at the hand-off to Scene A.

## Rules from the project

- Relative paths; lowercase-hyphenated file names for anything new.
- `.dispose()` everything you create; Enter after about 2 s skips the helmet cutscene to the fade and the confrontation.
- Every light must exist before the first shader compile (`src/core/precompile.js`). No shadow maps; cheap shaders; Intel UHD 620 target, about 24 fps or better.
- Keep added disk small; run `npm run optimize-models` on any new `.glb`. Hard-refresh when testing.
- Respawns: if he dies on the way down, the checkpoint at the shaft's foot (as now). Once the lock has sealed he cannot die (no air loss, no damage).
- Add test links: one that starts at the relay room with the kraken beaten (for example `?level=3&relay`, if it does not already do this; say what it does), and one that starts at the drain (`?level=3&lock`).
- Do not break Levels 1 to 3, the flashbacks, the kraken fight, the confrontation, or Scenes B and C. Do not commit or push.

## Do not

- Change the minigame's rules, or make ARIA the opponent anywhere in the text.
- Give Voss any words between the end of the fight and Scene A.
- Change Scene A beyond removing the suit.
- Add new face models or large assets.

## Report (write it to `docs/relay-lock-report.md`)

1. How to play it (the test links) and how it hands off to Scene A.
2. Each of the plan's 11 steps: done / done with a compromise / not done, and what to improve.
3. Every string you changed in the minigame (for Simphiwe), and in the level.
4. How the lock was built (code or Blender) and how the drain reuses the prep room's lock.
5. The helmet: a clip (which, its licence) or a built pose, and how it looks.
6. The suit's removal from Scene A, and what it changed for beats 1, 4, 11 and 13.
7. Lines added and cut; what the owner must record (`l3-relay-3` to `-5`, the optional Voss sounds).
8. Performance (fps, on which machine).
