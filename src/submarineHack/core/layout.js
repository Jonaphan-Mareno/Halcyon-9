import { Owner, Visibility } from "./Graph.js";

// Build a compact 5x5 network. Side lanes and a bottom crossbar keep all nodes
// reachable; the center route zigzags across sparse horizontal and diagonal links.
export function buildLayout(graph) {
  const width = 5;
  const spacing = 1.9;

  for (let row = 0; row < width; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const id = row * width + column;
      const x = (column - 2) * spacing;
      const y = (2 - row) * spacing;
      const z = Math.sin((row + 1) * 1.3 + column * 0.8) * 0.14;
      graph.addNode(id, x, y, z);
      graph.nodes.get(id).kind = id === 1
        ? "spawner"
        : column === 2 && row === 0
        ? "target"
        : column === 2 && row === width - 1
          ? "core"
          : "node";
    }
  }

  for (let row = 0; row < width; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const id = row * width + column;
      const removeCentralVertical = column === 2 && (row === 1 || row === 2);
      if (row < width - 1 && !removeCentralVertical) graph.connect(id, id + width);
      // The lowest row is a crossbar so every vertical lane remains connected.
      if (row === width - 1 && column < width - 1) graph.connect(id, id + 1);
      // Keep only the center cross-links above the crossbar; side lanes are
      // longer flanks instead of quick shortcuts into the target approach.
      if (row < width - 1 && (column === 1 || column === 2)) graph.connect(id, id + 1);
    }
  }

  // Replace central vertical shortcuts with diagonals that expose contested
  // side approaches without making the board a full lattice again.
  for (const [a, b] of [[7, 13], [8, 12], [11, 17]]) graph.connect(a, b);

  graph.setFactionRoots({
    blueCoreId: (width - 1) * width + 2,
    redSpawnerId: 1,
  });
  graph.targetNodeId = 2;

  graph.setOwner(graph.blueCoreId, Owner.BLUE);
  graph.setOwner(graph.redSpawnerId, Owner.RED);
  for (const node of graph.nodes.values()) {
    graph.setVisibility(node.id, Owner.BLUE, Visibility.HIDDEN);
    graph.setVisibility(node.id, Owner.RED, Visibility.HIDDEN);
  }
  for (const rootId of [graph.blueCoreId, graph.redSpawnerId]) {
    const root = graph.nodes.get(rootId);
    const faction = root.owner;
    graph.setVisibility(rootId, faction, Visibility.VISIBLE);
    for (const neighborId of root.neighbors) {
      graph.setVisibility(neighborId, faction, Visibility.VISIBLE);
    }
  }
  return graph;
}

