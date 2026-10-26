import assert from "node:assert/strict";
import test from "node:test";
import { Graph, Owner } from "../core/Graph.js";
import { buildLayout } from "../core/layout.js";
import { GameState } from "../core/GameState.js";
import { playerCapture } from "./capture.js";
import { aiTick } from "./ai.js";
import { severDisconnected } from "./sever.js";

function pathBetween(graph, from, to, avoid = new Set()) {
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    if (id === to) break;
    for (const n of graph.nodes.get(id).neighbors) {
      if (!prev.has(n) && !avoid.has(n)) { prev.set(n, id); queue.push(n); }
    }
  }
  const path = [];
  for (let id = to; id !== null; id = prev.get(id)) path.unshift(id);
  return path;
}

function breach(graph, state, nodeId, start = 1000) {
  let result;
  for (let i = 0; i < 3; i += 1) result = playerCapture(nodeId, graph, state, start + i * 100);
  return result;
}

// Characterization: documents CURRENT behaviour so a design change is deliberate.
test("breaching the Red spawner severs the entire Red network", () => {
  const graph = buildLayout(new Graph());
  const state = new GameState();
  graph.setOwner(2, Owner.RED);
  graph.setOwner(6, Owner.RED);
  // Blue chain from the core to a node adjacent to the spawner (id 1).
  const spawner = graph.redSpawnerId;
  const chain = pathBetween(graph, graph.blueCoreId, 7, new Set([spawner, 6, 2]));
  for (const id of chain) graph.setOwner(id, Owner.BLUE);
  assert.ok(graph.nodes.get(7).neighbors.includes(6));

  // Take 6 first (adjacent to Blue 7), then the spawner.
  assert.equal(breach(graph, state, 6, 1000).type, "captured");
  const result = breach(graph, state, spawner, 5000);
  assert.equal(result.type, "captured");
  assert.equal(graph.nodes.get(spawner).owner, Owner.BLUE);
  assert.equal(graph.nodes.get(2).owner, Owner.DEAD, "remaining Red nodes go offline");
});

test("severed (DEAD) nodes can be recaptured with one click", () => {
  const graph = buildLayout(new Graph());
  const state = new GameState();
  const neighborId = graph.nodes.get(graph.blueCoreId).neighbors[0];
  graph.setOwner(neighborId, Owner.DEAD);
  const result = playerCapture(neighborId, graph, state, 1000);
  assert.equal(result.type, "captured");
  assert.equal(result.breached, false);
  assert.equal(graph.nodes.get(neighborId).owner, Owner.BLUE);
});

test("the AI never expands into DEAD nodes", () => {
  const graph = buildLayout(new Graph());
  const state = new GameState();
  for (const id of graph.nodes.get(graph.redSpawnerId).neighbors) graph.setOwner(id, Owner.DEAD);
  assert.equal(aiTick(graph, state, { random: () => 0.5 }), null);
});

test("severDisconnected turns only unpowered Red nodes DEAD", () => {
  const graph = buildLayout(new Graph());
  graph.setOwner(6, Owner.RED);   // powered via spawner 1
  graph.setOwner(24, Owner.RED);  // isolated
  const severed = severDisconnected(graph);
  assert.deepEqual(severed, [24]);
  assert.equal(graph.nodes.get(6).owner, Owner.RED);
});
