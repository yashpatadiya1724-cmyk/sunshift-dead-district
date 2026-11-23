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

### 📅 Day 8 — Jam Submission
- **Status:** Final testing: pending.
