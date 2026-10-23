// Prologue photo 4 (graduation), 3D version: the Blender render of Voss and his mother
// (Blender/scripts/render_prologue_photo4.py) on the painted campus, in the Polaroid frame.
// Run: node scripts/prologue/compose-photo4.mjs
//   -> docs/reference-art/prologue-photo4-3d.png
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { W, H, campusBackdrop, polaroid } from './polaroid.mjs';

const FIGURES = 'docs/reference-art/prologue-photo4-figures.png';
const OUT = 'docs/reference-art/prologue-photo4-3d.png';

// Square crop round the two of them and his raised hand (render is 1600 x 1600), cut at the hips
const crop = { left: 110, top: 20, width: 1260, height: 1260 };

const figures = await sharp(FIGURES)
  .extract(crop)
  .resize(W, H)
  .modulate({ saturation: 0.9 })
  .recomb([[1.06, 0.03, 0], [0.02, 1.0, 0], [0, 0.02, 0.9]])   // the sunny warm cast of the backdrop
  .png().toBuffer();

const photo = await sharp(Buffer.from(campusBackdrop))
  .composite([{ input: figures }])
  .png().toBuffer();

writeFileSync(OUT, await polaroid(photo, 'My Dr. Voss!'));
console.log('wrote', OUT);
