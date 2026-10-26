import assert from "node:assert/strict";
import test from "node:test";
import { Graph } from "./Graph.js";
import { buildLayout } from "./layout.js";

test("buildLayout creates a 25-node network with a bottom core and top target", () => {
  const graph = buildLayout(new Graph());

  assert.equal(graph.nodes.size, 25);
  assert.equal(graph.startNodeId, 22);
  assert.equal(graph.targetNodeId, 2);
  assert.equal(graph.nodes.get(graph.startNodeId).kind, "core");
  assert.equal(graph.nodes.get(graph.targetNodeId).kind, "target");
  assert.ok(graph.nodes.get(graph.startNodeId).y < 0);
  assert.ok(graph.nodes.get(graph.targetNodeId).y > 0);
});

test("layout connections are valid, unique, and bidirectional", () => {
  const graph = buildLayout(new Graph());

  for (const node of graph.nodes.values()) {
    assert.ok(Number.isFinite(node.x));
    assert.ok(Number.isFinite(node.y));
    assert.ok(Number.isFinite(node.z));
    assert.equal(new Set(node.neighbors).size, node.neighbors.length);

    for (const neighborId of node.neighbors) {
      assert.ok(graph.nodes.has(neighborId), `node ${node.id} references missing node ${neighborId}`);
      assert.ok(
        graph.nodes.get(neighborId).neighbors.includes(node.id),
        `connection ${node.id} → ${neighborId} is not bidirectional`,
      );
    }
  }
});

test("every node is reachable from the Blue core", () => {
  const graph = buildLayout(new Graph());
  const reached = new Set([graph.startNodeId]);
  const queue = [graph.startNodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    for (const neighborId of graph.nodes.get(currentId).neighbors) {
      if (!reached.has(neighborId)) {
        reached.add(neighborId);
        queue.push(neighborId);
      }
    }
  }

  assert.equal(reached.size, graph.nodes.size);
});
