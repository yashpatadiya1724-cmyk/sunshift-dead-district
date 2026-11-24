import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/**
 * SkyLighting.js
 * Implements physical atmospheric scattering Sky and PMREM environment reflections.
 * PMREM environment map is regenerated only upon Shift events (Day <-> Night) for 60 FPS performance.
 */
export class SkyLighting {
  constructor(scene, renderer, dirLight) {
    this.scene = scene;
    this.renderer = renderer;
    this.dirLight = dirLight;

    // 1. Setup Physical Sky
    this.sky = new Sky();
    this.sky.scale.setScalar(4500); // Envelop the entire city district
    this.scene.add(this.sky);

    this.sunPosition = new THREE.Vector3();
    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.pmremGenerator.compileEquirectangularShader();

    // Dedicated offscreen sky scene for PMREM baking
    this.skyScene = new THREE.Scene();
    this.bakingSky = new Sky();
    this.bakingSky.scale.setScalar(4500);
    this.skyScene.add(this.bakingSky);

    // Initial Day parameters
    this.elevation = 45; // Degrees
    this.azimuth = 180;
    this.turbidity = 2.5;
    this.rayleigh = 1.2;
    this.mieCoefficient = 0.005;
    this.mieDirectionalG = 0.8;

    this.targetElevation = 45;
    this.targetTurbidity = 2.5;
    this.targetRayleigh = 1.2;

    // Pre-bake Day and Night PMREM environment maps once at boot
    this.dayEnvMap = null;
    this.nightEnvMap = null;
    this.prebakeEnvironmentMaps();

    this.updateSun(false);
  }

  prebakeEnvironmentMaps() {
    try {
      // 1. Bake Day Environment
      this.setSkyParams(this.bakingSky, 45, 180, 2.5, 1.2, 0.005, 0.8);
      const dayTarget = this.pmremGenerator.fromScene(this.skyScene);
      this.dayEnvMap = dayTarget.texture;

      // 2. Bake Night Environment
      this.setSkyParams(this.bakingSky, -2.5, 180, 12.0, 4.5, 0.005, 0.8);
      const nightTarget = this.pmremGenerator.fromScene(this.skyScene);
      this.nightEnvMap = nightTarget.texture;

      // Assign initial day environment
      this.scene.environment = this.dayEnvMap;
    } catch (e) {
      console.warn('Pre-bake PMREM fallback:', e);
    }
  }

  setSkyParams(targetSky, elevation, azimuth, turbidity, rayleigh, mieCoefficient, mieDirectionalG) {
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    const sunPos = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

    const uniforms = targetSky.material.uniforms;
    uniforms['turbidity'].value = turbidity;
    uniforms['rayleigh'].value = rayleigh;
    uniforms['mieCoefficient'].value = mieCoefficient;
    uniforms['mieDirectionalG'].value = mieDirectionalG;
    uniforms['sunPosition'].value.copy(sunPos);
  }

  setShiftPhase(isNight) {
    if (isNight) {
      // Dark crimson/blood sky
      this.targetElevation = -2.5;
      this.targetTurbidity = 12.0;
      this.targetRayleigh = 4.5;
      if (this.nightEnvMap) this.scene.environment = this.nightEnvMap;
    } else {
      // Golden sunlight sky
      this.targetElevation = 52.0;
      this.targetTurbidity = 2.2;
      this.targetRayleigh = 1.1;
      if (this.dayEnvMap) this.scene.environment = this.dayEnvMap;
    }
    // Update sun position without mid-game PMREM rebaking
    this.elevation = this.targetElevation;
    this.turbidity = this.targetTurbidity;
    this.rayleigh = this.targetRayleigh;
    this.updateSun(false);
  }

  updateSun(bakeEnvironment = false) {
    const phi = THREE.MathUtils.degToRad(90 - this.elevation);
    const theta = THREE.MathUtils.degToRad(this.azimuth);

    this.sunPosition.setFromSphericalCoords(1, phi, theta);

    // Update active sky uniforms
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = this.turbidity;
    uniforms['rayleigh'].value = this.rayleigh;
    uniforms['mieCoefficient'].value = this.mieCoefficient;
    uniforms['mieDirectionalG'].value = this.mieDirectionalG;
    uniforms['sunPosition'].value.copy(this.sunPosition);

    // Update directional light position aligned with sun direction
    if (this.dirLight) {
      this.dirLight.position.copy(this.sunPosition).multiplyScalar(80);
      this.dirLight.position.y = Math.max(15, this.dirLight.position.y);
    }

    if (bakeEnvironment) {
      this.bakeEnvironmentMap();
    }
  }

  bakeEnvironmentMap() {
    try {
      const bakeUniforms = this.bakingSky.material.uniforms;
      bakeUniforms['turbidity'].value = this.turbidity;
      bakeUniforms['rayleigh'].value = this.rayleigh;
      bakeUniforms['mieCoefficient'].value = this.mieCoefficient;
      bakeUniforms['mieDirectionalG'].value = this.mieDirectionalG;
      bakeUniforms['sunPosition'].value.copy(this.sunPosition);

      const renderTarget = this.pmremGenerator.fromScene(this.skyScene);
      if (this.scene.environment && this.scene.environment.dispose) {
        this.scene.environment.dispose();
      }
      this.scene.environment = renderTarget.texture;
    } catch (e) {
      // Fallback silently if WebGL context busy
    }
  }

  update(dt) {
    // Smooth lerp if transitioning
    if (Math.abs(this.elevation - this.targetElevation) > 0.05) {
      this.elevation = THREE.MathUtils.lerp(this.elevation, this.targetElevation, dt * 2.5);
      this.turbidity = THREE.MathUtils.lerp(this.turbidity, this.targetTurbidity, dt * 2.5);
      this.rayleigh = THREE.MathUtils.lerp(this.rayleigh, this.targetRayleigh, dt * 2.5);
      this.updateSun(false);
    }
  }
}
