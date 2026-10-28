import * as THREE from "three";

export function setupPicking(canvas, camera, meshes, onPick, onHover = () => {}) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;

  const intersectAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(meshes, false)[0]?.object.userData.node ?? null;
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    down = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  };

  const onPointerUp = (event) => {
    if (!down || event.pointerId !== down.pointerId) return;
    const movement = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (movement > 6 || event.button !== 0) return;

    const node = intersectAt(event.clientX, event.clientY);
    if (node) onPick(node, event);
    onHover(node, event);
  };

  const onPointerMove = (event) => {
    if (event.pointerType === "touch") return;
    onHover(intersectAt(event.clientX, event.clientY), event);
  };
  const onPointerCancel = () => { down = null; };
  const onPointerLeave = (event) => onHover(null, event);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);

  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
  };
}
