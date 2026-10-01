import * as THREE from "three";

export class RingPuzzle {
  constructor(scene, options = {}) {
    this.scene = scene;

    this.numPositions = options.numPositions ?? 8;
    this.targets = options.targets ?? [2, 5, 1]; // one target per ring
    this.rotateSpeed = options.rotateSpeed ?? 6; // radians/sec, for the tween
    this.coupling = options.coupling ?? 'none';
    this.onSolved = options.onSolved ?? null;
    this.makeMaterial = options.makeMaterial ?? null; // must be set before any _mat() call

    this.solved = false;
    this.rings = [];      // [{ mesh, currentPosition, targetRotation, isCorrect, targetTick }]
    this.ringMeshes = []; // flat list, for raycasting

    this._sharedNeutralTickMaterial = this._mat(0x303840, { metalness: 0.4, roughness: 0.7 });
    this._sharedRivetGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8);
    this._sharedRivetMaterial = this._mat(0x1a1e24, { metalness: 0.6, roughness: 0.6 });
    this._sharedTickGeometry = new THREE.BoxGeometry(0.03, 0.1, 0.02);
    this._sharedPointerGeometry = new THREE.BoxGeometry(0.26, 0.05, 0.05);
    this._sharedPointerMaterial = this._mat(
      0xcfefff,
      { emissive: 0x5a8fb0, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.3 },
      { glow: 0.7, glowHex: 0x9fdcff }
    );
    this.hub = new THREE.Group();
    this.hub.name = 'LightsPuzzleRoot';
    this.scene.add(this.hub);

    this._buildPanel();
    this._buildRings();
  }

  // Shader material from the game's factory if given, else a plain standard material
  _mat(hex, std = {}, glow = null) {
    if (this.makeMaterial) return this.makeMaterial(hex, glow ?? {});
    return new THREE.MeshStandardMaterial({ color: hex, metalness: 0.5, roughness: 0.6, ...std });
  }

  _buildPanel() {
    const outerRadius = 0.9 + (this.targets.length - 1) * 0.5 + 0.35;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(outerRadius * 2.2, outerRadius * 2.2, 0.15),
      this._mat(0x2a3037, { metalness: 0.5, roughness: 0.75 })   // panel, was 0x181c22
    );
    panel.position.z = -0.2; // sits behind the dials
    this.hub.add(panel);
    this.panel = panel;

    // Corner mounting bolts: static, decorative
    const inset = outerRadius * 1.05;
    const corners = [[-inset, -inset], [-inset, inset], [inset, -inset], [inset, inset]];
    for (const [x, y] of corners) {
      const rivet = new THREE.Mesh(this._sharedRivetGeometry, this._sharedRivetMaterial);
      rivet.position.set(x, y, -0.1);
      rivet.rotation.x = Math.PI / 2;
      panel.add(rivet);
    }
  }

  _buildRings() {
    const hub = this.hub;

    this.targets.forEach((target, index) => {
      const radius = 0.9 + index * 0.5;

      // Static bezel/housing -- does NOT rotate. Sits slightly behind the
      // dial so the dial reads as recessed into it, like a real instrument
      // fitting rather than a ring hovering in space.
      const bezel = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.14, 12, 32),
        this._mat(0x3a434d, { metalness: 0.55, roughness: 0.6 })
      );
      bezel.position.z = -0.05;
      hub.add(bezel);

      let targetTick = null;
      const tickRadius = radius + 0.22;
      for (let t = 0; t < this.numPositions; t++) {
        const isTarget = t === target;
        const tickAngle = (t / this.numPositions) * Math.PI * 2;
        const tick = new THREE.Mesh(
          this._sharedTickGeometry,
          isTarget
            ? this._mat(0x33e6ff, { emissive: 0x2299bb, emissiveIntensity: 0.9 }, { glow: 0.9, glowHex: 0x33e6ff })
            : this._sharedNeutralTickMaterial
        );
        tick.position.set(tickRadius * Math.cos(tickAngle), tickRadius * Math.sin(tickAngle), 0.05);
        tick.rotation.z = tickAngle;
        hub.add(tick);
        if (isTarget) targetTick = tick;
      }

      const ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.09, 16, 32),
        this._mat(0xaebac9, { metalness: 0.8, roughness: 0.4 }) 
      );
      ringMesh.userData.ringIndex = index; // tag for raycast -> puzzle data lookup
      hub.add(ringMesh);

      // Invisible, fatter collider so the thin ring is easy to click
      const hitArea = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.2, 8, 32),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      ringMesh.add(hitArea);

      const pointer = new THREE.Mesh(this._sharedPointerGeometry, this._sharedPointerMaterial);
      pointer.position.set(radius, 0, 0.08);
      ringMesh.add(pointer);

      // Small rivets on the dial's face; they turn with it
      const rivetCount = 5;
      for (let r = 0; r < rivetCount; r++) {
        const angle = ((r + 0.5) / rivetCount) * Math.PI * 2;
        const rivet = new THREE.Mesh(this._sharedRivetGeometry, this._sharedRivetMaterial);
        rivet.position.set(radius * Math.cos(angle), radius * Math.sin(angle), 0.06);
        rivet.rotation.x = Math.PI / 2;
        ringMesh.add(rivet);
      }

      this.rings.push({
        mesh: ringMesh,
        targetTick,
        currentPosition: 0,
        currentRotation: 0,
        targetRotation: 0,
        isCorrect: false,
      });
      this.ringMeshes.push(ringMesh);
    });
  }

  handleClick(hitObject) {
    let obj = hitObject;
    while (obj && obj.userData.ringIndex === undefined) {
      obj = obj.parent;
    }
    if (!obj) return false; // clicked something unrelated to the puzzle
    this._advanceRing(obj.userData.ringIndex);
    return true;
  }

  _advanceRing(index) {
    if (this.solved) return;

    const ring = this.rings[index];
    ring.currentPosition = (ring.currentPosition + 1) % this.numPositions;
    ring.targetRotation += (Math.PI * 2) / this.numPositions;
    this._updateRingCorrectness(ring, index);

    if (this.coupling === 'oneWay' || this.coupling === 'twoWay') {
      this._nudgeNeighbour(index + 1);
    }
    if (this.coupling === 'twoWay') {
      this._nudgeNeighbour(index - 1);
    }

    this._checkSolved();
  }

  _nudgeNeighbour(index) {
    const ring = this.rings[index];
    if (!ring) return; // no ring at this index (edge of the row)
    ring.currentPosition = (ring.currentPosition + 1) % this.numPositions;
    ring.targetRotation += (Math.PI * 2) / this.numPositions;
    this._updateRingCorrectness(ring, index);
  }

  _updateRingCorrectness(ring, index) {
    ring.isCorrect = ring.currentPosition === this.targets[index];
    const mat = ring.targetTick.material;
    const hex = ring.isCorrect ? 0x7dff8a : 0x33e6ff;   

    if (mat.isShaderMaterial) {
      const hex = ring.isCorrect ? 0x33ff66 : 0x66ddff;
      mat.uniforms.baseColor.value.set(hex);
      mat.uniforms.glowColor.value.set(hex);
      mat.uniforms.glowAmount.value = ring.isCorrect ? 1.2 : 0.9;
      return;
    }

    // standard-material fallback
    mat.color.set(ring.isCorrect ? 0x33ff66 : 0x66ddff);
    mat.emissive.set(ring.isCorrect ? 0x115522 : 0x2299bb);
    mat.emissiveIntensity = ring.isCorrect ? 1.4 : 0.9;
  }

  _checkSolved() {
    if (this.solved) return;
    if (this.rings.every((r) => r.isCorrect)) {
      this.solved = true;
      document.dispatchEvent(new CustomEvent('puzzle:lights-fixed'));
      this.onSolved?.();
    }
  }

  /** Call every frame with delta seconds. Eases each ring toward its target rotation. */
  update(delta) {
    for (const ring of this.rings) {
      if (ring.currentRotation === ring.targetRotation) continue;
      const diff = ring.targetRotation - ring.currentRotation;
      const step = this.rotateSpeed * delta;
      if (Math.abs(diff) <= step) {
        ring.currentRotation = ring.targetRotation;
      } else {
        ring.currentRotation += Math.sign(diff) * step;
      }
      ring.mesh.rotation.z = ring.currentRotation;
    }
  }
}