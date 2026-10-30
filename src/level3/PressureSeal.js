import * as THREE from 'three';
import { deckMaterial } from './DeckMaterials.js';

// The containment room's first puzzle. Each valve advances its own loop and the next one clockwise
// (A -> B -> C -> A), through four quarter-turn settings. The gauge shows both the live pressure and
// the target; the hatch latch releases only while all three loops match.
export const PRESSURE_STEP = 20;
export const PRESSURE_TARGETS = Object.freeze([2, 1, 3]);

export class PressureSealState {
  constructor() {
    this.values = [0, 0, 0];
    this.solved = false;
    this.turns = 0;
  }

  turn(index) {
    if (this.solved || !Number.isInteger(index) || index < 0 || index >= this.values.length) return false;
    this.values[index] = (this.values[index] + 1) % 4;
    const next = (index + 1) % this.values.length;
    this.values[next] = (this.values[next] + 1) % 4;
    this.turns++;
    this.solved = this.values.every((value, i) => value === PRESSURE_TARGETS[i]);
    return true;
  }
}

export class PressureSeal {
  constructor(trench) {
    this.trench = trench;
    this.state = new PressureSealState();
    this.group = new THREE.Group();
    this.group.name = 'PRESSURE_Seal';
    this.wheels = [];
    this.spots = [];
    this._turns = [0, 0, 0];
    this._build();
    this._draw();
  }

  _build() {
    const bay = this.trench.pts.bay;
    if (!bay) return;
    // The striped bay is against the west wall. Its local screen faces east, into the room.
    this.group.position.set(bay.x - 2.18, bay.y, bay.z);
    this.group.rotation.y = Math.PI / 2;
    this.trench.works.inner.add(this.group);

    const dark = deckMaterial('l3_dark', { sea: true });
    const rust = deckMaterial('l3_rust', { sea: true });
    const hazard = deckMaterial('l3_hazard', { sea: true });
    const add = (geometry, material, parent = this.group) => {
      const mesh = new THREE.Mesh(geometry, material);
      parent.add(mesh);
      return mesh;
    };

    add(new THREE.BoxGeometry(3.55, 2.2, 0.16), dark);
    for (const y of [-1.01, 1.01]) {
      const rail = add(new THREE.CylinderGeometry(0.055, 0.055, 3.35, 10), rust);
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, y, 0.02);
    }
    for (const x of [-1.68, 1.68]) add(new THREE.BoxGeometry(0.09, 2.12, 0.2), hazard).position.x = x;

    this._canvas = document.createElement('canvas');
    this._canvas.width = 960;
    this._canvas.height = 300;
    this._ctx = this._canvas.getContext('2d');
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.colorSpace = THREE.SRGBColorSpace;
    this._texture.anisotropy = 4;
    const screen = add(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: this._texture, toneMapped: false }));
    screen.position.set(0, 0.47, 0.091);

    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 1.1;
      const mount = add(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 14), rust);
      mount.rotation.x = Math.PI / 2;
      mount.position.set(x, -0.58, 0.14);
      const wheel = new THREE.Group();
      wheel.position.set(x, -0.58, 0.28);
      this.group.add(wheel);
      add(new THREE.TorusGeometry(0.28, 0.045, 8, 28), hazard, wheel);
      for (const angle of [0, Math.PI / 2]) {
        const spoke = add(new THREE.BoxGeometry(0.52, 0.045, 0.045), rust, wheel);
        spoke.rotation.z = angle;
      }
      const hub = add(new THREE.CylinderGeometry(0.075, 0.075, 0.1, 12), dark, wheel);
      hub.rotation.x = Math.PI / 2;
      this.wheels.push(wheel);
    }

    this.group.updateMatrixWorld(true);
    for (let i = 0; i < this.wheels.length; i++) {
      const id = 'pressureValve' + i;
      const spot = this.trench.s.interact.add({
        id,
        position: this.wheels[i].getWorldPosition(new THREE.Vector3()),
        radius: 0.38,
        reach: 2.8,
        label: () => `Turn valve ${'ABC'[i]} (${this.state.values[i] * PRESSURE_STEP} / ${PRESSURE_TARGETS[i] * PRESSURE_STEP} bar)`,
        when: () => this.trench.stage === 'inside' && this.trench.fight?.free && this.trench._relayBriefingDone && !this.state.solved,
        use: () => this.turn(i)
      });
      this.spots.push(spot);
    }
  }

  turn(index) {
    if (!this.state.turn(index)) return;
    this._turns[index]++;
    this._turns[(index + 1) % this._turns.length]++;
    this.trench.sfx?.cue('valveTurn', this.spots[index]?.position);
    this._draw();
    if (!this.state.solved) return;
    this.trench.works.openRelayHatch();
    this.trench.game.ui.showToast('Pressure balanced. Containment hatch released.', 4500);
  }

  guide() {
    if (this.state.solved) return null;
    return {
      text: 'Balance the containment valves: match each pressure to its target',
      target: this.spots[1]?.position || this.trench.pts.bay,   // (the middle wheel)
      label: 'VALVES'
    };
  }

  update(dt) {
    for (let i = 0; i < this.wheels.length; i++) {
      const target = -this._turns[i] * Math.PI / 2;
      this.wheels[i].rotation.z += (target - this.wheels[i].rotation.z) * (1 - Math.exp(-12 * dt));
    }
  }

  _draw() {
    if (!this._ctx) return;
    const g = this._ctx;
    g.fillStyle = '#031216';
    g.fillRect(0, 0, 960, 300);
    g.strokeStyle = this.state.solved ? '#61ffc0' : '#2fc6d9';
    g.lineWidth = 5;
    g.strokeRect(7, 7, 946, 286);
    g.fillStyle = '#8de8ed';
    g.font = 'bold 27px Courier New, monospace';
    g.fillText('CONTAINMENT // PRESSURE ROUTING', 28, 43);
    g.fillStyle = '#79a9ad';
    g.font = '20px Courier New, monospace';
    g.fillText('A > B > C > A   EACH TURN ADVANCES TWO LOOPS', 28, 74);

    for (let i = 0; i < 3; i++) {
      const x = 32 + i * 310;
      const match = this.state.values[i] === PRESSURE_TARGETS[i];
      g.fillStyle = match ? '#70ffc0' : '#f3c86a';
      g.font = 'bold 25px Courier New, monospace';
      g.fillText('LOOP ' + 'ABC'[i], x, 119);
      g.font = 'bold 34px Courier New, monospace';
      g.fillText(`${this.state.values[i] * PRESSURE_STEP} / ${PRESSURE_TARGETS[i] * PRESSURE_STEP} BAR`, x, 163);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k < this.state.values[i] ? (match ? '#49d99b' : '#d9a843') : '#17383d';
        g.fillRect(x + k * 60, 184, 48, 24);
      }
    }
    g.fillStyle = this.state.solved ? '#70ffc0' : '#8de8ed';
    g.font = 'bold 23px Courier New, monospace';
    g.fillText(this.state.solved ? 'PRESSURE BALANCED // HATCH RELEASED' : 'MATCH LIVE PRESSURE TO EACH TARGET', 28, 260);
    this._texture.needsUpdate = true;
  }

  dispose() {
    for (const spot of this.spots) this.trench.s.interact.remove(spot.id);
    this.spots.length = 0;
    this.group.removeFromParent();
    const geometries = new Set(), materials = new Set();
    this.group.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    this._texture?.dispose();
  }
}
