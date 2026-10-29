# Credits: third-party assets

## Development team

- Jonaphan Mareno
- Naomi Mareno
- Simphiwe Kwela
- Thabiso Ramaema
- Sivunile Mlambo
- Tariro Muvevi

Everything not listed here (the station, rooms, furniture, props, the organism, the drowned deck,
shaders, the procedural textures and the sound effects) is our own work. The sound effects are
synthesised in the browser (src/audio). The background music is the team's own choice of tracks
(public/assets/audio/music): credit every track here when it is added.

## ambientCG (CC0 1.0, public domain)

Used in Level 3 (the drowned deck). CC0 needs no credit, but we credit the site anyway.
The 1K-JPG packs were downloaded from ambientcg.com; the deck's were packed into small WebP files
in `public/assets/textures/l3/` (colour, normal, and occlusion/roughness/metalness).

| Material | Used for | Link |
|---|---|---|
| Metal 021 | rusted grey metal walls and ceilings | https://ambientcg.com/view?id=Metal021 |
| Metal 022 | heavy rust: the ribs, pipes, frames and the pump | https://ambientcg.com/view?id=Metal022 |
| Concrete 042 C | cracked concrete with rusty mesh: the floors and the foot of every wall | https://ambientcg.com/view?id=Concrete042C |
| Metal Walkway 014 | the rusty perforated catwalk in the pump room | https://ambientcg.com/view?id=MetalWalkway014 |
| Rock 035 | the canyon outside the station: cliffs, seabed, pillars and the vents | https://ambientcg.com/view?id=Rock035 |

Suggested credits-screen line: *"Rust, concrete and rock textures from ambientCG (ambientcg.com, CC0)."*

## Poly Haven (CC0 1.0, public domain)

Used in Level 2 (the habitat atrium and bedroom shell) and Level 1 (monitor glass). CC0 needs
no credit, but we credit the artists anyway. The models are downloaded by `Blender/scripts/fetch_plants.cjs`.

| Model | Author(s) | Used for | Link |
|---|---|---|---|
| Pachira Aquatica 01 | Rob Tuytel, Rico Cilliers | the money trees (island and lounge pot) | https://polyhaven.com/a/pachira_aquatica_01 |
| Potted Plant 01 | Rico Cilliers | potted plants by the window | https://polyhaven.com/a/potted_plant_01 |
| Potted Plant 04 | James Ray Cock | succulents on the counter and coffee table | https://polyhaven.com/a/potted_plant_04 |
| Anthurium Botany 01 | Rob Tuytel, Rico Cilliers | red-flowered plants (island, gallery) | https://polyhaven.com/a/anthurium_botany_01 |
| Fern 02 | Rob Tuytel, Rico Cilliers | ferns (island, gallery) | https://polyhaven.com/a/fern_02 |
| Shrub Sorrel 01 | Rico Cilliers | small flowers round the island | https://polyhaven.com/a/shrub_sorrel_01 |
| Food Apple 01 | Oliver Harries | dropped food | https://polyhaven.com/a/food_apple_01 |
| Food Lime 01 | Oliver Harries | dropped food | https://polyhaven.com/a/food_lime_01 |
| Lemon | Kuutti Siitonen | dropped food | https://polyhaven.com/a/lemon |
| Yellow Onion | Kuutti Siitonen | dropped food | https://polyhaven.com/a/yellow_onion |
| Sweet Potato | Jan Martens | dropped food | https://polyhaven.com/a/sweet_potato |

| Texture | Author(s) | Used for | Link |
|---|---|---|---|
| Farm Soil (colour + displacement, packed into `public/assets/textures/soil_farm.webp`) | Amal Kumar | the soil in every planter, garden bed and pot in the atrium (colour, and the displacement drives the parallax depth) | https://polyhaven.com/a/farm_soil |
| Blue Metal Plate (roughness map, cropped clear of the plate seams) | Rob Tuytel | smudges, scratches and grime on the glass of level 1's glitching and broken monitors (`public/assets/textures/screen_wear.jpg`) | https://polyhaven.com/a/blue_metal_plate |
| Metal Plate 02 | Rob Tuytel | scratched steel: Kessler's bedroom shell (`public/assets/textures/Metals/Metal_plate/`) | https://polyhaven.com/a/metal_plate_02 |

Suggested credits-screen line: *"Plant and food models and textures from Poly Haven (polyhaven.com,
CC0) by Rob Tuytel, Rico Cilliers, James Ray Cock, Oliver Harries, Kuutti Siitonen, Jan Martens and Amal Kumar."*

## Level 1 furniture and generator details

| Model | Author | Used for | Licence | Link |
|---|---|---|---|---|
| Armchair | captain_neodym | the armchair in the control room | Personal Use License (as listed on Free3D) | https://free3d.com/3d-model/armchair-72618.html |
| MI smart TV (32 inch) | vinitk | parts used for the control-room TVs | Personal Use License (as listed on Free3D) | https://free3d.com/3d-model/mi-smart-tv-32-inch-239229.html |
| Chair | bananacake | the other control-room chairs | Personal Use License (as listed on Free3D) | https://free3d.com/3d-model/chair-16205.html |
| Sci-fi modular assets | ahedov | parts used for the generator wall panel and pillar | CC-BY-SA | https://blendswap.com/blend/9831 |

Credit lines:
- *"Armchair" by captain_neodym (https://free3d.com/3d-model/armchair-72618.html), listed under Free3D's Personal Use License.*
- *"MI smart TV (32) inch" by vinitk (https://free3d.com/3d-model/mi-smart-tv-32-inch-239229.html), listed under Free3D's Personal Use License. Parts used for the control-room TVs.*
- *"Chair" by bananacake (https://free3d.com/3d-model/chair-16205.html), listed under Free3D's Personal Use License.*
- *"Sci-fi modular assets" by ahedov (https://blendswap.com/blend/9831), licensed under CC-BY-SA. Modified (parts used for the Level 1 generator wall panel and pillar).*

## Additional asset sources

Some items in the Level 2 bedrooms and the robots were downloaded for free from CGTrader and
BlendSwap. Their original listings are no longer available, so the individual asset names and links
could not be recovered.

## Sketchfab (CC BY 4.0: the authors must be credited)

The vegetables in the atrium's garden beds (Level 2). Downloaded by hand into
`Blender/assets/veg/<name>/` (not in git: download them from these links to rebuild), then
thinned, given 512 px textures and merged per crop by `Blender/scripts/build_l2_atrium.py`, and
swapped into `Blender/l2-atrium.blend` by `Blender/scripts/swap_l2_veg.py`.

| Model | Author | Used for | Link |
|---|---|---|---|
| Lettuce | SirWyrm | lettuces (healthy and wilted) | https://sketchfab.com/3d-models/lettuce-1dfd949d61ae4d378d7c65571746f693 |
| Tomato Plant | zvanstone | staked tomato plants (healthy and dying) | https://sketchfab.com/3d-models/tomato-plant-e0b559690e384fc0a9f3a05913f609c4 |
| Cabbage | Meerschaum Digital | the cabbage bed | https://sketchfab.com/3d-models/cabbage-654306fc3ae344c7b9e7a9a40faca45b |
| Carrot Collection | Adam.White | carrots in the beds (just the tops showing) and pulled-up carrots on the floor | https://sketchfab.com/3d-models/carrot-collection-5edfb3471cf4400e99ace18446f924b3 |

Required credit lines (CC BY 4.0, http://creativecommons.org/licenses/by/4.0/):
- *"Lettuce" by SirWyrm (https://sketchfab.com/SirWyrm), licensed under CC-BY-4.0. Modified (decimated, merged).*
- *"Tomato Plant" by zvanstone (https://sketchfab.com/zvanstone), licensed under CC-BY-4.0. Modified (decimated, merged).*
- *"Cabbage" by Meerschaum Digital (https://sketchfab.com/meerschaumdigital), licensed under CC-BY-4.0. Modified (decimated, merged).*
- *"Carrot Collection" by Adam.White (https://sketchfab.com/Adam.White), licensed under CC-BY-4.0. Modified (one carrot kept, cut, decimated, merged).*

Dr. Kessler (`public/assets/models/kessler.glb`) is built from these models by
`Blender/scripts/build_kessler_from_female.py` (the sources are `Blender/assets/female_scientist.glb` and `Blender/assets/angelica_head.glb`):

| Model | Author | Used for | Link |
|---|---|---|---|
| Female scientist | photon (that one larry) | Dr. Kessler's body and hands (and Lindqvist's) | https://sketchfab.com/3d-models/female-scientist-c34c0fb5c79d41a18436933f937b283c |
| Angelica - Female Head PBR Model with Animation | Sell Asset Store | Dr. Kessler's head, face, eyes and hair | https://sketchfab.com/3d-models/angelica-female-head-pbr-model-with-animation-bada072816b74daeb860b8e0725c254d |

- *"Female scientist" by photon (that one larry) (https://sketchfab.com/Professor_E12), licensed under CC-BY-4.0. Modified (rigged to Voss's skeleton, clothes repainted, head and hair replaced, glasses removed; also Lindqvist's body, repainted again).*
- *"Angelica - Female Head PBR Model with Animation" by Sell Asset Store (https://sketchfab.com/emraanalis), licensed under CC-BY-4.0. Modified (decimated, neck refitted, given expressions, skin warmed, hair, brows and eyes recoloured, eyelashes and eye highlights removed; the eyeballs also used for Lindqvist and Navarro).*

Voss's crewmates Lindqvist, Navarro and Park (`public/assets/models/lindqvist.glb`, `navarro.glb`,
`park.glb`) are the heads of these models on bodies already in the game (Lindqvist on Kessler's, so
on "Female scientist" above, recoloured; Navarro and Park on Voss's), built by
`Blender/scripts/build_crew_head.py` (the sources are `Blender/assets/lindqvist.glb`, `navarro.glb`
and `park.glb`). Their eyeballs are
Angelica's (above), the irises recoloured.

| Model | Author | Used for | Link |
|---|---|---|---|
| Female Character athletic woman | 3dUVpro | Lindqvist's head, face and hair | https://sketchfab.com/3d-models/female-character-athletic-woman-0b2bdf1b3b1f41d4b3faa7a3bccc0842 |
| Man base mesh | BlakkMato | Navarro's head, face, hair and beard | https://sketchfab.com/3d-models/man-base-mesh-a870a28384fb428da535b6a816fea73e |
| FREE DOWNLOAD Athletic African man walking 223 | deep3dstudio | Park's head and face | https://sketchfab.com/3d-models/free-download-athletic-african-man-walking-223-f9a8e3b108f04e998815593f78f163b1 |

- *"Female Character athletic woman" by 3dUVpro (https://sketchfab.com/3dUVpro), licensed under CC-BY-4.0. Modified (head cut from the body and set on another character's body and skeleton, neck refitted, hair shortened, decimated, texture rebaked, eyes cut out and replaced, mouth opened, given expressions).*
- *"Man base mesh" by BlakkMato (https://sketchfab.com/BlakkMato), licensed under CC-BY-4.0. Modified (head cut from the body and set on another character's body and skeleton, neck refitted, subdivided, hair cards thinned, texture rebaked, eyes replaced, mouth opened, given expressions).*
- *"FREE DOWNLOAD Athletic African man walking 223" by deep3dstudio (https://sketchfab.com/deep3dstudio), licensed under CC-BY-4.0. Modified (head cut from the body, straightened and set on another character's body and skeleton, a new neck made, decimated, texture rebaked, eyes cut out and replaced, mouth opened, given expressions).*

The kraken (Level 3). Downloaded by hand (glTF) into `Blender/assets/kraken/` (not in git: download it
from the link to rebuild) and taken apart by `Blender/scripts/build_l3_kraken.py` into its body, one
arm and one long tentacle, its textures packed into one atlas; the game repeats the tentacles (ten
instead of four) and bends them (`src/level3/Kraken.js`).

| Model | Author | Used for | Link |
|---|---|---|---|
| Kraken | toro ardido modelos 3d | the kraken in its cave at the bottom of the trench (Level 3's final fight) | https://sketchfab.com/3d-models/kraken-4c547a84faa5477a9900272f862b6664 |

Required credit line (CC BY 4.0):
- *This work is based on "Kraken" (https://sketchfab.com/3d-models/kraken-4c547a84faa5477a9900272f862b6664) by toro ardido modelos 3d (https://sketchfab.com/toro_ardido_modelos_3d) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/). Modified (taken apart, tentacles repeated and animated, textures packed, scaled up).*

## Level 3 sound (CC0)

Level 3's sound effects and the kraken fight's music (`src/level3/Level3Audio.js`). The clips were
cut, levelled and converted to ogg into `public/assets/audio/sfx/l3/` and `public/assets/audio/music/`.
CC0 needs no credit, but the authors are named here (some ask for it). Flashback 3
(`src/level3/LockFlashback.js`) uses some of the same clips (the engines' hum, the clunk of the main
feed, the door's creak and slam, the latch, the seal's hiss, fists on the glass, the water); its sparks,
low thuds, footsteps and the console's buzz are synthesised in the browser.

| Pack | Author | Used for | Link |
|---|---|---|---|
| RPG Audio | Kenney (kenney.nl) | creaks, doors, cloth (the suit), latches, clicks | https://kenney.nl/assets/rpg-audio |
| Sci-fi Sounds | Kenney | hatches, the prep room's machine hum, the thrusters, the suit's seal, the slam, console beeps, the chute's low rumble, the weight under the metal bangs | https://kenney.nl/assets/sci-fi-sounds |
| Impact Sounds | Kenney | pipe knocks, hits, the spear striking flesh and rock, the chute's joints clacking past and the dogs letting go | https://kenney.nl/assets/impact-sounds |
| Interface Sounds | Kenney | the pickup chime, confirm/error beeps, the low-air tick | https://kenney.nl/assets/interface-sounds |
| Tinysized SFX | Vehicle (Jan Schupke, vehiclemusic.eu) | floor creak, metal groans, water drops, the lock filling, air hiss, the harpoon, whooshes, the chute's metal grinding (knife and fork scrapes, slowed down) | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx |
| Loopable Dungeon Ambience | JaggedStone | the deck's rumble and drips (and, slowed, the deep sea's) | https://opengameart.org/content/loopable-dungeon-ambience |
| Bubble sound effects | Brian MacIntosh (BMacZero) | bubbles: his breath, the lock, the sea | https://opengameart.org/content/bubble-sound-effects |
| CC0 Deep Monster Roar | trazzz123 | the kraken's roar | https://opengameart.org/content/cc0-deep-monster-roar |
| 80 CC0 creature SFX | rubberduck | the kraken's screams, growls, hiss and snapping jaws (pitched down), its shrieks and siren scream (the screams layered high and low, stretched and roughened), and the chorus of shrill voices screaming at once | https://opengameart.org/content/80-cc0-creature-sfx |
| Gunshot sounds | Tabasco (Vincent Sevedge) | the rifle's shots: an SKS and a Mosin-Nagant recorded at a range, cleaned of their background noise and layered (the page says CC0, the files' own note CC-BY 3.0: credited here either way) | https://opengameart.org/content/gunshot-sounds |
| Pixabay sound effects | universfield, shakil10000, floraphonic, emilianodleon, freesound_community, frigginmouse (via pixabay.com, Pixabay Content License) | the window breaking in Level 1, its cell door opening, the lift's ding in Levels 1 and 2, Level 2's garden robots, the keypads' buttons, paper picked up, machines' buttons, the hatch opening in Level 2, the splash into Level 3's water, wading through it, the hits in the chute, and the crowd of screams in the kraken's (public/assets/audio/sound-effects/) | https://pixabay.com/sound-effects/ |
| Sinister Boss Appears (music) | cynicmusic (cynicmusic.com, pixelsphere.org) | the kraken fight's base track (`level3-kraken.ogg`) | https://opengameart.org/content/sinister-boss-appears |
| Dramatic Boss Encounter (music) | cynicmusic | the fight's rising drum layer (`level3-kraken-intense.ogg`) | https://opengameart.org/content/dramatic-boss-encounter |
| Aquaria (music) | cynicmusic | the quiet music out in the sea (`level3-sea.ogg`) | https://opengameart.org/content/aquaria |

## Generated video

| Asset | Source | Used for |
|---|---|---|
| `public/assets/video/sea_loop.mp4` | Generated with Google Gemini (Veo) by Naomi Mareno; trimmed into a seamless loop with FFmpeg | the deep sea outside the atrium's big window |

## Voice

| Asset | Source | Used for |
|---|---|---|
| `public/assets/audio/aria/*.mp3` | Text-to-speech from ElevenLabs, voice "Maisie" (as named in the Level 2 script; confirm the exact voice and plan terms before submission) | ARIA's spoken lines |

## To add when used

- Sketchfab sea creatures for the final submission: record the model name, author, licence and
  link here when they are added.


## Fonts

| Font | Author | Used for | Licence |
|---|---|---|---|
| Orbitron | Matt McInerney (Google Fonts) | the HALCYON-9 title in the opening | SIL Open Font License 1.1, https://github.com/google/fonts/tree/main/ofl/orbitron |
