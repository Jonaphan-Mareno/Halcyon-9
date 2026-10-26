import { Owner, Visibility } from "../core/Graph.js";
import { severDisconnected } from "./sever.js";
import { refreshFactionVision } from "./visibility.js";

export const AI_TICK_SECONDS = 1.5;

export function aiOpeningMove(graph, state) {
  if (state.status !== "playing") return null;
  const target = graph.nodes.get(graph.targetNodeId);
  if (!target || target.owner !== Owner.NEUTRAL) return null;
  const redCanReachTarget = target.neighbors.some((neighborId) => {
    const neighbor = graph.nodes.get(neighborId);
    return neighbor?.owner === Owner.RED && neighbor.active;
  });
  if (!redCanReachTarget) return null;

  graph.setOwner(target.id, Owner.RED);
  const severedNodeIds = severDisconnected(graph);
  refreshFactionVision(graph, Owner.RED);
  return { capturedNodeId: target.id, severedNodeIds };
}

function distancesFrom(graph, originId) {
  const distances = new Map([[originId, 0]]);
  const queue = [originId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    const nextDistance = distances.get(currentId) + 1;
    for (const neighborId of graph.nodes.get(currentId)?.neighbors ?? []) {
      if (!distances.has(neighborId)) {
        distances.set(neighborId, nextDistance);
        queue.push(neighborId);
      }
    }
  }
  return distances;
}

function pickWeighted(candidates, random) {
  if (candidates.length === 0) return null;
  const farthest = Math.max(...candidates.map(({ distance }) => distance));
  const weighted = candidates.map((candidate) => ({
    ...candidate,
    weight: (2 ** (farthest - candidate.distance)) * (candidate.hiddenFromBlue ? 4 : 1),
  }));
  const total = weighted.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = random() * total;
  for (const candidate of weighted) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate;
  }
  return weighted.at(-1);
}

export function aiTick(graph, state, { random = Math.random } = {}) {
  if (state.status !== "playing" || graph.redSpawnerId === null) return null;
  const distances = distancesFrom(graph, graph.blueCoreId);
  const candidatesById = new Map();

  for (const redNode of graph.nodes.values()) {
    if (redNode.owner !== Owner.RED || !redNode.active) continue;
    for (const neighborId of redNode.neighbors) {
      const neighbor = graph.nodes.get(neighborId);
      if (!neighbor || (neighbor.owner !== Owner.NEUTRAL && neighbor.owner !== Owner.BLUE)) continue;
      if (!candidatesById.has(neighborId)) {
        candidatesById.set(neighborId, {
          node: neighbor,
          distance: distances.get(neighborId) ?? graph.nodes.size,
          hiddenFromBlue: neighbor.owner !== Owner.BLUE
            && neighbor.visibility[Owner.BLUE] === Visibility.HIDDEN,
        });
      }
    }
  }

  const choice = pickWeighted([...candidatesById.values()], random);
  if (!choice) return null;

  graph.setOwner(choice.node.id, Owner.RED);
  const severedNodeIds = severDisconnected(graph);
  refreshFactionVision(graph, Owner.RED);

  const selectedNode = graph.nodes.get(state.activeNodeId);
  if (!selectedNode || selectedNode.owner !== Owner.BLUE || !selectedNode.active) {
    state.activeNodeId = graph.nodes.get(graph.blueCoreId)?.active
      ? graph.blueCoreId
      : [...graph.nodes.values()].find((node) => node.owner === Owner.BLUE && node.active)?.id ?? null;
  }

  return { capturedNodeId: choice.node.id, severedNodeIds };
}
