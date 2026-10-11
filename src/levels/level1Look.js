import * as THREE from 'three';

// The habitat look for level 1: which surface each part of the control room gets.
//
// controlroom.glb is exported by hand and most of its materials are numbered (Material.046...),
// so surfaces are chosen by object name where the object is known, and otherwise by the colour
// it was given in Blender. Same palette as level 2's atrium and lab: white walls, navy, soft
// black, orange accents, light blue light, brushed steel. No riveted hull plating on furniture
// or walls.

// Surface kinds are the procedural textures in HubMaterials (createHubTextures)
const S = {
  wallWhite: { kind: 'wall', tile: 2.2, bump: 0.25, color: 0xd9dde2, rough: 0.5, metal: 0.0 },
  wallGrey: { kind: 'wall', tile: 2.2, bump: 0.25, color: 0xa8afb7, rough: 0.5, metal: 0.05 },
  navy: { kind: 'paint', tile: 0.7, bump: 0.35, color: 0x16233a, rough: 0.42, metal: 0.1 },
  softBlack: { kind: 'paint', tile: 0.6, bump: 0.35, color: 0x121418, rough: 0.38, metal: 0.15 },
  glossBlack: { kind: 'paint', tile: 0.6, bump: 0.2, color: 0x0a0b0d, rough: 0.2, metal: 0.4 },
  orange: { kind: 'paint', tile: 0.5, bump: 0.3, color: 0xf07a14, rough: 0.38, metal: 0.1 },
  white: { kind: 'plastic', tile: 0.45, bump: 0.25, color: 0xe4e7ea, rough: 0.32, metal: 0.0 },
  lightBlue: { kind: 'plastic', tile: 0.45, bump: 0.25, color: 0x5fa8d0, rough: 0.35, metal: 0.0 },
  steel: { kind: 'brushed', tile: 0.3, bump: 0.4, color: 0x9aa1a8, rough: 0.3, metal: 0.85 },
  fabricBlack: { kind: 'fabric', tile: 0.07, bump: 1.0, color: 0x121317, rough: 0.85, metal: 0.0 },
  fabricOrange: { kind: 'fabric', tile: 0.06, bump: 1.0, color: 0xe0701c, rough: 0.85, metal: 0.0 },
  floor: { kind: 'floor', tile: 4.0, bump: 1.2, color: 0xc4c9ce, rough: 0.3, metal: 0.05 },
  screen: { kind: null, color: 0x05080b, rough: 0.12, metal: 0.0 }
};

// The room shell: floor, walls and ceiling are one mesh, split by facing in the shader
const SHELL = {
  ...S.wallWhite,
  shell: true,
  floorColor: 0xc4c9ce,
  lowWallColor: 0x16233a,
  stripeColor: 0xf07a14,
  ceilColor: 0x101216
};

// Known objects (names as GLTFLoader gives them: dots stripped)
const BY_NAME = [
  [/^Cube$/, SHELL],
  [/^Cube00[12]$|^Cube014$|^wall_hp_base/, S.wallGrey],
  [/^wall_hp_panel01/, S.white],
  [/^wall_hp_panel02/, S.navy],
  [/^Cube0(04|09|13)$/, S.navy],                    // the desks along the walls
  [/^Keyboard/, S.softBlack],
  [/^Chair/, S.fabricBlack],
  [/^Sessel$/, S.fabricOrange],                    // the armchair: the room's orange accent
  [/^Stuhlbein/, S.steel],
  [/^Sphere$/, S.white],                           // the round table
  [/^Cylinder$/, S.softBlack],
  [/^Cylinder00[12]$/, S.steel],
  [/^Cube007$/, S.navy],
  [/^Circle$/, S.glossBlack],                      // the generator
  [/^Circle0(05|10|11|16)$/, S.steel],
  [/^Circle0(0[6-9]|1[2-5])$/, S.softBlack],
  [/^pillar$/, S.navy],
  [/^pillar002$/, S.glossBlack],
  [/^kolecka/, S.softBlack],                       // the pipework on the monitor wall
  [/^srouby/, S.steel],
  [/^Door_Frame$/, S.softBlack],
  [/^Door_(Left|Right)$/, S.white],
  [/^Cabin_Wall/, S.wallWhite],
  [/^Cabin_(Ceiling|GunmetalDark)|^Console_Panel$/, S.softBlack],
  [/^Cabin_Floor$/, S.floor],
  [/^Cabin_Bolt|^Console_Button/, S.steel],
  [/^Cabin_Threshold_Hazard$|^Console_HazardStrip$/, S.orange]
];

// Objects whose own colours carry meaning (glowing rings, cables, screens, ARIA's monitor, the
// light-puzzle pad): left as they are, just lit the new way
const KEEP = /^Circle00[1-4]$|^BezierCurve|^Monitor_wall|^Sphere008$|^Plane0(6[6-9]|7[01])$|^Console_Screen$|^Cabin_(LightStrip|Trim)|^Cube005$/;

function byColour(mat) {
  const c = mat.color || new THREE.Color(1, 1, 1);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  if (hsl.s > 0.35 && hsl.l > 0.08) return null;  // a real colour: keep it
  const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  if (lum > 0.55) return S.white;
  if (lum > 0.2) return S.wallGrey;
  if (lum > 0.03) return S.softBlack;
  return S.screen;
}

// The surface for one mesh, or null to keep its own colour (lit the new way, untextured)
export function surfaceFor(cleanName, mat) {
  if (KEEP.test(cleanName)) return null;
  for (const [re, spec] of BY_NAME) if (re.test(cleanName)) return spec;
  return byColour(mat);
}

export const SURFACE = S;
