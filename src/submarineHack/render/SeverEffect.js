import * as THREE from "three";
import { gsap } from "../core/tween.js";

export function playSeverEffect(scene, node) {
  const particleCount = 18;
  const origin = new THREE.Vector3(node.x, node.y, node.z + 0.15);
  const velocities = [];
  const positions = new Float32Array(particleCount * 3);

  for (let index = 0; index < particleCount; index += 1) {
    const direction = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1,
      Math.random() * 1.4 + 0.25,
    ).normalize();
    direction.multiplyScalar(0.8 + Math.random() * 2.1);
    velocities.push(direction);
    positions[index * 3] = origin.x;
    positions[index * 3 + 1] = origin.y;
    positions[index * 3 + 2] = origin.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xff3d69,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const particles = new THREE.Points(geometry, material);
  particles.frustumCulled = false;
  scene.add(particles);

  const motion = { progress: 0 };
  gsap.to(motion, {
    progress: 1,
    duration: 0.7,
    ease: "power2.out",
    onUpdate: () => {
      const progress = motion.progress;
      const positionAttribute = geometry.getAttribute("position");
      for (let index = 0; index < particleCount; index += 1) {
        const velocity = velocities[index];
        positionAttribute.setXYZ(
          index,
          origin.x + velocity.x * progress,
          origin.y + velocity.y * progress,
          origin.z + velocity.z * progress - 1.2 * progress * progress,
        );
      }
      positionAttribute.needsUpdate = true;
      material.opacity = 1 - progress;
    },
    onComplete: () => {
      scene.remove(particles);
      geometry.dispose();
      material.dispose();
    },
  });
}
