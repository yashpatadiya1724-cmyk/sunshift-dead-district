# SUNSHIFT: Dead District — Story Bible & Mission Specification

## Setting & World
**Haven City.** Once a thriving coastal metropolis powered by the cutting-edge **Helios Solar Array**, an orbital solar collector and atmospheric reflector network. 
Three days ago, a catastrophic harmonic cascade within the Array triggered **The Shift**: a volatile, repeating atmospheric pulse that violently oscillates the skies between blistering Solar Day and pitch-black, UV-depleted **Blood Night**.

Simultaneously, the solar cascade accelerated the mutation of the dormant **Solanum-7** neural virus across the urban population. 
During the Day, the infected (zombies) are sluggish, photophobic, and weakened by sunlight.
When the Shift strikes and Blood Night descends, the virus surges through their nervous systems: they become fast, relentless predators with heightened aggression.

---

## Characters
- **Kade Mercer (Player):** Ex-Helios grid technician. He was part of the calibration team that overlooked harmonic anomalies prior to the cascade. Driven by overwhelming survivor's guilt, he navigates the infested streets seeking redemption.
- **Mara Quinn (Radio Operator):** Chief Communications Operator stationed atop the hardened **Evac Tower**. Mara guides Kade via two-way high-frequency radio, attempting to restore power to the military evacuation uplink before the final grid collapse.
- **Old Jonah (Ally):** A grizzled ex-precinct detective holding down a makeshift barricade in the southern market sector with a heavy gauge trench gun.

---

## Story Missions

All in-game dialogues, HUD objectives, and subtitles are strictly in English.

### Mission 1: "First Light"
- **Spawn:** Garage at coordinates `(0, 0, 0)`.
- **Objective:** Reach the muscle car by the plaza (`CONFIG.vehicle.spawnPosition`).
- **Dialogues:**
  - `Mara`: *"Kade? Kade, can you hear me? This is Mara at the Evac Tower. Stay low, stay quiet."*
  - `Mara`: *"Take the muscle car by the plaza. Press F near it. We have a long night ahead."*
- **Unlocks/Events:** Muscle car interaction, introduces basic movement and vehicle controls.

### Mission 2: "Dead Air"
- **Objective:** Retrieve Relay Node 1 (`CONFIG.relays.positions[0]`) located near the old communications building.
- **Dialogues:**
  - `Mara`: *"The tower needs four relays to boot the signal. First one is at the old radio station."*
  - On Relay Collection — `Mara`: *"Signal's weak but it's there. Keep going."*
- **Checkpoint:** Saved on collection.

### Mission 3: "Night Run"
- **Objective:** Reach Relay Node 2 (`CONFIG.relays.positions[1]`).
- **Dynamic Event:** When player covers half the distance (or after 15 seconds), trigger an immediate Shift into Blood Night (`shift.triggerShift()`) if it is currently Day.
- **Dialogues:**
  - `Mara`: *"The sun is flipping. Move NOW, they run at night!"*
- **Checkpoint:** Saved on collection.

### Mission 4: "Jonah's Barricade"
- **Objective:** Clear the infected swarming Jonah's perimeter at Relay Node 3 (`CONFIG.relays.positions[2]`).
- **Encounter:** 6 aggressive zombies spawn around the barricade.
- **Resolution:**
  - On clearing the threat:
    - `Jonah`: *"Kid, you've got guts. Take this shotgun. And the relay's behind me."*
  - Unlocks Weapon Slot 2 (Pump Shotgun).
- **Checkpoint:** Saved on clearing and collection.

### Mission 5: "Dark Signal"
- **Objective:** Infiltrate the infected hive surrounding Relay Node 4 (`CONFIG.relays.positions[3]`).
- **Encounter:** 8 extra infected (Runner/Brute hive).
- **Dialogues:**
  - `Mara`: *"That's a nest. Use your UV flare, Kade."*
  - On clearance: Unlocks Weapon Slot 3 (Assault Rifle).
- **Checkpoint:** Saved on collection.

### Mission 6: "Hold the Tower"
- **Objective:** Proceed to the Evac Tower (`CONFIG.relays.towerPosition`) and defend the uplink uplink dish.
- **Mechanics:**
  - Within a 10-meter radius around the tower, the uplink capacitor charges from 0% to 100% over 60 seconds.
  - Stepping outside the radius pauses the charging sequence.
  - Three distinct infected waves assault every 20 seconds (6 zombies per wave, spawned 35+ units away, featuring Runner and Brute mix).
  - HUD displays a dedicated charge progress gauge.
- **Dialogues:**
  - `Mara`: *"Hold the line, Kade. Sixty seconds. Don't die on me."*

### Mission 7: The Final Choice
Upon reaching 100% tower charge, the uplink stabilizes and presents Kade with a climactic decision:
`[E] EVACUATE` or `[G] SHUT DOWN THE ARRAY`

- **Choice [E] — Evacuate (Ending A):**
  - Epilogue text: *"The helicopter lifts off. Haven City burns below, but you are alive. Some nights you still hear the Shift."*
  - Title: **SURVIVOR — EVACUATION SUCCESSFUL**
- **Choice [G] — Shut Down the Array (Ending B):**
  - Epilogue text: *"The Array dies. The sky stops flipping. Dawn finally stays. You stay too, to rebuild what you broke."*
  - Title: **REDEEMER — THE SHIFT ENDS**

---

## Supporting Systems
1. **Dialogue UI & Radio Chime:** Bottom floating transmission card with speaker avatar badge, typewriter text, and dual-tone synth radio blip with static burst.
2. **Noise System:** Gunfire and high-speed car driving generate acoustic spikes that dynamically expand zombie sensory agro ranges.
3. **Progressive Weapon Unlocks:** Weapons are earned organically across missions (Pistol -> Shotgun -> Rifle).
4. **Cinematic Prologue:** Atmospheric opening narration establishing Haven City and the Solanum-7 outbreak.
5. **Checkpoint Persistence:** Allows instant tactical redeployment upon death.
