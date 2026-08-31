# Halcyon-9

Welcome to the repository for **Halcyon-9**, an atmospheric, deep-sea 3D survival and puzzle game built using **Three.js** and **Vite** (Vanilla JavaScript). 

You play as Voss, a reconstructed consciousness trapped in a flooding research station located deep in the ocean, guided by an AI companion named ARIA whose intentions are not entirely clear.

---

## 🚀 Getting Started

To run the project locally or build it for deployment, follow these commands.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed.

### Installation
Clone the repository, navigate to the folder, and install dependencies:
```bash
npm install
```

### Local Development
Run the local Vite development server (includes hot reloading):
```bash
npm run dev
```
Open the URL shown in your terminal (typically `http://localhost:5173`).

### Production Build
To build the project for production (as required for the LAMP server deployment):
```bash
npm run build
```
This compiles the code and assets into the `/dist` directory. **Only the contents of the `/dist` folder should be uploaded to the server.**

---

## 📂 Project Structure

This codebase is structured modularly to align with the grading rubric requirements and split work cleanly among the team:

```
halcyon-9/
├── dist/                  # Compiled production files (uploaded to server)
├── public/                # Static assets (not processed by Vite)
│   └── assets/
│       ├── audio/         # SFX, background music, voice lines
│       ├── models/        # 3D models (Power Relay rings, Drone, etc.)
│       └── textures/      # PBR textures (bump/height maps)
├── src/                   # Source code
│   ├── audio/
│   │   └── AudioManager.js # Spatial and ambient audio triggers
│   ├── core/
│   │   ├── Camera.js      # First-person camera and top-down minimap cameras
│   │   ├── Controls.js    # WASD controls and mouse-look setup
│   │   ├── Physics.js     # Physics system wrapper (e.g. Cannon.js)
│   │   └── Renderer.js    # Three.js WebGLRenderer & post-processing
│   ├── entities/
│   │   ├── ARIA.js        # ARIA's mood state, face screen materials, subtitles
│   │   ├── Drone.js       # Rogue machine AI, patrols, and detection
│   │   └── Player.js      # Player state, inventory, and health
│   ├── graphics/
│   │   ├── Lighting.js    # Dynamic lighting systems & shadow configurations
│   │   └── Shaders.js     # Custom GLSL shaders (water distortion, ARIA glitch)
│   ├── levels/
│   │   ├── Level1.js      # Level 1 logic ("Reboot")
│   │   ├── Level2.js      # Level 2 logic ("Logs")
│   │   └── Level3.js      # Level 3 logic ("Containment" / Flooding)
│   ├── ui/
│   │   └── UIManager.js   # Menu systems, volume/subtitle options, UI overlays
│   ├── main.js            # Entry point (bootstraps welcome screen & loop)
│   └── style.css          # Vanilla CSS layout styling for the UI layer
├── index.html             # Main HTML context
├── package.json           # Dependency tracker
└── vite.config.js         # Vite custom configurations
```

---

## 📊 Rubric Quick-Reference

Ensure our commits keep the following criteria satisfied:

1. **Operational / Deployment Requirements (Mandatory Pass)**
   * **Relative Paths Only**: Never start asset/import paths with `/`. Vite handles imports locally, but LAMP servers host in subdirectories.
   * **Filename Case-Sensitivity**: Use `lowercase-hyphenated-names` for all filenames (especially textures/models). Linux servers are case-sensitive; Windows/macOS are not.
   * **Memory Management**: When changing levels, always call `.dispose()` on unused geometries, materials, and textures in the level class to prevent memory leaks and crashes.

2. **Viewing (10%)**
   * First-person camera movement.
   * Top-down minimap view mode (Picture-in-Picture).
   * Reflected view (e.g., wet surfaces in Level 3 showing Voss's model reflection).

3. **Control & Playability (10%)**
   * Responsive WASD / mouse look.
   * Defined **Win/Loss states** (e.g., getting caught by drones, drowning).
   * A working physics model (gravity, mass, collision for the throw mechanic).

4. **3D Effects (15%)**
   * Multiple light sources, shadows, dynamic skybox, and colour language.
   * Textures with **bump/height maps** (PBR) on rusted metal panels.

5. **Shaders (10%)**
   * Custom vertex + fragment shaders:
     1. Level 3 rising water shader (ripples, refraction, opacity, vertex height wave displacement).
     2. Valve coolant burst shader (particles).
     3. ARIA static/glitch shader (scanline noise screen effect tied to her mood).

6. **Gameplay & Experience (25%) & Polish (10%)**
   * Restarting the game without page reload.
   * In-game pause menu, subtitles toggle, and audio volume sliders.
   * A loading screen to handle preloading high-res assets seamlessly.
