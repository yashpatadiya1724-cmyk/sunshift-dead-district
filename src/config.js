import * as THREE from 'three';

// Base Archetypes and Balance Constants for Scaling
const BASE_ENEMIES = {
  normal: { type: 'NORMAL', health: 70, daySpeed: 1.8, nightSpeed: 5.2, damage: 16, scale: 1.0, color: 0x3d5236, headColor: 0x5a7d4a, weight: 0.60 },
  runner: { type: 'RUNNER', health: 40, daySpeed: 3.2, nightSpeed: 7.2, damage: 12, scale: 0.82, color: 0x6a3830, headColor: 0x8e4c40, weight: 0.25 },
  brute: { type: 'BRUTE', health: 240, daySpeed: 1.2, nightSpeed: 3.4, damage: 35, scale: 1.45, color: 0x29253d, headColor: 0x3f3659, weight: 0.15 }
};

const BASE_ZOMBIE_COUNT = 20;
const BASE_ZOMBIE_COUNTS = { LOW: 10, MEDIUM: 14, HIGH: 20, ULTRA: 28 };
const BASE_QUALITY_COUNTS = { LOW: 10, MEDIUM: 14, HIGH: 20, ULTRA: 28 };
const BASE_NIGHT_EXTRA_SPAWNS = 6;

export const DIFFICULTIES = {
  EASY: {
    name: 'EASY',
    zombieCountMultiplier: 0.65,
    healthMultiplier: 0.65,
    damageMultiplier: 0.55
  },
  NORMAL: {
    name: 'NORMAL',
    zombieCountMultiplier: 1.0,
    healthMultiplier: 1.0,
    damageMultiplier: 1.0
  },
  HARD: {
    name: 'HARD',
    zombieCountMultiplier: 1.35,
    healthMultiplier: 1.35,
    damageMultiplier: 1.45
  }
};

export const CONFIG = {
  // Player Base Settings
  player: {
    maxHealth: 100,
    walkSpeed: 8.0,
    sprintMultiplier: 1.6,
    jumpStrength: 9.0,
    gravity: -22.0,
    camDistance: 3.2,
    mouseSensitivity: 0.0025,
    flareCooldown: 20.0,
    flareRadius: 12.0,
    flareFreezeDuration: 6.0
  },

  // Over-The-Shoulder Camera & Advanced Kinematic Movement Settings
  movement: {
    sprintSpeed: 12.8,     // Base sprint speed (8.0 m/s * 1.6 multiplier)
    camera: {
      shoulderHeight: 1.55,
      defaultOffsetRight: 0.7,
      defaultDistance: 3.2,
      aimOffsetRight: 0.9,
      aimDistance: 2.0,
      aimFovDelta: -12.0,
      sprintFovDelta: 5.0,
      dashFovKick: 4.0,
      posDamping: 14.0,
      fovLerpSpeed: 10.0,
      aimCrosshairScale: 0.7
    },
    accelerationTime: 0.2, // 0.2s to reach top speed
    decelerationTime: 0.1, // 0.1s to come to full stop
    turnSmoothTime: 0.1,   // 0.1s smooth body orientation
    coyoteTime: 0.1,       // 0.1s grace window after leaving ground
    jumpBufferTime: 0.1,   // 0.1s buffer before landing
    staminaMax: 5.0,       // 5 seconds max sprint capacity
    staminaDrainRate: 1.0, // 1.0 unit/s -> 5s total
    staminaRegenDelay: 3.0,// 3.0s delay before regeneration
    staminaRegenRate: 2.5, // units/s recovery
    dashDistance: 5.0,     // Instant velocity dash distance: 5.0m
    dashDuration: 0.20,    // 0.20s duration
    dashSpeed: 25.0,       // 5.0m / 0.20s = 25.0 m/s instant velocity
    dashCooldown: 1.2,     // 1.2s cooldown
    dashInvulnerabilityTime: 0.20, // 0.2s invulnerability window
    dashTapMaxDuration: 0.18, // Shift tap < 180ms threshold (hold >= 180ms begins sprint)
    dashStaminaCost: 1.0   // small stamina cost on dash
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
      size: [0.12, 0.22, 0.4],
      targetLength: 0.22,
      grip: {
        position: [0.02, 0.08, 0.04],
        rotation: [0, 0, Math.PI * 0.5]
      }
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
      size: [0.14, 0.2, 0.85],
      targetLength: 0.95,
      grip: {
        position: [0.02, 0.12, 0.04],
        rotation: [0, 0, Math.PI * 0.5]
      }
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
      size: [0.12, 0.24, 0.75],
      targetLength: 0.85,
      grip: {
        position: [0.02, 0.12, 0.04],
        rotation: [0, 0, Math.PI * 0.5]
      }
    }
  },

  // Enemies & Zombie Mechanics
  zombie: {
    count: 20,
    counts: {
      LOW: 10,
      MEDIUM: 14,
      HIGH: 20,
      ULTRA: 28
    },
    attackDistance: 1.35,
    attackCooldown: 1.0,
    soundHearingRadius: 18.0,
    agroRangeDay: 16.0,
    agroRangeNight: 32.0
  },
  enemies: {
    normal: { type: 'NORMAL', health: 70, daySpeed: 1.8, nightSpeed: 5.2, damage: 16, scale: 1.0, color: 0x3d5236, headColor: 0x5a7d4a, weight: 0.60 },
    runner: { type: 'RUNNER', health: 40, daySpeed: 3.2, nightSpeed: 7.2, damage: 12, scale: 0.82, color: 0x6a3830, headColor: 0x8e4c40, weight: 0.25 },
    brute: { type: 'BRUTE', health: 240, daySpeed: 1.2, nightSpeed: 3.4, damage: 35, scale: 1.45, color: 0x29253d, headColor: 0x3f3659, weight: 0.15 }
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
  score: {
    points: { NORMAL: 100, RUNNER: 150, BRUTE: 300 },
    comboWindow: 4.0,        // seconds to chain the next kill
    maxMultiplier: 5,
    nightMultiplier: 2,
    retryKeep: 0.8,          // score kept after a checkpoint retry
    ranks: [['S', 25000], ['A', 15000], ['B', 8000], ['C', 0]]
  },

  shift: {
    cycleDuration: 30.0,
    manualCooldown: 20.0,     // [V] player-triggered Sun Shift
    manualStunRadius: 12.0,
    manualStunDuration: 2.0,
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
    nightBloom: 0.45,
    nightWindowGlow: 0.45
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
      smaa: false,
      filmGrain: false,
      rain: false,
      wetAsphalt: false,
      lightCones: false,
      pointLights: 0,
      zombieCount: 10,
      maxAlive: 10,
      anisotropy: 1,
      pixelRatio: 0.85
    },
    MEDIUM: {
      postProcessing: true,
      shadows: true,
      shadowMapSize: 1024,
      bloom: true,
      gtao: false,
      smaa: false,
      filmGrain: false,
      rain: false,
      wetAsphalt: false,
      lightCones: true,
      pointLights: 3,
      zombieCount: 14,
      maxAlive: 14,
      anisotropy: 2,
      pixelRatio: 1.0
    },
    HIGH: {
      postProcessing: true,
      shadows: true,
      shadowMapSize: 1536,
      bloom: true,
      gtao: false,
      smaa: false,
      filmGrain: true,
      rain: false,
      wetAsphalt: false,
      lightCones: true,
      pointLights: 6,
      zombieCount: 20,
      maxAlive: 20,
      anisotropy: 4,
      pixelRatio: 1.25
    },
    ULTRA: {
      postProcessing: true,
      shadows: true,
      shadowMapSize: 2048,
      bloom: true,
      gtao: true,
      smaa: true,
      filmGrain: true,
      rain: true,
      wetAsphalt: true,
      lightCones: true,
      pointLights: 6,
      zombieCount: 28,
      maxAlive: 28,
      anisotropy: 8,
      pixelRatio: 1.5
    }
  },

  // Active Difficulty Settings
  difficulty: DIFFICULTIES,
  currentDifficulty: 'NORMAL'
};

export function applyDifficulty(diffKey = 'NORMAL') {
  const key = (diffKey || 'NORMAL').toUpperCase();
  const diff = DIFFICULTIES[key] || DIFFICULTIES.NORMAL;
  CONFIG.currentDifficulty = key;

  // Scale enemies health and damage
  for (const type of ['normal', 'runner', 'brute']) {
    if (CONFIG.enemies[type] && BASE_ENEMIES[type]) {
      CONFIG.enemies[type].health = Math.round(BASE_ENEMIES[type].health * diff.healthMultiplier);
      CONFIG.enemies[type].damage = Math.round(BASE_ENEMIES[type].damage * diff.damageMultiplier);
    }
  }

  // Scale zombie counts
  CONFIG.zombie.count = Math.round(BASE_ZOMBIE_COUNT * diff.zombieCountMultiplier);
  if (CONFIG.zombie.counts) {
    CONFIG.zombie.counts.LOW = Math.round(BASE_ZOMBIE_COUNTS.LOW * diff.zombieCountMultiplier);
    CONFIG.zombie.counts.MEDIUM = Math.round(BASE_ZOMBIE_COUNTS.MEDIUM * diff.zombieCountMultiplier);
    CONFIG.zombie.counts.HIGH = Math.round(BASE_ZOMBIE_COUNTS.HIGH * diff.zombieCountMultiplier);
  }

  // Scale quality preset zombie counts
  if (CONFIG.quality) {
    if (CONFIG.quality.LOW) CONFIG.quality.LOW.zombieCount = Math.round(BASE_QUALITY_COUNTS.LOW * diff.zombieCountMultiplier);
    if (CONFIG.quality.MEDIUM) CONFIG.quality.MEDIUM.zombieCount = Math.round(BASE_QUALITY_COUNTS.MEDIUM * diff.zombieCountMultiplier);
    if (CONFIG.quality.HIGH) CONFIG.quality.HIGH.zombieCount = Math.round(BASE_QUALITY_COUNTS.HIGH * diff.zombieCountMultiplier);
    if (CONFIG.quality.ULTRA) CONFIG.quality.ULTRA.zombieCount = Math.round(BASE_QUALITY_COUNTS.ULTRA * diff.zombieCountMultiplier);
  }

  if (CONFIG.shift) {
    CONFIG.shift.nightExtraSpawns = Math.max(2, Math.round(BASE_NIGHT_EXTRA_SPAWNS * diff.zombieCountMultiplier));
  }

  return diff;
}

CONFIG.applyDifficulty = applyDifficulty;
