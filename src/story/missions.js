import * as THREE from 'three';
import { CONFIG } from '../config.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'First Light',
    objective: 'Reach the muscle car by the plaza',
    targetPos: new THREE.Vector3(10, 0, 0),
    targetRadius: 3.5,
    dialogues: [
      { speaker: 'Mara', text: 'Kade? Kade, can you hear me? This is Mara at the Evac Tower. Stay low, stay quiet.', duration: 4200 },
      { speaker: 'Mara', text: 'Take the muscle car by the plaza. Press F near it. We have a long night ahead.', duration: 4200 }
    ],
    relayIndex: null
  },
  {
    id: 2,
    title: 'Dead Air',
    objective: 'Retrieve Relay 1 at the old radio station',
    targetPos: new THREE.Vector3(-49, 0, -27),
    targetRadius: 3.0,
    dialogues: [
      { speaker: 'Mara', text: 'The tower needs four relays to boot the signal. First one is at the old radio station.', duration: 4500 }
    ],
    onCompleteDialogues: [
      { speaker: 'Mara', text: "Signal's weak but it's there. Keep going.", duration: 3800 }
    ],
    relayIndex: 0
  },
  {
    id: 3,
    title: 'Night Run',
    objective: 'Secure Relay 2 across transit district',
    targetPos: new THREE.Vector3(39, 0, -49),
    targetRadius: 3.0,
    shiftTriggered: false,
    dialogues: [
      { speaker: 'Mara', text: 'Second relay is across the transit corridor. Stay alert.', duration: 3800 }
    ],
    relayIndex: 1
  },
  {
    id: 4,
    title: "Jonah's Barricade",
    objective: 'Clear the infected around Jonah & take Relay 3',
    targetPos: new THREE.Vector3(17, 0, 39),
    targetRadius: 3.0,
    spawnedZombies: false,
    dialogues: [
      { speaker: 'Jonah', text: "Hey! Over here! I'm pinned behind the market barricade!", duration: 4000 }
    ],
    clearedDialogues: [
      { speaker: 'Jonah', text: "Kid, you've got guts. Take this shotgun. And the relay's behind me.", duration: 4500 }
    ],
    relayIndex: 2
  },
  {
    id: 5,
    title: 'Dark Signal',
    objective: 'Infiltrate the hive and claim Relay 4',
    targetPos: new THREE.Vector3(-27, 0, 39),
    targetRadius: 3.0,
    spawnedHive: false,
    dialogues: [
      { speaker: 'Mara', text: "That's a nest. Use your UV flare, Kade.", duration: 4200 }
    ],
    relayIndex: 3
  },
  {
    id: 6,
    title: 'Hold the Tower',
    objective: 'Defend the Evac Tower uplink until charged',
    targetPos: new THREE.Vector3(6, 0, 6),
    targetRadius: 10.0,
    dialogues: [
      { speaker: 'Mara', text: "Hold the line, Kade. Sixty seconds. Don't die on me.", duration: 4500 }
    ],
    relayIndex: null
  },
  {
    id: 7,
    title: 'The Final Choice',
    objective: '[E] EVACUATE   |   [G] SHUT DOWN THE ARRAY',
    targetPos: new THREE.Vector3(6, 0, 6),
    targetRadius: 15.0,
    dialogues: [
      { speaker: 'Mara', text: 'The uplink is stable! Helicopter incoming, or you can shut down the array from the terminal. Your choice!', duration: 5000 }
    ],
    relayIndex: null
  }
];
