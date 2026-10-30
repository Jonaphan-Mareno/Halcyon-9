import * as THREE from 'three';

// The lift Voss rides from the control room down to the habitat deck. Level 1 has it inside
// controlroom.glb; level 2 loads the same parts from lift.glb (cut out of controlroom.glb by
// scripts/extract-lift.mjs), so both ends of the ride are the same cabin. ARIA rides along on a
// screen on its left wall (the call panel is on the right), in both levels: beside him as he
// faces the doors, rather than behind him.

export const LIFT_SCREEN_SIZE = [1.3, 0.73];
const BEZEL = 0.07;          // the frame around the screen, each side
const BEZEL_DEPTH = 0.05;
const SCREEN_HEIGHT = 1.95;  // the screen's middle, above the cabin floor (a little over eye level)
const TOWARD_DOORS = 0.25;   // how far along the wall from its middle, toward the doors (m)

// ARIA's screen on the cabin's left wall, facing across the cabin: a soft black bezel with the
// screen just in front of it. Both come back in world space and unparented; the level adds them
// where it keeps its things and gives the screen to its AriaManager (which finds monitors by name,
// so the screen is called Lift_Monitor).
export function makeLiftScreen(cabinRoot, bezelMaterial) {
  const wall = cabinRoot.getObjectByName('Cabin_Wall_Left');
  const cabin = cabinRoot.getObjectByName('ElevatorCabin');
  if (!wall || !cabin) return null;
  cabinRoot.updateMatrixWorld(true);
  const wallBox = new THREE.Box3().setFromObject(wall);
  const cabinCentre = new THREE.Box3().setFromObject(cabin).getCenter(new THREE.Vector3());
  const doors = cabinRoot.getObjectByName('Cabin_Threshold_Hazard');

  // the wall is axis aligned: its thinnest side is the way it faces, into the cabin
  const size = wallBox.getSize(new THREE.Vector3());
  const axis = size.x < size.z ? 'x' : 'z';
  const centre = wallBox.getCenter(new THREE.Vector3());
  const normal = new THREE.Vector3();
  normal[axis] = Math.sign(cabinCentre[axis] - centre[axis]);
  const face = normal[axis] > 0 ? wallBox.max[axis] : wallBox.min[axis];

  const [w, h] = LIFT_SCREEN_SIZE;
  const spot = new THREE.Vector3(centre.x, wallBox.min.y + SCREEN_HEIGHT, centre.z);
  spot[axis] = face;
  // a little toward the doors, where he looks out
  const along = axis === 'x' ? 'z' : 'x';
  if (doors) {
    const d = new THREE.Box3().setFromObject(doors).getCenter(new THREE.Vector3());
    spot[along] += Math.sign(d[along] - centre[along]) * TOWARD_DOORS;
  }
  const facing = spot.clone().add(normal);

  const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + BEZEL * 2, h + BEZEL * 2, BEZEL_DEPTH), bezelMaterial);
  bezel.name = 'Lift_ScreenBezel';
  bezel.position.copy(spot).addScaledVector(normal, BEZEL_DEPTH / 2);
  bezel.lookAt(facing.clone().addScaledVector(normal, BEZEL_DEPTH / 2));

  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));   // ARIA's shader expects glTF-style UVs
  const screen = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x05080b }));
  screen.name = 'Lift_Monitor';
  screen.position.copy(spot).addScaledVector(normal, BEZEL_DEPTH + 0.004);
  screen.lookAt(facing.clone().addScaledVector(normal, BEZEL_DEPTH + 0.004));

  bezel.updateMatrixWorld(true);
  screen.updateMatrixWorld(true);
  return { bezel, screen };
}

// The torn group photograph (Flashback 1) in a thin frame on the cabin's back wall, facing the
// doors: the first thing Voss sees as he steps in. A little above his eye line and hung a touch
// crooked. Level 1's room is drawn 1.6 times life size (Voss's eyes are 2.6 up), so the print is
// too. Comes back in world space, unparented: the frame and, inside it, the print (by itself, so
// it can be aimed at).
export const LIFT_PHOTO_SIZE = [0.66, 0.5115];  // 1200 x 930, as the print with its caption
const PHOTO_HEIGHT = 2.45;

export function makeLiftPhoto(cabinRoot, texture, frameMaterial) {
  const wall = cabinRoot.getObjectByName('Cabin_Wall_Back');
  const cabin = cabinRoot.getObjectByName('ElevatorCabin');
  if (!wall || !cabin) return null;
  cabinRoot.updateMatrixWorld(true);
  const wallBox = new THREE.Box3().setFromObject(wall);
  const cabinCentre = new THREE.Box3().setFromObject(cabin).getCenter(new THREE.Vector3());
  const size = wallBox.getSize(new THREE.Vector3());
  const axis = size.x < size.z ? 'x' : 'z';
  const centre = wallBox.getCenter(new THREE.Vector3());
  const normal = new THREE.Vector3();
  normal[axis] = Math.sign(cabinCentre[axis] - centre[axis]);
  const spot = new THREE.Vector3(centre.x, wallBox.min.y + PHOTO_HEIGHT, centre.z);
  spot[axis] = normal[axis] > 0 ? wallBox.max[axis] : wallBox.min[axis];

  const [w, h] = LIFT_PHOTO_SIZE;
  const frame = new THREE.Group();
  frame.name = 'Lift_PhotoFrame';
  frame.position.copy(spot);
  frame.lookAt(spot.clone().add(normal));
  frame.rotateZ(0.035);
  const border = 0.035, depth = 0.025;
  const bar = (bw, bh, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth), frameMaterial);
    m.position.set(x, y, depth / 2);
    frame.add(m);
  };
  bar(w + border * 2, border, 0, (h + border) / 2);
  bar(w + border * 2, border, 0, -(h + border) / 2);
  bar(border, h, (w + border) / 2, 0);
  bar(border, h, -(w + border) / 2, 0);
  // the backing board, dark, where the print is torn away
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x15120f }));
  back.position.z = 0.004;
  frame.add(back);
  // the print (its torn part is see-through); a little dimmer than white, so it does not glow
  const print = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, color: 0xc9bfae, alphaTest: 0.5 }));
  print.name = 'Lift_Photo';
  print.position.z = 0.008;
  frame.add(print);
  frame.updateMatrixWorld(true);
  return { frame, print };
}
