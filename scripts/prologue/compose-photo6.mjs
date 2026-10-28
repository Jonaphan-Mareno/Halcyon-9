// Prologue photo 6 (the hospital): the Blender render (Blender/scripts/render_prologue_photo6.py)
// graded cold and a little faded, in the Polaroid frame, captioned "Mom keeps forgetting".
// Run: node scripts/prologue/compose-photo6.mjs
//   -> docs/reference-art/prologue-photo6-3d.png
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { W, H, polaroid } from './polaroid.mjs';

const RENDER = 'docs/reference-art/prologue-photo6-render.png';
const OUT = 'docs/reference-art/prologue-photo6-3d.png';

// Square crop round the two of them, the sign and the whiteboard (render is 1600 x 1600)
const crop = { left: 300, top: 110, width: 1260, height: 1260 };

const photo = await sharp(RENDER)
  .extract(crop)
  .resize(W, H, { kernel: 'lanczos3' })
  .modulate({ saturation: 0.75 })
  .recomb([[0.94, 0.03, 0.03], [0.02, 0.97, 0.03], [0.02, 0.05, 1.04]])   // cold strip light
  .linear(0.95, 6)                                                        // a little faded
  .sharpen({ sigma: 0.6 })
  .png().toBuffer();

writeFileSync(OUT, await polaroid(photo, 'Mom keeps forgetting'));
console.log('wrote', OUT);
