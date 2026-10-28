// Prototype: prologue photo 4 (graduation), drawn as SVG, wrapped in a Polaroid frame.
// Run: node scripts/prologue/gen-photo4.mjs   -> docs/reference-art/prologue-photo4.{svg,png}
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const W = 800, H = 800;           // photo area
const FW = 940, FH = 1090;        // polaroid frame
const PX = (FW - W) / 2, PY = 60; // photo offset inside the frame

const skinV = '#efd2bd', skinVs = '#d9b49a';
const skinM = '#d9a77f', skinMs = '#bf8a63';
const ink = '#241c1a';

const background = `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9fc3dd"/><stop offset="1" stop-color="#e9e2cf"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="bokeh"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g filter="url(#soft)">
    <rect x="0" y="330" width="${W}" height="470" fill="#c9b79a"/>
    <rect x="-20" y="250" width="${W + 40}" height="60" fill="#b8a487"/>
    <polygon points="-20,250 400,130 ${W + 20},250" fill="#a89478"/>
    ${[40, 190, 340, 490, 640, 760].map(x => `<rect x="${x}" y="305" width="46" height="400" fill="#dccfb5"/><rect x="${x - 6}" y="298" width="58" height="14" fill="#cbbb9e"/>`).join('')}
    <rect x="0" y="690" width="${W}" height="110" fill="#8fa072"/>
  </g>
  <g filter="url(#bokeh)" opacity="0.55">
    ${[[90, 180, 40], [640, 120, 34], [720, 330, 28], [30, 420, 32], [560, 60, 24]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff6d8"/>`).join('')}
    <circle cx="110" cy="560" r="60" fill="#7e9a5b"/><circle cx="700" cy="590" r="70" fill="#6f8c52"/>
  </g>`;

// ---------- Voss: gown, cap, glasses, dark wavy hair ----------
const voss = `
  <g transform="translate(-20,0)">
    <path d="M238 300 C230 230 270 205 312 205 C356 205 392 232 384 305 C388 350 392 392 372 420 L252 420 C230 392 236 350 238 300 Z" fill="#1d1816"/>
    <path d="M150 800 C152 540 200 455 312 440 C424 455 472 540 474 800 Z" fill="#1e2433"/>
    <path d="M250 440 L312 560 L374 440 Z" fill="#e8eef3"/>
    <path d="M290 440 L312 520 L334 440 Z" fill="#7a2f3a"/>
    <path d="M232 450 C250 600 262 700 266 800 L300 800 C290 700 280 600 268 462 Z" fill="#c8a24a"/>
    <path d="M392 450 C374 600 362 700 358 800 L324 800 C334 700 344 600 356 462 Z" fill="#c8a24a"/>
    <path d="M288 372 L288 440 C300 452 324 452 336 440 L336 372 Z" fill="${skinVs}"/>
    <ellipse cx="312" cy="318" rx="66" ry="82" fill="${skinV}"/>
    <ellipse cx="248" cy="330" rx="9" ry="16" fill="${skinV}"/><ellipse cx="376" cy="330" rx="9" ry="16" fill="${skinV}"/>
    <path d="M246 306 C244 248 276 226 312 232 C348 226 380 248 378 306 C372 280 356 262 338 258 C328 270 318 274 312 274 C306 274 296 270 286 258 C268 262 252 280 246 306 Z" fill="#241d1a"/>
    <path d="M246 300 C238 340 246 372 236 400 C256 396 262 366 262 330 Z M378 300 C386 340 378 372 388 400 C368 396 362 366 362 330 Z" fill="#241d1a"/>
    <path d="M272 308 q16 -9 34 -2 M320 306 q18 -7 34 2" stroke="#2a1f1b" stroke-width="5" stroke-linecap="round" fill="none"/>
    <ellipse cx="290" cy="324" rx="6.5" ry="7" fill="${ink}"/><ellipse cx="336" cy="324" rx="6.5" ry="7" fill="${ink}"/>
    <circle cx="292" cy="322" r="2" fill="#fff"/><circle cx="338" cy="322" r="2" fill="#fff"/>
    <path d="M312 330 q-6 24 -2 34 q6 4 12 0" stroke="${skinVs}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M288 386 q24 20 50 0" stroke="#9c5b57" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M292 388 q20 14 42 0 q-20 6 -42 0z" fill="#fff" opacity=".85"/>
    <rect x="266" y="308" width="48" height="34" rx="9" fill="#cfe4f0" fill-opacity=".25" stroke="#2c3138" stroke-width="3.5"/>
    <rect x="320" y="308" width="48" height="34" rx="9" fill="#cfe4f0" fill-opacity=".25" stroke="#2c3138" stroke-width="3.5"/>
    <path d="M314 322 h6 M266 322 l-18 -4 M368 322 l18 -4" stroke="#2c3138" stroke-width="3.5" fill="none"/>
    <path d="M254 252 C256 222 276 206 312 206 C348 206 368 222 370 252 C348 238 276 238 254 252 Z" fill="#14161f"/>
    <polygon points="170,226 312,176 454,226 312,262" fill="#171a25"/>
    <polygon points="170,226 312,262 312,270 170,234" fill="#0c0e15"/>
    <polygon points="454,226 312,262 312,270 454,234" fill="#0c0e15"/>
    <path d="M312 220 L420 238 L422 296" stroke="#c8a24a" stroke-width="4" fill="none"/>
    <path d="M414 292 h16 l4 34 h-24 z" fill="#c8a24a"/>
  </g>`;

// ---------- Mother: ~50, long black hair going grey, pendant, cardigan ----------
const mom = `
  <g transform="translate(10,60)">
    <path d="M440 330 C430 255 480 232 526 232 C572 232 612 258 606 332 C612 392 618 450 596 490 L452 490 C432 450 446 392 440 330 Z" fill="#26201f"/>
    <path d="M410 800 C412 580 450 490 526 478 C602 490 640 580 642 800 Z" fill="#2f6d6a"/>
    <path d="M496 480 L526 600 L556 480 Z" fill="#f2e8d8"/>
    <path d="M520 478 L526 800" stroke="#245654" stroke-width="3"/>
    ${[560, 620, 680, 740].map(y => `<circle cx="526" cy="${y}" r="5" fill="#e4d6b8"/>`).join('')}
    <path d="M506 405 L506 482 C516 494 536 494 546 482 L546 405 Z" fill="${skinMs}"/>
    <path d="M500 484 C512 540 540 540 552 484" stroke="#c8a24a" stroke-width="2.5" fill="none"/>
    <circle cx="526" cy="533" r="9" fill="#e0b84f" stroke="#a8842c" stroke-width="2"/>
    <ellipse cx="526" cy="344" rx="60" ry="74" fill="${skinM}"/>
    <ellipse cx="468" cy="356" rx="8" ry="14" fill="${skinM}"/><ellipse cx="584" cy="356" rx="8" ry="14" fill="${skinM}"/>
    <path d="M466 338 C462 276 490 252 526 256 C562 252 590 276 586 338 C580 304 560 284 540 280 C534 290 528 296 526 296 C522 296 516 290 510 280 C492 284 472 304 466 338 Z" fill="#2a2322"/>
    <path d="M466 332 C458 380 468 420 456 462 C478 454 484 410 482 366 Z M586 332 C594 380 584 420 596 462 C574 454 568 410 570 366 Z" fill="#2a2322"/>
    <path d="M480 300 C492 280 510 270 524 270 M500 290 C506 282 514 278 520 276 M572 306 C568 292 558 282 546 276" stroke="#b9b6b4" stroke-width="5" stroke-linecap="round" fill="none" opacity=".9"/>
    <path d="M462 350 C460 392 462 424 456 454" stroke="#b9b6b4" stroke-width="4" stroke-linecap="round" fill="none" opacity=".8"/>
    <path d="M492 334 q16 -10 32 -3 M532 331 q16 -7 32 3" stroke="#201816" stroke-width="5.5" stroke-linecap="round" fill="none"/>
    <path d="M494 352 q12 -9 26 0 q-13 8 -26 0 z" fill="#fff"/><path d="M534 352 q14 -9 26 0 q-13 8 -26 0z" fill="#fff"/>
    <ellipse cx="507" cy="352" rx="5.5" ry="6" fill="#3b2218"/><ellipse cx="547" cy="352" rx="5.5" ry="6" fill="#3b2218"/>
    <path d="M488 372 q8 6 16 2 M548 374 q8 4 16 -2" stroke="${skinMs}" stroke-width="2.5" fill="none" opacity=".7"/>
    <path d="M526 356 q-6 22 -2 30 q6 4 12 0" stroke="${skinMs}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M496 400 q30 28 62 0" stroke="#a24a4a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M502 402 q25 20 50 0 q-25 8 -50 0z" fill="#fff"/>
    <path d="M484 310 q10 -4 18 0 M556 310 q10 -4 18 0 M476 372 q-4 14 2 24 M576 372 q4 14 -2 24" stroke="${skinMs}" stroke-width="2" fill="none" opacity=".6"/>
    <g transform="rotate(-18 480 640)">
      <rect x="420" y="620" width="150" height="44" rx="7" fill="#f4ead2" stroke="#d9c9a0" stroke-width="2"/>
      <rect x="470" y="620" width="14" height="44" fill="#9b2f3b"/>
    </g>
    <circle cx="452" cy="650" r="22" fill="${skinM}"/><circle cx="560" cy="626" r="22" fill="${skinM}"/>
  </g>
  <ellipse cx="404" cy="522" rx="28" ry="20" fill="${skinM}" transform="rotate(-20 404 522)"/>`;

const photo = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    ${background}
    ${voss}
    ${mom}
  </svg>`;

const frame = `
<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}" viewBox="0 0 ${FW} ${FH}">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.35 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <radialGradient id="vig" cx="50%" cy="50%" r="70%">
      <stop offset="0.55" stop-color="#2a1a05" stop-opacity="0"/><stop offset="1" stop-color="#2a1a05" stop-opacity=".55"/>
    </radialGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6f1e4"/><stop offset="1" stop-color="#e7dfcb"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="6" dy="10" stdDeviation="10" flood-opacity=".45"/></filter>
  </defs>
  <rect width="${FW}" height="${FH}" fill="#2b2622"/>
  <rect x="28" y="22" width="${FW - 56}" height="${FH - 50}" rx="8" fill="url(#paper)" filter="url(#shadow)"/>
  <g transform="translate(${PX} ${PY})">
    <image href="data:image/svg+xml;base64,${Buffer.from(photo).toString('base64')}" width="${W}" height="${H}"/>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
    <rect width="${W}" height="${H}" fill="#fff" filter="url(#grain)" opacity=".7"/>
    <rect width="${W}" height="${H}" fill="#e9b25a" opacity=".10"/>
  </g>
  <text x="${FW / 2}" y="${PY + H + 130}" text-anchor="middle" font-family="Segoe Script, Bradley Hand, cursive" font-size="54" fill="#2a2f5a" opacity=".85" transform="rotate(-1.5 ${FW / 2} ${PY + H + 120})">Dr. Voss</text>
</svg>`;

const out = 'docs/reference-art/prologue-photo4';
writeFileSync(out + '.svg', frame);
await sharp(Buffer.from(frame)).png().toFile(out + '.png');
console.log('wrote', out);
