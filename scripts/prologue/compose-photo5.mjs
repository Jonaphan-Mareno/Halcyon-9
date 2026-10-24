// Prologue photo 5 (the collapse): the Blender render (Blender/scripts/render_prologue_photo5.py)
// graded cold and washed out by the flash, in the Polaroid frame, captioned
// "Mom keeps falling".
// Run: node scripts/prologue/compose-photo5.mjs
//   -> docs/reference-art/prologue-photo5-3d.png
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { W, H, polaroid } from './polaroid.mjs';

const RENDER = 'docs/reference-art/prologue-photo5-render.png';
const OUT = 'docs/reference-art/prologue-photo5-3d.png';

// Square crop round the two of them, his face, her hand and the broken plate (render is 1600 x 1600)
const crop = { left: 230, top: 330, width: 1190, height: 1190 };

const photo = await sharp(RENDER)
  .extract(crop)
  .resize(W, H, { kernel: 'lanczos3' })
  .modulate({ saturation: 0.7, brightness: 1.04 })
  .recomb([[0.92, 0.04, 0.04], [0.02, 0.96, 0.04], [0.03, 0.06, 1.06]])   // cold
  .linear(1.18, -18)                                                      // the flash's hard contrast
  .sharpen({ sigma: 0.6 })
  .png().toBuffer();

writeFileSync(OUT, await polaroid(photo, 'Mom keeps falling'));
console.log('wrote', OUT);
