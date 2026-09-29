import * as THREE from "three";

export class RingPuzzle{
    constructor(scene, options = {}) {
        this.scene = scene;

        this.numPositions = options.numPositions ?? 8;
        this.targets = options.targets ?? [2, 5, 1]; // one target per ring
        this.rotateSpeed = options.rotateSpeed ?? 6; // radians/sec, for the tween

        this.coupling = options.coupling ?? 'none';

        this.solved = false;
        this.rings = [];      // [{ mesh, currentPosition, targetRotation, isCorrect, targetTick }]
        this.ringMeshes = []; // flat list, for raycasting

        this._sharedNeutralTickMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a4250,
        metalness: 0.4,
        roughness: 0.7,
        });
        this._sharedRivetGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8);
        this._sharedRivetMaterial = new THREE.MeshStandardMaterial({
        color: 0x14171d,
        metalness: 0.6,
        roughness: 0.6,
        });
        this._sharedTickGeometry = new THREE.BoxGeometry(0.03, 0.1, 0.02);
        this._sharedPointerGeometry = new THREE.BoxGeometry(0.26, 0.05, 0.05);
        this._sharedPointerMaterial = new THREE.MeshStandardMaterial({
        color: 0xffcc33,
        emissive: 0x664400,
        emissiveIntensity: 0.6,
        metalness: 0.5,
        roughness: 0.3,
        });

            this.hub = new THREE.Group();
        this.hub.name = 'LightsPuzzleRoot';
        this.scene.add(this.hub);

        this._buildPanel();
        this._buildRings();
    }
       _buildPanel() {
    const outerRadius = 0.9 + (this.targets.length - 1) * 0.5 + 0.35;
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(outerRadius * 2.2, outerRadius * 2.2, 0.15),
      new THREE.MeshStandardMaterial({
        color: 0x181c22,
        metalness: 0.5,
        roughness: 0.75,
      })
    );
    panel.position.z = -0.2; // sits behind the dials
    this.hub.add(panel);
    this.panel = panel;

    // Corner mounting bolts on the panel itself -- static, purely decorative,
    // reinforcing that this is bolted to something rather than freestanding.
    const inset = outerRadius * 1.05;
    const corners = [
      [-inset, -inset],
      [-inset, inset],
      [inset, -inset],
      [inset, inset],
    ];
    for (const [x, y] of corners) {
      const rivet = new THREE.Mesh(this._sharedRivetGeometry, this._sharedRivetMaterial);
      rivet.position.set(x, y, -0.1);
      rivet.rotation.x = Math.PI / 2;
      panel.add(rivet);
    }
  }


  _buildRings() {
    const hub = this.hub; // build directly into the shared root, not a separate group
    this.hub = hub;

    this.targets.forEach((target, index) => {
      const radius = 0.9 + index * 0.5;

      // Static bezel/housing -- does NOT rotate. Sits slightly behind the
      // dial so the dial reads as recessed into it, like a real instrument
      // fitting rather than a ring hovering in space.
      const bezel = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.14, 12, 32),
        new THREE.MeshStandardMaterial({
          color: 0x20242c,
          metalness: 0.55,
          roughness: 0.6,
        })
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
            ? new THREE.MeshStandardMaterial({
                color: 0x66ddff,
                emissive: 0x2299bb,
                emissiveIntensity: 0.9,
              })
            : this._sharedNeutralTickMaterial
        );
        tick.position.set(
          tickRadius * Math.cos(tickAngle),
          tickRadius * Math.sin(tickAngle),
          0.05
        );
        tick.rotation.z = tickAngle;
        hub.add(tick);
        if (isTarget) targetTick = tick;
      }
      const ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.09, 16, 32),
        new THREE.MeshStandardMaterial({
          color: 0xaebac9,   // brushed-aluminium grey
          metalness: 0.8,
          roughness: 0.4,
        })
      );
      ringMesh.userData.ringIndex = index; // tag for raycast -> puzzle data lookup
      hub.add(ringMesh);

      const pointer = new THREE.Mesh(this._sharedPointerGeometry, this._sharedPointerMaterial);
      pointer.position.set(radius, 0, 0.08);
      ringMesh.add(pointer);

      // A few small rivets around the dial's face -- decorative texture,
      // also children of the dial, so they turn with it.
      const rivetCount = 5;
      for (let r = 0; r < rivetCount; r++) {
        const angle = ((r + 0.5) / rivetCount) * Math.PI * 2; // offset so none sit under the pointer
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
    // Confirm on the tick mark itself: green + brighter when aligned,
    // back to its default cyan "aim here" look otherwise.
    const color = ring.isCorrect ? 0x33ff66 : 0x66ddff;
    const emissive = ring.isCorrect ? 0x115522 : 0x2299bb;
    ring.targetTick.material.color.set(color);
    ring.targetTick.material.emissive.set(emissive);
    ring.targetTick.material.emissiveIntensity = ring.isCorrect ? 1.4 : 0.9;
  }

  _checkSolved() {
    if (this.solved) return;
    if (this.rings.every((r) => r.isCorrect)) {
      this.solved = true;
      document.dispatchEvent(new CustomEvent('puzzle:lights-fixed'));
    }
  }

  /**
   * Call every frame with delta seconds. Eases each ring's visual rotation
   * toward its target instead of snapping instantly.
   */
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