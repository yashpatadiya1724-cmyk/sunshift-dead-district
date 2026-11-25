# 🚀 itch.io Jam Submission Checklist (GitHub Game Off 2026)

This checklist covers all technical requirements, packaging details, and submission metadata needed to publish **SUNSHIFT: Dead District** to itch.io for GitHub Game Off 2026 (Theme: **SHIFT**).

---

## 📦 1. Production Build & Packaging

1. Run the dedicated itch.io standalone build script in terminal:
   ```bash
   npm run build:itch
   ```
2. **What this command does:**
   - Runs `vite build --base=./` to produce standalone relative asset paths suitable for itch.io iframe/subfolder hosting.
   - Emits distribution files into `dist/`.
   - Automatically packages all files in `dist/` into a ready-to-upload ZIP archive: `dist/sunshift-dead-district.zip` (and root `sunshift-dead-district-itch.zip`).
3. **Verify archive contents:**
   - Confirm `index.html` is at the root level of the ZIP archive.
   - Confirm `assets/` contains the JS bundle and CSS stylesheet.
   - Confirm no absolute `/` paths exist in `dist/index.html`.

---

## 🌐 2. itch.io Project Page Configuration

| Setting | Value |
|---|---|
| **Title** | SUNSHIFT: Dead District |
| **Short Tagline** | Stylized 3D Action Survival Shooter — Survive the Solar Shift anomaly. |
| **Classification** | Games |
| **Kind of project** | HTML (You have a ZIP file that will be played in the browser) |
| **Release status** | Released |
| **Pricing** | $0 or donate |
| **Uploads** | Upload `dist/sunshift-dead-district.zip` (Check: *"This file will be played in the browser"*)|
| **Viewport Dimensions** | **1280 × 720** (Default 16:9), Responsive enabled |
| **Orientation** | Landscape |
| **Fullscreen button** | Enabled (Recommended) |
| **Enable Pointer Lock** | **Enabled** (Crucial for first-person/third-person mouse aiming) |
| **Mobile Friendly** | Supported (Responsive UI modals & fluid layout) |

---

## 🌗 3. Jam Theme Alignment: "SHIFT"

For the submission text on the jam form:

- **Day/Night Environmental Shift:** The Helios Solar Array pulse violently flips Haven City between blinding Day Shift and blood-red Night Shift every 30 seconds.
- **Enemy Dynamic Shift:** Solanum-7 infected shift from slow, shambling daytime targets into fast, rabid sprinting horrors at night with extra horde spawns.
- **Tactical Shift:** Players shift tactics between scavenging on foot, firing three distinct weapons (Pistol, Shotgun, Assault Rifle), driving a muscle car with roadkill kinematics, and deploying a tactical UV Flare (`[Q]`) to freeze enemies in stasis.
- **Narrative Shift (Two Endings):** Mission 7 offers a critical moral shift: Evacuate the burning city (Ending A) or sacrifice escape to shut down the Helios grid and restore permanent dawn (Ending B).

---

## 🎮 4. Key Gameplay Controls

- **Move / Drive:** `W`, `A`, `S`, `D`
- **Aim & Look:** Mouse movement (Pointer Lock)
- **Shoot:** Left Mouse Click
- **Weapons:** `1` (Pistol), `2` (Shotgun), `3` (Assault Rifle)
- **Reload:** `R`
- **Enter / Exit Car:** `F`
- **UV Flare Shockwave:** `Q`
- **Handbrake / Jump:** `Spacebar`
- **Sprint:** `Shift` (Hold)
- **Pause Menu:** `Escape`
- **Toggle Performance HUD:** `F3`

---

## 🛠️ 5. Technical Highlights

- **Engine:** Three.js (r160) & Vite (zero bloated dependencies, ~250 kB gzipped bundle).
- **Procedural Synthesizer:** Complete audio landscape generated in real time with Web Audio API (engine rumble, gunfire, ricochets, ambient pads, sirens, zombie groans) — zero audio sample downloads!
- **Settings & Difficulty Persistence:** Volume, sensitivity, FOV, invert Y, graphics presets (AUTO, LOW, MEDIUM, HIGH, ULTRA), difficulty (Easy, Normal, Hard), and all-time records saved to `localStorage`.
- **Keyboard & Screen Accessibility:** Full keyboard menu navigation with cyber focus rings, responsive layouts for small screens.
