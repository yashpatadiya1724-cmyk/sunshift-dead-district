import * as THREE from 'three';

/**
 * Atmosphere.js
 * Manages weather particles (pooled rain particles capped at 300), night fog,
 * and wet asphalt roughness transitions.
 */
export class Atmosphere {
  constructor(scene) {
    this.scene = scene;
    this.isNight = false;

    // 1. Pooled Rain Particles (Exactly 300 points for laptop 60 FPS)
    this.maxRainDrops = 300;
    this.rainGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxRainDrops * 3);
    const velocities = new Float32Array(this.maxRainDrops);

    for (let i = 0; i < this.maxRainDrops; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 50;
      positions[i * 3 + 1] = Math.random() * 25;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      velocities[i] = 18 + Math.random() * 8;
    }

    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.velocities = velocities;

    this.rainMat = new THREE.PointsMaterial({
      color: 0x99bbff,
      size: 0.35,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.rainParticles = new THREE.Points(this.rainGeo, this.rainMat);
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
  }

  setShiftPhase(isNight, groundMat = null, quality = 'HIGH') {
    this.isNight = isNight;
    const allowRain = isNight && quality === 'HIGH';
    this.rainParticles.visible = allowRain;

    // Wet asphalt transition (only in HIGH quality)
    if (groundMat) {
      if (quality === 'HIGH') {
        groundMat.roughness = isNight ? 0.36 : 0.85;
        groundMat.metalness = isNight ? 0.30 : 0.08;
      } else {
        groundMat.roughness = 0.85;
        groundMat.metalness = 0.08;
      }
      groundMat.needsUpdate = true;
    }
  }

  update(dt, focusPosition) {
    if (!this.isNight || !this.rainParticles.visible) return;

    // Center rain bounding volume over player / vehicle
    const posAttr = this.rainGeo.attributes.position;
    const posArray = posAttr.array;
    const centerX = focusPosition ? focusPosition.x : 0;
    const centerZ = focusPosition ? focusPosition.z : 0;

    for (let i = 0; i < this.maxRainDrops; i++) {
      const idx = i * 3;
      posArray[idx + 1] -= this.velocities[i] * dt;

      // Wrap around ground to sky
      if (posArray[idx + 1] <= 0) {
        posArray[idx] = centerX + (Math.random() - 0.5) * 45;
        posArray[idx + 1] = 22 + Math.random() * 6;
        posArray[idx + 2] = centerZ + (Math.random() - 0.5) * 45;
      }
    }
    posAttr.needsUpdate = true;
  }
}
