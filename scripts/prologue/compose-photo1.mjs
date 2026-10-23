// Prologue photo 1 (our little Voss): the Blender render (Blender/scripts/render_prologue_photo1.py)
// graded warm and sunny, a little overexposed like an old summer snapshot, in the Polaroid frame,
// captioned "Our little Voss".
// Run: node scripts/prologue/compose-photo1.mjs
//   -> docs/reference-art/prologue-photo1-3d.png
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { W, H, polaroid } from './polaroid.mjs';

const RENDER = 'docs/reference-art/prologue-photo1-render.png';
const OUT = 'docs/reference-art/prologue-photo1-3d.png';

// Square crop round her and him, from her head to her waist (render is 1600 x 1600)
const crop = { left: 270, top: 330, width: 1060, height: 1060 };

const photo = await sharp(RENDER)
  .extract(crop)
  .resize(W, H, { kernel: 'lanczos3' })
  .modulate({ saturation: 1.0, brightness: 1.08 })
  .recomb([[1.1, 0.04, 0], [0.03, 1.02, 0], [0, 0.02, 0.86]])   // summer sun on an old print
  .sharpen({ sigma: 0.6 })
  .png().toBuffer();

writeFileSync(OUT, await polaroid(photo, 'Our little Voss'));
console.log('wrote', OUT);
