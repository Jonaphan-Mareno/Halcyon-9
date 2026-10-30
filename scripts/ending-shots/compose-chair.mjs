// The Stay narration's unseen Polaroid (Blender/scripts/render_ending_chair.py, mode hero): the two of
// them on a painted garden, in the prologue's frame, and its caption alone for the black after it.
// Run (from the repo root), with the render folder:
//   node scripts/ending-shots/compose-chair.mjs <dir>     <dir>/hero-figures.png -> <dir>/photo-hero.png
//     (mode frames of the render needs it) and public/assets/textures/ending/chair/caption.webp
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { W, H, polaroid } from '../prologue/polaroid.mjs';

const DIR = process.argv[2];
const OUT = 'public/assets/textures/ending/chair';
mkdirSync(OUT, { recursive: true });

// Behind them: the ward's garden in the morning, soft
const garden = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c9de"/><stop offset="1" stop-color="#f0e6cf"/></linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g filter="url(#soft)">
    <rect x="-20" y="150" width="${W + 40}" height="420" fill="#ece2cf"/>
    ${[70, 300, 530].map((x) => `<rect x="${x}" y="230" width="150" height="190" fill="#8fa6b4"/>`).join('')}
    <ellipse cx="90" cy="600" rx="170" ry="120" fill="#6f8c52"/><ellipse cx="720" cy="590" rx="180" ry="130" fill="#7e9a5b"/>
    <rect x="0" y="640" width="${W}" height="170" fill="#8fa072"/>
    ${[[160, 560, '#d23a3c'], [640, 545, '#e889a6'], [700, 590, '#f4f1ea'], [60, 590, '#e889a6']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="20" fill="${c}"/>`).join('')}
  </g>
</svg>`;

// (a square crop round the two of them, cut at the hips; the render is 1600 x 1600)
const figures = await sharp(join(DIR, 'hero-figures.png'))
  .extract({ left: 130, top: 60, width: 1300, height: 1300 })
  .resize(W, H).recomb([[1.06, 0.03, 0], [0.02, 1.0, 0], [0, 0.02, 0.9]]).png().toBuffer();
const photo = await sharp(Buffer.from(garden)).composite([{ input: figures }]).png().toBuffer();
writeFileSync(join(DIR, 'photo-hero.png'), await polaroid(photo, 'Voss, my hero'));
// the caption alone, for the black after the picture
const caption = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="240"><text x="450" y="160" text-anchor="middle" font-family="Segoe Script, Bradley Hand, cursive" font-size="96" fill="#f1ead9">Voss, my hero</text></svg>`;
await sharp(Buffer.from(caption)).webp({ quality: 90, alphaQuality: 90 }).toFile(join(OUT, 'caption.webp'));
console.log('wrote', join(DIR, 'photo-hero.png'), 'and', join(OUT, 'caption.webp'));
