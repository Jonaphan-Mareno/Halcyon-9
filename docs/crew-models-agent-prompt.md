# Prompt for agent 1: the three crew models (Lindqvist, Navarro, Park)

Copy everything below the line into a new agent session in the Halcyon-9 repo (branch `cut-scenes`). This work must finish **before** the Flashback 3 agent starts: it needs your models.

---

You are making three new character models for the Halcyon-9 game: **Lindqvist, Navarro and Park**, Voss's dead crewmates. The owner has downloaded a full model for each and labelled it by surname. Your job is to take **each supplied model's head** and attach it to **Voss's body, skeleton and face morphs**, the way Kessler was already made, so that they animate with Voss's clips and talk through the existing `FaceRig`.

## Read first

1. `Blender/scripts/build_kessler_from_female.py`: your template. Kessler is the body of one Sketchfab model with the head of another, on Voss's skeleton, with Voss's face morphs carried over, and with hair, skin and clothes repainted in the game's flat style. Read it fully and **generalise it** (for example `Blender/scripts/build_crew_head.py`, parameterised by character) instead of rewriting from scratch. Do not break `build_kessler_from_female.py` or `kessler.glb`.
2. `src/entities/Kessler.js` (the loader), `src/entities/FaceRig.js` (the morph names it drives and the expression presets), and `src/entities/Player.js` (`makeToonRamp`, `toonFrom`, `MODEL_HEIGHT`).
3. `src/level3/DrownedCrew.js` (the `CREW` list): it already fixes each character's **coat colour** and that **Lindqvist wears glasses**; keep those looks. Kessler is `0xc9c6b8` with red hair and shades; the others are `0x3b4a5e` (Lindqvist), `0x5a4a32` (Navarro) and `0x46523f` (Park).
4. `src/story/BriefingFlashback.js` (`_cast`, `_dress`, `_dressKessler`): how the characters are dressed and posed today, as copies of Voss.
5. `CREDITS.md` and `docs/cutscenes-flashbacks-plan.md` (sections 1 and 6), for context.

## Inputs

The supplied models should be in `Blender/assets/` (the owner labelled them with the surnames; look for `lindqvist*`, `navarro*` and `park*`, as files or folders). **If you cannot find all three, stop and ask the owner where they are.** For each, record the **source URL, author and licence**. If a licence forbids modification or use in a game, or is missing, stop and tell the owner rather than using it.

Do not assume anyone's gender or pronouns from the name: use the model that was supplied, and say in your report what each looks like. (The Flashback 1 code currently refers to Lindqvist as "her"; flag it if the supplied head does not match, so the owner can decide.)

## What to produce

For each of the three:

- `public/assets/models/lindqvist.glb`, `navarro.glb`, `park.glb`: Voss's body and skeleton and Voss's clips (keep every clip the flashbacks use; check `BriefingFlashback.js` and `Flashback3D.js` for the names, and `Idle` and `Walk` at least), the supplied model's head, eyes and hair attached and skinned to Voss's neck, and **Voss's face morph targets** carried over so `FaceRig` works unchanged: `jaw_open`, `mouth_wide`, `mouth_pucker`, `mouth_smile`, `blink`, `brow_up`, `brow_down`, `eyes_tired`, `mouth_frown`, plus the extra brow morphs Voss has (`brow_inner_up`, `brow_up_L`, `brow_up_R`).
- **Teeth and a mouth interior** that read properly when the jaw opens (the owner disliked a black hole in Voss's mouth before; Kessler's script handles this; follow it).
- **Clothes repainted flat** in each character's colours, in the game's painted style, as the other characters are; Lindqvist keeps the glasses.
- Recognisably **different people**: head, hair, skin and colouring must differ clearly from each other, from Kessler and from Voss.
- Each file about **0.8 MB or less after** `npm run optimize-models` (run it on all three). The owner is keeping storage low: downscale textures, thin the hair and prefer per-vertex colour for hair as Kessler does. Total for the three should stay under about 2.5 MB.
- `src/entities/CrewMember.js`: a loader that generalises `Kessler.js` (name in, same `root`, `clips`, `parts` shape and the same scale and facing), so the Flashback 3 agent can load any of the four. Keep `Kessler.js` working (it may simply use the new class).
- `CREDITS.md`: an entry per model (title, author, licence, link), as for Kessler.
- A short note in `docs/crew-models-report.md` (see below).

## Checks

- Load each in the game's engine (a throwaway test page or script is fine; remove it afterwards) and render previews: neutral, mouth wide open, smiling and frowning, both blinking, shown at normal viewing distance and close up. Check `FaceRig` moves each face with no popping or stretching, the head sits correctly on the neck while the `Idle` and `Walk` clips play, and nothing clips through the collar.
- Check the skeleton bone names match Voss's exactly (the existing code looks them up by name).
- `npm run build` still passes.

## Rules from the project

- Lowercase-hyphenated file names, relative paths.
- Blender 5.x is installed; the Blender MCP tools and `blender -b` are both usable. Keep scripts under `Blender/scripts/`.
- GLTFLoader strips `. : / [ ]` and spaces from node names: verify the `.glb` contents after export.
- Do not touch `Blender/l2-atrium.blend` (hand-edited).
- Do not commit or push.

## Report (`docs/crew-models-report.md`)

For each model: the source, the licence, what it looks like, the final file size, the morph names present, the clip names present, and any problem you could not fix. **Say plainly if a face looks poor or "robotic"** when speaking at normal viewing distance, as the owner has rejected a face before and would rather know now. Include the paths of your preview images.
