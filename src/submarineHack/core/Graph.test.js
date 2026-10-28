import assert from "node:assert/strict";
import test from "node:test";
import { Graph, Owner, Visibility } from "./Graph.js";

test("ownership changes recompute active branches from both faction roots", () => {
  const graph = new Graph();
  graph.addNode("blue-core", 0, 0);
  graph.addNode("blue-link", 1, 0);
  graph.addNode("blue-leaf", 2, 0);
  graph.addNode("red-spawner", 3, 0);
  graph.connect("blue-core", "blue-link");
  graph.connect("blue-link", "blue-leaf");
  graph.connect("blue-leaf", "red-spawner");
  graph.setFactionRoots({ blueCoreId: "blue-core", redSpawnerId: "red-spawner" });

  graph.setOwner("blue-core", Owner.BLUE);
  graph.setOwner("blue-link", Owner.BLUE);
  graph.setOwner("blue-leaf", Owner.BLUE);
  graph.setOwner("red-spawner", Owner.RED);
  assert.deepEqual(
    [...graph.nodes.values()].map(({ id, active }) => [id, active]),
    [["blue-core", true], ["blue-link", true], ["blue-leaf", true], ["red-spawner", true]],
  );

  graph.setOwner("blue-link", Owner.NEUTRAL);
  assert.equal(graph.nodes.get("blue-core").active, true);
  assert.equal(graph.nodes.get("blue-link").active, false);
  assert.equal(graph.nodes.get("blue-leaf").active, false);
  assert.equal(graph.nodes.get("red-spawner").active, true);

  graph.setOwner("blue-link", Owner.BLUE);
  assert.equal(graph.nodes.get("blue-leaf").active, true);
});

test("visibility is stored independently for Blue and Red", () => {
  const graph = new Graph();
  graph.addNode("n", 0, 0);

  graph.setVisibility("n", Owner.BLUE, Visibility.VISIBLE);

  assert.equal(graph.nodes.get("n").visibility[Owner.BLUE], Visibility.VISIBLE);
  assert.equal(graph.nodes.get("n").visibility[Owner.RED], Visibility.HIDDEN);
});

test("connections reject missing nodes and avoid duplicate neighbors", () => {
  const graph = new Graph();
  graph.addNode("a", 0, 0);
  graph.addNode("b", 1, 0);
  graph.connect("a", "b");
  graph.connect("a", "b");

  assert.deepEqual(graph.nodes.get("a").neighbors, ["b"]);
  assert.throws(() => graph.connect("a", "missing"), /missing nodes/);
});
