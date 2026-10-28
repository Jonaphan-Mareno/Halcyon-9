export const Owner = Object.freeze({ NEUTRAL: "neutral", BLUE: "blue", RED: "red", DEAD: "dead" });
// Keep the old export name for any systems that still use the Phase 1 API.
export const NodeState = Owner;
export const Visibility = Object.freeze({ HIDDEN: "hidden", VISIBLE: "visible" });
const FACTIONS = [Owner.BLUE, Owner.RED];

export class Graph {
  constructor() {
    this.nodes = new Map();
    this.blueCoreId = null;
    this.redSpawnerId = null;
    // Compatibility aliases used by the layout and later gameplay systems.
    this.startNodeId = null;
    this.targetNodeId = null;
  }

  addNode(id, x, y, z = 0) {
    if (this.nodes.has(id)) throw new Error(`Node ${id} already exists`);
    this.nodes.set(id, {
      id,
      x,
      y,
      z,
      owner: Owner.NEUTRAL,
      active: false,
      breachProgress: 0,
      visibility: {
        [Owner.BLUE]: Visibility.HIDDEN,
        [Owner.RED]: Visibility.HIDDEN,
      },
      neighbors: [],
    });
    return this.nodes.get(id);
  }

  connect(a, b) {
    const nodeA = this.nodes.get(a);
    const nodeB = this.nodes.get(b);
    if (!nodeA || !nodeB) throw new Error(`Cannot connect missing nodes ${a} and ${b}`);
    if (a === b) throw new Error("A node cannot connect to itself");
    if (!nodeA.neighbors.includes(b)) nodeA.neighbors.push(b);
    if (!nodeB.neighbors.includes(a)) nodeB.neighbors.push(a);
  }

  setFactionRoots({ blueCoreId = this.blueCoreId, redSpawnerId = this.redSpawnerId } = {}) {
    for (const [name, id] of [["Blue core", blueCoreId], ["Red spawner", redSpawnerId]]) {
      if (id !== null && !this.nodes.has(id)) throw new Error(`${name} node ${id} does not exist`);
    }
    this.blueCoreId = blueCoreId;
    this.redSpawnerId = redSpawnerId;
    this.startNodeId = blueCoreId;
    this.recomputeActivity();
  }

  setOwner(id, owner) {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node ${id} does not exist`);
    if (!Object.values(Owner).includes(owner)) throw new Error(`Invalid node owner: ${owner}`);
    node.owner = owner;
    this.recomputeActivity();
    return node;
  }

  setVisibility(id, faction, visibility) {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`Node ${id} does not exist`);
    if (!FACTIONS.includes(faction)) throw new Error(`Invalid visibility faction: ${faction}`);
    if (!Object.values(Visibility).includes(visibility)) throw new Error(`Invalid visibility: ${visibility}`);
    node.visibility[faction] = visibility;
  }

  recomputeActivity() {
    for (const node of this.nodes.values()) node.active = false;

    for (const [faction, rootId] of [
      [Owner.BLUE, this.blueCoreId],
      [Owner.RED, this.redSpawnerId],
    ]) {
      if (rootId === null || this.nodes.get(rootId)?.owner !== faction) continue;

      const reached = new Set([rootId]);
      const queue = [rootId];
      while (queue.length > 0) {
        const currentId = queue.shift();
        const current = this.nodes.get(currentId);
        current.active = true;
        for (const neighborId of current.neighbors) {
          const neighbor = this.nodes.get(neighborId);
          if (neighbor?.owner === faction && !reached.has(neighborId)) {
            reached.add(neighborId);
            queue.push(neighborId);
          }
        }
      }
    }
  }
}
