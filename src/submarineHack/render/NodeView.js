import * as THREE from "three";
import { Owner, Visibility } from "../core/Graph.js";

const palette = {
  neutral: { color: 0x18374a, emissive: 0x062336, intensity: 0.8 },
  blue: { color: 0x31dcff, emissive: 0x087ba8, intensity: 1.8 },
  red: { color: 0xff456e, emissive: 0x9e0b37, intensity: 1.8 },
  dead: { color: 0x18212b, emissive: 0x070c12, intensity: 0.3 },
  target: { color: 0xffcf62, emissive: 0xa8680d, intensity: 1.8 },
};

function nodeStyle(node) {
  if (node.owner === Owner.BLUE) return palette.blue;
  if (node.owner === Owner.RED) return palette.red;
  if (node.owner === Owner.DEAD) return palette.dead;
  if (node.kind === "target") return palette.target;
  if (node.kind === "core") return palette.blue;
  if (node.kind === "spawner") return palette.red;
  return palette.neutral;
}

export function updateNodeMesh(mesh, viewer = Owner.BLUE, selectedNodeId = null) {
  const node = mesh.userData.node;
  const style = nodeStyle(node);
  const isAlwaysVisibleMarker = node.kind === "core" || node.kind === "target" || node.kind === "spawner";
  const isHidden = node.visibility[viewer] === Visibility.HIDDEN
    && node.owner !== viewer
    && !isAlwaysVisibleMarker;
  const isInactive = (node.owner === Owner.BLUE || node.owner === Owner.RED) && !node.active;
  const opacity = isHidden ? 0.11 : isInactive ? 0.34 : 1;

  mesh.material.color.setHex(isHidden ? 0x151c22 : style.color);
  mesh.material.emissive.setHex(isHidden ? 0x03070a : style.emissive);
  mesh.material.emissiveIntensity = isHidden ? 0.15 : style.intensity * (isInactive ? 0.35 : 1);
  mesh.material.opacity = opacity;
  mesh.material.transparent = opacity < 1;
  mesh.material.depthWrite = opacity === 1;
  const isSelected = node.id === selectedNodeId;
  const breachPulse = node.owner === Owner.RED ? node.breachProgress * 0.08 : 0;
  mesh.scale.setScalar(isSelected ? 1.16 : 1 + breachPulse);

  if (mesh.userData.accentRing) {
    const ringColor = node.kind === "target" ? 0xffcf62 : style.color;
    mesh.userData.accentRing.material.color.setHex(isHidden ? 0x151c22 : ringColor);
    mesh.userData.accentRing.material.opacity = isHidden ? 0.12 : opacity * 0.8;
  }
}

export function createNodeMesh(node) {
  const isSpecial = node.kind === "core" || node.kind === "target" || node.kind === "spawner";
  const material = new THREE.MeshStandardMaterial({
    metalness: 0.22,
    roughness: 0.3,
  });
  const geometry = new THREE.SphereGeometry(isSpecial ? 0.29 : 0.21, 24, 18);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(node.x, node.y, node.z);
  mesh.userData.node = node;

  if (isSpecial) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 8, 40), ringMaterial);
    ring.position.z = 0.015;
    mesh.add(ring);
    mesh.userData.accentRing = ring;
  }

  updateNodeMesh(mesh);
  return mesh;
}
