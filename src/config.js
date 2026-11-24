import * as THREE from 'three';

export const CONFIG = {
  // Player Base Settings
  player: {
    maxHealth: 100,
    walkSpeed: 8.0,
    sprintMultiplier: 1.6,
    jumpStrength: 9.0,
    gravity: -22.0,
    camDistance: 4.5,
    mouseSensitivity: 0.0025,
    flareCooldown: 20.0,
    flareRadius: 12.0,
    flareFreezeDuration: 6.0
  },

  // Vehicle (Muscle Car) Settings
  vehicle: {
    spawnPosition: new THREE.Vector3(10, 0, 0),
    maxHealth: 100,
    maxSpeed: 28.0,
    reverseSpeed: -10.0,
    acceleration: 18.0,
    braking: 26.0,
    handbrakeDecel: 38.0,
    friction: 6.5,
    steerSpeed: 2.2,
    enterRadius: 3.0,
    roadkillMinSpeed: 8.0,
    ejectDamage: 20,
    respawnDelay: 25.0, // seconds to respawn if destroyed
    camDistance: 8.0,
    camHeight: 3.5
  },

  // Weapons Arsenal
  weapons: {
    pistol: {
      id: 0,
      name: 'PISTOL',
      damage: 35,
      pellets: 1,
      spread: 0,
      fireRate: 0.2,
      auto: false,
      magSize: 12,
      reloadTime: 1.2,
      reserveAmmo: Infinity,
      maxReserve: Infinity,
      color: 0x444444,
      size: [0.12, 0.22, 0.4]
    },
    shotgun: {
      id: 1,
      name: 'SHOTGUN',
      damage: 18,
      pellets: 6,
      spread: 0.08,
      fireRate: 0.65,
      auto: false,
      magSize: 6,
      reloadTime: 2.0,
      reserveAmmo: 24,
      maxReserve: 36,
      color: 0x5a3d28,
      size: [0.14, 0.2, 0.85]
    },
    rifle: {
      id: 2,
      name: 'ASSAULT RIFLE',
      damage: 22,
      pellets: 1,
      spread: 0.025,
      fireRate: 0.1,
      auto: true,
      magSize: 30,
      reloadTime: 1.8,
      reserveAmmo: 90,
      maxReserve: 150,
      color: 0x2e353b,
      size: [0.12, 0.24, 0.75]
    }
  },

  // Enemies & Zombie Mechanics
  zombie: {
    count: 20,
    attackDistance: 1.35,
    attackCooldown: 1.0,
    soundHearingRadius: 18.0,
    agroRangeDay: 16.0,
    agroRangeNight: 32.0
  },
  enemies: {
    normal: { type: 'NORMAL', health: 70, daySpeed: 1.8, nightSpeed: 4.5, damage: 12, scale: 1.0, color: 0x3d5236, headColor: 0x5a7d4a, weight: 0.60 },
    runner: { type: 'RUNNER', health: 40, daySpeed: 3.2, nightSpeed: 6.2, damage: 8, scale: 0.82, color: 0x6a3830, headColor: 0x8e4c40, weight: 0.25 },
    brute: { type: 'BRUTE', health: 220, daySpeed: 1.1, nightSpeed: 2.8, damage: 25, scale: 1.45, color: 0x29253d, headColor: 0x3f3659, weight: 0.15 }
  },

  // Pickups
  pickups: {
    dropChance: 0.20,
    collectRadius: 1.8,
    lifetime: 20.0,
    healthHealAmount: 30,
    ammoRefill: { shotgun: 8, rifle: 30 }
  },

  // Shift Day/Night Cycle
  shift: {
    cycleDuration: 30.0,
    warningSeconds: 5.0,
    nightExtraSpawns: 6,
    dayFog: 0x87ceeb,
    dayFogDensity: 0.012,
    daySky: 0x87ceeb,
    dayDirColor: 0xfffaed,
    dayDirIntensity: 1.4,
    dayHemiSky: 0x87ceeb,
    dayHemiGround: 0x3a3024,
    dayHemiIntensity: 0.7,
    dayBloom: 0.5,
    dayWindowGlow: 0.2,

    nightFog: 0x1a0505,
    nightFogDensity: 0.020,
    nightSky: 0x1a0505,
    nightDirColor: 0xff2222,
    nightDirIntensity: 0.45,
    nightHemiSky: 0x200505,
    nightHemiGround: 0x050000,
    nightHemiIntensity: 0.2,
    nightBloom: 1.05,
    nightWindowGlow: 1.6
  },

  // Relays and Evacuation Tower
  relays: {
    total: 4,
    pickupRadius: 2.5,
    nightAmmoRewardRadius: 4.5,
    towerPosition: new THREE.Vector3(6, 0, 6),
    towerEvacRadius: 4.0,
    positions: [
      new THREE.Vector3(-49, 0, -27),
      new THREE.Vector3(39, 0, -49),
      new THREE.Vector3(17, 0, 39),
      new THREE.Vector3(-27, 0, 39)
    ]
  },

  // Quality Presets
  quality: {
    LOW: {
      postProcessing: false,
      shadows: false,
      shadowMapSize: 512,
      bloom: false,
      gtao: false,
      film: false,
      smaa: false,
      vignette: false,
      pixelRatio: 1.0
    },
    MEDIUM: {
      postProcessing: true,
      shadows: true,
      shadowMapSize: 1024,
      bloom: true,
      gtao: false,
      film: true,
      smaa: true,
      vignette: true,
      pixelRatio: 1.0
    },
    HIGH: {
      postProcessing: true,
      shadows: true,
      shadowMapSize: 2048,
      bloom: true,
      gtao: true,
      film: true,
      smaa: true,
      vignette: true,
      pixelRatio: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1.0
    }
  }
};
