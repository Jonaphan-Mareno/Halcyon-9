import { Owner } from "../core/Graph.js";

// Graph.recomputeActivity performs a faction-rooted BFS. Red nodes outside the
// AI's powered component are removed from the network; disconnected Blue nodes
// remain Blue and inactive so the player can reconnect them later.
export function severDisconnected(graph, spawnerId = graph.redSpawnerId) {
  if (spawnerId !== null && spawnerId !== graph.redSpawnerId) {
    graph.setFactionRoots({ blueCoreId: graph.blueCoreId, redSpawnerId: spawnerId });
  }
  graph.recomputeActivity();

  const severedNodeIds = [];
  for (const node of graph.nodes.values()) {
    if (node.owner === Owner.RED && !node.active) severedNodeIds.push(node.id);
  }

  for (const nodeId of severedNodeIds) graph.setOwner(nodeId, Owner.DEAD);
  graph.recomputeActivity();
  return severedNodeIds;
}
