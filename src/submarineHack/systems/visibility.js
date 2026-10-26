import { Owner, Visibility } from "../core/Graph.js";

export function revealFactionFrontier(graph, faction, { reset = false } = {}) {
  if (reset) {
    for (const node of graph.nodes.values()) {
      graph.setVisibility(node.id, faction, Visibility.HIDDEN);
    }
  }

  for (const node of graph.nodes.values()) {
    if (node.owner !== faction) continue;
    graph.setVisibility(node.id, faction, Visibility.VISIBLE);
    for (const neighborId of node.neighbors) {
      graph.setVisibility(neighborId, faction, Visibility.VISIBLE);
    }
  }
}

export function refreshFactionVision(graph, faction) {
  revealFactionFrontier(graph, faction);
}

export function resetBlueVisibility(graph) {
  revealFactionFrontier(graph, Owner.BLUE, { reset: true });
}
