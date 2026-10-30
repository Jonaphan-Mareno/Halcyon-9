// The Save-ARIA narration's rendered pictures: the Blender renders graded and made small for the
// game (1600 x 900 webp).
//   Blender/scripts/render_ending_window.py     -> mom-window.webp
// Run (from the repo root): node scripts/ending-shots/compose.mjs [render dir]
//   (default docs/reference-art, where the Blender scripts write by default)
// Prints where the glass is, for GLASS in src/level3/EndingNarration.js.
import sharp from 'sharp';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2] || 'docs/reference-art';
const OUT = 'public/assets/textures/ending';
const W = 1600, H = 900;

const shots = [
  // the window: morning, warm and soft
  { src: 'ending-window-render.png', out: 'mom-window.webp',
    grade: (s) => s.recomb([[1.08, 0.02, 0], [0.01, 1.0, 0], [0, 0.02, 0.86]]).linear(0.98, 8).modulate({ saturation: 1.12 }) }
];

for (const s of shots) {
  const src = join(DIR, s.src);
  if (!existsSync(src)) {
    console.log('missing', src, '(skipped)');
    continue;
  }
  const img = s.grade(sharp(src).resize(W, H, { kernel: 'lanczos3', fit: 'cover' }));
  const info = await img.sharpen({ sigma: 0.5 }).webp({ quality: 80, effort: 6 }).toFile(join(OUT, s.out));
  console.log('wrote', join(OUT, s.out), Math.round(info.size / 1024) + ' KB');
}
const window = join(DIR, 'ending-window.json');
if (existsSync(window)) console.log('window (her face; the glass, as the screen):', readFileSync(window, 'utf8'));
