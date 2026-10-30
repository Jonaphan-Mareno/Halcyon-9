import { FILES as SFX, MUSIC } from './Level3Audio.js';

// Every file Level 3 loads, in about the order it needs them: what it needs to start first (the
// deck, the drowned crew, the suit), then the outside, the kraken and its works, and last the
// engine-room flashback. Level 2 fetches these in the background (core/Prefetch.js) so the way
// down the hatch does not wait on them.

const M = './assets/models/';
const T = './assets/textures/l3/';
const A = './assets/audio/';

const TEXTURE_SETS = ['l3_wall', 'l3_rust', 'l3_concrete', 'l3_grate', 'l3_rock'];
const CREW = ['kessler', 'lindqvist', 'navarro', 'park'];
const FLASHBACK3 = [
  'kessler-1', 'kessler-2', 'lindqvist-1', 'park-1', 'kessler-3', 'navarro-1', 'lindqvist-2', 'kessler-4', 'park-2',
  'park-3', 'navarro-2', 'kessler-5', 'lindqvist-3', 'kessler-6', 'lindqvist-4', 'navarro-3', 'park-4', 'kessler-7', 'navarro-4'
];

export const LEVEL3_FILES = [
  // the deck and the drowned crew: needed to start
  M + 'l3-drowned.glb', M + 'human_scientist.glb', M + 'kessler.glb', M + 'lindqvist.glb', M + 'navarro.glb', M + 'park.glb',
  ...TEXTURE_SETS.flatMap((s) => ['color', 'normal', 'orm'].map((k) => `${T}${s}_${k}.webp`)),
  ...SFX.map((f) => `${A}sfx/l3/${f}.ogg`),
  // outside, the works and the kraken
  M + 'l3-outside.glb', T + 'atrium_pano.jpg', M + 'l3-works.glb', M + 'l3-creatures.glb', M + 'l3-kraken.glb',
  M + 'Swimming.fbx', M + 'Treading Water.fbx',
  MUSIC.sea, MUSIC.base, MUSIC.intense,
  // the engine-room flashback
  ...CREW.map((c) => `${M}${c}.glb`),
  ...FLASHBACK3.map((f) => `${A}flashback3/fb3-${f}.mp3`)
];
