// Level 2's story so far, and what to do next.
//
// The route (scenes 2.1 to 2.9 of the script): leave the lift, fight through the garden to the
// hatch, find it locked with Dr. Kessler's override, go upstairs, take her card from Voss's
// locker, open the lab's files, open Kessler's room, take the code, go back down and open the
// hatch.
//
// Whatever happens in the level sets a FLAG here, once (flags never go back). The objective
// banner and the waypoint are worked out from the flags alone, so any part of the level can set
// a flag and the guidance follows. Upstairs, the bunk and the lab can be done in either order;
// Kessler's room needs both (her door wants the card and the lab's authorisation).

// In route order (the debug key sets them in this order)
export const FLAGS = [
  'leftLift',       // stepped out of the lift
  'dronesWoken',    // the drones dropped on him in the garden
  'pipeTaken',      // he pulled the water pipe off the wall by the hatch
  'gardenCleared',  // the last drone shattered: the pumps restart and the stair bulkheads lift
  'hatchTried',     // tried the hatch keypad: it wants Kessler's override
  'cardTaken',      // took Kessler's access card from Voss's locker
  'logWatched',     // watched the last of Voss's personal logs (Cycle 8)
  'labDone',        // opened the lab's files (the subject list: CYCLE 9)
  'codeFound',      // found the override code in Kessler's room
  'hatchOpen'       // typed the code: the hatch is open
];

// The crew bunk (Voss's old room, east of the gallery), the lab (north) and Kessler's room
// (north-east), to know when he is inside them
const BUNK = { x0: 17.3, x1: 25.9, y0: 5.0, z0: -5.5, z1: 3.0 };
const KESSLER = { x0: 8.3, x1: 20.3, y0: 5.0, z0: -22.1, z1: -10.1, r: 17.2 };
const LAB = { y0: 4.5, z1: -17.3, halfWidth: 7 };

export class Level2Story {
  // targets: world positions for the waypoint { hatch, pipe, quarters, lab, kessler } and, inside
  // the rooms, the things to use { locker, personalLog, labTerminal, kesslerLog, codeCard }
  constructor(targets) {
    this.targets = targets;
    this.seen = () => false;       // (id) => has he read that entry (the level sets this)
    this.flags = Object.fromEntries(FLAGS.map((f) => [f, false]));
    this.onChange = null;          // (flag) => {}: something new has happened
  }

  has(flag) {
    return this.flags[flag] === true;
  }

  // Record that something happened. Returns true the first time only.
  set(flag) {
    if (!(flag in this.flags)) {
      console.warn(`Level2Story: no flag "${flag}".`);
      return false;
    }
    if (this.flags[flag]) return false;
    this.flags[flag] = true;
    this.onChange?.(flag);
    return true;
  }

  // The next flag in route order that is not set yet (for the debug key), or null
  next() {
    return FLAGS.find((f) => !this.flags[f]) || null;
  }

  get complete() {
    return this.flags.hatchOpen;
  }

  // What to do now: { text, label, target } where target (a Vector3, or null for no marker)
  // is what the waypoint points at, and label is the waypoint's name
  objective(playerPosition) {
    const f = this.flags;
    const t = this.targets;
    if (f.hatchOpen) return { text: 'Climb down into the shaft', label: 'HATCH', target: t.hatch };
    if (!f.gardenCleared) {
      // ARIA told him in the lift: the pipe first (the drones only dive once he has it)
      if (!f.pipeTaken) return { text: 'Take the water pipe off the wall by the hatch', label: 'PIPE', target: t.pipe || t.hatch };
      return { text: 'Soak the drones, then freeze them', label: '', target: null };
    }
    if (f.codeFound) return { text: 'Go back to the hatch', label: 'HATCH', target: t.hatch };
    // the garden is clear but nothing upstairs has been touched yet: try the hatch first
    if (!f.hatchTried && !f.cardTaken && !f.labDone) {
      return { text: 'Open the hatch', label: 'HATCH', target: t.hatch };
    }
    const p = playerPosition;
    // the crew bunk: his locker (Kessler's card) and his personal logs (the last one, Cycle 8)
    if (!f.cardTaken || !f.logWatched) {
      if (p && this._inBunk(p)) {
        if (!f.cardTaken) return { text: "Search the crew quarters: find J. Voss's locker", label: 'LOCKER', target: t.locker };
        return { text: "Watch Voss's personal logs", label: 'LOGS', target: t.personalLog };
      }
      // the lit door in the dead gallery is the pull: the marker names the light, not the room
      if (!f.cardTaken) return { text: "Find Dr. Kessler's override key", label: 'LIGHT ON', target: t.quarters };
      return { text: "Go back and watch Voss's personal logs", label: 'LOGS', target: t.personalLog };
    }
    if (!f.labDone) {
      if (p && this._inLab(p)) return { text: 'Read the files on the lab terminal', label: 'TERMINAL', target: t.labTerminal };
      return { text: 'Investigate the lab', label: 'LAB', target: t.lab };
    }
    if (p && this._inKessler(p)) {
      if (!this.seen('kesslerLog')) return { text: "Search Dr. Kessler's room", label: 'LOG', target: t.kesslerLog };
      return { text: "Search Dr. Kessler's room", label: 'CARD', target: t.codeCard };
    }
    return { text: "Open Dr. Kessler's room with her card", label: 'KESSLER', target: t.kessler };
  }

  _inLab(p) {
    return p.y > LAB.y0 && p.z < LAB.z1 && Math.abs(p.x) < LAB.halfWidth;
  }

  _inKessler(p) {
    const k = KESSLER;
    return p.y > k.y0 && p.x > k.x0 && p.x < k.x1 && p.z > k.z0 && p.z < k.z1 && Math.hypot(p.x, p.z) > k.r;
  }

  _inBunk(p) {
    return p.y > BUNK.y0 && p.x > BUNK.x0 && p.x < BUNK.x1 && p.z > BUNK.z0 && p.z < BUNK.z1;
  }
}
