import * as THREE from 'three';

// The brick Voss throws through the cell window: a fired clay brick drawn by code (no image
// files). The colour map has the clay's uneven firing, dark burnt patches, sandy specks, pits,
// chipped corners and smears of old mortar; a height map of the same features becomes the
// normal map, so the pits and chips catch the red emergency light.

const W = 512, H = 256;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blob(g, x, y, r, colour) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, colour);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// Paints both maps with the same random features (same seed), colour or relief
function paint(g, relief) {
  const rand = rng(7);
  g.fillStyle = relief ? '#808080' : '#9a4426';
  g.fillRect(0, 0, W, H);

  // uneven firing: warmer and darker areas
  for (let i = 0; i < 40; i++) {
    const x = rand() * W, y = rand() * H, r = 20 + rand() * 90;
    const c = relief ? 'rgba(128,128,128,0)'
      : rand() < 0.5 ? `rgba(${150 + rand() * 40},${70 + rand() * 25},${35 + rand() * 15},0.35)`
        : `rgba(${60 + rand() * 30},${25 + rand() * 12},${15 + rand() * 8},0.3)`;
    blob(g, x, y, r, c);
  }
  // burnt edge: darker towards the long sides
  if (!relief) {
    for (const [y0, y1] of [[0, 40], [H, H - 40]]) {
      const grad = g.createLinearGradient(0, y0, 0, y1);
      grad.addColorStop(0, 'rgba(45,18,10,0.45)');
      grad.addColorStop(1, 'rgba(45,18,10,0)');
      g.fillStyle = grad;
      g.fillRect(0, Math.min(y0, y1), W, 40);
    }
  }
  // grain: sandy specks and dark grit
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * (relief ? 60 : 28);
    d[i] += n; d[i + 1] += n * (relief ? 1 : 0.8); d[i + 2] += n * (relief ? 1 : 0.6);
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 900; i++) {
    const x = rand() * W, y = rand() * H, s = 0.6 + rand() * 1.6;
    const light = rand() < 0.55;
    g.fillStyle = relief ? (light ? 'rgba(150,150,150,0.7)' : 'rgba(70,70,70,0.8)')
      : light ? 'rgba(220,170,120,0.55)' : 'rgba(35,15,10,0.6)';
    g.fillRect(x, y, s, s);
  }
  // pits
  for (let i = 0; i < 70; i++) {
    const x = rand() * W, y = rand() * H, r = 1.5 + rand() * 4;
    g.fillStyle = relief ? 'rgba(30,30,30,0.9)' : 'rgba(40,16,10,0.75)';
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // chips knocked out of the edges: paler clay underneath, sunk below the surface
  for (let i = 0; i < 9; i++) {
    const onTop = rand() < 0.5;
    const x = rand() * W, y = onTop ? rand() * 14 : H - rand() * 14;
    g.fillStyle = relief ? 'rgba(40,40,40,0.95)' : 'rgba(176,96,62,0.95)';
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, rr = 6 + rand() * 16;
      const px = x + Math.cos(a) * rr * 1.4, py = y + Math.sin(a) * rr * 0.7;
      k ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.fill();
  }
  // old mortar smeared along one side
  for (let i = 0; i < 14; i++) {
    const x = rand() * W, y = H - 8 - rand() * 30, r = 6 + rand() * 18;
    blob(g, x, y, r, relief ? 'rgba(175,175,175,0.8)' : 'rgba(178,172,160,0.8)');
  }
}

// The height map turned into a normal map (slopes from neighbouring pixels)
function toNormals(heightCanvas, strength) {
  const src = heightCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d');
  const img = g.createImageData(W, H);
  const h = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

export function createBrickMaps() {
  const colour = document.createElement('canvas');
  colour.width = W; colour.height = H;
  paint(colour.getContext('2d'), false);
  const height = document.createElement('canvas');
  height.width = W; height.height = H;
  paint(height.getContext('2d'), true);

  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(toNormals(height, 4));
  normalMap.colorSpace = THREE.NoColorSpace;
  return { map, normalMap };
}
