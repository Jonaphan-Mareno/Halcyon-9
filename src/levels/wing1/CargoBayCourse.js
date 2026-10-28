import * as THREE from 'three';
import { Machine, MACHINE_TYPES } from '../../entities/Machine.js';
import { applyHubMaterials } from '../../graphics/HubMaterials.js';

// Wing 1, the Cargo Bay: a course built on ONE idea, the overhead crane.
//
//   Teach  - at the first console, lay a container across the electrified channel: a bridge.
//   Twist  - at the far console, stack containers into steps up to the catwalk. There are
//            exactly four containers: one bridge and three steps.
//   Test   - crawlers are stomped (jump on them) or crushed under a dropped container. The
//            welding drone guarding the gate only goes down to the coolant from the catwalk.
//   Reward - Quarters A and its videotape. Then a maintenance bridge extends for the way back.
//
// The crane works on a grid of slots that matches the room (Blender/scripts/build_wing1_cargo.py):
// four columns across the bay and five rows along it, the second row being the channel.
// Containers are real physics objects (fixed boxes the crane relocates), so you can stand on and climb them.

const COLS = [-6.6, -2.2, 2.2, 6.6];        // x of each slot column
const ROWS = [-46, -53, -60, -68, -76];     // z of each slot row (row 1 is the channel)
const CHANNEL_ROW = 1;
const CRATE_W = 2.4, CRATE_H = 1.2, CRATE_L = 6.6;
const MAX_STACK = 3;
const RAIL_Y = 13.8;
const HOOK_TRAVEL = 6.6;                   // hook height when moving: clears a full stack carrying one
const START_CELLS = [[0, 0], [0, 0], [1, 0], [2, 0]];
const CRATE_LOOKS = [
  ['cont_blue', [0.10, 0.19, 0.21]], ['cont_red', [0.27, 0.15, 0.12]],
  ['cont_grey', [0.24, 0.25, 0.27]], ['cont_mustard', [0.22, 0.21, 0.16]]
];

export const CARGO_BAY = {
  checkpoint: new THREE.Vector3(0, 0.1, -37),
  consoles: [new THREE.Vector3(-11, 0, -44.5), new THREE.Vector3(-11, 0, -58.5)],
  coolant: new THREE.Vector3(11, 3.6, -78.4),
  catwalkStep: new THREE.Vector3(7.2, 4.6, -68),
  // the player is in the wing when past the hub wall, inside the wing's width
  contains: (p) => p.z < -34.2 && Math.abs(p.x) < 15.5
};

const named = (name, rgb, rough = 0.6, metal = 0.5) => {
  const m = new THREE.MeshStandardMaterial({ name, roughness: rough, metalness: metal });
  m.color.setRGB(rgb[0], rgb[1], rgb[2]);
  return m;
};

export class CargoBayCourse {
  constructor({ scene, physics, level, inventory, toast }) {
    this.scene = scene;
    this.physics = physics;
    this.level = level;
    this.inventory = inventory;
    this.toast = toast;
    this.group = new THREE.Group();
    this.group.name = 'CargoBayCourse';
    scene.add(this.group);

    this.complete = false;
    this.inCrane = false;
    this._camPos = new THREE.Vector3();
    this._camRot = new THREE.Euler();
    this._v = new THREE.Vector3();

    this._buildConsoles();
    this._buildCrane();
    this._buildCrates();
    this._buildCoolant();
    this._buildMachines();
    applyHubMaterials(this.group, level.textures);
    this.reset();
  }

  // ---------------------------------------------------------------- building
  _buildConsoles() {
    const metal = named('hull_mid', [0.23, 0.24, 0.26]);
    this.consoleMeshes = CARGO_BAY.consoles.map((p) => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.05, 0.7), metal);
      body.position.y = 0.52;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.05), new THREE.MeshBasicMaterial({ color: 0x33c8ff }));
      screen.position.set(0, 1.15, 0.12);
      screen.rotation.x = -0.45;
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
      lever.position.set(0.45, 1.25, -0.1);
      g.add(body, screen, lever);
      g.position.copy(p);
      g.lookAt(0, 0, p.z);   // faces into the bay
      this.group.add(g);
      return g;
    });
  }

  _buildCrane() {
    const g = new THREE.Group();
    const dark = named('hull_dark', [0.08, 0.085, 0.095]);
    const trimM = named('trim', [0.30, 0.32, 0.35]);
    this.bridge = new THREE.Mesh(new THREE.BoxGeometry(27.0, 0.8, 1.0), dark);
    this.bridge.position.y = RAIL_Y;
    this.trolley = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.8), trimM);
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), dark);
    this.magnet = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.35, 20), dark);
    this.magnetGlow = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 6, 24), new THREE.MeshBasicMaterial({ color: 0x33c8ff }));
    this.magnetGlow.rotation.x = Math.PI / 2;
    this.magnetGlow.position.y = -0.18;
    this.magnet.add(disc, this.magnetGlow);
    g.add(this.bridge, this.trolley, this.cable, this.magnet);
    this.group.add(g);

    // where the crane will act, shown only while driving it
    this.marker = new THREE.Group();
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(CRATE_W + 0.3, 0.06, CRATE_L + 0.3)),
      new THREE.LineBasicMaterial({ color: 0x40e8ff }));
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(CRATE_W + 0.3, CRATE_L + 0.3),
      new THREE.MeshBasicMaterial({ color: 0x40e8ff, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    fill.rotation.x = -Math.PI / 2;
    this.marker.add(edge, fill);
    this.markerEdge = edge;
    this.markerFill = fill;
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  _buildCrates() {
    const R = this.physics.RAPIER;
    const dark = named('hull_dark', [0.08, 0.085, 0.095]);
    this.crates = START_CELLS.map((_, i) => {
      const [name, rgb] = CRATE_LOOKS[i % CRATE_LOOKS.length];
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(CRATE_W, CRATE_H, CRATE_L), named(name, rgb, 0.7, 0.35)));
      for (const z of [-CRATE_L / 2 + 0.08, CRATE_L / 2 - 0.08]) {            // end frames
        const f = new THREE.Mesh(new THREE.BoxGeometry(CRATE_W + 0.06, CRATE_H + 0.06, 0.16), dark);
        f.position.z = z;
        mesh.add(f);
      }
      for (let k = 1; k < 6; k++) {                                            // side ribs
        const rib = new THREE.Mesh(new THREE.BoxGeometry(CRATE_W + 0.05, CRATE_H * 0.8, 0.08), dark);
        rib.position.z = -CRATE_L / 2 + (k * CRATE_L) / 6;
        mesh.add(rib);
      }
      this.group.add(mesh);
      // A FIXED body the crane relocates, not a kinematic one: the character controller treats
      // fixed bodies like floor (you can walk along a container), but sticks on kinematic ones.
      const body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed());
      this.physics.world.createCollider(R.ColliderDesc.cuboid(CRATE_W / 2, CRATE_H / 2, CRATE_L / 2), body);
      return { mesh, body };
    });
  }

  _buildCoolant() {
    const g = new THREE.Group();
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), named('hull_mid', [0.23, 0.24, 0.26]));
    pedestal.position.y = 0.25;
    this.coolantItem = new THREE.Group();
    this.coolantItem.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.55, 12),
      new THREE.MeshStandardMaterial({ color: 0x55697a, roughness: 0.4, metalness: 0.7 })));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.09, 12), new THREE.MeshBasicMaterial({ color: 0x4ff0ff }));
    band.position.y = 0.1;
    this.coolantItem.add(band);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.4, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x4fb8ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 1.7;
    this.coolantItem.add(beam);
    this.coolantItem.position.y = 0.9;
    g.add(pedestal, this.coolantItem);
    g.position.copy(CARGO_BAY.coolant);
    this.group.add(g);
  }

  _buildMachines() {
    this.crawlers = [
      new Machine('crawler', [new THREE.Vector3(9, 0, -44), new THREE.Vector3(9, 0, -48.5)]),          // teaches the stomp
      new Machine('crawler', [new THREE.Vector3(-8, 0, -62), new THREE.Vector3(-1, 0, -62),
        new THREE.Vector3(-1, 0, -72), new THREE.Vector3(-8, 0, -72)]),                                   // roams the crane's grid
      new Machine('crawler', [new THREE.Vector3(11, 3.6, -69.5), new THREE.Vector3(11, 3.6, -77.5)])   // on the catwalk
    ];
    this.welder = new Machine('welder', [new THREE.Vector3(-8, 0, -86.5), new THREE.Vector3(8, 0, -86.5)]);
    for (const m of [...this.crawlers, this.welder]) this.group.add(m.group);
  }

  // ---------------------------------------------------------------- state
  // Back to the start of the course (after a death). full: also undo finishing it (a level restart).
  reset({ full = false } = {}) {
    if (full && this.complete) {
      this.complete = false;
      this.group.remove(this.walk);
      this.physics.world.removeRigidBody(this.walkBody);
      this.walk = null;
      this.walkBody = null;
    }
    this.stacks = new Map();
    this.crates.forEach((c, i) => {
      const [col, row] = START_CELLS[i];
      this._push(col, row, c);
    });
    this.crane = { col: 1, row: 0, x: COLS[1], z: ROWS[0], hook: HOOK_TRAVEL, phase: 'idle', pending: null, target: 0, carrying: null };
    for (const m of [...this.crawlers, this.welder]) m.reset();
    this.coolantTaken = false;
    this.coolantItem.parent.visible = true;
    this.inventory.owned = this.inventory.owned.filter((id) => id !== 'coolant');
    this.crossed = false;
    this.reachedCatwalk = false;
    this.level.closeGate('GATE_W1');
    this.tapeSeen = false;
    this._syncCrane();
  }

  _key(col, row) { return col + ',' + row; }
  _stack(col, row) {
    const k = this._key(col, row);
    if (!this.stacks.has(k)) this.stacks.set(k, []);
    return this.stacks.get(k);
  }

  _push(col, row, crate) {
    const s = this._stack(col, row);
    const bottom = s.length * CRATE_H;
    s.push(crate);
    crate.col = col;
    crate.row = row;
    this._placeCrate(crate, COLS[col], bottom + CRATE_H / 2, ROWS[row]);
  }

  _placeCrate(crate, x, y, z) {
    crate.mesh.position.set(x, y, z);
    crate.body.setTranslation({ x, y, z }, true);
  }

  get bridgeBuilt() {
    for (let c = 0; c < COLS.length; c++) if (this._stack(c, CHANNEL_ROW).length) return true;
    return this.complete;
  }

  get stepsBuilt() {
    return this._stack(3, 3).length >= 2 && this._stack(2, 3).length >= 1;
  }

  // ---------------------------------------------------------------- driving the crane
  enterCrane(camera) {
    this.inCrane = true;
    this._camPos.copy(camera.position);
    this._camRot.copy(camera.rotation);
    // inside the bay, high up by the entrance wall and below the crane rails, looking down the room
    camera.position.set(0, 12.2, -42.8);
    camera.lookAt(0, 0, -63);
    this.marker.visible = true;
  }

  exitCrane(camera) {
    this.inCrane = false;
    camera.position.copy(this._camPos);
    camera.rotation.copy(this._camRot);
    this.marker.visible = false;
  }

  get craneBusy() {
    const c = this.crane;
    return c.phase !== 'idle' || Math.abs(c.x - COLS[c.col]) > 0.05 || Math.abs(c.z - ROWS[c.row]) > 0.05;
  }

  // Keys while at a console. Returns a short message for the HUD when something is refused.
  craneKey(code) {
    const c = this.crane;
    if (c.phase !== 'idle') return null;
    if (code === 'KeyA' || code === 'ArrowLeft') c.col = Math.max(0, c.col - 1);
    else if (code === 'KeyD' || code === 'ArrowRight') c.col = Math.min(COLS.length - 1, c.col + 1);
    else if (code === 'KeyW' || code === 'ArrowUp') c.row = Math.min(ROWS.length - 1, c.row + 1);
    else if (code === 'KeyS' || code === 'ArrowDown') c.row = Math.max(0, c.row - 1);
    else if (code === 'KeyE' || code === 'Space') {
      if (this.craneBusy) return null;
      const s = this._stack(c.col, c.row);
      if (c.carrying) {
        if (s.length >= MAX_STACK) return 'That stack is full.';
        c.pending = 'drop';
        c.target = s.length * CRATE_H + CRATE_H + 0.2;
      } else {
        if (!s.length) return 'Nothing to pick up there.';
        c.pending = 'grab';
        c.target = s.length * CRATE_H + 0.2;
      }
      c.phase = 'down';
    }
    return null;
  }

  _approach(v, target, maxStep) {
    const d = target - v;
    return Math.abs(d) <= maxStep ? target : v + Math.sign(d) * maxStep;
  }

  _updateCrane(dt) {
    const c = this.crane;
    if (c.phase === 'idle') {
      c.x = this._approach(c.x, COLS[c.col], 7 * dt);
      c.z = this._approach(c.z, ROWS[c.row], 7 * dt);
    } else if (c.phase === 'down') {
      c.hook = this._approach(c.hook, c.target, 6 * dt);
      if (c.hook === c.target) {
        if (c.pending === 'grab') c.carrying = this._stack(c.col, c.row).pop();
        else {
          const crate = c.carrying;
          c.carrying = null;
          this._push(c.col, c.row, crate);
          this._crushUnder(c.col, c.row);
        }
        c.phase = 'up';
      }
    } else if (c.phase === 'up') {
      c.hook = this._approach(c.hook, HOOK_TRAVEL, 6 * dt);
      if (c.hook === HOOK_TRAVEL) c.phase = 'idle';
    }
    this._syncCrane();
  }

  _syncCrane() {
    const c = this.crane;
    this.bridge.position.z = c.z;
    this.trolley.position.set(c.x, RAIL_Y - 0.85, c.z);
    const top = RAIL_Y - 1.3;
    const len = Math.max(0.1, top - c.hook);
    this.cable.scale.y = len;
    this.cable.position.set(c.x, c.hook + len / 2, c.z);
    this.magnet.position.set(c.x, c.hook, c.z);
    this.magnetGlow.material.color.setHex(c.carrying ? 0xffb040 : 0x33c8ff);
    if (c.carrying) this._placeCrate(c.carrying, c.x, c.hook - 0.2 - CRATE_H / 2, c.z);

    // the marker sits on top of the selected stack: cyan if the action works, red if not
    const s = this._stack(c.col, c.row);
    this.marker.position.set(COLS[c.col], s.length * CRATE_H + 0.05, ROWS[c.row]);
    const ok = c.carrying ? s.length < MAX_STACK : s.length > 0;
    const color = ok ? 0x40e8ff : 0xff4a4a;
    this.markerEdge.material.color.setHex(color);
    this.markerFill.material.color.setHex(color);
  }

  // A container dropped onto a crawler crushes it
  _crushUnder(col, row) {
    const top = this._stack(col, row).length * CRATE_H;
    for (const m of this.crawlers) {
      if (!m.active) continue;
      const p = m.group.position;
      if (Math.abs(p.x - COLS[col]) < CRATE_W / 2 + 0.5 && Math.abs(p.z - ROWS[row]) < CRATE_L / 2 + 0.5 && p.y < top) {
        m.disable();
        this.toast('Crushed!');
      }
    }
  }

  // ---------------------------------------------------------------- the player's side
  // Things to use, for the session's "nearest thing in reach" prompt
  interactables(enterCrane) {
    const list = [];
    CARGO_BAY.consoles.forEach((p, i) => {
      list.push({ pos: p, radius: 2.4, label: 'Use the crane console', run: () => enterCrane(i), bias: 1 });
    });
    if (!this.coolantTaken) {
      list.push({ pos: CARGO_BAY.coolant, radius: 2.2, label: 'Take the coolant', run: () => this._takeCoolant(), bias: 2 });
    }
    if (this.welder.active && this.inventory.has('coolant')) {
      list.push({ pos: this.welder.group.position, radius: 5.0, label: 'Douse the welding drone with coolant', run: () => this._douseWelder(), bias: 4 });
    }
    return list;
  }

  _takeCoolant() {
    this.coolantTaken = true;
    this.coolantItem.parent.visible = false;
    this.inventory.add('coolant');
    this.toast('Coolant taken. Water and a welding arc do not mix.');
  }

  _douseWelder() {
    this.inventory.owned = this.inventory.owned.filter((id) => id !== 'coolant');
    this.welder.disable();
    this.level.openGate('GATE_W1');
    this.toast('The welding drone shorts out in a burst of steam. The gate unlocks.');
  }

  // Watching the tape finishes the course: a maintenance bridge extends for the way back
  markComplete() {
    if (this.complete) return;
    this.complete = true;
    this.tapeSeen = true;
    const R = this.physics.RAPIER;
    const walk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 7.2), named('hull_light', [0.36, 0.37, 0.39]));
    walk.position.set(-11.6, -0.15, -53);
    applyHubMaterials(walk, this.level.textures);
    this.group.add(walk);
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(-11.6, -0.15, -53));
    this.physics.world.createCollider(R.ColliderDesc.cuboid(1.7, 0.15, 3.6), body);
    this.walk = walk;
    this.walkBody = body;
    this.toast('A maintenance bridge extends across the channel. The way back is open.');
  }

  // Per frame. ctx: { player (PlayerController), canSee, onHit, playing }
  update(dt, ctx) {
    this._updateCrane(dt);
    const t = performance.now() / 1000;
    this.coolantItem.rotation.y = t;
    this.coolantItem.position.y = 0.9 + Math.sin(t * 2) * 0.06;
    if (!ctx.playing) return;

    const p = ctx.player.position;
    if (p.z < -56.5) this.crossed = true;
    if (p.y > 3.0 && p.x > 7.5 && p.z < -63) this.reachedCatwalk = true;

    const mctx = { playerPos: p, canSee: ctx.canSee, onHit: ctx.onHit };
    for (const m of [...this.crawlers, this.welder]) m.update(dt, mctx);

    // Stomp: landing on a crawler from above squashes it, and you bounce off
    const vy = ctx.player.velocity.y;
    for (const m of this.crawlers) {
      if (!m.active || vy > -1) continue;
      const c = m.group.position;
      const above = p.y - c.y;
      if (Math.hypot(p.x - c.x, p.z - c.z) < 1.05 && above > 0.25 && above < 1.4) {
        m.disable();
        ctx.player.bounce();
        this.toast('Stomped!');
      }
    }
  }

  // What to do next, for the objective line and the waypoint
  step(target) {
    const welderPos = this.welder.group.position;
    if (!this.bridgeBuilt) {
      target.copy(CARGO_BAY.consoles[0]).setY(1.4);
      return { text: 'CARGO BAY: lay a container across the electrified channel. Use the crane console.', label: 'CRANE CONSOLE' };
    }
    if (!this.crossed) {
      const c = [0, 1, 2, 3].find((i) => this._stack(i, CHANNEL_ROW).length);
      target.set(COLS[c ?? 0], 1.6, ROWS[CHANNEL_ROW]);
      return { text: 'Cross the channel on your container bridge.', label: 'BRIDGE' };
    }
    if (!this.reachedCatwalk && !this.coolantTaken) {
      if (this.stepsBuilt) {
        target.copy(CARGO_BAY.catwalkStep);
        return { text: 'Climb your container steps up to the catwalk.', label: 'CATWALK' };
      }
      target.copy(CARGO_BAY.consoles[1]).setY(1.4);
      return { text: 'Stack containers into steps up to the catwalk (1 high, then 2 high). Use the far crane console.', label: 'CRANE CONSOLE' };
    }
    if (!this.coolantTaken) {
      target.copy(CARGO_BAY.coolant).setY(CARGO_BAY.coolant.y + 1.2);
      return { text: 'Get the coolant at the end of the catwalk. Stomp the crawler in your way.', label: 'COOLANT' };
    }
    if (this.welder.active) {
      target.set(welderPos.x, welderPos.y + 1.8, welderPos.z);
      return { text: 'Douse the welding drone with the coolant: get close and press E. It hits hard.', label: 'WELDING DRONE' };
    }
    target.copy(this.level.tapes.A || welderPos);
    return { text: 'Quarters A is open. Watch the videotape inside.', label: 'TAPE A' };
  }
}

export { MACHINE_TYPES };
