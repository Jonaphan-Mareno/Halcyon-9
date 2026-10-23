// Shared pieces for the prologue photos: painted backdrops and the Polaroid frame
// (cream border, grain, vignette, warm cast, handwritten caption).
import sharp from 'sharp';

export const W = 800, H = 800;           // photo area
export const FW = 940, FH = 1090;        // polaroid frame
const PX = (FW - W) / 2, PY = 60;        // photo offset inside the frame

// Soft-focus university steps for the graduation photo
export const campusBackdrop = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9fc3dd"/><stop offset="1" stop-color="#e9e2cf"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
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
  </g>
</svg>`;

// Wraps a W x H photo (PNG buffer) in the Polaroid frame; returns a PNG buffer
export async function polaroid(photoPng, caption) {
  const frame = `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${FW}" height="${FH}" viewBox="0 0 ${FW} ${FH}">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.3 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <radialGradient id="vig" cx="50%" cy="50%" r="72%">
      <stop offset="0.6" stop-color="#1c1408" stop-opacity="0"/><stop offset="1" stop-color="#1c1408" stop-opacity=".45"/>
    </radialGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f6f1e4"/><stop offset="1" stop-color="#e7dfcb"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="6" dy="10" stdDeviation="10" flood-opacity=".45"/></filter>
  </defs>
  <rect width="${FW}" height="${FH}" fill="#2b2622"/>
  <rect x="28" y="22" width="${FW - 56}" height="${FH - 50}" rx="8" fill="url(#paper)" filter="url(#shadow)"/>
  <g transform="translate(${PX} ${PY})">
    <image xlink:href="data:image/png;base64,${photoPng.toString('base64')}" width="${W}" height="${H}"/>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
    <rect width="${W}" height="${H}" fill="#fff" filter="url(#grain)" opacity=".6"/>
    <rect width="${W}" height="${H}" fill="#e9b25a" opacity=".08"/>
  </g>
  ${caption ? `<text x="${FW / 2}" y="${PY + H + 130}" text-anchor="middle" font-family="Segoe Script, Bradley Hand, cursive" font-size="54" fill="#2a2f5a" opacity=".85" transform="rotate(-1.5 ${FW / 2} ${PY + H + 120})">${caption}</text>` : ''}
</svg>`;
  return sharp(Buffer.from(frame)).png().toBuffer();
}
