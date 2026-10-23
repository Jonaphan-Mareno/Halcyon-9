// Copies the six finished prologue Polaroids (docs/reference-art/prologue-photoN-3d.png, made by
// compose-photoN.mjs) into the game as WebP: public/assets/textures/prologue/photoN.webp.
// Run: node scripts/prologue/export-photos.mjs
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';

const OUT_DIR = 'public/assets/textures/prologue';
mkdirSync(OUT_DIR, { recursive: true });

for (let n = 1; n <= 6; n++) {
  const out = `${OUT_DIR}/photo${n}.webp`;
  await sharp(`docs/reference-art/prologue-photo${n}-3d.png`).webp({ quality: 80 }).toFile(out);
  console.log('wrote', out, Math.round(statSync(out).size / 1024) + ' KB');
}
