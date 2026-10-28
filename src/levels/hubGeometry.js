import * as THREE from 'three';

// The hub's plan view: radius and angle in degrees (0 = east, counter-clockwise, as in
// Blender), height up. Handy for placing things in a round room.
export const polar = (r, aDeg, y = 0) => {
  const a = (aDeg * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(a), y, -r * Math.sin(a));
};

// The reverse: the angle (degrees, 0..360) of a point as seen from the hub's centre
export const angleOf = (p) => ((Math.atan2(-p.z, p.x) * 180) / Math.PI + 360) % 360;

// Inner radius of the atrium wall, and the angular gaps in it (doors, elevator, window)
export const HUB_RADIUS = 32;
export const WALL_GAPS = [
  { name: 'window', a0: 15, a1: 75 },
  { name: 'A', a0: 86.5, a1: 93.5 },
  { name: 'B', a0: 196.5, a1: 203.5 },
  { name: 'elevator', a0: 265.5, a1: 274.5 },
  { name: 'C', a0: 316.5, a1: 323.5 }
];

// Is this wall angle clear of every opening (with some margin)?
export const wallClear = (a, margin = 3.5) =>
  WALL_GAPS.every((g) => {
    const c = (g.a0 + g.a1) / 2;
    const half = (g.a1 - g.a0) / 2 + margin;
    return Math.abs(((a - c + 180) % 360 + 360) % 360 - 180) >= half;
  });
