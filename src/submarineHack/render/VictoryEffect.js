import * as THREE from "three";
import { gsap } from "../core/tween.js";

export function playVictoryEffect(scene, node) {
  for (let index = 0; index < 3; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd66f,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 64), material);
    ring.position.set(node.x, node.y, node.z + 0.18 + index * 0.015);
    ring.scale.setScalar(0.45);
    scene.add(ring);

    gsap.to(ring.scale, {
      x: 3.5 + index * 0.45,
      y: 3.5 + index * 0.45,
      z: 1,
      duration: 1.1,
      delay: index * 0.16,
      ease: "power2.out",
    });
    gsap.to(material, {
      opacity: 0,
      duration: 1.1,
      delay: index * 0.16,
      ease: "power1.out",
      onComplete: () => {
        scene.remove(ring);
        ring.geometry.dispose();
        material.dispose();
      },
    });
  }
}
