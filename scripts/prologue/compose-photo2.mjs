// Prologue photo 2 (the explorer): the Blender render (Blender/scripts/render_prologue_photo2.py)
// graded warm, in the Polaroid frame, captioned "He wants to be an explorer".
// Run: node scripts/prologue/compose-photo2.mjs
//   -> docs/reference-art/prologue-photo2-3d.png
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { W, H, polaroid } from './polaroid.mjs';

const RENDER = 'docs/reference-art/prologue-photo2-render.png';
const OUT = 'docs/reference-art/prologue-photo2-3d.png';

// Square crop round the two of them and his submarine (render is 1600 x 1600)
const crop = { left: 280, top: 250, width: 1250, height: 1250 };

const photo = await sharp(RENDER)
  .extract(crop)
  .resize(W, H, { kernel: 'lanczos3' })
  .modulate({ saturation: 0.9 })
  .recomb([[1.07, 0.03, 0], [0.02, 1.0, 0], [0, 0.02, 0.88]])   // the warm cast of an old print
  .sharpen({ sigma: 0.6 })
  .png().toBuffer();

writeFileSync(OUT, await polaroid(photo, 'He wants to be an explorer'));
console.log('wrote', OUT);
