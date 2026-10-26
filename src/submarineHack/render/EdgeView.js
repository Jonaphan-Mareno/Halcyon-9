import * as THREE from "three";
import { Owner, Visibility } from "../core/Graph.js";

export function createEdge(a, b) {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(0.035, 0.035, length, 8, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color: 0x126078,
    transparent: true,
    opacity: 0.68,
  });
  const edge = new THREE.Mesh(geometry, material);
  edge.position.copy(start).add(end).multiplyScalar(0.5);
  edge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  edge.userData.nodes = [a, b];
  updateEdgeMesh(edge);
  return edge;
}

export function updateEdgeMesh(edge, viewer = Owner.BLUE) {
  const [a, b] = edge.userData.nodes;
  const isKnown = (node) => node.owner === viewer
    || node.visibility[viewer] === Visibility.VISIBLE
    || node.kind === "core"
    || node.kind === "target"
    || node.kind === "spawner";
  const visible = isKnown(a) && isKnown(b);
  edge.material.opacity = visible ? 0.68 : 0.07;
  edge.material.color.setHex(visible ? 0x126078 : 0x101820);
}
