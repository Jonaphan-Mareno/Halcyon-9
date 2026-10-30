// The devlog, beat by beat (devlog/script.md, draft 4): who speaks, what they say, and what the
// screen shows under it. Read by build.mjs (the footage, timing and prompter subtitles) and by
// overlay.js (the doodles, code cards, labels and diagrams drawn on top).
//
// A beat's base (what fills the screen):
//   gp: [['m:ss', 'm:ss'], ...]   ranges of gameplaypart1.mp4, played back to back
//   seq: 'blender/<name>'          a Blender render (PNG frames at 24 fps)
//   old: '<name>'                  an old version of the game (PNG frames at 10 fps, slowly zoomed)
//   split: [base, base]            two of the above side by side (before | after)
//   black: true
// Its overlay: code {file, from, to, hl: [[a, b], ...]} (the base then plays in the right third),
// label / labelR (tags), blender (the fake Blender interface round a render), diagram, title, dim.
// handoff: the gag that brings the next speaker in (no line; its own length).

export const WPS = 2.8;           // speaking pace (words a second) the timing assumes

export const BEATS = [
  // ---- 0. cold open
  { who: 'naomi', line: 'Three hundred metres under the sea, a research station stopped answering.', gp: [['24:28', '24:40']], noHost: true, pad: 1.2 },
  { who: 'naomi', line: '...We built it. Hi.', gp: [['24:40', '24:46']], noHost: true },

  // ---- 1. meet the team
  { handoff: 'intro', black: true, dur: 9.0 },
  { who: 'naomi', line: "This is the devlog for Halcyon-9, a deep-sea survival and puzzle game, built with Three.js, plain JavaScript and Vite, with the Rapier physics engine underneath. We're Edge Case Runners. Yes, the name is also our debugging experience.", black: true, scene: 'team' },
  { handoff: 'shove', black: true, dur: 6.5 },
  { who: 'naomi', line: "This isn't a trailer. It's how it got made: the code, the models, and every time we had to change our minds.", gp: [['0:00', '0:12']] },

  // ---- 2. where it started
  { who: 'naomi', title: 'Where it started', line: 'The idea started with a dream I had one night. A man wakes up deep under the sea with no memory. The only voice around is the station\'s AI, ARIA. She\'s very helpful, and she really wants him to connect her to the mainland. Whether you should... is the game.', gp: [['2:28', '2:52'], ['6:44', '7:00']] },
  { handoff: 'jonaphan-climb', dur: 4.0, old: 'first-room', dim: true },
  { who: 'jonaphan', line: "You can't push out the guy who made the folder structure.", old: 'first-room', label: 'WEEK ONE · 31 AUG · ded168b' },
  { who: 'jonaphan', line: 'Week one was this. I set up Vite, Three.js and our folder structure, and our first scene was a grey box with one lamp. Moving on.', old: 'first-room', label: 'WEEK ONE · 31 AUG · ded168b', pad: 0.8 },
  { handoff: 'simphiwe-hatch', dur: 4.0, seq: 'blender/controlroom' },
  { who: 'simphiwe', line: 'I modelled the control room in Blender, and we hit our first wall straight away:', seq: 'blender/controlroom', blender: 'controlroom' },
  { who: 'simphiwe', line: "lights don't come out of Blender the way you expect. The commit history goes from colour but no light... to punctual lights... to a room you could finally see.", split: [{ seq: 'blender/cr-0c31cac' }, { seq: 'blender/cr-2f8f2eb' }], label: '12 SEP · colour, no light', labelR: '15 SEP · added lights' },
  { who: 'simphiwe', line: 'Then cel shading: the light falls off in bands instead of a smooth fade. Our first custom shader.', split: [{ seq: 'blender/cr-2f8f2eb' }, { old: 'room-cel' }], label: 'IN BLENDER', labelR: '20 SEP · cel shading, in game' },

  // ---- 3. level 1
  { who: 'simphiwe', title: 'Level 1: Reboot', line: 'Voss wakes up through a blur that clears, like eyes opening. Behind that black screen, the game is quietly building the level, so the intro never stutters.', gp: [['1:12', '1:28']] },
  { who: 'simphiwe', line: 'Level 1 is locked to first person on purpose. We wanted you confined, unable to even see yourself.', gp: [['1:28', '1:38']] },
  { handoff: 'thabiso-reach', dur: 4.0, gp: [['1:38', '1:42']], dim: true },
  { who: 'thabiso', line: "Okay. The cell's mine.", gp: [['1:16', '1:20']] },
  { who: 'thabiso', line: 'The cell teaches you three things. Pick up the brick. Throw it. Get out. The throw is our own physics: the brick has velocity and gravity, and every frame we cast a ray from where it was to where it is now. So even a fast throw can\'t skip through the window between two frames.', gp: [['1:16', '1:36']], code: { file: 'src/levels/Level1.js', from: 2440, to: 2462, hl: [[2440, 2441], [2443, 2444], [2454, 2458]] } },
  { who: 'thabiso', line: 'The glass is pre-broken in Blender. On impact we swap the pane for the pieces, and each one flies out from the hit point with its own spin, bounces, loses speed and settles.', gp: [['1:20', '1:32']], diagram: 'ray' },
  { who: 'thabiso', line: 'And the way out: Voss reaches through the hole, and his arm is solved with inverse kinematics, so his hand actually lands on the handle. The door hangs from a pivot at its hinge, so it swings like a real door. I also put the music in, so if a moment gives you chills... you\'re welcome.', gp: [['1:30', '1:50']] },
  { handoff: 'naomi-torch', dur: 3.5, gp: [['1:45', '1:50']], dim: true },
  { who: 'naomi', line: "Here's our hierarchy. The camera is a child of Voss's head, and the torch is a child of the camera. Look anywhere and the light comes with you, for free. The door is a child of its hinge pivot, so opening it is one rotation.", gp: [['1:45', '2:00']], diagram: 'scenegraph', dim: true },
  { who: 'naomi', line: 'Level 1 is drawn with one shader we wrote. The game feeds it a single number: power. At zero the station is dead, with a few LED strips stuttering. At one, everything is steady. Fixing the generator literally turns up a uniform.', gp: [['3:50', '4:08']], code: { file: 'src/graphics/Shaders.js', from: 325, to: 339, hl: [[329, 330], [336, 336]] } },
  { who: 'naomi', line: "It has a fixed number of light slots, so the room's lights, the cell light and the torch all fit. Textures are made procedurally from world position, projected along each axis, so our models don't even need UV maps. There's an ACES filmic colour curve, and a faint cyan rim on everything. That's our signature. Look for it.", gp: [['2:10', '2:28']], code: { file: 'src/graphics/Shaders.js', from: 318, to: 327, hl: [[325, 327]] } },
  { who: 'naomi', title: 'Pivot 1: a place, not a game', line: "Our first pivot was the look. The rooms felt like game rooms. So Level 1 got restyled to match the habitat we'd built for Level 2: navy lower walls, an orange stripe, light from above and below.", split: [{ old: 'l1-before' }, { gp: [['4:06', '4:24']] }], label: '2 OCT · before', labelR: 'NOW · the habitat look' },
  { who: 'naomi', line: 'And the floors got parallax occlusion mapping. The shader steps through a height map per pixel, so flat tiles look deep, with no extra triangles. Textures doing more than colour.', gp: [['4:14', '4:24']], code: { file: 'src/graphics/parallax.js', from: 22, to: 44, hl: [[30, 34], [35, 40]] } },
  { who: 'naomi', line: "The generator puzzle is never the same twice. We carve a random path from the battery to each lamp, so it's always solvable, then fill the rest with decoys and live fuses that zap you. Run out of time and the room blacks out.", gp: [['3:28', '3:52']], code: { file: 'src/puzzles/CircuitPuzzle.js', from: 250, to: 270, hl: [[250, 251], [262, 264]] } },
  { handoff: 'tariro-rings', dur: 4.0, gp: [['1:58', '2:03']], dim: true },
  { who: 'tariro', line: "I built the ring puzzle, and I wired the flow so ARIA only switches on once you've earned it. Then come the three linked relay rings: turn one and another turns with it.", gp: [['1:58', '2:10'], ['3:58', '4:06']] },
  { handoff: 'sivu-legs', dur: 4.5, gp: [['4:28', '4:33']], dim: true },
  { who: 'sivu', line: "The keypad and the lift doors are mine: real button logic, a zoomed keypad view, doors that slide. Wrong code? ARIA sends you off to find the maintenance tag.", gp: [['4:26', '4:50']] },
  { who: 'sivu', line: "I also made the game harder. You're welcome. Four difficulty presets change how much damage you take and how long puzzles give you. And then there's 'Last backup': double damage, forty percent less puzzle time, two lives. And it's permadeath. Lose them and you're back at the title.", gp: [['0:00', '0:14']], zoomMenu: true },
  { who: 'naomi', line: "And you're never lost: an objective banner, a marker on the exact thing, and an arrow on the edge of the screen when it's out of view.", gp: [['4:40', '4:56']] },

  // ---- 4. level 2
  { handoff: 'naomi-freeze-sivu', dur: 4.0, seq: 'blender/l2-atrium', dim: true },
  { who: 'naomi', title: 'Level 2: The Habitat Atrium', line: 'Level 2 is our biggest environment: a huge round hall with a garden, three floors of catwalks and a window onto the ocean.', seq: 'blender/l2-atrium', blender: 'l2-atrium' },
  { who: 'naomi', title: 'Pivot 2: twelve frames a second', line: 'And our second pivot: the first version looked amazing... at twelve frames a second on an ordinary laptop. We wanted it smooth on everyday Intel graphics, like the UHD 620, so we started measuring everything.', old: 'atrium-first', label: '2 OCT · the first atrium (six lights)' },
  { who: 'naomi', line: 'The model is Draco-compressed, twelve megabytes down to about three. Four-times anti-aliasing cost nine milliseconds a frame, so we switched to FXAA at about one. Physically-based plants cost five milliseconds, so they\'re Lambert now. Every number came from measuring, not guessing.', old: 'atrium-perf', diagram: 'perf', dim: true },
  { who: 'naomi', line: "The atrium is damaged: a few lamps make soft pools of light, some areas are dead, and when the garden's pumps restart, the light comes back. One shared mood system drives this across the whole game. It dims lights, makes them stutter like failing power, and pushes everything to red when an alarm goes off... or when ARIA snaps.", gp: [['8:36', '8:50'], ['19:12', '19:20']] },
  { who: 'naomi', line: "The glass is dark and one-sided: clear face-on and nearly solid at the edges. That's the Fresnel effect, in our shader.", gp: [['9:02', '9:12']], code: { file: 'src/graphics/Shaders.js', from: 318, to: 323, hl: [[320, 320]] } },
  { handoff: 'simphiwe-drone', dur: 3.5, seq: 'blender/bedroom', dim: true },
  { who: 'simphiwe', line: "I built the crew rooms, and you can read the struggle in my commits: 'textures added but can't get colour right'... 'whole room doesn't have texture'... and finally, 'textures look more like a cell'. Which, here, is a compliment.", split: [{ seq: 'blender/bedroom-first' }, { seq: 'blender/bedroom' }], label: '6 OCT · first bedroom', labelR: 'NOW', blenderSplit: true },
  { handoff: 'naomi-swat', dur: 3.5, gp: [['7:46', '7:50']], dim: true },
  { who: 'naomi', line: "Level 2's new idea is a tool. Pull a pipe off the irrigation line and spray. Wet drones spark, and that means ARIA can freeze them: hold Q, they freeze, fall and shatter into a particle burst of ice.", gp: [['7:58', '8:30']] },
  { who: 'naomi', line: 'The water you can freeze is a grid of cells in a tiny texture. The game writes how cold each cell is; the shader reads it and mixes rippling water into cracked ice, cell by cell. Deep water becomes a slab you can stand on, and a wet ramp becomes a slide.', gp: [['8:04', '8:24']], code: { file: 'src/level2/FrostWater.js', from: 34, to: 53, hl: [[35, 35], [50, 53]] } },
  { who: 'simphiwe', line: 'I made those drones, by the way.', gp: [['9:10', '9:16']], offscreen: true },
  { who: 'naomi', line: "Each drone is a small state machine: drop from the ceiling, circle at head height, a one-second warning as its eye turns red, dive, recover. Only one attacks at a time, never more than four in the air. And Simphiwe's robots have head lamps that glow red the moment they spawn.", gp: [['8:10', '8:30'], ['9:14', '9:24']], diagram: 'drone' },
  { handoff: 'jonaphan-vlog', dur: 3.5, gp: [['9:44', '9:48']], dim: true },
  { who: 'jonaphan', line: 'I did the logs. The story runs on flags. Once a flag is set, the objective banner and the waypoint work themselves out, so any part of the level can move the story on. Everything you read, hear or watch goes through one reader panel: notes, terminals, audio logs, and video logs where we render a live talking head into a corner of the game\'s own canvas.', gp: [['9:44', '10:12'], ['12:28', '12:44']], host: 'vlog' },
  { who: 'jonaphan', line: "What's in those logs, though... you'll have to read them yourself.", black: true, host: 'vlog', scene: 'locked' },
  { handoff: 'tariro-arm', dur: 4.0, gp: [['16:14', '16:20']], dim: true },
  { who: 'tariro', line: "Kessler's room is mine. A robot arm swings through it, and every frame we read its live bone positions and test them as capsules against your body, so it hurts exactly where it touches. To stop it, you beat my fusebox: four rings spinning at different speeds. Stop each one in its target zone, and every lock makes the rest seven percent faster. Have fun.", gp: [['16:12', '16:34'], ['16:42', '17:06']] },
  { handoff: 'naomi-hatch', dur: 3.5, gp: [['19:28', '19:32']], dim: true },
  { who: 'naomi', line: "The hatch: the wheel spins, the dogs pull in, the seal hisses, the lid bangs open, and below is a shaft with a ladder and rings of light. It isn't modelled. A shader works out what you'd see down it from where you stand.", gp: [['19:28', '19:46']], code: { file: 'src/level2/Gates.js', from: 108, to: 124, hl: [[112, 118]] } },
  { who: 'naomi', line: "While you play Level 2, Level 3's files are already downloading in the background, so the way down never waits. When you go, the old level is disposed: geometry, materials, listeners, the lot.", gp: [['19:44', '19:58']] },

  // ---- 5. the story pivot
  { who: 'naomi', title: 'Pivot 3: a reason', line: 'Our first story had a twist and no heart. Voss went through the station because we told him to. So we gave him someone: someone worth going to the bottom of the sea for. Who, and why, we\'re keeping to ourselves.', black: true, scene: 'notepad' },
  { who: 'naomi', line: "Technically, that pivot gave us a photograph prologue, voices levelled to the same loudness as they load, and the lighting starting to act. ARIA's face is a 3D head rendered into a texture, then drawn through our own shader as glowing dots. Her expression, colour and glitching are all uniforms.", split: [{ gp: [['6:46', '7:20']] }, { seq: 'blender/aria-head' }], label: 'IN GAME', labelR: 'aria-head.blend', blenderSplit: true },

  // ---- 6. level 3
  { who: 'naomi', title: 'Level 3: The Drowned Deck', line: "Level 3 starts with a three-hundred-metre slide down a steel pipe: A and D steer, Space ducks, past sparking cables, steam and half-shut shutters. It's built far above the deck, out of sight, as one tube with its own shader lit by its own ring lamps. Once you're through, it's removed.", gp: [['19:58', '20:28']] },
  { who: 'naomi', title: "Pivot 4: 'drowned' means drowned", line: "Level 3's first version was another set of corridors. We rebuilt it flooded.", gp: [['20:30', '20:42']], label: 'NOW · flooded, waist-deep' },
  { who: 'naomi', line: "The water is one flat sheet whose surface is computed per pixel: slow swells, fine chop, and rings wherever Voss wades, up to eight at once, fed in as uniforms. It's murky, more opaque looking across than straight down, and the water line is shared with the walls, so they darken below it and show a tide mark above.", gp: [['20:30', '20:58']], code: { file: 'src/level3/Water.js', from: 28, to: 46, hl: [[31, 32], [39, 40]] } },
  { who: 'naomi', title: 'Pivot 5: we went outside', line: 'Our biggest pivot: the whole game was planned indoors, and it felt too techy. So you suit up, and you go outside.', gp: [['23:40', '23:58']] },
  { who: 'naomi', line: 'Suiting up switches you to third person, so you can see him swim. The suit, the helmet and the rifle are all our own, built from primitives.', gp: [['23:58', '24:30']] },
  { who: 'naomi', line: 'The ocean is a canyon with no end. The skybox is a cube map we paint in code, and the fog matches its horizon colour, so the canyon dissolves into it.', seq: 'blender/l3-outside', blender: 'l3-outside' },
  { who: 'naomi', line: "Marine snow drifts around the camera and wraps in the vertex shader, so there's always some and it costs nothing on the CPU. Some of it is plankton. Swim through it and it flares blue.", gp: [['24:46', '25:04']], code: { file: 'src/level3/SeaScene.js', from: 383, to: 392, hl: [[386, 386], [388, 390]] } },
  { who: 'naomi', line: 'The station\'s windows use interior mapping. We took a 360-degree photo of our own atrium, and for every pixel of glass we trace the line of sight into an invisible round room and look it up in the photo. The room has depth and shifts as you move, for one texture read.', gp: [['24:30', '24:46']], diagram: 'interior', dim: true },
  { who: 'naomi', line: 'The sea life is built in code: schools of fish flocking as instanced meshes, ghost fish whose glowing skeletons are drawn in the shader, jellyfish that actually pulse, and anglerfish that turn to face you.', seq: 'blender/l3-creatures', blender: 'l3-creatures' },
  { who: 'naomi', line: 'Your uplink cable is a simulated rope, points joined by sticks, so it hangs and sways and has a maximum length. Oxygen is the clock. The headlamp is a spotlight with a cone drawn along it, and we turned shadows off in Level 3, because rendering the whole scene a second time was too much for an ordinary laptop.', gp: [['24:46', '25:30']] },
  { who: 'naomi', line: 'And when you go into the ocean, there has to be something in it.', gp: [['26:20', '26:30']] },
  { who: 'naomi', line: "The kraken is based on a CC-BY model by toro ardido. We took it apart in Blender and rebuilt it. It has ten tentacles now, and they move.", seq: 'blender/l3-kraken', blender: 'l3-kraken' },
  { who: 'naomi', line: 'Each tentacle is a curve through seventeen points, worked out every frame from a chain of sixteen links, so waves run down it like an octopus arm. When one reaches for you, the chain is pulled toward you and keeps its length. The points go to the vertex shader in a small texture, so one draw call draws all the arms. Even its jaw hinges in the shader.', gp: [['26:40', '27:04']], code: { file: 'src/level3/Kraken.js', from: 137, to: 150, hl: [[138, 138], [146, 149]] }, diagram: 'tentacle' },
  { who: 'naomi', line: 'It lives in the drowned works, a construction hall in the cliff, generated by a Blender script. Inside is a maze decked with grating, and the kraken hunts you over it: it rattles the deck, lunges at the bars, drives an arm up through the floor, or grabs you until you shoot it free.', seq: 'blender/l3-works', blender: 'l3-works' },
  { who: 'naomi', line: 'In the clearing, it\'s a three-phase boss. Its mouth glows after each blow, and that\'s your target. Sweeps and slams, then boulders and grabs, then it clouds the water with ink and everything gets faster.', gp: [['27:08', '27:40'], ['27:52', '28:04']] },
  { handoff: 'simphiwe-ping', dur: 3.5, gp: [['29:40', '29:46']], dim: true },
  { who: 'simphiwe', line: "Third time's the charm. The relay's network minigame is mine: a five-by-five graph where you're blue and ARIA's AI is red. You capture nodes, and a sonar ping reveals hidden ones, while a scanner called the Warden sweeps every six seconds and hides what you've seen. The AI thinks every second and a half and prefers moves near your core.", black: true, diagram: 'network' },
  { handoff: 'sivu-valves', dur: 3.5, gp: [['28:52', '28:58']], dim: true },
  { who: 'sivu', line: "And the containment door before it is mine: three valves you have to balance, or it won't release.", gp: [['28:52', '29:34']] },
  { who: 'naomi', line: "...and that's as far as we're showing you.", black: true, offscreen: true, pad: 1.0 },

  // ---- 7. under the hood
  { handoff: 'naomi-fps', dur: 4.0, black: true },
  { who: 'naomi', title: 'Under the hood', line: 'A quality monitor watches the frame rate. Under about 45 frames a second, it steps down the resolution, lights and effects. When there\'s room, it steps back up.', gp: [['8:40', '8:56']], code: { file: 'src/core/PerfMonitor.js', from: 1, to: 9, hl: [[3, 7]] } },
  { who: 'naomi', line: 'Meshes that share a material are merged, so a room is a handful of draw calls instead of hundreds.', gp: [['13:10', '13:22']], code: { file: 'src/core/mergeStatic.js', from: 1, to: 6, hl: [[1, 4]] } },
  { who: 'naomi', line: 'Shaders are compiled before you ever see them, the way the game really draws, so nothing hitches the first time it appears. And every light exists before that first compile, because adding a light later recompiles every shader.', gp: [['13:22', '13:40']], code: { file: 'src/core/precompile.js', from: 1, to: 14, hl: [[1, 6]] } },
  { who: 'naomi', line: "Rapier, our physics engine, is most of our code by size, so it loads in the background during Level 1. There's a pause menu with options, a game-over screen where ARIA reacts, and a restart that swaps the level without reloading the page.", gp: [['0:00', '0:10'], ['4:56', '5:06']] },
  { who: 'naomi', line: "And most of our station isn't hand-modelled: it's built by Python scripts in Blender. When the design changed, and it changed a lot, we edited the script and rebuilt instead of starting over. Name prefixes like COL_ and DOOR_ tell the game what each piece is.", seq: 'blender/l2-atrium', blender: 'l2-atrium', scripting: true },
  { handoff: 'jonaphan-walk', dur: 4.0, gp: [['23:10', '23:16']], dim: true },
  { who: 'jonaphan', line: "Voss is mine: walking, crouching, running, swimming, first and third person. Then we took motion-capture clips made for a completely different skeleton and retargeted them onto him in world space, because the two rigs don't even stand the same way. On top of that there's a face rig that moves his mouth to his own recorded voice.", split: [{ gp: [['23:08', '23:30']] }, { seq: 'blender/l2-voss' }], label: 'IN GAME', labelR: 'l2-voss.blend', blenderSplit: true },

  // ---- 8. one shader, properly
  { handoff: 'naomi-blind', dur: 3.0, gp: [['8:04', '8:08']], dim: true },
  { who: 'naomi', title: 'One shader, properly', line: 'If you remember one shader, make it this one. uMask is a small texture: one pixel per square of water. When you spray, the game adds cold to the squares you hit. The shader samples that value, and at zero it draws rippling water; as it rises it blends to frosted, then cracked ice. One uniform texture, driven by gameplay, changing what you see and what you can stand on.', gp: [['8:04', '8:28']], code: { file: 'src/level2/FrostWater.js', from: 21, to: 53, hl: [[22, 22], [35, 35], [37, 41], [44, 47], [49, 53]], walk: true } },

  // ---- 9. outro
  { handoff: 'pile-in', dur: 4.0, black: true },
  { who: 'naomi', line: "That's Halcyon-9. Hand-built models, our own shaders, a systemic AI enemy, a network minigame, and a companion you probably shouldn't trust. All running in a browser on modest hardware.", black: true, scene: 'team' },
  { who: 'naomi', line: 'Built by...', black: true, scene: 'team' },
  { who: 'jonaphan', line: 'Jonaphan.', black: true, scene: 'team', pop: 'jonaphan', min: 1.1 },
  { who: 'tariro', line: 'Tariro.', black: true, scene: 'team', pop: 'tariro', min: 1.1 },
  { who: 'sivu', line: 'Sivu.', black: true, scene: 'team', pop: 'sivu', min: 1.1 },
  { who: 'thabiso', line: 'Thabiso.', black: true, scene: 'team', pop: 'thabiso', min: 1.1 },
  { who: 'simphiwe', line: 'Simphiwe.', black: true, scene: 'team', pop: 'simphiwe', min: 1.1 },
  { who: 'naomi', line: '...and Naomi.', black: true, scene: 'team', pop: 'naomi', min: 1.4 },
  { who: 'everyone', line: "We're Edge Case Runners.", black: true, scene: 'team', min: 2.4 },
  { who: 'naomi', line: "Go play it. And find out what he's looking for.", black: true, scene: 'team', pad: 1.2 },
  { handoff: 'end-card', dur: 5.0, black: true }
];

// each beat's length (s): a handoff's own, or the line at the speaking pace and a breath
export function lengths() {
  return BEATS.map((b) => {
    if (b.handoff) return b.dur;
    const words = b.line.split(/\s+/).length;
    return Math.max(b.min || 0, +(words / WPS + 0.6 + (b.pad || 0)).toFixed(2));
  });
}
