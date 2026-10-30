import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { relayTurnDeltas } from './relayRules.js';

const STANDARD = [[0, 1, 2, 3], [1, 2, 3], [2, 3], [3]];
const LAST_BACKUP = [[0, 2], [1, 3], [0, 1, 2], [1, 2, 3]];
const wrap = n => ((n % 8) + 8) % 8;

for (const difficulty of ['easy', 'medium', 'hard', 'superHard']) {
  test(difficulty + ': each dial moves the expected world-space markers', () => {
    const links = difficulty === 'superHard' ? LAST_BACKUP : STANDARD;
    for (const direction of [-1, 1]) {
      for (let dial = 0; dial < 4; dial++) {
        const root = new THREE.Group(), rings = [], markers = [];
        let parent = root;
        const initial = [7, 2, 5, 3];
        for (const step of initial) {
          const ring = new THREE.Group(), marker = new THREE.Object3D();
          ring.position.y = 1;
          marker.position.x = 1;
          ring.add(marker);
          parent.add(ring);
          parent = ring;
          rings.push(ring);
          markers.push(marker);
          ring.rotation.y = step * Math.PI / 4;
        }
        const deltas = relayTurnDeltas(dial, difficulty);
        // Check both the eased turn and its final position: compensation must
        // also keep unrelated markers still while the ring animation is moving.
        for (const fraction of [0.25, 0.75, 1]) {
          rings.forEach((ring, i) => {
            ring.rotation.y = (initial[i] + direction * deltas[i] * fraction) * Math.PI / 4;
          });
          root.updateMatrixWorld(true);
          let initialWorld = 0;
          markers.forEach((marker, i) => {
            initialWorld += initial[i];
            const angle = (initialWorld + (links[dial].includes(i) ? direction * fraction : 0)) * Math.PI / 4;
            const point = marker.getWorldPosition(new THREE.Vector3());
            assert.ok(Math.abs(point.x - Math.cos(angle)) < 1e-9, 'marker ' + i + ' x');
            assert.ok(Math.abs(point.z + Math.sin(angle)) < 1e-9, 'marker ' + i + ' z');
          });
        }
      }
    }
  });
}

for (const difficulty of ['medium', 'superHard']) {
  test(difficulty + ': all 4096 scrambles are solvable using forward turns', () => {
    // Explore from solved using reverse moves. Every visited state therefore
    // has a solution composed only of the forward turns available with E.
    const encode = steps => steps.reduce((id, step, i) => id | (wrap(step) << (3 * i)), 0);
    const decode = id => [0, 1, 2, 3].map(i => (id >> (3 * i)) & 7);
    const queue = [0], seen = new Set(queue);
    for (let at = 0; at < queue.length; at++) {
      const steps = decode(queue[at]);
      for (let dial = 0; dial < 4; dial++) {
        const deltas = relayTurnDeltas(dial, difficulty);
        const next = encode(steps.map((step, i) => step - deltas[i]));
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    assert.equal(seen.size, 8 ** 4);
  });
}

test('invalid dial selections do not produce a turn', () => {
  for (const index of [-1, 4, 0.5, undefined]) {
    assert.equal(relayTurnDeltas(index, 'superHard'), null);
  }
});
