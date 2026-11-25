// ===== SUNSHIFT: DEAD DISTRICT - MOVEMENT & KINEMATICS TEST SUITE =====
import assert from 'node:assert';
import { CONFIG } from '../src/config.js';

console.log('🏃 Starting Movement & Kinematics Test Suite (test/movement_test.js)...\n');

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

const moveCfg = CONFIG.movement;
const baseSpeed = CONFIG.player.walkSpeed; // 8.0
const sprintSpeed = baseSpeed * CONFIG.player.sprintMultiplier; // 12.8

// Helper: 1D acceleration/deceleration simulation step
function stepSpeed(current, target, rate, dt) {
  if (current < target) {
    return Math.min(target, current + rate * dt);
  } else if (current > target) {
    return Math.max(target, current - rate * dt);
  }
  return current;
}

// ===== 1. ACCELERATION & DECELERATION KINEMATICS =====
console.log('--- Suite 1: Kinematic Acceleration & Deceleration Curves ---');

runTest('Acceleration achieves target top speed in configured 0.20s', () => {
  const topSpeed = baseSpeed;
  const accelRate = topSpeed / moveCfg.accelerationTime; // topSpeed / 0.2
  const dt = 1 / 1000; // 1ms precision simulation
  let speed = 0;
  let elapsed = 0;

  while (speed < topSpeed && elapsed < 1.0) {
    speed = stepSpeed(speed, topSpeed, accelRate, dt);
    elapsed += dt;
  }

  assert(Math.abs(elapsed - 0.20) < 0.005, `Expected ~0.20s to top speed, got ${elapsed.toFixed(3)}s`);
  assert.strictEqual(speed, topSpeed, 'Speed must reach exact top speed');
});

runTest('Deceleration achieves full stop in configured 0.10s', () => {
  const topSpeed = sprintSpeed;
  const decelRate = topSpeed / moveCfg.decelerationTime; // topSpeed / 0.1
  const dt = 1 / 1000;
  let speed = topSpeed;
  let elapsed = 0;

  while (speed > 0 && elapsed < 1.0) {
    speed = stepSpeed(speed, 0, decelRate, dt);
    elapsed += dt;
  }

  assert(Math.abs(elapsed - 0.10) < 0.005, `Expected ~0.10s to stop, got ${elapsed.toFixed(3)}s`);
  assert.strictEqual(speed, 0, 'Speed must reach exact 0');
});

runTest('Direction reversal transitions smoothly through deceleration without discontinuity', () => {
  let vx = baseSpeed;
  const targetVx = -baseSpeed;
  const decelRate = sprintSpeed / moveCfg.decelerationTime;
  const dt = 1 / 60; // 60Hz step

  vx = stepSpeed(vx, targetVx, decelRate, dt);
  assert(vx < baseSpeed, 'Velocity must immediately decrease towards reversed direction');
  assert(Number.isFinite(vx), 'Velocity must remain valid finite number');
});

// ===== 2. COYOTE TIME & JUMP BUFFER =====
console.log('\n--- Suite 2: Coyote Time & Jump Buffer Windows ---');

runTest('Coyote time window (0.10s) permits jump immediately after leaving ground', () => {
  let isGrounded = false;
  let coyoteTimer = moveCfg.coyoteTime; // 0.10s
  let velocityY = 0;

  // Step 0.05s into air (within coyote window)
  const dt = 0.05;
  coyoteTimer -= dt;

  // Player presses jump during coyote window
  const tryJump = () => {
    if (isGrounded || coyoteTimer > 0) {
      velocityY = CONFIG.player.jumpStrength;
      coyoteTimer = 0;
      return true;
    }
    return false;
  };

  const jumped = tryJump();
  assert.strictEqual(jumped, true, 'Jump must succeed within 0.1s coyote time');
  assert.strictEqual(velocityY, CONFIG.player.jumpStrength);
  assert.strictEqual(coyoteTimer, 0, 'Coyote timer must reset after jump consumed');
});

runTest('Coyote time disallows jumping once the 0.10s grace window expires', () => {
  let isGrounded = false;
  let coyoteTimer = moveCfg.coyoteTime; // 0.10s
  let velocityY = 0;

  // 0.12s elapsed
  coyoteTimer -= 0.12;

  const tryJump = () => {
    if (isGrounded || coyoteTimer > 0) {
      velocityY = CONFIG.player.jumpStrength;
      return true;
    }
    return false;
  };

  const jumped = tryJump();
  assert.strictEqual(jumped, false, 'Jump must fail after coyote window expired');
  assert.strictEqual(velocityY, 0);
});

runTest('Jump buffer preserves input 0.10s before landing and triggers on ground touch', () => {
  let isGrounded = false;
  let jumpBufferTimer = moveCfg.jumpBufferTime; // 0.10s
  let velocityY = -5.0; // Falling downwards

  // 0.06s pass in air
  jumpBufferTimer -= 0.06;

  // Touch ground
  isGrounded = true;
  let jumpTriggered = false;
  if (jumpBufferTimer > 0) {
    velocityY = CONFIG.player.jumpStrength;
    jumpBufferTimer = 0;
    jumpTriggered = true;
  }

  assert.strictEqual(jumpTriggered, true, 'Buffered jump must execute upon touching ground');
  assert.strictEqual(velocityY, CONFIG.player.jumpStrength);
  assert.strictEqual(jumpBufferTimer, 0);
});

// ===== 3. STAMINA DRAIN, REGEN DELAY & RECOVERY =====
console.log('\n--- Suite 3: Sprint Stamina & Regeneration ---');

runTest('Continuous sprint drains full stamina pool in exactly 5.0 seconds', () => {
  let stamina = moveCfg.staminaMax; // 5.0
  const dt = 0.1;
  let elapsed = 0;

  while (stamina > 0 && elapsed < 10.0) {
    stamina = Math.max(0, stamina - dt * moveCfg.staminaDrainRate);
    elapsed += dt;
  }

  assert(Math.abs(elapsed - 5.0) < 0.15, `Expected 5.0s sprint time, got ${elapsed.toFixed(2)}s`);
  assert.strictEqual(stamina, 0, 'Stamina must reach 0');
});

runTest('Stamina regeneration enforces strict 3.0s delay after sprint ends', () => {
  let stamina = 1.0;
  let regenCooldown = moveCfg.staminaRegenDelay; // 3.0s

  // Simulate 2.0 seconds of idle (cooldown not finished)
  for (let t = 0; t < 20; t++) {
    const dt = 0.1;
    if (regenCooldown > 0) {
      regenCooldown -= dt;
    } else {
      stamina += dt * moveCfg.staminaRegenRate;
    }
  }

  assert(regenCooldown > 0, 'Regen cooldown should still be active at 2.0s');
  assert.strictEqual(stamina, 1.0, 'Stamina must NOT regenerate during 3.0s cooldown delay');

  // Simulate another 1.5 seconds (cooldown expires at 1.0s, regens for 0.5s)
  for (let t = 0; t < 15; t++) {
    const dt = 0.1;
    if (regenCooldown > 0) {
      regenCooldown -= dt;
    } else {
      stamina += dt * moveCfg.staminaRegenRate;
    }
  }

  assert(stamina > 1.0, 'Stamina must regenerate after 3.0s delay elapsed');
});

// ===== 4. DASH MECHANIC, INSTANT VELOCITY & INVULNERABILITY =====
console.log('\n--- Suite 4: Tactical Kinetic Dash ---');

runTest('Dash triggers with instant velocity (no ramp) achieving exactly 5.0m displacement', () => {
  const dashSpeed = moveCfg.dashSpeed; // 25.0 m/s
  const dashDuration = moveCfg.dashDuration; // 0.20s
  const dt = 1 / 100; // 10ms step
  let distance = 0;
  let timer = dashDuration;

  // Instant velocity: no acceleration ramp
  while (timer > 0) {
    distance += dashSpeed * dt;
    timer -= dt;
  }

  assert(Math.abs(distance - moveCfg.dashDistance) < 0.01, `Expected 5.0m displacement, got ${distance.toFixed(2)}m`);
  assert.strictEqual(moveCfg.dashDistance, 5.0, 'Configured dash distance must be 5.0m');
  assert.strictEqual(moveCfg.dashDuration, 0.20, 'Configured dash duration must be 0.20s');
});

runTest('Dash provides 0.20s invulnerability window preventing incoming damage', () => {
  let playerHealth = 100;
  let invulnerableTimer = moveCfg.dashInvulnerabilityTime; // 0.20s

  const takeDamage = (dmg) => {
    if (invulnerableTimer > 0) return; // Invulnerable
    playerHealth -= dmg;
  };

  // Attack 1: occurs during dash invulnerability (0.10s)
  takeDamage(35);
  assert.strictEqual(playerHealth, 100, 'Damage must be completely ignored during invulnerability window');

  // Time passes past 0.20s
  invulnerableTimer = 0;

  // Attack 2: occurs after invulnerability expires
  takeDamage(35);
  assert.strictEqual(playerHealth, 65, 'Damage must register normally once invulnerability expires');
});

runTest('Shift tap (<180ms) with movement key triggers dash, while holding (>=180ms) activates sprint without dash', () => {
  const tapMaxDuration = moveCfg.dashTapMaxDuration; // 0.18s

  // Helper simulating player shift input state machine
  const simulateShiftAction = (heldDuration, isMoving) => {
    let sprintStarted = false;
    let dashTriggered = false;

    // Shift pressed and held
    if (heldDuration >= tapMaxDuration && isMoving) {
      sprintStarted = true;
    }

    // Shift released
    if (!sprintStarted && heldDuration < tapMaxDuration && isMoving) {
      dashTriggered = true;
    }

    return { sprintStarted, dashTriggered };
  };

  // Case A: Tap for 100ms with movement key -> Must trigger DASH
  const tapResult = simulateShiftAction(0.10, true);
  assert.strictEqual(tapResult.dashTriggered, true, 'Short tap (<180ms) with movement must trigger dash');
  assert.strictEqual(tapResult.sprintStarted, false, 'Short tap must NOT activate sprint');

  // Case B: Hold for 300ms with movement key -> Must activate SPRINT, NO DASH on release
  const holdResult = simulateShiftAction(0.30, true);
  assert.strictEqual(holdResult.sprintStarted, true, 'Hold (>=180ms) must activate sprint');
  assert.strictEqual(holdResult.dashTriggered, false, 'Releasing after sprint must NOT trigger dash');

  // Case C: Tap for 100ms WITHOUT movement key (stationary) -> Must NOT trigger DASH
  const stationaryTap = simulateShiftAction(0.10, false);
  assert.strictEqual(stationaryTap.dashTriggered, false, 'Tap without movement key must NOT trigger dash');
});

runTest('Dash enforces strict 1.20s cooldown between activations', () => {
  let dashCooldown = 0;

  const triggerDash = () => {
    if (dashCooldown <= 0) {
      dashCooldown = moveCfg.dashCooldown; // 1.20s
      return true;
    }
    return false;
  };

  assert.strictEqual(triggerDash(), true, 'First dash succeeds');
  assert.strictEqual(dashCooldown, 1.20);
  assert.strictEqual(triggerDash(), false, 'Second dash blocked during cooldown');

  dashCooldown -= 1.20;
  assert.strictEqual(triggerDash(), true, 'Dash succeeds again after 1.2s cooldown');
});

console.log('\n================================');
console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
