import * as THREE from "three";
import { gsap } from "../core/tween.js";
import { resetBlueVisibility } from "./visibility.js";

const SWEEP_SECONDS = 6;
const SWEEP_START_X = -6.2;
const SWEEP_END_X = 6.2;

export function startWarden(graph, state, scene, { onSweep } = {}) {
  const scanner = new THREE.Group();
  scanner.name = "warden-scanner";
  scanner.position.set(SWEEP_START_X, 0, 0.25);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({
      color: 0x1cddff,
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const beam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.055, 12),
    new THREE.MeshBasicMaterial({
      color: 0x9af5ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.position.z = -0.01;
  scanner.add(glow, beam);
  scene.add(scanner);

  state.wardenTimer = SWEEP_SECONDS;
  const sweep = gsap.to(scanner.position, {
    x: SWEEP_END_X,
    duration: SWEEP_SECONDS,
    ease: "none",
    repeat: -1,
    onUpdate: () => {
      state.wardenTimer = Math.max(0, SWEEP_SECONDS * (1 - sweep.progress()));
    },
    onRepeat: () => {
      scanner.position.x = SWEEP_START_X;
      resetBlueVisibility(graph);
      if (onSweep) onSweep();
      state.wardenTimer = SWEEP_SECONDS;
    },
  });

  return () => {
    sweep.kill();
    scene.remove(scanner);
    scanner.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
  };
}
