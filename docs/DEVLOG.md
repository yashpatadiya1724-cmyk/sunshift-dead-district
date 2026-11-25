# 📓 Developer Log: SUNSHIFT Dead District (GitHub Game Off 2026)

---

### 📅 Day 1 — Foundation & Third-Person Camera
- **Done:**
  - Initialized Vite + Three.js project skeleton.
  - Implemented Pointer Lock API mouse aiming and smooth orbit third-person follow camera.
  - Built keyboard movement controller with sprint support.
- **Challenges & Fixes:** Pointer lock release on ESC needed to be captured properly.

---

### 📅 Day 2 — City Environment & Collision
- **Done:**
  - Built procedural 16-block city grid with asphalt road markings and raised sidewalks.
  - Added independent X and Z axis bounding-box collision so character slides along walls smoothly.
  - Added abandoned car obstacles and barricades.

---

### 📅 Day 3 — Zombie AI & Shooting Mechanics
- **Done:**
  - Implemented raycast pistol shooting with building wall occlusion checks.
  - Built zombie navigation with horizontal-distance agro triggers.
  - Added blood particle bursts and ricochet spark voxel effects.

---

### 📅 Day 4 — The SHIFT Mechanic (Day ☀️ $\leftrightarrow$ Night 🩸)
- **Done:**
  - Created `ShiftSystem.js` with frame-rate independent exponential color lerp.
  - Night Shift rolls in dense red fog, triggers siren alarm, and boosts zombie speed.
  - Added UV Flare shockwave (`[Q]`) to freeze surrounding zombies in stasis.

---

### 📅 Day 5 — Mission Loop & Evacuation Tower
- **Done:**
  - Placed 4 collectible Energy Relays at major street intersections with distant beacon beams (`fog: false`).
  - Added central evacuation tower that activates once all 4 relays are collected.
  - Added Victory and Game Over conditions.

---

### 📅 Day 6 — Audio Synthesis & Vehicle Mechanics
- **Done:**
  - Built zero-asset procedural Web Audio synthesizer (engine audio, gunshots, groans, sirens, ambient pads).
  - Built drivable muscle car (`[F]`) with arcade physics, handbrake drifts, and zombie roadkill.
  - Added camera wall-raycast collision avoidance and corner obstacle navigation for zombies.

---

### 📅 Day 7 — Polish, HUD & First-Time Tutorial
- **Done:**
  - Built in-canvas HUD minimap with player-yaw rotation and entity radar dots.
  - Created Main Menu, Pause Menu with ESC sync, Settings persistence (FOV, Invert Y, Volume, Sens), and First-Time Tutorial.
  - Added particle pooling, F3 FPS counter, and low-health heartbeat pulse.
- **Next:** Final testing: pending.

---

### 📅 Day 8 — Submission Polish, Accessibility & Packaging
- **Done:**
  - **Combat Difficulty Settings:** Added Easy, Normal, and Hard difficulty selector on the Main Menu, scaling zombie numbers, health pools, and melee damage multipliers through `src/config.js`.
  - **Records & High Score Tracking:** Added persistent `localStorage` storage for All-Time Best Survival Time and Best Kills, displayed on both Main Menu and Game Over screens.
  - **Keyboard Navigation:** Added full Arrow Keys (Up/Down/Left/Right) and Enter navigation across all menu panels with high-visibility cyber focus rings (`:focus-visible` / `.keyboard-focus`).
  - **Mobile & Small-Screen Responsiveness:** Implemented media queries and fluid overflow scrolling for viewports under 640px wide or short heights, ensuring menus never get clipped.
  - **Automated Itch Packaging:** Configured `npm run build:itch` to build relative assets and bundle `dist/` directly into a ready-to-upload zip archive.
  - **Bundle Code Splitting:** Optimized production build with safe vendor chunking to reduce initial bundle overhead.
  - **Engine Test Suite Expansion:** Added automated unit tests in `test/game_engine_test.js` validating difficulty multipliers and record saving logic (23 passing tests).
- **Status:** Release-ready for GitHub Game Off 2026. Submission package verified.
