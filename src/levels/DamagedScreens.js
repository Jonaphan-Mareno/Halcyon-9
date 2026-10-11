import * as THREE from 'three';

// Two damaged monitors outside the monitor room, drawn with one small shader over the screen's
// canvas readout:
//
//   glitch - a failing signal: rows of the picture tear sideways, the colour channels split,
//            scanlines, a rolling bright band and bursts of static (now and then the picture
//            inverts for a frame). Bursts come at random moments (see GlitchTimer).
//   broken - the glass has taken a blow: cracks spread from the impact point and catch the
//            room light even with the power off; around the impact the panel is dead (an ink
//            blot of black), stuck pixel columns run down the screen, light bleeds through one
//            corner and what is left of the picture flickers.
//
// Both have a real worn-glass layer on top: smudges, scratches and grime from Poly Haven's
// Blue Metal Plate roughness map (Rob Tuytel, CC0), cropped clear of the plate's seams.

export const IMPACT = new THREE.Vector2(0.66, 0.42);   // where the broken screen was hit (uv)

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
uniform sampler2D map;
uniform sampler2D wear;
uniform sampler2D cracks;
uniform float mode;      // 0 glitch, 1 broken
uniform float time;
uniform float burst;     // 0..1, a glitch burst in progress
uniform float on;        // 0 before the power comes back
uniform float light;     // how lit the room is (0 dark .. 1 fully lit)
uniform vec2 impact;
varying vec2 vUv;

float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  vec3 col;
  if (mode < 0.5) {
    float row = floor(uv.y * 28.0);
    float tb = floor(time * 24.0);
    float amt = 0.06 + burst;
    // torn rows
    if (h(vec2(row, tb)) < 0.45 * amt) uv.x += (h(vec2(row * 1.3, tb + 7.0)) - 0.5) * 0.25 * amt;
    // split colour channels
    float off = 0.003 + 0.025 * amt;
    col = vec3(texture2D(map, uv + vec2(off, 0.0)).r, texture2D(map, uv).g, texture2D(map, uv - vec2(off, 0.0)).b);
    // a bright band rolling down, scanlines, static
    col += step(0.96 - 0.2 * burst, fract(uv.y * 2.0 + time * 0.6)) * vec3(0.06, 0.1, 0.13);
    col *= 0.8 + 0.2 * sin(uv.y * 700.0);
    float n = h(uv * vec2(640.0, 400.0) + fract(time * 13.0) * 100.0);
    col = mix(col, vec3(n * 0.8), 0.05 + 0.5 * burst * step(0.55, h(vec2(row, tb + 3.0))));
    if (h(vec2(tb, 9.0)) < burst * 0.25) col = vec3(0.7, 0.9, 1.0) - col;   // a frame inverted
    col *= on;
  } else {
    float d = distance(vUv * vec2(1.6, 1.0), impact * vec2(1.6, 1.0));
    vec3 ui = texture2D(map, uv).rgb;
    // dead panel spreading from the impact, with a ragged edge
    float blot = smoothstep(0.22, 0.42, d + (h(floor(vUv * vec2(70.0, 44.0))) - 0.5) * 0.1);
    float flick = step(0.18, h(vec2(floor(time * 9.0), 2.0)));
    col = ui * blot * (0.5 + 0.5 * flick);
    // stuck pixel columns
    float s = h(vec2(floor(vUv.x * 240.0), 4.0));
    if (s > 0.965) col = mix(col, s > 0.988 ? vec3(0.85, 0.15, 0.85) : (s > 0.977 ? vec3(0.15, 0.9, 0.55) : vec3(0.85)), 0.75 * blot);
    // light bleeding through a corner
    col += vec3(0.32, 0.36, 0.42) * smoothstep(0.16, 0.0, distance(vUv * vec2(1.6, 1.0), vec2(0.25, 0.78)));
    col *= on;
    // the cracks catch the room light, powered or not
    vec4 c = texture2D(cracks, vUv);
    col = mix(col, vec3(0.62, 0.68, 0.74) * (0.12 + 0.88 * light), c.a * 0.85);
  }
  // worn glass: smudges and scratches lift the blacks a little
  // (scaled under one repeat: the cropped photo does not tile)
  float w = texture2D(wear, vUv * vec2(0.95, 0.5) + vec2(0.02, 0.25)).r;
  col += vec3(0.045, 0.05, 0.055) * (0.3 + 0.7 * light) * smoothstep(0.25, 0.75, w);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// Cracks spreading out from the impact: long radial cracks that fork, broken rings round the
// impact and a crushed spot in the middle (white lines on transparent; the shader reads alpha)
function crackTexture(w, h) {
  let a = 5;
  const rand = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const ix = IMPACT.x * w, iy = (1 - IMPACT.y) * h;
  g.lineCap = 'round';

  const crack = (x, y, ang, len, width, depth) => {
    g.lineWidth = width;
    g.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * rand()})`;
    g.beginPath(); g.moveTo(x, y);
    const steps = Math.max(3, Math.floor(len / 14));
    for (let k = 0; k < steps; k++) {
      ang += (rand() - 0.5) * 0.35;
      x += Math.cos(ang) * len / steps; y += Math.sin(ang) * len / steps;
      g.lineTo(x, y);
      if (depth < 2 && rand() < 0.12) {
        g.stroke();
        crack(x, y, ang + (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.5), len * 0.4, width * 0.7, depth + 1);
        g.lineWidth = width; g.beginPath(); g.moveTo(x, y);
      }
    }
    g.stroke();
  };
  for (let k = 0; k < 17; k++) crack(ix, iy, (k / 17) * Math.PI * 2 + (rand() - 0.5) * 0.3, (0.25 + rand() * 0.7) * w * 0.6, 1.2 + rand() * 1.4, 0);

  for (const r of [14, 30, 55, 90]) {
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    const n = 18;
    for (let k = 0; k < n; k++) {
      if (rand() < 0.35) continue;
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const r0 = r * (0.85 + rand() * 0.3), r1 = r * (0.85 + rand() * 0.3);
      g.beginPath();
      g.moveTo(ix + Math.cos(a0) * r0, iy + Math.sin(a0) * r0 * 0.9);
      g.lineTo(ix + Math.cos(a1) * r1, iy + Math.sin(a1) * r1 * 0.9);
      g.stroke();
    }
  }
  // the crushed spot: a cluster of tiny bright shards
  for (let k = 0; k < 40; k++) {
    const ang = rand() * Math.PI * 2, rr = rand() * 12;
    g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.5})`;
    g.beginPath();
    const x = ix + Math.cos(ang) * rr, y = iy + Math.sin(ang) * rr;
    g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6); g.lineTo(x + (rand() - 0.5) * 6, y + (rand() - 0.5) * 6);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

let wearTexture = null;
function loadWear() {
  if (!wearTexture) {
    wearTexture = new THREE.TextureLoader().load('./assets/textures/screen_wear.jpg');
    wearTexture.wrapS = wearTexture.wrapT = THREE.RepeatWrapping;
    wearTexture.colorSpace = THREE.NoColorSpace;
  }
  return wearTexture;
}

// The material for a damaged screen showing the canvas texture `map`
export function damagedScreenMaterial(mode, map, w, h) {
  const cracks = mode === 'broken' ? crackTexture(w, h) : null;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      wear: { value: loadWear() },
      cracks: { value: cracks || map },
      mode: { value: mode === 'broken' ? 1 : 0 },
      time: { value: 0 },
      burst: { value: 0 },
      on: { value: 0 },
      light: { value: 0 },
      impact: { value: IMPACT.clone() }
    },
    vertexShader,
    fragmentShader,
    toneMapped: false
  });
  mat.userData.cracks = cracks;
  return mat;
}

// Random glitch bursts: a sharp hit that fades over a fraction of a second
export class GlitchTimer {
  constructor() { this.value = 0; this.next = 0.5; }
  update(dt) {
    this.next -= dt;
    if (this.next <= 0) {
      this.value = 0.5 + Math.random() * 0.5;
      this.next = Math.random() < 0.3 ? 0.12 : 0.6 + Math.random() * 2.4;
    }
    this.value = Math.max(0, this.value - dt * (2.5 + Math.random() * 3));
    return this.value;
  }
}
