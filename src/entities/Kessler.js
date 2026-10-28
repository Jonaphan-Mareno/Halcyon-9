import { CrewMember } from './CrewMember.js';

// Dr. Elena Kessler (kessler.glb, built by Blender/scripts/build_kessler_from_female.py from
// "Female scientist" by photon and the head of "Angelica" by Sell Asset Store, both CC-BY-4.0, see
// CREDITS.md): in her thirties, curly red hair to her shoulders, green eyes, no glasses, a white
// coat over a slate shirt, a deep red tie and dark trousers.
//
// Her skeleton and clips are Voss's (Idle and Walk are in her file). Her face has the same morph
// targets as his (jaw_open, mouth_wide, blink, ...) for FaceRig.
//
// Body parts are separate meshes (Head, Eyes, Hands, Body, Hair). Her hair and the inside
// of her mouth are coloured per vertex (COLOR_0). Loaded as any crewmate is (CrewMember.js).

export class Kessler extends CrewMember {
  constructor() {
    super('kessler');
  }
}
