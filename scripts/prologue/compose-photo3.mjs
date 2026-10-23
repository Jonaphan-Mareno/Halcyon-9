// Prologue photo 3 (the science fair): the Blender render (Blender/scripts/render_prologue_photo3.py)
// graded warm, in the Polaroid frame, captioned "He's top of the class again".
// Run: node scripts/prologue/compose-photo3.mjs
//   -> docs/reference-art/prologue-photo3-3d.png
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { W, H, polaroid } from './polaroid.mjs';

const RENDER = 'docs/reference-art/prologue-photo3-render.png';
const OUT = 'docs/reference-art/prologue-photo3-3d.png';

// Square crop round the two of them, his project and the banner (render is 1600 x 1600)
const crop = { left: 140, top: 230, width: 1300, height: 1300 };

const photo = await sharp(RENDER)
  .extract(crop)
  .resize(W, H, { kernel: 'lanczos3' })
  .modulate({ saturation: 0.9 })
  .recomb([[1.06, 0.03, 0], [0.02, 1.0, 0], [0, 0.02, 0.9]])   // the warm cast of an old print
  .sharpen({ sigma: 0.6 })
  .png().toBuffer();

writeFileSync(OUT, await polaroid(photo, "He's top of the class again"));
console.log('wrote', OUT);
