import { Owner } from "../core/Graph.js";
import { severDisconnected } from "./sever.js";
import { refreshFactionVision } from "./visibility.js";

export const RED_BREACH_CLICKS = 3;
export const RED_BREACH_WINDOW_MS = 1250;
export const RED_BREACH_DECAY_DELAY_MS = 500;

function clearAttempt(node, state) {
  node.breachProgress = 0;
  state.breachAttempts.delete(node.id);
}

function checkVictory(graph, state) {
  const target = graph.nodes.get(graph.targetNodeId);
  const won = target?.owner === Owner.BLUE && target.active;
  if (won) state.status = "won";
  return won;
}

export function updateCaptureProgress(graph, state, now = performance.now()) {
  for (const [nodeId, attempt] of state.breachAttempts) {
    const node = graph.nodes.get(nodeId);
    if (!node || now - attempt.lastClickAt >= RED_BREACH_DECAY_DELAY_MS
      || now - attempt.startedAt > RED_BREACH_WINDOW_MS) {
      if (node) node.breachProgress = 0;
      state.breachAttempts.delete(nodeId);
    }
  }
}

export function playerCapture(nodeId, graph, state, now = performance.now()) {
  updateCaptureProgress(graph, state, now);
  if (state.status !== "playing") return { type: "inactive" };

  const node = graph.nodes.get(nodeId);
  if (!node) return { type: "missing" };

  if (node.owner === Owner.BLUE && node.active) {
    state.activeNodeId = node.id;
    return { type: "selected", nodeId };
  }

  const hasActiveBlueNeighbor = node.neighbors.some((neighborId) => {
    const neighbor = graph.nodes.get(neighborId);
    return neighbor?.owner === Owner.BLUE && neighbor.active;
  });
  if (!hasActiveBlueNeighbor) return { type: "unpowered", nodeId };

  if (node.owner === Owner.NEUTRAL || node.owner === Owner.DEAD) {
    graph.setOwner(nodeId, Owner.BLUE);
    refreshFactionVision(graph, Owner.BLUE);
    state.activeNodeId = nodeId;
    const won = checkVictory(graph, state);
    return { type: "captured", nodeId, won, breached: false };
  }

  if (node.owner !== Owner.RED) return { type: "unavailable", nodeId };

  let attempt = state.breachAttempts.get(nodeId);
  if (!attempt) {
    attempt = { clicks: 0, startedAt: now, lastClickAt: now };
    state.breachAttempts.set(nodeId, attempt);
  }
  attempt.clicks += 1;
  attempt.lastClickAt = now;
  node.breachProgress = attempt.clicks / RED_BREACH_CLICKS;

  if (attempt.clicks < RED_BREACH_CLICKS) {
    return { type: "breaching", nodeId, clicks: attempt.clicks, required: RED_BREACH_CLICKS };
  }

  clearAttempt(node, state);
  graph.setOwner(nodeId, Owner.BLUE);
  const severedNodeIds = severDisconnected(graph);
  refreshFactionVision(graph, Owner.BLUE);
  state.activeNodeId = nodeId;
  const won = checkVictory(graph, state);
  return { type: "captured", nodeId, won, breached: true, severedNodeIds };
}
