# Crew models report (Lindqvist, Navarro, Park; Kessler updated)

Built by `Blender/scripts/build_crew_head.py` (one script, parameterised by character: `CHARS` at
the top), with the neck fitting shared with Kessler's script in `Blender/scripts/neck_fit.py`.
Loaded in the game by `src/entities/CrewMember.js` (`new CrewMember('lindqvist').load()`; same
`root`, `clips`, `parts`, scale and facing as before; `Kessler.js` now just extends it).

**Lindqvist, Navarro and Park are done.** **Kessler was rebuilt** too:
her neck, her skin tone, and **no more sunglasses** (her green eyes show).

## How they are made

- **Bodies:** Navarro and Park are on **Voss's body**, Lindqvist on **Kessler's body**
  (`kessler.glb`), all recoloured, with the body's own skeleton, clips and skin weights.
- **Heads:** the supplied model's head is built in Voss's space (his face morphs and his mouth are
  measured there), then moved onto the body. It is scaled so its eyes are as far apart as Voss's,
  at his eye height, with the nose as far forward.
- **Necks (reworked):** below the head, the borrowed neck is drawn onto the body's own old neck,
  which the collar was made around. This happens gradually: from under the chin at the front, and
  from below the skull at the sides and back. The neck is then cut off inside the collar. Before,
  each head kept its own fuller neck down to a fixed line and then snapped onto the body's, which
  left a ledge or flap over the collar. That is gone on all of them. **Park** gets a new neck
  instead (see his section).
- **Face morphs:** Voss's 12 face morphs are carried over (each vertex follows the point of his face
  it lands on). Lindqvist's and Park's blinks are made by the script, because their cut-out lids
  don't line up with his.
- **Mouth:** a slit is cut along the lip line, with Voss's own mouth interior and teeth behind it
  (scaled to the face's height between eyes and mouth), and a thin dark seal behind the slit so no
  crack shows when the mouth is shut.
- **Eyes:** eyeballs from the Angelica model (already in the repo for Kessler), with the irises
  recoloured.
- **Head textures:** rebaked into one compact 1024 texture per head.
- **Voss's "VOSS" ID card** (painted in his shirt texture) is now a blank card on Navarro and Park.

Rebuild, in this order, because Lindqvist is built on top of `kessler.glb`:

1. `blender -b --factory-startup --python Blender/scripts/build_kessler_from_female.py`
2. `blender -b --factory-startup --python Blender/scripts/build_crew_head.py -- lindqvist`
3. The same command with `navarro`, then with `park`.
4. `npm run optimize-models -- kessler.glb lindqvist.glb navarro.glb park.glb`

## Lindqvist: `public/assets/models/lindqvist.glb`, **678 KB**

- **Source:** "Female Character athletic woman" by 3dUVpro, https://sketchfab.com/3d-models/female-character-athletic-woman-0b2bdf1b3b1f41d4b3faa7a3bccc0842, **CC-BY-4.0**.
- **Body:** Kessler's ("Female scientist" by photon, CC-BY-4.0), repainted: a slate-blue coat
  (`0x3b4a5e`, as DrownedCrew), a white shirt (open collar, no tie) and charcoal trousers.
  **Voss's glasses** (black frames, clear lenses), fitted to her face, on the same glasses bones.
- **Looks:** a woman, light skin, straight silver-white hair to the collar, grey-green eyes.
- **Parts:** `Head`, `Eyes`, `Glasses`, `Hands`, `Body`. The clothes are one texture, `M_Clothes`,
  as on Kessler (not Voss's `M_Coat`, `M_Shirt`, `M_Pants`).

## Navarro: `public/assets/models/navarro.glb`, **833 KB**

- **Source:** "Man base mesh" by BlakkMato, https://sketchfab.com/3d-models/man-base-mesh-a870a28384fb428da535b6a816fea73e, **CC-BY-4.0**.
- **Body:** Voss's, in a brown coat (`0x5a4a32`, as DrownedCrew), a cream shirt and dark trousers.
- **Looks:** a man, light-tan skin, short spiky black hair with shaved sides, a full black beard,
  blue eyes.
- **Hair and beard** are cut-out cards (`M_HairCards`); the beard rides the jaw with the morphs.
- **Parts:** `Head`, `Eyes`, `Hair`, `Hands`, `Body`.
- **Size:** about 33 KB over the 0.8 MB target. The three crew files together are 2.0 MB.

## Kessler: `public/assets/models/kessler.glb`, **777 KB** (rebuilt)

- **No glasses:** her shades are gone (her parts are now `Head`, `Eyes`, `Hands`, `Body`, `Hair`);
  her green eyes and her blink are seen. The 2D figure of her in `src/level2/Flashback.js` lost its
  shades too.

- **Neck:** fitted the same way, so it goes cleanly into her shirt collar. The dark patch in the V
  of her collar (her old ragged neck used to cover it) is now painted shirt-coloured.
- **Skin:** warmer and less pale (Angelica's texture multiplied toward peach; the hair, brows and
  eyes are unchanged). Her hands follow the new tone.
- Everything else is as before (same materials, morphs and clips).

## Park: `public/assets/models/park.glb`, **~540 KB**

- **Source:** "FREE DOWNLOAD Athletic African man walking 223" by deep3dstudio, https://sketchfab.com/3d-models/free-download-athletic-african-man-walking-223-f9a8e3b108f04e998815593f78f163b1, **CC-BY-4.0**.
  It is a body scan of a real man (a scanning studio's free sample, released under CC-BY). The
  two models supplied before it were not used: a CC-BY-NC-SA scan, then a Sims 4 export (EA's).
- **Body:** Voss's, in a green coat (`0x46523f`, as DrownedCrew), a pale blue-grey shirt and dark
  trousers.
- **Looks:** a man, dark brown skin, close-cropped black hair (the scan's own, with a lighter patch
  over one temple), dark brown eyes. No glasses.
- **How:** one surface like Lindqvist's (painted eyes cut out, the lips cut apart, the head's colours
  rebaked). The scan's head was turned about 6°, so it is straightened before fitting. His face is
  narrow, so the head is drawn 7% larger than matching eye spacing alone would make it.
- **Neck:** the scan's neck runs into his tank top, and his shoulders rise to his jaw, so it could
  not be reshaped cleanly. The head is cut off at the throat, below the underside of the jaw (higher
  at the back, under the skull); his scanned shoulders are cut away at the sides behind the jaw.
  A new neck is built from that edge down into the collar, onto Voss's neck, painted one plain skin
  colour (the colour just above the cut). The chin and jaw keep their underside, so the chin stands
  clear of the neck.
- **Parts:** `Head`, `Eyes`, `Hands`, `Body`.

## All four files contain

- **Morphs:** `jaw_open`, `mouth_wide`, `mouth_pucker`, `mouth_smile`, `mouth_frown`, `blink`,
  `eyes_tired`, `brow_up`, `brow_down`, `brow_inner_up`, `brow_up_L`, `brow_up_R`. FaceRig drives
  them unchanged; this was checked in the engine (each morph alone, and the 'arguing' babble).
- **Clips:** `Idle` and `Walk` (all the flashbacks use).
- **Skeleton:** the same 67 joints as `human_scientist_v2.glb`, with identical names.

## Problems not fixed. Honest assessment of the faces

At **normal viewing distance (mid-shot)** all four read as people talking, not robots. **Navarro
is the best of the crew. Lindqvist is the weakest in close-up**, Park close behind her; keep her in mid-shots, as the
Flashback 3 plan already says.

Lindqvist:
- Her source sculpt has a worried, knit brow built in, so she always looks anxious, and her smile
  reads weakly.
- Her eyes look a little wide and staring in close-up.
- Her teeth (Voss's, narrowed) look greyish and blocky when the jaw is fully open. At talking
  amounts only a strip shows.
- Her solid sculpted hair has ragged ends at the back of the collar.

Navarro:
- His low-poly head is a little soft at very close range.
- A thin sliver of white stays at his eye corners when fully blinking.
- His hair cards are thinned and look a bit sparse from behind.
- His neck is still slightly full at the nape, seen straight from behind (no ledge now).

Park:
- His neck is new and plain: smooth skin with no detail, slightly flat in colour next to his face.
- A small sliver of eye stays at the outer corners when he fully blinks.
- His resting face looks wide-eyed and a little tense (the scan's own expression), and his teeth
  are as blocky as Lindqvist's when the jaw is fully open.

All: when the mouth opens fully, the top edge of the upper teeth shows as a hard white line.

## Preview images

Rendered in the game's engine (three.js, `CrewMember`, `FaceRig`, the toon materials), from a
throwaway test page that has since been removed:

- `docs/crew-models-previews/lindqvist-ingame.jpg`
- `docs/crew-models-previews/navarro-ingame.jpg`
- `docs/crew-models-previews/park-ingame.jpg`
- `docs/crew-models-previews/kessler-ingame.jpg`

  Each sheet, row by row: neutral, jaw open, smile, frown / blink, "ee", "oo", worry / two talking
  frames (FaceRig babble), three-quarter view, mid-shot / the neck from the side, Walk, the neck
  from behind mid-walk, the back mid-walk.
- `docs/crew-models-previews/crew-with-kessler.jpg`: Lindqvist, Navarro, Park and Kessler side by
  side.

## Update: mouths, Park's neck, Kessler's speech (2026-10-28)

- **One mouth for all four** (Kessler, Lindqvist, Navarro, Park). It has Voss's own teeth with
  their jaw motion, scaled evenly to each mouth. Before, they were squashed differently in width and
  height and looked blocky. The teeth sit inside a pocket made from the lips' inner edges back toward
  the throat: the roof stays still and the floor (tongue) drops with the lower lip.
  - Voss's original lining was not copied: it is welded to his own lips, and on another face it
    floated behind the lips and stretched into spikes.
  - The crew's cut lips now roll inward over the teeth, so they have thickness, as Voss's do.
  - On the crew, the lip motion is now taken from the front of Voss's lip on the same side. Before,
    the lower lip's edge often stuck to his upper lip, which also caused spikes.
- **Kessler's mouth barely opened:** her own (Angelica) mouth piece was decimated into one lump that
  stretched across the opening. It is replaced by the same teeth and pocket, her jaw drops 1.45×
  Voss's (her lips are much fuller), and the inside of her upper lip now moves with the upper lip.
- **Park's neck:** his own scanned neck is kept, but only inside the body's slim neck column. His
  shoulders and the back of his tank top are cut away, and the back of the neck is smoothed up to
  the skull (no more ragged flaps).
- **Blinks** (Lindqvist, Park): the lids now close past the lower lid and into the corners.
  Navarro's blink is 25% stronger.
- **Remaining:** on Park, a small sliver can still show at the outer eye corner when fully closed.
  Navarro's mouth corners show a light orange inner-lip colour when wide open.
- **Sizes:** Kessler 789 KB, Lindqvist 714 KB, Navarro 918 KB (over the 0.8 MB target), Park
  620 KB.
- **Preview:** `docs/crew-models-previews/mouths-eyes-necks.jpg`. Each row: talking, mouth open,
  blink, side of the neck.

## Update: necks in profile, Lindqvist's teeth (2026-10-28)

- **Park's neck** (it looked detached in profile): every vertex of his neck below the skull (and
  below the jaw at the front) is now pressed onto Voss's own neck surface, the one the collar was
  made around. His mesh stays in one piece, so the neck meets the collar all round. His nape is
  painted in his own skin colour (it had picked up his tank top's red).
- **Navarro's neck:** his low-poly nape had been cut away as "shoulder", leaving a notch at the back
  that showed his under-jaw beard. The nape is now kept and drawn in. His neck is painted in his
  throat's own colour (it had been the lighter cheek colour).
- **Lindqvist's teeth** (three bands): her lower lip drops less than Voss's, so her lower teeth rose
  above it and showed their front, top and back. The lower teeth now drop exactly as far as each
  character's lower lip (all three crew). The white points at her mouth corners were gaps through
  to her shirt; the mouth pocket is now closed at the corners (all three crew).
- **Remaining:** behind Park's left ear, a small dark-and-light mark from the scan's ear. Navarro
  has a small skin tuft at the collar's side, seen from directly side-on.
- **Preview:** `docs/crew-models-previews/necks-profiles-mouths.jpg`. Rows: Park, Navarro,
  Lindqvist, Kessler. Each row: left and right profile, behind, mouth open.

## Update: Park lower, Navarro's neck colour, Lindqvist's teeth width (2026-10-28)

- **Park** sits 2 cm lower on his neck (`drop` in `CHARS`): his head is closer to his body and he
  is about 2.6 cm shorter in the game. His neck now goes straight down into the collar from the side
  and from behind. Voss has the same collar, but his hair hides the back of his neck.
- **Navarro's neck** is painted in his face's skin colour with only gentle shading. The dark streaks
  in the source texture there had turned it brown.
- **Lindqvist's teeth** are full width again (`teeth_w` 1.0). They had been narrowed while chasing
  the white points at her mouth corners, which turned out to be holes, now closed.
- **Preview:** `docs/crew-models-previews/necks-profiles-mouths.jpg`. Row 1: Park (side, behind,
  side, back). Row 2: Park (face, full figure), Navarro (front, side). Row 3: Navarro, Lindqvist's
  mouth open, half open and a little open.

## Update: Park's neck, no gap (2026-10-28)

There was a see-through gap at the side of Park's neck, just above the collar: the side of his neck
had been trimmed away as "shoulder" before it reached the coat. His scanned neck is no longer
trimmed there; only what lies well outside the neck goes. All of it is pressed onto Voss's neck
surface, so it runs down into the coat all round, like Voss's own, and below the jaw it is painted
in his skin. Park is now 708 KB.

Preview: `docs/crew-models-previews/park-neck.jpg`. Row 1: both sides, and from behind on either
side. Row 2: from behind, three-quarter front, side mid-walk, face.
