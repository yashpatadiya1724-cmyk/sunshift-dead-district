// ===== SUNSHIFT: DEAD DISTRICT - JUMP KINEMATICS & GROUND INTEGRATION TEST =====
import assert from 'node:assert';
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { Player } from '../src/entities/Player.js';

console.log('🦘 Starting Jump Integration Test Suite (test/jump_integration_test.js)...\n');

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

// Minimal mock environment for Player in Node.js
globalThis.document = {
  getElementById: () => ({
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    innerText: '',
    getContext: () => ({
      clearRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {}
    })
  })
};
globalThis.window = {
  addEventListener: () => {}
};

class MockInput {
  constructor() {
    this.keys = {};
    this.mouse = { isDown: false, isRightDown: false, deltaX: 0, deltaY: 0 };
  }
  isKey(code) {
    return !!this.keys[code];
  }
  isMouseDown() {
    return false;
  }
  consumeMouseDelta() {
    return { x: 0, y: 0 };
  }
}

function runJumpSimulation(spaceHoldFrames, totalFrames = 120, dt = 1 / 60, cityRayTargets = []) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const input = new MockInput();
  const player = new Player(scene, camera, input, null, null);

  let jumpCount = 0;
  let apexHeight = 0;
  let apexFrame = 0;
  let flightFrames = 0;
  let landedFrame = -1;
  const trajectory = [];

  for (let frame = 0; frame < totalFrames; frame++) {
    input.keys['Space'] = frame < spaceHoldFrames;

    const wasGrounded = player.isGrounded;
    player.update(dt, [], [], cityRayTargets);

    if (wasGrounded && !player.isGrounded) {
      jumpCount++;
    }

    if (!player.isGrounded) {
      flightFrames++;
      if (player.mesh.position.y > apexHeight) {
        apexHeight = player.mesh.position.y;
        apexFrame = frame;
      }
    } else if (jumpCount > 0 && landedFrame === -1) {
      landedFrame = frame;
    }

    trajectory.push({
      frame,
      time: frame * dt,
      y: player.mesh.position.y,
      velocityY: player.velocityY,
      isGrounded: player.isGrounded,
      coyoteTimer: player.coyoteTimer,
      jumpBufferTimer: player.jumpBufferTimer
    });
  }

  return { player, jumpCount, apexHeight, apexFrame, flightFrames, landedFrame, trajectory };
}

// ===== 1. APEX HEIGHT & FLIGHT TIME =====
console.log('--- Suite 1: Jump Kinematics (Single Tap) ---');

runTest('Single Space press reaches expected apex height (~1.77m) and returns to ground', () => {
  const sim = runJumpSimulation(5, 120);
  // Theoretical: v0 = 9.0, g = 22.0 => apex = 9^2 / (2 * 22) = 1.84m. Discrete 60fps simulation gives ~1.77m
  assert(sim.apexHeight >= 1.70 && sim.apexHeight <= 1.90, `Apex height expected between 1.70m and 1.90m, got ${sim.apexHeight.toFixed(3)}m`);
  assert(sim.apexFrame >= 20 && sim.apexFrame <= 26, `Apex frame expected ~23 (t ~0.38s), got ${sim.apexFrame}`);
  assert.strictEqual(sim.jumpCount, 1, `Expected exactly 1 jump, got ${sim.jumpCount}`);
});

runTest('Flight time is ~0.80s-0.85s (48-52 frames) and lands cleanly at y = 0', () => {
  const sim = runJumpSimulation(5, 120);
  assert(sim.flightFrames >= 47 && sim.flightFrames <= 53, `Flight frames expected 47-53, got ${sim.flightFrames}`);
  assert.strictEqual(sim.player.isGrounded, true, 'Player must be grounded after flight');
  assert.strictEqual(sim.player.mesh.position.y, 0, 'Player Y must be 0 after landing');
  assert.strictEqual(sim.player.velocityY, 0, 'VelocityY must be 0 after landing');
});

// ===== 2. SPACE HELD DOWN (EDGE TRIGGER VERIFICATION) =====
console.log('--- Suite 2: Continuous Space Hold Edge Trigger ---');

runTest('Holding Space down for all 120 frames triggers EXACTLY 1 jump (no infinite jumping)', () => {
  const sim = runJumpSimulation(120, 120);
  assert.strictEqual(sim.jumpCount, 1, `Holding Space must execute exactly 1 jump, got ${sim.jumpCount}`);
  assert.strictEqual(sim.player.isGrounded, true, 'Player must remain grounded after landing despite Space held');
  assert.strictEqual(sim.player.mesh.position.y, 0, 'Player must be at ground y=0');
  assert.strictEqual(sim.player.velocityY, 0, 'VelocityY must be 0');
});

runTest('Timers: coyoteTimer and jumpBufferTimer are zeroed immediately upon jump', () => {
  const sim = runJumpSimulation(5, 120);
  const jumpStartFrame = sim.trajectory[0];
  assert.strictEqual(jumpStartFrame.coyoteTimer, 0, 'coyoteTimer must be 0 immediately upon jump');
  assert.strictEqual(jumpStartFrame.jumpBufferTimer, 0, 'jumpBufferTimer must be 0 immediately upon jump');
});

// ===== 3. GROUND CHECK SELF-MESH IMMUNITY =====
console.log('--- Suite 3: Ground Raycast Ignores Self-Mesh ---');

runTest('Ground check ignores player mesh and children in cityRayTargets', () => {
  // Construct dummy scene with player's own mesh added to targets list
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const input = new MockInput();
  const player = new Player(scene, camera, input, null, null);

  // Deliberately include player's mesh in ray targets
  const targets = [player.mesh];

  // In mid-air at y = 5.0
  player.mesh.position.y = 5.0;
  player.isGrounded = false;
  player.velocityY = 0;

  player.update(1 / 60, [], [], targets);

  // Ground check must NOT hit player.mesh and must NOT ground the player at y=5.0
  assert.strictEqual(player.isGrounded, false, 'Player must not be grounded by intersecting their own mesh');
  assert(player.mesh.position.y < 5.0, 'Player must fall downward under gravity');
});

console.log(`\nJump Integration Tests Completed: ${testsPassed} passed, ${testsFailed} failed.\n`);
if (testsFailed > 0) process.exit(1);
