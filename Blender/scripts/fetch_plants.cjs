// Downloads the free plant and food models Level 2 uses from Poly Haven (CC0; credit Poly Haven
// and the artists on the credits screen) into Blender/assets/plants/<id>/.
// The raw downloads are not kept in git; run this once before building the atrium:
//   node Blender/scripts/fetch_plants.cjs
const fs = require('fs');
const path = require('path');

const PLANTS = [
  'pachira_aquatica_01',     // money tree (the tall tree in the lounge island)
  'potted_plant_02',         // potted plant
  'calathea_orbifolia_01',   // broad-leaf plant
  'anthurium_botany_01',     // red-flowered plant
  'fern_02',                 // fern
  'shrub_sorrel_01',         // small flowers
  'potted_plant_01',         // potted plant (by the window)
  'potted_plant_04',         // succulent in a pot
  'food_lime_01',            // spilled food (the crew grew and stored their own)
  'food_apple_01',
  'sweet_potato',
  'yellow_onion',
  'lemon'
];
const OUT = path.join(__dirname, '..', 'assets', 'plants');

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

(async () => {
  for (const id of PLANTS) {
    const dir = path.join(OUT, id);
    if (fs.existsSync(path.join(dir, `${id}_1k.gltf`))) { console.log('have', id); continue; }
    const files = JSON.parse((await get(`https://api.polyhaven.com/files/${id}`)).toString());
    const g = files.gltf['1k'].gltf;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}_1k.gltf`), await get(g.url));
    for (const [rel, f] of Object.entries(g.include || {})) {
      const dest = path.join(dir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await get(f.url));
    }
    console.log('downloaded', id);
  }
})().catch((e) => { console.error(e); process.exit(1); });
