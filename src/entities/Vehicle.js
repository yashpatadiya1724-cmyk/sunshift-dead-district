import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';
import { assets } from '../core/Assets.js';

// Module-level scratch vectors to eliminate per-frame allocations
const _carForward = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _carStep = new THREE.Vector3();
const _testCarPos = new THREE.Vector3();
const _sideOffset = new THREE.Vector3();

export class Vehicle {
  constructor(scene, sound, effects) {
    this.scene = scene;
    this.sound = sound;
    this.effects = effects;

    this.isOccupied = false;
    this.speed = 0;
    this.yaw = 0;
    this.steerAngle = 0;
    this.health = CONFIG.vehicle.maxHealth;
    this.isDestroyed = false;
    this.respawnTimer = 0;
    this.wheels = [];

    // 1. Instance Car Model (GLB or Procedural Fallback)
    const carInstance = assets.getInstance('car');
    if (carInstance) {
      this.mesh = carInstance;
      this.findWheelMeshes();
    } else {
      this.mesh = new THREE.Group();
      this.buildDefaultMuscleCar();
    }

    // 2. Headlights & SpotLight setup
    this.setupHeadlights();

    // Initial Placement
    this.reset();
    this.scene.add(this.mesh);

    // Handle 'F' key enter/exit listener
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF') {
        this.toggleEntry();
      }
    });
  }

  findWheelMeshes() {
    this.wheels = [];
    this.mesh.traverse((node) => {
      if (node.isMesh && (node.name.toLowerCase().includes('wheel') || node.name.startsWith('wheel_'))) {
        this.wheels.push(node);
      }
    });
  }

  buildDefaultMuscleCar() {
    // 1. Chassis
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x991111,
      roughness: 0.35,
      metalness: 0.55
    });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.65, 4.4), bodyMat);
    chassis.position.y = 0.55;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.mesh.add(chassis);

    // 2. Cabin
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x14181f,
      roughness: 0.25,
      metalness: 0.75
    });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.62, 2.3), cabinMat);
    cabin.position.set(0, 1.15, -0.3);
    cabin.castShadow = true;
    this.mesh.add(cabin);

    // 3. Wheels
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x151515,
      roughness: 0.85,
      metalness: 0.2
    });
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.35, 14);
    wheelGeo.rotateZ(Math.PI / 2);

    const offsets = [
      [-1.15, 0.38, 1.35],
      [1.15, 0.38, 1.35],
      [-1.15, 0.38, -1.35],
      [1.15, 0.38, -1.35]
    ];

    offsets.forEach(([wx, wy, wz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx, wy, wz);
      w.castShadow = true;
      this.mesh.add(w);
      this.wheels.push(w);
    });
  }

  setupHeadlights() {
    const lightGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffcc, fog: false });
    const lightGeo = new THREE.BoxGeometry(0.35, 0.18, 0.1);

    const leftLightMesh = new THREE.Mesh(lightGeo, lightGlowMat);
    leftLightMesh.position.set(-0.8, 0.65, 2.21);
    this.mesh.add(leftLightMesh);

    const rightLightMesh = new THREE.Mesh(lightGeo, lightGlowMat);
    rightLightMesh.position.set(0.8, 0.65, 2.21);
    this.mesh.add(rightLightMesh);

    this.headlightSpot = new THREE.SpotLight(0xffffdd, 0, 45, Math.PI / 4.5, 0.4, 1.2);
    this.headlightSpot.position.set(0, 0.8, 2.3);
    this.headlightTarget = new THREE.Object3D();
    this.headlightTarget.position.set(0, 0.5, 25);
    this.mesh.add(this.headlightSpot);
    this.mesh.add(this.headlightTarget);
    this.headlightSpot.target = this.headlightTarget;
  }

  reset() {
    this.isOccupied = false;
    this.speed = 0;
    this.yaw = 0;
    this.health = CONFIG.vehicle.maxHealth;
    this.isDestroyed = false;
    this.respawnTimer = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(CONFIG.vehicle.spawnPosition);
    this.mesh.rotation.set(0, 0, 0);
    this.headlightSpot.intensity = 0;

    if (this.sound) this.sound.stopEngine();
    events.emit('vehicleState', { inVehicle: false, speed: 0, health: this.health });
  }

  toggleEntry() {
    const player = window.__SUNSHIFT_GAME__?.player;
    if (!player || this.isDestroyed) return;

    if (!this.isOccupied) {
      const dist = player.mesh.position.distanceTo(this.mesh.position);
      if (dist <= CONFIG.vehicle.enterRadius) {
        this.enter(player);
      }
    } else {
      this.exit(player);
    }
  }

  enter(player) {
    this.isOccupied = true;
    player.isInVehicle = true;
    player.mesh.visible = false;
    if (this.sound) this.sound.startEngine();
    events.emit('vehicleState', { inVehicle: true, speed: this.speed, health: this.health });
  }

  exit(player) {
    this.isOccupied = false;
    player.isInVehicle = false;
    player.mesh.visible = true;

    // Eject player slightly to the left of the car without runtime allocation
    // Try left, right, back, front and use the first spot that is not inside an obstacle
    const colliders = window.__SUNSHIFT_GAME__?.city?.colliders || [];
    for (const [x, z] of [[-2.2, 0], [2.2, 0], [0, -3.2], [0, 3.2]]) {
      _sideOffset.set(x, 0, z).applyAxisAngle(_upAxis, this.yaw);
      player.mesh.position.copy(this.mesh.position).add(_sideOffset);
      player.mesh.position.y = 0;
      if (!player.checkCollisions(player.mesh.position, colliders)) break;
      player.mesh.position.copy(this.mesh.position);
    }

    if (this.sound) this.sound.stopEngine();
    events.emit('vehicleState', { inVehicle: false, speed: 0, health: this.health });
  }

  update(dt, input, cityColliders, zombies, isNight) {
    if (this.isDestroyed) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.reset();
      }
      return;
    }

    this.headlightSpot.intensity = isNight ? 2.5 : 0;

    if (!this.isOccupied) {
      if (Math.abs(this.speed) > 0.1) {
        this.speed -= Math.sign(this.speed) * CONFIG.vehicle.friction * dt;
        this.moveWithCollisions(dt, cityColliders);
      } else {
        this.speed = 0;
      }
      return;
    }

    // 1. Controls & Acceleration
    const isHandbraking = input.isKey('Space');

    if (input.isKey('KeyW')) {
      this.speed = Math.min(CONFIG.vehicle.maxSpeed, this.speed + CONFIG.vehicle.acceleration * dt);
    } else if (input.isKey('KeyS')) {
      if (this.speed > 0.5) {
        this.speed = Math.max(0, this.speed - CONFIG.vehicle.braking * dt);
      } else {
        this.speed = Math.max(CONFIG.vehicle.reverseSpeed, this.speed - CONFIG.vehicle.acceleration * 0.7 * dt);
      }
    } else {
      if (Math.abs(this.speed) > 0.1) {
        this.speed -= Math.sign(this.speed) * CONFIG.vehicle.friction * dt;
      } else {
        this.speed = 0;
      }
    }

    if (isHandbraking) {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, CONFIG.vehicle.handbrakeDecel * 0.05 * dt);
    }

    // 2. Steering based on speed ratio
    if (Math.abs(this.speed) > 0.2) {
      const steerDir = this.speed >= 0 ? 1 : -1;
      if (input.isKey('KeyA')) {
        this.yaw += CONFIG.vehicle.steerSpeed * steerDir * dt;
      }
      if (input.isKey('KeyD')) {
        this.yaw -= CONFIG.vehicle.steerSpeed * steerDir * dt;
      }
    }

    this.mesh.rotation.y = this.yaw;

    // 3. Movement & Collision
    this.moveWithCollisions(dt, cityColliders);

    // 4. Wheels Rotation Animation
    if (this.wheels.length > 0 && Math.abs(this.speed) > 0.01) {
      const spinDelta = (this.speed / 0.38) * dt;
      this.wheels.forEach((w) => {
        w.rotation.x += spinDelta;
      });
    }

    // 5. Zombie Roadkill Check
    this.checkZombieRoadkill(zombies);

    // 6. Sound & Engine Pitch
    if (this.sound) {
      const speedRatio = Math.abs(this.speed) / CONFIG.vehicle.maxSpeed;
      this.sound.updateEngine(speedRatio);
    }

    // 7. Emit state for HUD
    events.emit('vehicleState', {
      inVehicle: true,
      speed: Math.abs(Math.round(this.speed * 3.6)),
      health: this.health
    });
  }

  moveWithCollisions(dt, colliders) {
    _carForward.set(0, 0, 1).applyAxisAngle(_upAxis, this.yaw);
    _carStep.copy(_carForward).multiplyScalar(this.speed * dt);

    // Check X axis
    _testCarPos.copy(this.mesh.position);
    _testCarPos.x += _carStep.x;
    if (!this.checkCarCollision(_testCarPos, colliders)) {
      this.mesh.position.x = _testCarPos.x;
    } else {
      this.onBuildingCrash(Math.abs(this.speed));
      this.speed *= -0.3;
    }

    // Check Z axis
    _testCarPos.copy(this.mesh.position);
    _testCarPos.z += _carStep.z;
    if (!this.checkCarCollision(_testCarPos, colliders)) {
      this.mesh.position.z = _testCarPos.z;
    } else {
      this.onBuildingCrash(Math.abs(this.speed));
      this.speed *= -0.3;
    }
  }

  checkCarCollision(pos, colliders) {
    const radius = 1.6;
    for (let i = 0; i < colliders.length; i++) {
      const box = colliders[i];
      if (
        pos.x > box.min.x - radius && pos.x < box.max.x + radius &&
        pos.z > box.min.z - radius && pos.z < box.max.z + radius
      ) {
        return true;
      }
    }
    return false;
  }

  onBuildingCrash(impactSpeed) {
    if (impactSpeed > 6.0) {
      const damage = Math.round(impactSpeed * 1.5);
      this.health = Math.max(0, this.health - damage);
      if (this.effects) this.effects.addShake(0.2);

      if (this.health <= 0) {
        this.explode();
      }
    }
  }

  checkZombieRoadkill(zombies) {
    if (Math.abs(this.speed) < CONFIG.vehicle.roadkillMinSpeed) return;

    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (z.isDead) continue;

      const dist = this.mesh.position.distanceTo(z.mesh.position);
      if (dist < 2.6) {
        z.takeDamage(999);
        if (this.effects) {
          this.effects.spawnBlood(z.mesh.position);
          this.effects.addShake(0.12);
        }
      }
    }
  }

  explode() {
    this.isDestroyed = true;
    this.mesh.visible = false;
    this.respawnTimer = CONFIG.vehicle.respawnDelay;

    if (this.sound) {
      this.sound.stopEngine();
      this.sound.carExplosion();
    }
  }
}
