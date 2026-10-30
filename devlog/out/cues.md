# Devlog cues: every line with its time in the video

Play `halcyon9-devlog-prompter.mp4` and read your lines when your name comes up (they are also on screen). Times are minutes:seconds.

**Recording:** one file per line, named as in the table (your first name in lower case, a dash, the line number: `sivu-03.mp3`). Any format is fine (mp3, m4a or wav from a phone). Record somewhere quiet, with the phone about a hand away from your mouth, and leave a second of silence before and after the line. Say the line at the pace of the video: the words turn white as you should say them, and the bar fills as its time runs out.

**"Everyone" lines** (the outro): each of you records it on your own, named `everyone-<your name>.mp3`; they are layered together.

## NAOMI

| File name | Time | Line |
|---|---|---|
| `naomi-01.mp3` | 00:00 | Three hundred metres under the sea, a research station stopped answering. |
| `naomi-02.mp3` | 00:05 | ...We built it. Hi. |
| `naomi-03.mp3` | 00:16 | This is the devlog for Halcyon-9, a deep-sea survival and puzzle game, built with Three.js, plain JavaScript and Vite, with the Rapier physics engine underneath. We're Edge Case Runners. Yes, the name is also our debugging experience. |
| `naomi-04.mp3` | 00:37 | This isn't a trailer. It's how it got made: the code, the models, and every time we had to change our minds. |
| `naomi-05.mp3` | 00:45 | The idea started with a dream I had one night. A man wakes up deep under the sea with no memory. The only voice around is the station's AI, ARIA. She's very helpful, and she really wants him to connect her to the mainland. Whether you should... is the game. |
| `naomi-06.mp3` | 03:11 | Here's our hierarchy. The camera is a child of Voss's head, and the torch is a child of the camera. Look anywhere and the light comes with you, for free. The door is a child of its hinge pivot, so opening it is one rotation. |
| `naomi-07.mp3` | 03:27 | Level 1 is drawn with one shader we wrote. The game feeds it a single number: power. At zero the station is dead, with a few LED strips stuttering. At one, everything is steady. Fixing the generator literally turns up a uniform. |
| `naomi-08.mp3` | 03:43 | It has a fixed number of light slots, so the room's lights, the cell light and the torch all fit. Textures are made procedurally from world position, projected along each axis, so our models don't even need UV maps. There's an ACES filmic colour curve, and a faint cyan rim on everything. That's our signature. Look for it. |
| `naomi-09.mp3` | 04:04 | Our first pivot was the look. The rooms felt like game rooms. So Level 1 got restyled to match the habitat we'd built for Level 2: navy lower walls, an orange stripe, light from above and below. |
| `naomi-10.mp3` | 04:18 | And the floors got parallax occlusion mapping. The shader steps through a height map per pixel, so flat tiles look deep, with no extra triangles. Textures doing more than colour. |
| `naomi-11.mp3` | 04:29 | The generator puzzle is never the same twice. We carve a random path from the battery to each lamp, so it's always solvable, then fill the rest with decoys and live fuses that zap you. Run out of time and the room blacks out. |
| `naomi-12.mp3` | 05:35 | And you're never lost: an objective banner, a marker on the exact thing, and an arrow on the edge of the screen when it's out of view. |
| `naomi-13.mp3` | 05:50 | Level 2 is our biggest environment: a huge round hall with a garden, three floors of catwalks and a window onto the ocean. |
| `naomi-14.mp3` | 05:58 | And our second pivot: the first version looked amazing... at twelve frames a second on an ordinary laptop. We wanted it smooth on everyday Intel graphics, like the UHD 620, so we started measuring everything. |
| `naomi-15.mp3` | 06:11 | The model is Draco-compressed, twelve megabytes down to about three. Four-times anti-aliasing cost nine milliseconds a frame, so we switched to FXAA at about one. Physically-based plants cost five milliseconds, so they're Lambert now. Every number came from measuring, not guessing. |
| `naomi-16.mp3` | 06:27 | The atrium is damaged: a few lamps make soft pools of light, some areas are dead, and when the garden's pumps restart, the light comes back. One shared mood system drives this across the whole game. It dims lights, makes them stutter like failing power, and pushes everything to red when an alarm goes off... or when ARIA snaps. |
| `naomi-17.mp3` | 06:48 | The glass is dark and one-sided: clear face-on and nearly solid at the edges. That's the Fresnel effect, in our shader. |
| `naomi-18.mp3` | 07:18 | Level 2's new idea is a tool. Pull a pipe off the irrigation line and spray. Wet drones spark, and that means ARIA can freeze them: hold Q, they freeze, fall and shatter into a particle burst of ice. |
| `naomi-19.mp3` | 07:33 | The water you can freeze is a grid of cells in a tiny texture. The game writes how cold each cell is; the shader reads it and mixes rippling water into cracked ice, cell by cell. Deep water becomes a slab you can stand on, and a wet ramp becomes a slide. |
| `naomi-20.mp3` | 07:55 | Each drone is a small state machine: drop from the ceiling, circle at head height, a one-second warning as its eye turns red, dive, recover. Only one attacks at a time, never more than four in the air. And Simphiwe's robots have head lamps that glow red the moment they spawn. |
| `naomi-21.mp3` | 09:17 | The hatch: the wheel spins, the dogs pull in, the seal hisses, the lid bangs open, and below is a shaft with a ladder and rings of light. It isn't modelled. A shader works out what you'd see down it from where you stand. |
| `naomi-22.mp3` | 09:34 | While you play Level 2, Level 3's files are already downloading in the background, so the way down never waits. When you go, the old level is disposed: geometry, materials, listeners, the lot. |
| `naomi-23.mp3` | 09:46 | Our first story had a twist and no heart. Voss went through the station because we told him to. So we gave him someone: someone worth going to the bottom of the sea for. Who, and why, we're keeping to ourselves. |
| `naomi-24.mp3` | 10:01 | Technically, that pivot gave us a photograph prologue, voices levelled to the same loudness as they load, and the lighting starting to act. ARIA's face is a 3D head rendered into a texture, then drawn through our own shader as glowing dots. Her expression, colour and glitching are all uniforms. |
| `naomi-25.mp3` | 10:20 | Level 3 starts with a three-hundred-metre slide down a steel pipe: A and D steer, Space ducks, past sparking cables, steam and half-shut shutters. It's built far above the deck, out of sight, as one tube with its own shader lit by its own ring lamps. Once you're through, it's removed. |
| `naomi-26.mp3` | 10:39 | Level 3's first version was another set of corridors. We rebuilt it flooded. |
| `naomi-27.mp3` | 10:44 | The water is one flat sheet whose surface is computed per pixel: slow swells, fine chop, and rings wherever Voss wades, up to eight at once, fed in as uniforms. It's murky, more opaque looking across than straight down, and the water line is shared with the walls, so they darken below it and show a tide mark above. |
| `naomi-28.mp3` | 11:06 | Our biggest pivot: the whole game was planned indoors, and it felt too techy. So you suit up, and you go outside. |
| `naomi-29.mp3` | 11:14 | Suiting up switches you to third person, so you can see him swim. The suit, the helmet and the rifle are all our own, built from primitives. |
| `naomi-30.mp3` | 11:24 | The ocean is a canyon with no end. The skybox is a cube map we paint in code, and the fog matches its horizon colour, so the canyon dissolves into it. |
| `naomi-31.mp3` | 11:36 | Marine snow drifts around the camera and wraps in the vertex shader, so there's always some and it costs nothing on the CPU. Some of it is plankton. Swim through it and it flares blue. |
| `naomi-32.mp3` | 11:49 | The station's windows use interior mapping. We took a 360-degree photo of our own atrium, and for every pixel of glass we trace the line of sight into an invisible round room and look it up in the photo. The room has depth and shifts as you move, for one texture read. |
| `naomi-33.mp3` | 12:08 | The sea life is built in code: schools of fish flocking as instanced meshes, ghost fish whose glowing skeletons are drawn in the shader, jellyfish that actually pulse, and anglerfish that turn to face you. |
| `naomi-34.mp3` | 12:21 | Your uplink cable is a simulated rope, points joined by sticks, so it hangs and sways and has a maximum length. Oxygen is the clock. The headlamp is a spotlight with a cone drawn along it, and we turned shadows off in Level 3, because rendering the whole scene a second time was too much for an ordinary laptop. |
| `naomi-35.mp3` | 12:43 | And when you go into the ocean, there has to be something in it. |
| `naomi-36.mp3` | 12:49 | The kraken is based on a CC-BY model by toro ardido. We took it apart in Blender and rebuilt it. It has ten tentacles now, and they move. |
| `naomi-37.mp3` | 12:59 | Each tentacle is a curve through seventeen points, worked out every frame from a chain of sixteen links, so waves run down it like an octopus arm. When one reaches for you, the chain is pulled toward you and keeps its length. The points go to the vertex shader in a small texture, so one draw call draws all the arms. Even its jaw hinges in the shader. |
| `naomi-38.mp3` | 13:24 | It lives in the drowned works, a construction hall in the cliff, generated by a Blender script. Inside is a maze decked with grating, and the kraken hunts you over it: it rattles the deck, lunges at the bars, drives an arm up through the floor, or grabs you until you shoot it free. |
| `naomi-39.mp3` | 13:44 | In the clearing, it's a three-phase boss. Its mouth glows after each blow, and that's your target. Sweeps and slams, then boulders and grabs, then it clouds the water with ink and everything gets faster. |
| `naomi-40.mp3` | 14:33 | ...and that's as far as we're showing you. |
| `naomi-41.mp3` | 14:42 | A quality monitor watches the frame rate. Under about 45 frames a second, it steps down the resolution, lights and effects. When there's room, it steps back up. |
| `naomi-42.mp3` | 14:52 | Meshes that share a material are merged, so a room is a handful of draw calls instead of hundreds. |
| `naomi-43.mp3` | 15:00 | Shaders are compiled before you ever see them, the way the game really draws, so nothing hitches the first time it appears. And every light exists before that first compile, because adding a light later recompiles every shader. |
| `naomi-44.mp3` | 15:14 | Rapier, our physics engine, is most of our code by size, so it loads in the background during Level 1. There's a pause menu with options, a game-over screen where ARIA reacts, and a restart that swaps the level without reloading the page. |
| `naomi-45.mp3` | 15:30 | And most of our station isn't hand-modelled: it's built by Python scripts in Blender. When the design changed, and it changed a lot, we edited the script and rebuilt instead of starting over. Name prefixes like COL_ and DOOR_ tell the game what each piece is. |
| `naomi-46.mp3` | 16:15 | If you remember one shader, make it this one. uMask is a small texture: one pixel per square of water. When you spray, the game adds cold to the squares you hit. The shader samples that value, and at zero it draws rippling water; as it rises it blends to frosted, then cracked ice. One uniform texture, driven by gameplay, changing what you see and what you can stand on. |
| `naomi-47.mp3` | 16:44 | That's Halcyon-9. Hand-built models, our own shaders, a systemic AI enemy, a network minigame, and a companion you probably shouldn't trust. All running in a browser on modest hardware. |
| `naomi-48.mp3` | 16:55 | Built by... |
| `naomi-49.mp3` | 17:02 | ...and Naomi. |
| `naomi-50.mp3` | 17:06 | Go play it. And find out what he's looking for. |

## JONAPHAN

| File name | Time | Line |
|---|---|---|
| `jonaphan-01.mp3` | 01:08 | You can't push out the guy who made the folder structure. |
| `jonaphan-02.mp3` | 01:12 | Week one was this. I set up Vite, Three.js and our folder structure, and our first scene was a grey box with one lamp. Moving on. |
| `jonaphan-03.mp3` | 08:17 | I did the logs. The story runs on flags. Once a flag is set, the objective banner and the waypoint work themselves out, so any part of the level can move the story on. Everything you read, hear or watch goes through one reader panel: notes, terminals, audio logs, and video logs where we render a live talking head into a corner of the game's own canvas. |
| `jonaphan-04.mp3` | 08:42 | What's in those logs, though... you'll have to read them yourself. |
| `jonaphan-05.mp3` | 15:51 | Voss is mine: walking, crouching, running, swimming, first and third person. Then we took motion-capture clips made for a completely different skeleton and retargeted them onto him in world space, because the two rigs don't even stand the same way. On top of that there's a face rig that moves his mouth to his own recorded voice. |
| `jonaphan-06.mp3` | 16:57 | Jonaphan. |

## SIMPHIWE

| File name | Time | Line |
|---|---|---|
| `simphiwe-01.mp3` | 01:27 | I modelled the control room in Blender, and we hit our first wall straight away: |
| `simphiwe-02.mp3` | 01:33 | lights don't come out of Blender the way you expect. The commit history goes from colour but no light... to punctual lights... to a room you could finally see. |
| `simphiwe-03.mp3` | 01:44 | Then cel shading: the light falls off in bands instead of a smooth fade. Our first custom shader. |
| `simphiwe-04.mp3` | 01:51 | Voss wakes up through a blur that clears, like eyes opening. Behind that black screen, the game is quietly building the level, so the intro never stutters. |
| `simphiwe-05.mp3` | 02:01 | Level 1 is locked to first person on purpose. We wanted you confined, unable to even see yourself. |
| `simphiwe-06.mp3` | 07:00 | I built the crew rooms, and you can read the struggle in my commits: 'textures added but can't get colour right'... 'whole room doesn't have texture'... and finally, 'textures look more like a cell'. Which, here, is a compliment. |
| `simphiwe-07.mp3` | 07:52 | I made those drones, by the way. |
| `simphiwe-08.mp3` | 14:01 | Third time's the charm. The relay's network minigame is mine: a five-by-five graph where you're blue and ARIA's AI is red. You capture nodes, and a sonar ping reveals hidden ones, while a scanner called the Warden sweeps every six seconds and hides what you've seen. The AI thinks every second and a half and prefers moves near your core. |
| `simphiwe-09.mp3` | 17:01 | Simphiwe. |

## THABISO

| File name | Time | Line |
|---|---|---|
| `thabiso-01.mp3` | 02:12 | Okay. The cell's mine. |
| `thabiso-02.mp3` | 02:14 | The cell teaches you three things. Pick up the brick. Throw it. Get out. The throw is our own physics: the brick has velocity and gravity, and every frame we cast a ray from where it was to where it is now. So even a fast throw can't skip through the window between two frames. |
| `thabiso-03.mp3` | 02:34 | The glass is pre-broken in Blender. On impact we swap the pane for the pieces, and each one flies out from the hit point with its own spin, bounces, loses speed and settles. |
| `thabiso-04.mp3` | 02:47 | And the way out: Voss reaches through the hole, and his arm is solved with inverse kinematics, so his hand actually lands on the handle. The door hangs from a pivot at its hinge, so it swings like a real door. I also put the music in, so if a moment gives you chills... you're welcome. |
| `thabiso-05.mp3` | 17:00 | Thabiso. |

## TARIRO

| File name | Time | Line |
|---|---|---|
| `tariro-01.mp3` | 04:50 | I built the ring puzzle, and I wired the flow so ARIA only switches on once you've earned it. Then come the three linked relay rings: turn one and another turns with it. |
| `tariro-02.mp3` | 08:50 | Kessler's room is mine. A robot arm swings through it, and every frame we read its live bone positions and test them as capsules against your body, so it hurts exactly where it touches. To stop it, you beat my fusebox: four rings spinning at different speeds. Stop each one in its target zone, and every lock makes the rest seven percent faster. Have fun. |
| `tariro-03.mp3` | 16:58 | Tariro. |

## SIVU

| File name | Time | Line |
|---|---|---|
| `sivu-01.mp3` | 05:07 | The keypad and the lift doors are mine: real button logic, a zoomed keypad view, doors that slide. Wrong code? ARIA sends you off to find the maintenance tag. |
| `sivu-02.mp3` | 05:18 | I also made the game harder. You're welcome. Four difficulty presets change how much damage you take and how long puzzles give you. And then there's 'Last backup': double damage, forty percent less puzzle time, two lives. And it's permadeath. Lose them and you're back at the title. |
| `sivu-03.mp3` | 14:26 | And the containment door before it is mine: three valves you have to balance, or it won't release. |
| `sivu-04.mp3` | 16:59 | Sivu. |

## EVERYONE

| File name | Time | Line |
|---|---|---|
| `everyone-01.mp3` | 17:03 | We're Edge Case Runners. |
