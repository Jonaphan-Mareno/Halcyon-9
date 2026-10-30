# Halcyon-9 devlog: script and shot list (draft 4)

A merge of our draft 2 (the doodles, the pivots, the mystery) and the team's technical draft (level by level, measured numbers, how every system works). **Everyone narrates the part they built**: Naomi opens (it was her dream) and shoves everyone off, then each person gets brought back in with their own doodle gag when it's their turn. Light and chatty, but every section shows **the code**, **the Blender file** or **the old version**. About 15 minutes; trim points are at the end.

## Who speaks when, and how they come in

The speaker's doodle stands in the host corner while they talk. **[HANDOFF]** blocks are the little gag that brings each person in. Each one plays off what that person built, and each is 3 to 5 seconds with a pop or a sound effect.

| # | Speaker | Section | How they come in |
|---|---|---|---|
| 1 | **Naomi** | Cold open, intro, where it started | Shoves everyone off-screen |
| 2 | **Jonaphan** | Week one: the setup | Still clinging to the edge of the frame from the shove; hauls himself back up |
| 3 | **Simphiwe** | The control room, lights, cel shading, waking up | Pops up through a hatch in the floor with a paint roller and rolls colour onto the grey screen |
| 4 | **Thabiso** | The cell: the brick, the glass, the handle | An arm reaches in from off-screen (inverse kinematics), feels around, finds the "handle" and pulls him in |
| 5 | **Naomi** | The scene graph, the level shader, the restyle, the generator | Walks back in with the torch; the screen lights up wherever she points it |
| 6 | **Tariro** | The ring puzzle | Rings spin round the host corner; she stops them all "inside the zone" and steps through |
| 7 | **Sivu** | The keypad, difficulty and permadeath | His legs walk in first; the frame has to tilt up (he's too tall). He types a code: ACCESS GRANTED |
| 8 | **Naomi** | The Level 2 atrium, performance, light as mood | Sivu tries to stay; she freezes him with the hose and he slides out like an ice block |
| 9 | **Simphiwe** | Crew rooms | Rides in on a drone |
| 10 | **Naomi** | The garden freeze, drones | Swats the drone; it falls and shatters |
| 11 | **Jonaphan** | The logs and the reader panel | Appears as a talking head on a video-log screen |
| 12 | **Tariro** | Kessler's room: the arm and the fusebox | The robot arm swings through the corner; she ducks under it, flips the fusebox, and the arm stops |
| 13 | **Naomi** | The hatch, the story pivot, Level 3 to the kraken | Climbs up out of the hatch shaft |
| 14 | **Simphiwe** | The relay network minigame | A sonar ping sweeps the screen and reveals him as a blue node |
| 15 | **Sivu** | The containment valves | Turns three valves; a door slides open with him behind it |
| 16 | **Naomi** | Under the hood: performance, build scripts | Pops back in under a giant FPS counter that shrinks and grows her |
| 17 | **Jonaphan** | Voss: animation and retargeting | Walks in doing Voss's injured walk |
| 18 | **Naomi** | One shader, properly | Pulls the code panel down like a window blind |
| 19 | **Everyone** | Outro | All six pile in at once; Sivu last, tilting the frame again |

**Recording tip:** each person records their own lines on their phone, in a quiet room, with the phone about a hand's width from their mouth. Naomi keeps the intro, the outro and the link sections, so the pace holds.

**If someone would rather not speak:** their doodle still comes in with the gag, and Naomi reads their lines. ("Simphiwe, tell them about the textures." *Simphiwe's doodle holds up a sign:* "no." Naomi: "Fine.")

**Shot tags**

| Tag | What it is |
|---|---|
| `gp 12:34` | A timestamp in `gameplaypart1.mp4` |
| **[BEFORE @abc1234]** | An old commit, checked out and recorded, shown before or after the current version |
| **[BLENDER file.blend]** | A viewport recording, work-in-progress style: wireframe on and off, the outliner and the modifier stack showing |
| **[CODE file:line]** | A code card: the snippet on the left with lines highlighting as they're mentioned, the effect running on the right |
| **[RUBRIC: ...]** | A note for the team only: which marking category the section supports. **Never shown or said in the video.** |

**The brief asks the devlog for:** how we handled lighting and effects, how the gameplay mechanics were designed, and our original innovations. All three run through every level section, and "Under the hood" pulls them together.

**Spoiler rule (keep the mystery):** Voss is a man with no memory, and ARIA wants to be connected to the mainland. There's someone he's doing this for, and the story turned on her. Nothing more. No cycles or backups as story, no "reconstructed consciousness", no crew, no flashback contents, no water lock, confrontation or endings.

**Footage to avoid:** `gp 0:15–1:15`, `gp 10:30–12:20`, `gp 14:00`, `gp 17:45–19:10`, `gp 21:10–22:50`, and everything after `gp 29:45`.

---

## 0. Cold open (0:00 to 0:15)

**[ON SCREEN]** `gp 24:30–25:00`: Voss drops off the platform into open water, with marine snow and ARIA in the corner of the visor. Just the hum.

**NAOMI:** "Three hundred metres under the sea, a research station stopped answering."

Beat.

"...We built it. Hi."

## 1. Meet the team (0:15 to 0:50)

**[ON SCREEN]** Handwritten: *devlog / Halcyon-9*. Pop, pop, pop: the six doodles bounce in with names and arrows. Sivu is too tall; the frame tilts up for him. They huddle; *Edge Case Runners* writes itself above.

**NAOMI:** "This is the devlog for Halcyon-9, a deep-sea survival and puzzle game, built with Three.js, plain JavaScript and Vite, with the Rapier physics engine underneath. We're Edge Case Runners. Yes, the name is also our debugging experience."

**[ON SCREEN]** Naomi's doodle shoves the others off-screen (Sivu needs two shoves; *"hey!"*), pulls a screen in from the edge, drags it to the centre and settles in the corner as host.

**NAOMI:** "This isn't a trailer. It's how it got made: the code, the models, and every time we had to change our minds."

## 2. Where it started (0:50 to 1:45)

**[RUBRIC: Gameplay & Experience]**

**NAOMI:** "The idea started with a dream I had one night. A man wakes up deep under the sea with no memory. The only voice around is the station's AI, ARIA. She's very helpful, and she really wants him to connect her to the mainland. Whether you should... is the game."

**[HANDOFF → Jonaphan]** A hand grips the bottom edge of the frame. Jonaphan's doodle hauls himself back up, panting.

**JONAPHAN:** "You can't push out the guy who made the folder structure."

**[BEFORE @ded168b]** Jonaphan's first commit: a dim grey room with one light.

**JONAPHAN:** "Week one was this. I set up Vite, Three.js and our folder structure, and our first scene was a grey box with one lamp. Moving on."

**[HANDOFF → Simphiwe]** A hatch pops open in the floor of the frame. Simphiwe rises out of it with a paint roller and rolls colour across the grey screen, bumping Jonaphan off.

**[BLENDER controlroom.blend]** Simphiwe's control room: orbit, wireframe toggle, the light objects in the outliner. Then **[BEFORE @591f245]**, **[BEFORE @0c31cac]** ("colour but no light"), **[BEFORE @2f8f2eb]** ("added lights").

**SIMPHIWE:** "I modelled the control room in Blender, and we hit our first wall straight away: lights don't come out of Blender the way you expect. The commit history goes from *colour but no light*... to *punctual lights*... to a room you could finally see."

**[BEFORE @c6620f1]** "Cell shading implemented", wiped against the version before it.

**SIMPHIWE:** "Then cel shading: the light falls off in bands instead of a smooth fade. Our first custom shader."

## 3. Level 1: Reboot (1:45 to 4:45)

**[RUBRIC: Viewing · Controls & Playability · 3D Effects · Shaders]**

### Waking up

**[ON SCREEN]** `gp 1:15`: the screen coming up out of black, blurred, then clear.

**SIMPHIWE:** "Voss wakes up through a blur that clears, like eyes opening. Behind that black screen, the game is quietly building the level, so the intro never stutters."

**SIMPHIWE:** "Level 1 is locked to first person on purpose. We wanted you confined, unable to even see yourself."

### The cell, the brick and the glass

**[HANDOFF → Thabiso]** A doodle arm reaches in from the edge, bending at the elbow (IK!), feels around, grabs Simphiwe's paint roller like a door handle and swaps itself in. Thabiso steps through.

**THABISO:** "Okay. The cell's mine."

**[ON SCREEN]** `gp 1:15–1:45`: the red cell.

**[CODE src/core/Controls.js:102]**, the raycaster, with a diagram: the brick's old position → its new position, a ray between them, the window's box.

**THABISO:** "The cell teaches you three things. Pick up the brick. Throw it. Get out. The throw is our own physics: the brick has velocity and gravity, and every frame we cast a ray from where it was to where it is now. So even a fast throw can't skip through the window between two frames."

**[BLENDER]** The window pane pre-fractured into shards in Blender. Then the shards flying in game.

**THABISO:** "The glass is pre-broken in Blender. On impact we swap the pane for the pieces, and each one flies out from the hit point with its own spin, bounces, loses speed and settles."

**[ON SCREEN]** `gp 1:30`: reaching through the window for the handle.

**THABISO:** "And the way out: Voss reaches through the hole, and his arm is solved with inverse kinematics, so his hand actually lands on the handle. The door hangs from a pivot at its hinge, so it swings like a real door. I also put the music in, so if a moment gives you chills... you're welcome."

### The scene graph

**[HANDOFF → Naomi]** Naomi walks back in with a torch. The dark screen lights up wherever she points it; she points it at Thabiso, who squints and backs out.

**[ON SCREEN]** A diagram drawn on: *scene → player → head → camera → torch*.

**NAOMI:** "Here's our hierarchy. The camera is a child of Voss's head, and the torch is a child of the camera. Look anywhere and the light comes with you, for free. The door is a child of its hinge pivot, so opening it is one rotation."

### The level shader

**[CODE src/graphics/Shaders.js:110 and :330–336]**: `uniform float uPower`, and the strip that stutters until power is restored.

**NAOMI:** "Level 1 is drawn with one shader we wrote. The game feeds it a single number: power. At zero the station is dead, with a few LED strips stuttering. At one, everything is steady. Fixing the generator literally turns up a uniform."

**[CODE src/graphics/Shaders.js:325–327]**: the cyan rim.

**NAOMI:** "It has a fixed number of light slots, so the room's lights, the cell light and the torch all fit. Textures are made procedurally from world position, projected along each axis, so our models don't even need UV maps. There's an ACES filmic colour curve, and a faint cyan rim on everything. That's our signature. Look for it."

### Pivot 1: "it looks like a game, not a place"

**[BEFORE @dc7e57a]** vs **[BEFORE @ed2bfd7]**: a wipe between the old control room and the habitat restyle.

**NAOMI:** "Our first pivot was the look. The rooms felt like game rooms. So Level 1 got restyled to match the habitat we'd built for Level 2: navy lower walls, an orange stripe, light from above *and* below."

**[BEFORE @eeadcb2]**: the floor with parallax off, then on.

**[CODE src/graphics/parallax.js]**

**NAOMI:** "And the floors got parallax occlusion mapping. The shader steps through a height map per pixel, so flat tiles look deep, with no extra triangles. Textures doing more than colour."

### The puzzles

**[ON SCREEN]** `gp 3:30–3:50`: the generator wire tiles.

**[CODE src/puzzles/CircuitPuzzle.js:251]**: `_carvePaths()`.

**NAOMI:** "The generator puzzle is never the same twice. We carve a random path from the battery to each lamp, so it's always solvable, then fill the rest with decoys and live fuses that zap you. Run out of time and the room blacks out."

**[ON SCREEN]** `gp 2:00` and `gp 4:00`: Tariro's ring puzzle, then the relay rings lighting up.

**[HANDOFF → Tariro]** Three doodle rings start spinning round the host corner, knocking Naomi off. Tariro stops each one with a click, *in the zone*, and steps through the middle.

**TARIRO:** "I built the ring puzzle, and I wired the flow so ARIA only switches on once you've earned it. Then come the three linked relay rings: turn one and another turns with it."

**[HANDOFF → Sivu]** Two very long doodle legs walk into frame. The frame tilts up... and up... to find Sivu's head. He taps a keypad floating beside him: *ACCESS GRANTED*. Tariro gets politely stepped over.

**[ON SCREEN]** `gp 4:30–4:45`: the keypad, ACCESS GRANTED.

**SIVU:** "The keypad and the lift doors are mine: real button logic, a zoomed keypad view, doors that slide. Wrong code? ARIA sends you off to find the maintenance tag."

**[ON SCREEN]** `gp 0:00`: the difficulty picker.

**[RUBRIC: Polish]**

**SIVU:** "I also made the game harder. You're welcome. Four difficulty presets change how much damage you take and how long puzzles give you. And then there's 'Last backup': double damage, forty percent less puzzle time, two lives. And it's permadeath. Lose them and you're back at the title."

**[ON SCREEN]** `gp 4:45`: the objective banner and the marker with its edge arrow.

**NAOMI:** "And you're never lost: an objective banner, a marker on the exact thing, and an arrow on the edge of the screen when it's out of view."

## 4. Level 2: The Habitat Atrium (4:45 to 8:15)

**[RUBRIC: 3D Effects · Shaders · Gameplay & Experience · Polish]**

**[HANDOFF → Naomi]** Sivu leans in to keep talking. Naomi sprays him with a doodle hose; he frosts over, tips, and slides out of frame like an ice block.

**[BLENDER l2-atrium.blend]** The atrium in the viewport: wireframe, the outliner with `COL_`, `DOOR_`, `SPAWN_` objects. Then `gp 7:45–8:00` in game.

**NAOMI:** "Level 2 is our biggest environment: a huge round hall with a garden, three floors of catwalks and a window onto the ocean."

### Pivot 2: it ran at twelve frames a second

**[BEFORE @cceb20c]**: the first atrium with six reactor lights, an FPS counter in the corner.

**NAOMI:** "And our second pivot: the first version looked amazing... at twelve frames a second on an ordinary laptop. We wanted it smooth on everyday Intel graphics, like the UHD 620, so we started measuring everything."

**[ON SCREEN]** An animated table:

| What | Before | After |
|---|---|---|
| Atrium model | ~12 MB | ~3 MB (Draco) |
| Anti-aliasing | 4× MSAA ≈ 9 ms | FXAA ≈ 1 ms |
| Plants | full PBR ≈ 5 ms | Lambert |
| Lights | 6 | 2 |
| Bloom | always | dropped on slow machines |

**[CODE src/core/loaders.js]** (the Draco decoder)

**NAOMI:** "The model is Draco-compressed, twelve megabytes down to about three. Four-times anti-aliasing cost nine milliseconds a frame, so we switched to FXAA at about one. Physically-based plants cost five milliseconds, so they're Lambert now. Every number came from measuring, not guessing."

### Light as mood

**[BEFORE @0c38285]** vs now. `gp 19:15`: the room flushing red.

**NAOMI:** "The atrium is damaged: a few lamps make soft pools of light, some areas are dead, and when the garden's pumps restart, the light comes back. One shared mood system drives this across the whole game. It dims lights, makes them stutter like failing power, and pushes everything to red when an alarm goes off... or when ARIA snaps."

**[ON SCREEN]** Close on glass in the atrium, at an angle and face-on.

**NAOMI:** "The glass is dark and one-sided: clear face-on and nearly solid at the edges. That's the Fresnel effect, in our shader."

### The crew rooms

**[HANDOFF → Simphiwe]** A doodle drone buzzes in with Simphiwe riding it like a scooter.

**[BLENDER bedroom.blend]** Simphiwe's bedrooms: the material slots, the metal-plate textures in the shader editor.

**[BEFORE @06b7716]** "initial bedroom design" → **[BEFORE @f6a4d88]** "Textures look more like a cell".

**SIMPHIWE:** "I built the crew rooms, and you can read the struggle in my commits: *'textures added but can't get colour right'*... *'whole room doesn't have texture'*... and finally, *'textures look more like a cell'*. Which, here, is a compliment."

### The garden fight

**[HANDOFF → Naomi]** Naomi swats Simphiwe's drone. It sparks, freezes, drops and shatters. Simphiwe hangs in the air for a second, cartoon-style, then falls.

**[ON SCREEN]** `gp 7:45–8:30`: the pipe spraying, drones sparking, freezing, falling and shattering.

**NAOMI:** "Level 2's new idea is a tool. Pull a pipe off the irrigation line and spray. Wet drones spark, and that means ARIA can freeze them: hold Q, they freeze, fall and shatter into a particle burst of ice."

**[CODE src/level2/FrostWater.js:22 and :35]**: `uniform sampler2D uMask`, `float f = texture2D(uMask, vUv).r`.

**NAOMI:** "The water you can freeze is a grid of cells in a tiny texture. The game writes how cold each cell is; the shader reads it and mixes rippling water into cracked ice, cell by cell. Deep water becomes a slab you can stand on, and a wet ramp becomes a slide."

**[ON SCREEN]** `gp 9:15`: Simphiwe's drones and robots.

**SIMPHIWE** (from off-screen, still on the floor): "I made those drones, by the way."

**NAOMI:** "Each drone is a small state machine: drop from the ceiling, circle at head height, a one-second warning as its eye turns red, dive, recover. Only one attacks at a time, never more than four in the air. And Simphiwe's robots have head lamps that glow red the moment they spawn."

### Upstairs

**[HANDOFF → Jonaphan]** A doodled handheld screen slides into the corner. Jonaphan's face is on it as a little video log, scanlines and all.

**[ON SCREEN]** `gp 9:45–10:15`, `gp 12:30–13:00`: the crew quarters and the reader panel (no text readable).

**JONAPHAN:** "I did the logs. The story runs on flags. Once a flag is set, the objective banner and the waypoint work themselves out, so any part of the level can move the story on. Everything you read, hear or watch goes through one reader panel: notes, terminals, audio logs, and video logs where we render a live talking head into a corner of the game's own canvas."

**JONAPHAN:** "What's *in* those logs, though... you'll have to read them yourself."

### Kessler's room

**[ON SCREEN]** `gp 15:00–17:30`: the robot arm, the fusebox, the timing rings.

**[HANDOFF → Tariro]** A doodle robot arm swings through the corner and knocks the video-log screen away. Tariro ducks under the next swing, flips a fusebox, and the arm freezes mid-air.

**TARIRO:** "Kessler's room is mine. A robot arm swings through it, and every frame we read its live bone positions and test them as capsules against your body, so it hurts exactly where it touches. To stop it, you beat my fusebox: four rings spinning at different speeds. Stop each one in its target zone, and every lock makes the rest seven percent faster. Have fun."

### The hatch

**[HANDOFF → Naomi]** A round hatch opens in the floor under Tariro; she drops through it. Naomi climbs up out of it.

**[ON SCREEN]** `gp 19:30–19:45`: the hatch wheel spinning, the lid swinging up onto the lit shaft.

**[CODE src/level2/Gates.js]**: the shaft shader.

**NAOMI:** "The hatch: the wheel spins, the dogs pull in, the seal hisses, the lid bangs open, and below is a shaft with a ladder and rings of light. It isn't modelled. A shader works out what you'd see down it from where you stand."

**NAOMI:** "While you play Level 2, Level 3's files are already downloading in the background, so the way down never waits. When you go, the old level is disposed: geometry, materials, listeners, the lot."

## 5. Pivot 3: the story needed a reason (8:15 to 9:00)

**[RUBRIC: Gameplay & Experience (a coherent storyline)]**

**[ON SCREEN]** Doodle-Naomi with a notepad: *VERSION 1*. It gets a big question mark, then is torn out. The next page: a doodled heart with a question mark.

**NAOMI:** "Our first story had a twist and no heart. Voss went through the station because we told him to. So we gave him someone: someone worth going to the bottom of the sea for. Who, and why, we're keeping to ourselves."

**[ON SCREEN]** One Polaroid dropping and developing, cut before it's readable. ARIA's dot face at `gp 6:45`.

**NAOMI:** "Technically, that pivot gave us a photograph prologue, voices levelled to the same loudness as they load, and the lighting starting to *act*. ARIA's face is a 3D head rendered into a texture, then drawn through our own shader as glowing dots. Her expression, colour and glitching are all uniforms."

**[BLENDER aria-head.blend]** The shape keys sliding: smile, brows, lids.

## 6. Level 3: The Drowned Deck (9:00 to 12:45)

**[RUBRIC: 3D Effects · Shaders · Innovation · Viewing]**

### The chute

**[ON SCREEN]** `gp 20:00–20:30`.

**NAOMI:** "Level 3 starts with a three-hundred-metre slide down a steel pipe: A and D steer, Space ducks, past sparking cables, steam and half-shut shutters. It's built far above the deck, out of sight, as one tube with its own shader lit by its own ring lamps. Once you're through, it's removed."

### Pivot 4: 'drowned' had to mean drowned

**[BEFORE @16c1e01]**: the first, dry, indoor Level 3 (the engine-room deck), then `gp 20:30–21:00`.

**NAOMI:** "Level 3's first version was another set of corridors. We rebuilt it flooded."

**[CODE src/level3/Water.js]**

**NAOMI:** "The water is one flat sheet whose surface is computed per pixel: slow swells, fine chop, and rings wherever Voss wades, up to eight at once, fed in as uniforms. It's murky, more opaque looking across than straight down, and the water line is shared with the walls, so they darken below it and show a tide mark above."

### Pivot 5: we went outside

**[ON SCREEN]** `gp 23:30–24:30`: the suit, third person, out on the platform.

**NAOMI:** "Our biggest pivot: the whole game was planned indoors, and it felt too techy. So you suit up, and you go outside."

**NAOMI:** "Suiting up switches you to third person, so you can see him swim. The suit, the helmet and the rifle are all our own, built from primitives."

**[BLENDER l3-outside.blend]** The canyon, the station hull and cliffs, flown over in wireframe.

**NAOMI:** "The ocean is a canyon with no end. The skybox is a cube map we paint in code, and the fog matches its horizon colour, so the canyon dissolves into it."

**[CODE src/level3/SeaScene.js]**: the marine-snow vertex shader.

**NAOMI:** "Marine snow drifts around the camera and wraps in the vertex shader, so there's always some and it costs nothing on the CPU. Some of it is plankton. Swim through it and it flares blue."

**[CODE src/level3/SeaScene.js:55]**: interior mapping.

**NAOMI:** "The station's windows use interior mapping. We took a 360-degree photo of our own atrium, and for every pixel of glass we trace the line of sight into an invisible round room and look it up in the photo. The room has depth and shifts as you move, for one texture read."

**[BLENDER l3-creatures.blend]** The anglerfish, gulper eel and jellyfish. **[CODE src/level3/SeaLife.js]** (`InstancedMesh`)

**NAOMI:** "The sea life is built in code: schools of fish flocking as instanced meshes, ghost fish whose glowing skeletons are drawn in the shader, jellyfish that actually pulse, and anglerfish that turn to face you."

**[ON SCREEN]** `gp 24:45–25:30`: swimming, the cable paying out.

**NAOMI:** "Your uplink cable is a simulated rope, points joined by sticks, so it hangs and sways and has a maximum length. Oxygen is the clock. The headlamp is a spotlight with a cone drawn along it, and we turned shadows off in Level 3, because rendering the whole scene a second time was too much for an ordinary laptop."

### The kraken

**[BLENDER l3-kraken.blend]** The original CC-BY model (credited) with four straight tentacles, then cut into body, arm and tentacle.

**NAOMI:** "And when you go into the ocean, there has to be something in it."

**NAOMI:** "The kraken is based on a CC-BY model by toro ardido. We took it apart in Blender and rebuilt it. It has ten tentacles now, and they move."

**[CODE src/level3/Kraken.js:138 and :245]**: `uniform sampler2D uCtrl` and the `DataTexture`. Beside it, a diagram: 16 links → a 17-point curve → a texture row → the vertex shader bends the arm along it.

**NAOMI:** "Each tentacle is a curve through seventeen points, worked out every frame from a chain of sixteen links, so waves run down it like an octopus arm. When one reaches for you, the chain is pulled toward you and keeps its length. The points go to the vertex shader in a small texture, so one draw call draws all the arms. Even its jaw hinges in the shader."

**[BLENDER l3-works.blend]** The drowned works built by script. Then `gp 26:15–28:00`.

**NAOMI:** "It lives in the drowned works, a construction hall in the cliff, generated by a Blender script. Inside is a maze decked with grating, and the kraken hunts you over it: it rattles the deck, lunges at the bars, drives an arm up through the floor, or grabs you until you shoot it free."

**NAOMI:** "In the clearing, it's a three-phase boss. Its mouth glows after each blow, and that's your target. Sweeps and slams, then boulders and grabs, then it clouds the water with ink and everything gets faster."

### The relay

**[ON SCREEN]** `gp 28:45–29:45`: the network minigame (if recorded), then Sivu's three valves, *pressure balanced*.

**[HANDOFF → Simphiwe]** A sonar ping ripples across the screen. Where it passes, a blue node lights up... and it's Simphiwe.

**SIMPHIWE:** "Third time's the charm. The relay's network minigame is mine: a five-by-five graph where you're blue and ARIA's AI is red. You capture nodes, and a sonar ping reveals hidden ones, while a scanner called the Warden sweeps every six seconds and hides what you've seen. The AI thinks every second and a half and prefers moves near your core."

**[HANDOFF → Sivu]** Three doodle valves turn by themselves. A door in the corner slides open, and Sivu is standing behind it, ducking slightly.

**SIVU:** "And the containment door before it is mine: three valves you have to balance, or it won't release."

**[ON SCREEN]** Cut to black on `gp 29:45`.

**NAOMI** (off-screen): "...and that's as far as we're showing you."

## 7. Under the hood (12:45 to 14:00)

**[RUBRIC: Polish · Innovation (efficiency)]**

**[HANDOFF → Naomi]** Naomi pops back in under a giant FPS counter. It drops to "45" and she shrinks a little; it climbs back up and she grows again.

**[CODE src/core/PerfMonitor.js:4]**: the quality ladder. Show the counter (F3) stepping down and back up.

**NAOMI:** "A quality monitor watches the frame rate. Under about 45 frames a second, it steps down the resolution, lights and effects. When there's room, it steps back up."

**[CODE src/core/mergeStatic.js]**: the draw-call count before and after.

**NAOMI:** "Meshes that share a material are merged, so a room is a handful of draw calls instead of hundreds."

**[CODE src/core/precompile.js]**

**NAOMI:** "Shaders are compiled before you ever see them, the way the game really draws, so nothing hitches the first time it appears. And every light exists before that first compile, because adding a light later recompiles *every* shader."

**[ON SCREEN]** The pause menu → restart, with no page reload. The game-over screen with ARIA's reaction.

**NAOMI:** "Rapier, our physics engine, is most of our code by size, so it loads in the background during Level 1. There's a pause menu with options, a game-over screen where ARIA reacts, and a restart that swaps the level without reloading the page."

**[BLENDER]** The Scripting tab: run `build_l2_atrium.py`, and the room builds itself.

**NAOMI:** "And most of our station isn't hand-modelled: it's built by Python scripts in Blender. When the design changed, and it changed a lot, we edited the script and rebuilt instead of starting over. Name prefixes like `COL_` and `DOOR_` tell the game what each piece is."

**[ON SCREEN]** `gp 23:15`: third-person Voss walking. **[BLENDER l2-voss.blend]** with the armature.

**[HANDOFF → Jonaphan]** Jonaphan limps in doing Voss's injured walk, dead serious, then stops and bows.

**JONAPHAN:** "Voss is mine: walking, crouching, running, swimming, first and third person. Then we took motion-capture clips made for a completely different skeleton and retargeted them onto him in world space, because the two rigs don't even stand the same way. On top of that there's a face rig that moves his mouth to his own recorded voice."

## 8. One shader, properly (14:00 to 14:40)

**[RUBRIC: Shaders (*"you must be able to explain your shader code"*)]**

**[HANDOFF → Naomi]** Naomi pulls the code panel down from the top of the frame like a window blind, and it bonks Jonaphan off.

**[CODE src/level2/FrostWater.js]**: the whole fragment shader, highlighted line by line, with the pool freezing on the right.

**NAOMI:** "If you remember one shader, make it this one. `uMask` is a small texture: one pixel per square of water. When you spray, the game adds cold to the squares you hit. The shader samples that value, and at zero it draws rippling water; as it rises it blends to frosted, then cracked ice. One uniform texture, driven by gameplay, changing what you see and what you can stand on."

**(TEAM: confirm this is the shader you'll all explain in the demo.)**

## 9. Outro (14:40 to 15:10)

**[ON SCREEN]** All six pile into the frame at once. Sivu comes in last, and the frame tilts up again. Everyone waves.

**NAOMI:** "That's Halcyon-9. Hand-built models, our own shaders, a systemic AI enemy, a network minigame, and a companion you probably shouldn't trust. All running in a browser on modest hardware."

**NAOMI:** "Built by..."

**[ON SCREEN]** Each doodle pops up a size as they say their own name.

**EACH, IN TURN:** "Jonaphan." "Tariro." "Sivu." "Thabiso." "Simphiwe." "...and Naomi."

**EVERYONE:** "We're Edge Case Runners."

Beat.

**NAOMI:** "Go play it. And find out what he's looking for."

**[ON SCREEN]** Black. Handwritten: *Halcyon-9, by Edge Case Runners.*

---

## Who built what (from the git history and the team draft: please check)

- **Naomi:** Level 2's atrium and lab, Level 3 (the deck, chute, ocean, sea life and kraken), ARIA's face, parallax floors, the mood lighting, performance and automatic quality.
- **Jonaphan:** the project setup and first room; Voss (the character, movement, swimming, first and third person, retargeting); the logs, intro, flashbacks and cutscenes.
- **Simphiwe:** the control room in Blender, lights and cel shading, the crew bedrooms and textures, the drones and robots, the relay network minigame (the Warden).
- **Sivu:** the keypad and lift doors, difficulty and permadeath, the containment pressure-seal puzzle.
- **Tariro:** the ring puzzle and Level 1's flow, Kessler's robot arm and fusebox minigame.
- **Thabiso:** the escape from the cell (the handle reach), the level music.

## Production list

- **Old versions to record** (I check out each commit and record the same spot): `ded168b`, `591f245`, `0c31cac`, `2f8f2eb`, `c6620f1`, `dc7e57a`, `ed2bfd7`, `eeadcb2`, `cceb20c`, `19cec77`, `0c38285`, `06b7716`, `f6a4d88`, `16c1e01`.
- **Blender viewport recordings:** `controlroom`, `bedroom`, `aria-head`, `l2-atrium`, `l2-voss`, `l3-outside`, `l3-creatures`, `l3-kraken`, `l3-works`, and the build-script run.
- **Code cards:** every **[CODE]** above, rendered as a dark code panel with line highlights.
- **Not in your recording:** the relay network minigame (`gp 29:45` cuts to the terminal). Record 20 seconds of it if you want it shown.

## If it's too long

Trim in this order:
1. The sea life paragraph
2. "Upstairs"
3. The crew-rooms texture story
4. The kraken maze details

Never cut sections 3, 4, 6, 7 or 8: they carry the brief's three required topics.
