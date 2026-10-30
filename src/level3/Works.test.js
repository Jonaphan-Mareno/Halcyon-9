import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Physics } from '../core/Physics.js';
import { Works } from './Works.js';

// Load no environment model; exercise the actual hatch animation and Rapier collision methods.
class HatchFixture extends Works {
  async _load() {}
}

test('the hatch blocks passage until its opening animation completes', async () => {
  const physics = await Physics.create();
  const works = new HatchFixture({ setOutsideShown() {} }, physics);
  const geometry = new THREE.BoxGeometry(1.92, 2.57, 0.24);
  const material = new THREE.MeshBasicMaterial();
  const leaf = new THREE.Mesh(geometry, material);
  leaf.position.set(106.2, 1.3, 0);
  works.inner.add(leaf);
  const door = { obj: leaf, base: leaf.position.clone(), open: 0, target: 0, collider: null, kind: 'leaf' };
  works.doors.GATE_RelayHatch = door;
  let openingSounds = 0;
  works.onSound = () => openingSounds++;
  const R = physics.RAPIER;
  const body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(106.2, 0.9, -1.3));
  const player = physics.world.createCollider(R.ColliderDesc.capsule(0.55, 0.35), body);
  const controller = physics.world.createCharacterController(0.02);
  const position = new THREE.Vector3(106.2, 0, -1.3);
  const passage = () => {
    physics.step(1 / 60);
    controller.computeColliderMovement(player, { x: 0, y: 0, z: 3 });
    return controller.computedMovement().z;
  };
  try {
    works._block(door, true);
    assert.ok(passage() < 1.5, 'the closed hatch blocks the player');
    assert.equal(works.openRelayHatch(), true);
    assert.equal(works.openRelayHatch(), false, 'repeated requests do not skip the animation');
    assert.ok(door.collider);
    assert.ok(passage() < 1.5, 'solving the puzzle must not immediately remove the blocker');
    for (let i = 0; i < 39; i++) works.update(0.05, position, () => {});
    assert.ok(door.open < 1);
    assert.ok(door.collider);
    assert.ok(passage() < 1.5, 'the opening hatch still blocks passage');
    works.update(0.05, position, () => {});
    assert.equal(door.open, 1);
    assert.equal(door.collider, null);
    assert.ok(Math.abs(passage() - 3) < 0.001, 'the fully open hatch allows passage');
    assert.equal(openingSounds, 1);
  } finally {
    works.dispose();
    physics.world.free();
    geometry.dispose();
    material.dispose();
  }
});
