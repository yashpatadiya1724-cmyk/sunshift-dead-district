# 🧟 SUNSHIFT: Dead District ☀️🩸

> A stylized low-poly third-person zombie survival adventure built with Three.js for **GitHub Game Off 2026** (Theme: **SHIFT**).

[![CI Verification](https://github.com/yashpatadiya1724-cmyk/sunshift-dead-district/actions/workflows/ci.yml/badge.svg)](https://github.com/yashpatadiya1724-cmyk/sunshift-dead-district/actions/workflows/ci.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-Mansitra%20Foundation-ea4aaa?style=flat&logo=github-sponsors)](https://www.mansitra.in/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Game Off 2026](https://img.shields.io/badge/GitHub_Game_Off-2026-blue.svg)](https://itch.io/jam/game-off-2026)
[![Built with Three.js](https://img.shields.io/badge/Built_with-Three.js_r160-black.svg?logo=three.js)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite-646CFF.svg?logo=vite)](https://vitejs.dev/)

---

## 🎮 Play Online
- **Web Browser (GitHub Pages):** [https://yashpatadiya1724-cmyk.github.io/sunshift-dead-district/](https://yashpatadiya1724-cmyk.github.io/sunshift-dead-district/)
- **itch.io Page:** [https://yashpatadiya1724-cmyk.itch.io/sunshift-dead-district](https://yashpatadiya1724-cmyk.itch.io/sunshift-dead-district)

---

## 🌗 Theme Interpretation: "SHIFT"
In *SUNSHIFT: Dead District*, the environment is destabilized by an accelerated atmospheric **Solar Shift**:
- **Day Shift (Calm Scavenging):** Zombies are sluggish, sunlight keeps visibility high, and ambient musical chords provide relief while locating energy beacons.
- **Night Shift (Blood Fog & Escalation):** Thick crimson fog rolls in, siren alarms sound, zombies mutate into rabid sprinters, and additional infected spawn in the district.
- **Countdown Warning:** The last 5 seconds of every shift cycle trigger urgent audio beeps and rhythmic HUD warnings.
- **UV Flare Shockwave:** Players can deploy a tactical ultraviolet flash (`[Q]`) that temporarily freezes all nearby infected in a blue stasis glow.

---

## ✨ Implemented Features

### 🚗 Drivable Muscle Car
- Press `[F]` within 3 meters of the parked muscle car to get behind the wheel.
- Responsive arcade physics with acceleration, reverse, steering sensitivity, and handbrake drifts (`[SPACE]`).
- **Zombie Roadkill:** Slamming into zombies at speeds above 8 km/h instantly crushes them with blood particle bursts and camera shake.
- Vehicle integrity system with collision damage against buildings, catastrophic explosions, and plaza respawning.
- Night headlights and procedural engine audio that dynamically revs with vehicle speed.

### 🧟 Enemy Types & AI
- **Normal Infected (60%):** Balanced health and speed.
- **Runners (25%):** Fragile but fast sprinters with aggressive pursuit angles.
- **Brutes (15%):** Massive, heavy-hitting mutants with high health pools.
- Intelligent corner avoidance (tangent side-stepping) to prevent getting stuck on building walls.
- Distance-based LOD performance optimization (zombies beyond 60 meters update on alternating frames).

### 🌆 City Environment & Camera
- Procedural district with asphalt streets, yellow road centerlines, sidewalks, and rooftop HVAC units.
- Independent X/Z wall sliding colliders preventing camera or player snagging.
- **Raycast Camera Collision:** The third-person follow camera detects building walls and pulls forward smoothly to prevent clipping into architecture.

### 🖥️ Menus & Audio Synthesizer
- **Complete UI System:** Loading screen with progress bar, Main Menu with live scene orbit camera, Pause menu (synced with ESC pointer lock), Controls panel, Settings panel, and Game Over / Victory stats recap.
- **Procedural Web Audio Engine (Zero audio downloads):** Synthesized gunshots, zombie groans, ambient day pads, night tension drones, footstep thuds, mechanical weapon reloads, and UI clicks.
- **Interactive First-Time Tutorial:** 5-step overlay walking new players through movement, combat, relays, shift rules, and the UV flare.

### 🗺️ HUD & Accessibility
- Real-time circular radar minimap rotating with camera yaw, displaying player, car, zombies (<40m), relays, and evacuation tower.
- Dynamic health bar color transitions (green $\rightarrow$ yellow $\rightarrow$ pulsing red) with low-health desaturation and heartbeat pulse.
- Realtime FPS counter toggle (`[F3]`).
- Settings persistence in `localStorage` for Master Volume, Mouse Sensitivity, Invert Mouse Y, FOV (60°–90°), and Graphics Quality presets.

---

## 🕹️ Controls

| Action | Primary Key | Notes |
|---|---|---|
| **Move / Drive** | `W`, `A`, `S`, `D` | Controls player on foot or steers the muscle car |
| **Enter / Exit Car** | `F` | Active within 3m of the car |
| **UV Flare Shockwave** | `Q` | Freezes nearby zombies for 6s (20s cooldown) |
| **Aim & Look** | `Mouse Movement` | Sensitivity & Invert Y configurable in Settings |
| **Shoot Weapon** | `Left Click` | Raycast weapon with muzzle flash and hit sparks |
| **Sprint** | `Shift` (Hold) | 1.6x movement speed boost |
| **Jump / Handbrake** | `Spacebar` | Jump on foot / Handbrake drift while driving |
| **Toggle FPS Counter** | `F3` | Displays current framerate in top-left |
| **Pause / Resume** | `Escape` | Releases mouse lock and opens pause menu |

---

## 💻 Local Development Setup

```bash
git clone https://github.com/yashpatadiya1724-cmyk/sunshift-dead-district.git
cd sunshift-dead-district
npm install
npm run dev
```

---

## 🎨 Asset Attributions & Licenses

*SUNSHIFT: Dead District* utilizes open-standard 3D assets, CC0 1.0 Universal models, and a robust zero-crash procedural fallback engine:

- **Kenney (CC0 1.0 Universal):** Modular city buildings, road network tiles, sidewalk pavements, and vehicle assets ([kenney.nl](https://kenney.nl)).
- **Quaternius (CC0 1.0 Universal):** Stylized survivor character, animated undead packs, and modular firearm weaponry ([quaternius.com](https://quaternius.com)).
- **Poly Haven (CC0 1.0 Universal):** 1K HDR atmospheric environment skies — Zwartkops Straight Afternoon & Zwinger Night ([polyhaven.com](https://polyhaven.com)).

Full details and legal texts are available in [`public/LICENSES.txt`](./public/LICENSES.txt).

