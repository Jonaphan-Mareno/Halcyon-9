import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { Interact } from '../level2/Interact.js';
import { Trench } from './Trench.js';

function terminalFixture() {
  const trench = Object.create(Trench.prototype);
  const interact = new Interact(new THREE.PerspectiveCamera(), { castRay: () => null });
  Object.assign(trench, {
    stage: 'inside',
    fight: { free: true },
    _relayBriefingDone: true,
    _uplinkOverridden: false,
    _hackFrame: null,
    pressureSeal: { state: { solved: false } },
    pts: { screen: new THREE.Vector3() },
    s: { interact },
    game: { _relayHackActive: false }
  });
  trench._spots();
  return { trench, terminal: interact.spots.find(spot => spot.id === 'relayScreen') };
}

test('the unsolved pressure seal blocks the terminal prompt and direct use', () => {
  const { trench, terminal } = terminalFixture();
  assert.equal(terminal.when(), false);
  terminal.use();
  trench._openHack();
  assert.equal(trench.game._relayHackActive, false);
  assert.equal(trench._hackFrame, null);
});

test('solving the pressure seal enables the terminal after the briefing', () => {
  const { trench, terminal } = terminalFixture();
  trench.pressureSeal.state.solved = true;
  assert.equal(terminal.when(), true);
  trench._relayBriefingDone = false;
  assert.equal(terminal.when(), false);
  terminal.use();
  assert.equal(trench.game._relayHackActive, false);
});

test('a solved seal cannot bypass the other terminal prerequisites', () => {
  const { trench, terminal } = terminalFixture();
  trench.pressureSeal.state.solved = true;
  for (const [key, value] of [['stage', 'down'], ['_uplinkOverridden', true], ['_hackFrame', {}]]) {
    const previous = trench[key];
    trench[key] = value;
    assert.equal(terminal.when(), false);
    terminal.use();
    assert.equal(trench.game._relayHackActive, false);
    trench[key] = previous;
  }
  trench.fight.free = false;
  assert.equal(terminal.when(), false);
  terminal.use();
  assert.equal(trench.game._relayHackActive, false);
});
