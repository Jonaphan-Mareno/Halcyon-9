import * as THREE from 'three';
import { Player } from '../../src/entities/Player.js';
import { FaceRig } from '../../src/entities/FaceRig.js';
import { CAPTION_BAND, writeCaption } from '../flashback1-photo/caption.js';
import { BriefingFlashback } from '../../src/story/BriefingFlashback.js';

// The restored crew photo of the ending (public/assets/textures/ending/crew-photo.webp): Flashback
// 1's photograph as it was before Voss tore and stained it. The same room, the same moment (the
// flash), from the same camera as scripts/flashback1-photo/, but whole: Voss stands at the end of
// the line where the tear was, everyone's own face shows (the flashback's are blanked; here they
// are not), and they smile. Then made into a print, warm and only a little faded: no stains, no
// tear, no water rings.
//
// Run `node scripts/ending-photo/render.mjs` (it starts the dev server and a headless Chrome, and
// writes the file). Open this page in the dev server to see it.

const W = 1200, H = 800;          // the picture on the print, 3:2 with its border (as the torn one)
const PRINT_H = H + CAPTION_BAND; // the print, with the paper under the picture and its caption
const BORDER = 0.028;
const SMILES = {
  voss: { smile: 0.85, brow: 0.2 }, lindqvist: { smile: 0.95, brow: 0.25 }, navarro: { smile: 1, brow: 0.15 },
  kessler: { smile: 0.9, brow: 0.2 }, park: { smile: 1, brow: 0.25 }
};

async function main() {
  const player = new Player(new THREE.Scene());
  await player.load();
  const fb = new BriefingFlashback(player, { root: null, faces: true });
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const inner = [Math.round(W * (1 - 2 * BORDER)), Math.round(H - W * 2 * BORDER)];
  renderer.setSize(inner[0], inner[1]);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  await fb.preload(renderer);
  const shot = fb.posePhoto(inner[0] / inner[1]);
  // Voss in the line (the flashback is seen through his eyes, so the photo hides him): as he was,
  // years ago, before the station: his clean face, rested lids, no wound
  const voss = fb.people.voss;
  voss.group.visible = true;
  voss.model.traverse((o) => {
    if (!o.isMesh) return;
    if ((o.material?.name === 'M_Head' || o.material?.name === 'M_LipSeal') && player.headTexture) o.material.map = player.headTexture;
    const i = o.morphTargetDictionary?.eyes_tired;
    if (i !== undefined) o.morphTargetInfluences[i] = 0;
  });
  // everyone smiling, eyes open (their faces have Voss's morph targets)
  for (const [name, face] of Object.entries(SMILES)) {
    const p = fb.people[name];
    if (!p) continue;
    const rig = new FaceRig(p.model, 'neutral');
    rig.gain = 1.7;                // (their smiles are mild morphs: as far as they will go)
    rig.pose(face, 100);
    rig.stare(100);
    for (let i = 0; i < 60; i++) rig.update(1 / 30);
  }
  renderer.render(fb.scene, shot.camera);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = PRINT_H;
  const g = c.getContext('2d');
  const b = Math.round(W * BORDER);
  g.fillStyle = '#f4efe4';
  g.fillRect(0, 0, W, PRINT_H);
  // warm, the colour a print keeps: less faded than the torn one, which lived in a pocket
  g.filter = 'sepia(0.16) saturate(0.95) contrast(1.06) brightness(1.02)';
  g.drawImage(renderer.domElement, b, b, inner[0], inner[1]);
  g.filter = 'none';
  let seed = 23;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  v.addColorStop(0, 'rgba(255, 240, 210, 0)');
  v.addColorStop(1, 'rgba(120, 80, 40, 0.22)');
  g.fillStyle = v;
  g.fillRect(b, b, inner[0], inner[1]);
  const glow = g.createLinearGradient(b, b, b + inner[0] * 0.4, b + inner[1] * 0.5);
  glow.addColorStop(0, 'rgba(255, 200, 130, 0.12)');
  glow.addColorStop(1, 'rgba(255, 200, 130, 0)');
  g.fillStyle = glow;
  g.fillRect(b, b, inner[0], inner[1]);
  writeCaption(g, H - b + 20);
  const img = g.getImageData(0, 0, W, PRINT_H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  c.id = 'out';
  document.body.appendChild(c);
  window.__faces = shot.faces.map((f) => f.toArray().map((x) => +x.toFixed(3)));
  window.__photo = c.toDataURL('image/webp', 0.86);
  window.__ready = true;
}

main().catch((e) => {
  console.error(e);
  window.__error = String(e && e.stack || e);
});
