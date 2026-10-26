import * as THREE from "three";
import { gsap } from "../core/tween.js";
import { Owner, Visibility } from "../core/Graph.js";

export const PING_RADIUS = 4.1;
const PING_ANIMATION_SECONDS = 0.8;

export function firePing(originId, graph, state, scene, radius = PING_RADIUS) {
  if (state.status !== "playing" || state.pingCooldown > 0) return false;
  const origin = graph.nodes.get(originId);
  if (!origin || origin.owner !== Owner.BLUE || !origin.active) return false;

  state.pingCooldown = state.pingCooldownMax;
  const radiusSquared = radius * radius;
  for (const node of graph.nodes.values()) {
    const dx = node.x - origin.x;
    const dy = node.y - origin.y;
    const dz = node.z - origin.z;
    if (dx * dx + dy * dy + dz * dz <= radiusSquared) {
      graph.setVisibility(node.id, Owner.BLUE, Visibility.VISIBLE);
    }
  }

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1, 64),
    new THREE.MeshBasicMaterial({
      color: 0x55eaff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ring.position.set(origin.x, origin.y, origin.z + 0.22);
  ring.scale.setScalar(0.05);
  scene.add(ring);

  const cleanup = () => {
    scene.remove(ring);
    ring.geometry.dispose();
    ring.material.dispose();
  };
  gsap.to(ring.scale, {
    x: radius,
    y: radius,
    z: 1,
    duration: PING_ANIMATION_SECONDS,
    ease: "power2.out",
  });
  gsap.to(ring.material, {
    opacity: 0,
    duration: PING_ANIMATION_SECONDS,
    ease: "power1.out",
    onComplete: cleanup,
  });
  return true;
}
