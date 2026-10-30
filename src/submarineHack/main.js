import * as THREE from "three";
import "./style.css";
import { Graph } from "./core/Graph.js";
import { GameState } from "./core/GameState.js";
import { buildLayout } from "./core/layout.js";
import { clampDelta } from "./core/time.js";
import { createEdge, updateEdgeMesh } from "./render/EdgeView.js";
import { createNodeMesh, updateNodeMesh } from "./render/NodeView.js";
import { createComposer } from "./render/postprocessing.js";
import { createScene } from "./render/scene.js";
import { playSeverEffect } from "./render/SeverEffect.js";
import { playVictoryEffect } from "./render/VictoryEffect.js";
import { setupPicking } from "./input/raycast.js";
import { updateCaptureProgress, playerCapture } from "./systems/capture.js";
import { aiOpeningMove, aiTick } from "./systems/ai.js";
import { firePing } from "./systems/ping.js";
import { startWarden } from "./systems/warden.js";
import { updateHud } from "./ui/hud.js";
import { sfx } from "./audio/audio.js";

const gameState = new GameState();
document.querySelector("#round-time").textContent = String(gameState.timeLimit);
document.querySelector("#timer").title = `Power the lock's pump controller before the backup cell's ${gameState.timeLimit} seconds run out.`;

const canvas = document.querySelector("#game");
const { renderer, scene, camera, controls } = createScene(canvas);
const graph = buildLayout(new Graph());
gameState.activeNodeId = graph.blueCoreId;

function playSeveredEffects(nodeIds = []) {
  if (nodeIds.length > 0) sfx.sever();
  for (const nodeId of nodeIds) {
    const node = graph.nodes.get(nodeId);
    if (node) playSeverEffect(scene, node);
  }
}

const edgeLayer = new THREE.Group();
edgeLayer.name = "network-edges";
for (const node of graph.nodes.values()) {
  for (const neighborId of node.neighbors) {
    if (node.id < neighborId) {
      edgeLayer.add(createEdge(node, graph.nodes.get(neighborId)));
    }
  }
}
scene.add(edgeLayer);

const nodeLayer = new THREE.Group();
nodeLayer.name = "network-nodes";
const nodeMeshes = [];
for (const node of graph.nodes.values()) {
  const mesh = createNodeMesh(node);
  nodeMeshes.push(mesh);
  nodeLayer.add(mesh);
}
scene.add(nodeLayer);

let stopWarden = () => {};
let cameraShakeTimeline = null;
let cameraShakeOrigin = null;
let cameraShakeTime = 0;
let roundStarted = false;

function describeNode(node) {
  if (node.kind === "target") {
    if (node.owner === "red") {
      return ["PUMP CONTROLLER · BREAKER TRIPPED", "Reset it from a powered blue neighbor with three rapid clicks. Keep it connected to your access core to power the pumps.", "gold"];
    }
    if (node.owner === "blue" && !node.active) {
      return ["PUMP CONTROLLER · NO POWER", "Seawater shorted your path. Reconnect blue nodes to the access core to restore power here.", "gold"];
    }
    return ["PUMP CONTROLLER", "Bring this node online from a powered blue neighbor and keep its connection to the access core.", "gold"];
  }
  if (node.kind === "core") return ["RELAY ACCESS CORE", "Your way into the relay's network. Connected blue nodes extend your path.", "blue"];
  if (node.kind === "spawner") return ["SHORTED JUNCTION", "Seawater in the lines: the short spreads from here and tries to cut off your access core.", "red"];

  const known = node.visibility.blue === "visible" || node.owner === "blue";
  if (!known) return ["UNKNOWN SIGNAL", "Press Space from a powered blue node to scan nearby. A blind click may hit a tripped breaker.", "neutral"];
  if (node.owner === "blue" && !node.active) return ["ACCESS NODE · OFFLINE", "A short cut this connection. Reconnect the path to restore power through this branch.", "blue"];
  if (node.owner === "blue") return ["ACCESS NODE · POWERED", "Click to select this node as your sonar origin. Bring junctions online from any powered blue neighbor.", "blue"];
  if (node.owner === "red") {
    const clicks = Math.round(node.breachProgress * 3);
    const progress = clicks > 0 ? ` Reset: ${clicks}/3—keep the burst going.` : "";
    return ["TRIPPED BREAKER", `Click three times within 1.25 seconds. A 0.5-second pause lets it trip again.${progress}`, "red"];
  }
  if (node.owner === "dead") return ["DEAD · OFFLINE", "This junction has burnt out of the network.", "neutral"];
  return ["DEAD JUNCTION", "One click brings it back online when it touches a powered blue node.", "neutral"];
}

function showNodeTooltip(node, event) {
  const tooltip = document.querySelector("#node-tooltip");
  if (!node || !roundStarted) {
    tooltip.hidden = true;
    return;
  }
  const [title, copy, owner] = describeNode(node);
  document.querySelector("#node-tooltip-title").textContent = title;
  document.querySelector("#node-tooltip-copy").textContent = copy;
  tooltip.dataset.owner = owner;
  tooltip.hidden = false;
  const left = Math.min(event.clientX + 16, window.innerWidth - 260);
  const top = Math.min(event.clientY + 16, window.innerHeight - 120);
  tooltip.style.left = `${Math.max(10, left)}px`;
  tooltip.style.top = `${Math.max(10, top)}px`;
}

function startRound() {
  if (roundStarted) return;
  roundStarted = true;
  gameState.timeRemaining = gameState.timeLimit;
  gameState.aiTimer = gameState.aiTickInterval;
  document.querySelector("#tutorial-screen").hidden = true;
  canvas.focus({ preventScroll: true });
  aiOpeningMove(graph, gameState);
  stopWarden = startWarden(graph, gameState, scene);
  updateHud(gameState);
}

function finishGame(status, reason = null) {
  if (gameState.status !== "playing" && gameState.status !== status) return;
  gameState.status = status;
  gameState.endReason = reason;
  gameState.aiTimer = Number.POSITIVE_INFINITY;
  stopWarden();
  cameraShakeTimeline?.kill();
  cameraShakeTimeline = null;
  if (cameraShakeOrigin) controls.target.copy(cameraShakeOrigin);
  cameraShakeOrigin = null;

  if (status === "won") {
    const target = graph.nodes.get(graph.targetNodeId);
    if (target) playVictoryEffect(scene, target);
    sfx.victory();
    window.parent.postMessage({ type: "halcyon-submarine-hack-won" }, window.location.origin);
  } else {
    sfx.defeat();
  }
  updateHud(gameState);
}

function shakeCamera() {
  cameraShakeTime = 0.17;
}

setupPicking(canvas, camera, nodeMeshes, (node) => {
  if (!roundStarted) return;
  const result = playerCapture(node.id, graph, gameState);
  if (result?.type === "captured") {
    sfx.capture();
    if (result.breached) shakeCamera();
    if (result.won) finishGame("won");
  }
  playSeveredEffects(result?.severedNodeIds);
}, showNodeTooltip);

const onKeyDown = (event) => {
  if (event.code !== "Space" || !roundStarted || event.repeat || event.target !== canvas) return;
  event.preventDefault();
  sfx.unlock();
  if (firePing(gameState.activeNodeId, graph, gameState, scene)) sfx.ping();
};
window.addEventListener("keydown", onKeyDown);
window.addEventListener("pointerdown", () => sfx.unlock(), { once: true });
document.querySelector("#restart-button").addEventListener("click", () => window.location.reload());
document.querySelector("#start-button").addEventListener("click", startRound);
const helpToggle = document.querySelector("#help-toggle");
const helpPanel = document.querySelector("#help-panel");
const toggleHelp = (open) => {
  helpPanel.hidden = !open;
  helpToggle.setAttribute("aria-expanded", String(open));
};
helpToggle.addEventListener("click", () => toggleHelp(helpPanel.hidden));
document.querySelector("#help-close").addEventListener("click", () => toggleHelp(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helpPanel.hidden) toggleHelp(false);
});

const composer = createComposer(renderer, scene, camera);
window.addEventListener("resize", () => composer.setSize(window.innerWidth, window.innerHeight));

const clock = new THREE.Clock();
updateHud(gameState);
function frame() {
  requestAnimationFrame(frame);
  const deltaSeconds = clampDelta(clock.getDelta());
  if (cameraShakeTime > 0) {
    cameraShakeTime = Math.max(0, cameraShakeTime - deltaSeconds);
    const strength = cameraShakeTime / 0.17;
    controls.target.x += (Math.random() - 0.5) * strength * 0.035;
    controls.target.y += (Math.random() - 0.5) * strength * 0.025;
  }
  if (roundStarted && gameState.status === "playing") {
    gameState.updateCooldowns(deltaSeconds);
    if (gameState.updateRoundTimer(deltaSeconds)) {
      finishGame("lost", "timer");
    } else {
      gameState.aiTimer -= deltaSeconds;
      while (gameState.status === "playing" && gameState.aiTimer <= 0) {
        gameState.aiTimer += gameState.aiTickInterval;
        const result = aiTick(graph, gameState);
        if (result) playSeveredEffects(result.severedNodeIds);
        if (graph.nodes.get(graph.blueCoreId).owner === "red") finishGame("lost", "core");
      }
    }
  }
  if (roundStarted) updateCaptureProgress(graph, gameState);
  controls.update();
  for (const mesh of nodeMeshes) updateNodeMesh(mesh, undefined, gameState.activeNodeId);
  for (const edge of edgeLayer.children) updateEdgeMesh(edge);
  updateHud(gameState);
  composer.render();
}
frame();
