# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-24
### Added
- **Core Theme Mechanic:** "SUN SHIFT" system featuring dynamic day/night transitions, siren alarms, warning beeps in the final 5 seconds, and UV Flare shockwave (`[Q]`).
- **Drivable Muscle Car:** Parked muscle car (`[F]` to enter/exit) with arcade acceleration, steering, handbrake drifts (`[SPACE]`), building crash damage, and high-speed zombie roadkill mechanics.
- **Enemy AI System:** Multiple zombie archetypes (Normal, Runner, Brute) with corner avoidance pathing, UV freeze reactions, and 60m+ distance LOD performance skipping.
- **Camera Collision Avoidance:** Raycast wall detection between player head and third-person camera preventing interior wall clipping.
- **Modular HUD:** Canvas radar minimap rotating with camera yaw, screen-top objective compass with distance tracker, vehicle speedometer, car integrity bar, and directional damage indicator arc.
- **Procedural Audio Synthesizer:** Standard Web Audio API synthesizer generating day pad ambience, night tension drones, gunshots, zombie groans, footstep thuds, reload clicks, and car engine pitch modulation.
- **Settings & Accessibility:** Modal panels with `localStorage` persistence for Master Volume, Mouse Sensitivity, Invert Mouse Y, FOV slider (60°–90°), and Graphics Quality presets (Low, Medium, High).
- **First-Time Tutorial:** 5-step guided interactive hints introducing movement, shooting, relays, shifts, and the UV flare.
- **Engineering & Tooling:** Automated GitHub Actions CI workflow, GitHub Pages deployment action, and standalone itch.io ZIP build script (`npm run build:itch`).
