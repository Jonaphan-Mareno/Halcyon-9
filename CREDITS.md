# Credits: third-party assets

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
CC0 needs no credit, but the authors are named here (some ask for it).

| Pack | Author | Used for | Link |
|---|---|---|---|
| RPG Audio | Kenney (kenney.nl) | creaks, doors, cloth (the suit), latches, clicks | https://kenney.nl/assets/rpg-audio |
| Sci-fi Sounds | Kenney | hatches, the prep room's machine hum, the thrusters, the suit's seal, the slam, console beeps, the chute's low rumble | https://kenney.nl/assets/sci-fi-sounds |
| Impact Sounds | Kenney | pipe knocks, hits, the spear striking flesh and rock, the chute's joints clacking past | https://kenney.nl/assets/impact-sounds |
| Interface Sounds | Kenney | the pickup chime, confirm/error beeps, the low-air tick | https://kenney.nl/assets/interface-sounds |
| Tinysized SFX | Vehicle (Jan Schupke, vehiclemusic.eu) | floor creak, metal groans, water drops, the lock filling, air hiss, the harpoon, whooshes, the chute's metal grinding (knife and fork scrapes, slowed down) | https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx |
| Loopable Dungeon Ambience | JaggedStone | the deck's rumble and drips (and, slowed, the deep sea's) | https://opengameart.org/content/loopable-dungeon-ambience |
| Bubble sound effects | Brian MacIntosh (BMacZero) | bubbles: his breath, the lock, the sea | https://opengameart.org/content/bubble-sound-effects |
| CC0 Deep Monster Roar | trazzz123 | the kraken's roar | https://opengameart.org/content/cc0-deep-monster-roar |
| 80 CC0 creature SFX | rubberduck | the kraken's screams, growls, hiss and snapping jaws (pitched down) | https://opengameart.org/content/80-cc0-creature-sfx |
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
