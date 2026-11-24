// ===== SUNSHIFT: DEAD DISTRICT - AUTOMATED ENGINE & CONFIG TEST SUITE =====
import assert from 'node:assert';
import { CONFIG } from '../src/config.js';
import { EventBus } from '../src/core/Events.js';

console.log('🧪 Starting SUNSHIFT: Dead District Engine Test Suite...\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

// ===== SUITE 1: EVENT BUS SYSTEM =====
console.log('--- Suite 1: EventBus Architecture ---');

runTest('EventBus subscribes and emits payloads to listeners', () => {
  const bus = new EventBus();
  let received = null;
  bus.on('player:hit', (data) => {
    received = data;
  });

  bus.emit('player:hit', { damage: 25, source: 'zombie_walker' });
  assert.deepStrictEqual(received, { damage: 25, source: 'zombie_walker' });
});

runTest('EventBus unregisters listeners via returned unsubscribe callback', () => {
  const bus = new EventBus();
  let callCount = 0;
  const unsubscribe = bus.on('shift:night', () => {
    callCount++;
  });

  bus.emit('shift:night');
  assert.strictEqual(callCount, 1);

  unsubscribe();
  bus.emit('shift:night');
  assert.strictEqual(callCount, 1, 'Callback should not fire after unsubscribe');
});

runTest('EventBus isolates listeners of different event channels', () => {
  const bus = new EventBus();
  let firedA = false;
  let firedB = false;

  bus.on('channel:A', () => { firedA = true; });
  bus.on('channel:B', () => { firedB = true; });

  bus.emit('channel:A');
  assert.strictEqual(firedA, true);
  assert.strictEqual(firedB, false);
});

// ===== SUITE 2: CONFIG & GAMEPLAY BALANCING =====
console.log('\n--- Suite 2: Balance & Combat Configuration ---');

runTest('Player settings contain valid physics and combat constants', () => {
  const p = CONFIG.player;
  assert(p.maxHealth >= 100, 'Player health must be >= 100');
  assert(p.walkSpeed > 0, 'Walk speed must be positive');
  assert(p.sprintMultiplier > 1.0, 'Sprint must be faster than walk');
  assert(p.gravity < 0, 'Gravity must be negative');
  assert(p.flareRadius > 0, 'Flare radius must be positive');
});

runTest('Vehicle settings contain valid kinematics', () => {
  const v = CONFIG.vehicle;
  assert(v.maxHealth >= 100);
  assert(v.maxSpeed > 20);
  assert(v.acceleration > 0);
  assert(v.braking > 0);
  assert(v.reverseSpeed < 0);
});

runTest('Weapons arsenal has balanced damage, magazines, and rates of fire', () => {
  const weapons = CONFIG.weapons;
  assert(weapons.pistol, 'Pistol must exist');
  assert(weapons.shotgun, 'Shotgun must exist');
  assert(weapons.rifle, 'Rifle must exist');

  Object.entries(weapons).forEach(([key, w]) => {
    assert(w.damage > 0, `${key} damage must be positive`);
    assert(w.magSize > 0, `${key} magSize must be positive`);
    assert(w.reloadTime > 0, `${key} reloadTime must be positive`);
    assert(w.fireRate > 0, `${key} fireRate must be positive`);
  });
});

runTest('Enemies have distinctive archetypes with day/night multipliers', () => {
  const enemies = CONFIG.enemies;
  assert(enemies, 'Enemies must be defined');
  const archetypes = Object.keys(enemies);
  assert(archetypes.includes('normal'), 'Normal archetype required');
  assert(archetypes.includes('runner'), 'Runner archetype required');
  assert(archetypes.includes('brute'), 'Brute archetype required');

  archetypes.forEach(type => {
    const data = enemies[type];
    assert(data.health > 0, `${type} health must be > 0`);
    assert(data.damage > 0, `${type} damage must be > 0`);
    assert(data.daySpeed > 0, `${type} day speed must be > 0`);
    assert(data.nightSpeed >= data.daySpeed, `${type} night speed must be >= day speed`);
    assert(data.weight > 0, `${type} spawn weight must be positive`);
  });
});

runTest('Shift system defines day/night cycle timings and environmental parameters', () => {
  const shift = CONFIG.shift;
  assert(shift.cycleDuration > 0, 'Cycle duration must be positive');
  assert(shift.warningSeconds > 0, 'Warning time must be positive');
  assert(shift.nightExtraSpawns >= 0, 'Night spawns must be >= 0');
  assert(shift.dayFog !== undefined);
  assert(shift.nightFog !== undefined);
});

console.log('\n================================');
console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
