# Credits: third-party assets

Everything not listed here (the station, rooms, furniture, props, the organism, shaders, the
procedural textures, the vegetables in the garden beds, the music and sound effects) is our own
work. The score and the sound effects are synthesised in the browser (src/audio), so there are
no audio files to credit.

## Poly Haven (CC0 1.0, public domain)

Used in Level 2 (the habitat atrium) and Level 1 (monitor glass). CC0 needs no credit, but we
credit the artists anyway. The models are downloaded by `Blender/scripts/fetch_plants.cjs`.

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
