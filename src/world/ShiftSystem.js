import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';

export class ShiftSystem {
  constructor(scene, dirLight, hemiLight, bloomPass, city, sound, effects) {
    this.scene = scene;
    this.dirLight = dirLight;
    this.hemiLight = hemiLight;
    this.bloomPass = bloomPass;
    this.city = city;
    this.sound = sound;
    this.effects = effects;

    this.isNight = false;
    this.cycleDuration = CONFIG?.shift?.cycleDuration ?? 30.0;
    this.timer = this.cycleDuration;
    this.lastWarningSec = -1;

    // Day visual settings
    this.dayFog = new THREE.Color(CONFIG?.shift?.dayFog ?? 0xd0e0e3);
    this.dayFogDensity = CONFIG?.shift?.dayFogDensity ?? 0.012;
    this.daySky = new THREE.Color(CONFIG?.shift?.daySky ?? 0x87ceeb);
    this.dayDirColor = new THREE.Color(CONFIG?.shift?.dayDirColor ?? 0xfffaed);
    this.dayDirIntensity = CONFIG?.shift?.dayDirIntensity ?? 1.4;
    this.dayHemiSky = new THREE.Color(CONFIG?.shift?.dayHemiSky ?? 0xb1e1ff);
    this.dayHemiGround = new THREE.Color(CONFIG?.shift?.dayHemiGround ?? 0x3a3d40);
    this.dayHemiIntensity = CONFIG?.shift?.dayHemiIntensity ?? 0.6;
    this.dayBloom = CONFIG?.shift?.dayBloom ?? 0.5;
    this.dayWindowGlow = CONFIG?.shift?.dayWindowGlow ?? 0.3;

    // Night visual settings
    this.nightFog = new THREE.Color(CONFIG?.shift?.nightFog ?? 0x1a0505);
    this.nightFogDensity = CONFIG?.shift?.nightFogDensity ?? 0.020;
    this.nightSky = new THREE.Color(CONFIG?.shift?.nightSky ?? 0x0a0002);
    this.nightDirColor = new THREE.Color(CONFIG?.shift?.nightDirColor ?? 0xff2222);
    this.nightDirIntensity = CONFIG?.shift?.nightDirIntensity ?? 0.4;
    this.nightHemiSky = new THREE.Color(CONFIG?.shift?.nightHemiSky ?? 0x330005);
    this.nightHemiGround = new THREE.Color(CONFIG?.shift?.nightHemiGround ?? 0x150002);
    this.nightHemiIntensity = CONFIG?.shift?.nightHemiIntensity ?? 0.2;
    this.nightBloom = CONFIG?.shift?.nightBloom ?? 1.0;
    this.nightWindowGlow = CONFIG?.shift?.nightWindowGlow ?? 1.5;

    this.applyDayInstant();
  }

  applyDayInstant() {
    this.scene.fog.color.copy(this.dayFog);
    this.scene.fog.density = this.dayFogDensity;
    this.scene.background.copy(this.daySky);
    this.dirLight.color.copy(this.dayDirColor);
    this.dirLight.intensity = this.dayDirIntensity;
    this.hemiLight.color.copy(this.dayHemiSky);
    this.hemiLight.groundColor.copy(this.dayHemiGround);
    this.hemiLight.intensity = this.dayHemiIntensity;

    if (this.bloomPass) {
      this.bloomPass.strength = this.dayBloom;
    }
    if (this.city) {
      this.city.setWindowGlow(this.dayWindowGlow, 1.0);
    }
  }

  reset() {
    this.isNight = false;
    this.timer = this.cycleDuration;
    this.lastWarningSec = -1; // Clear warning state
    this.applyDayInstant();

    if (this.sound) {
      this.sound.setNight(false);
    }

    const icon = document.getElementById('shift-icon');
    const name = document.getElementById('shift-name');
    const progress = document.getElementById('shift-progress');

    if (icon) icon.innerText = '☀️';
    if (name) {
      name.innerText = 'DAY SHIFT (CALM)';
      name.style.color = '#ffcc00';
    }
    if (progress) {
      progress.style.background = '#ffaa00';
    }
  }

  update(dt, onShiftCallback) {
    this.timer -= dt;

    // Trigger warning beep and visual pulse on each integer second within the final 5s
    if (this.timer <= 5 && this.timer > 0) {
      const wholeSec = Math.ceil(this.timer);
      if (wholeSec !== this.lastWarningSec) {
        this.lastWarningSec = wholeSec;

        // Beep audio
        if (this.sound) {
          if (typeof this.sound.shiftWarningBeep === 'function') {
            this.sound.shiftWarningBeep();
          } else if (typeof this.sound.warningBeep === 'function') {
            this.sound.warningBeep();
          }
        }

        // Screen edge pulse: red if night is coming, white if day is coming
        if (this.effects && typeof this.effects.pulseWarning === 'function') {
          this.effects.pulseWarning(!this.isNight);
        }

        events.emit('shiftWarningPulse', { secondsLeft: wholeSec });
      }
    }

    if (this.timer <= 0) {
      this.triggerShift();
      if (onShiftCallback) {
        onShiftCallback(this.isNight);
      }
    }

    this.applyShiftVisuals(dt);
  }

  triggerShift() {
    this.isNight = !this.isNight;
    this.timer = this.cycleDuration;
    this.lastWarningSec = -1; // Clear warning state

    // Notify all systems
    events.emit('shift', { isNight: this.isNight });

    if (this.sound) {
      if (typeof this.sound.shiftAlarm === 'function') this.sound.shiftAlarm();
      this.sound.setNight(this.isNight);
    }

    if (this.effects) {
      this.effects.flashShift(this.isNight);
      if (this.isNight) {
        this.effects.showBanner('NIGHT FALLS', '#ff3333');
      } else {
        this.effects.showBanner('DAWN BREAKS', '#ffcc00');
      }
    }

    const icon = document.getElementById('shift-icon');
    const name = document.getElementById('shift-name');
    const progress = document.getElementById('shift-progress');

    if (this.isNight) {
      if (icon) icon.innerText = '🩸';
      if (name) {
        name.innerText = 'NIGHT SHIFT (DANGER)';
        name.style.color = '#ff3333';
      }
      if (progress) progress.style.background = '#ff2222';
    } else {
      if (icon) icon.innerText = '☀️';
      if (name) {
        name.innerText = 'DAY SHIFT (CALM)';
        name.style.color = '#ffcc00';
      }
      if (progress) progress.style.background = '#ffaa00';
    }
  }

  applyShiftVisuals(dt) {
    const k = 1 - Math.exp(-3 * dt);

    const targetFog = this.isNight ? this.nightFog : this.dayFog;
    const targetDensity = this.isNight ? this.nightFogDensity : this.dayFogDensity;
    const targetSky = this.isNight ? this.nightSky : this.daySky;
    const targetDir = this.isNight ? this.nightDirColor : this.dayDirColor;
    const targetDirInt = this.isNight ? this.nightDirIntensity : this.dayDirIntensity;
    const targetHemiSky = this.isNight ? this.nightHemiSky : this.dayHemiSky;
    const targetHemiGround = this.isNight ? this.nightHemiGround : this.dayHemiGround;
    const targetHemiInt = this.isNight ? this.nightHemiIntensity : this.dayHemiIntensity;
    const targetBloom = this.isNight ? this.nightBloom : this.dayBloom;
    const targetGlow = this.isNight ? this.nightWindowGlow : this.dayWindowGlow;

    this.scene.fog.color.lerp(targetFog, k);
    this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, targetDensity, k);
    this.scene.background.lerp(targetSky, k);

    this.dirLight.color.lerp(targetDir, k);
    this.dirLight.intensity = THREE.MathUtils.lerp(this.dirLight.intensity, targetDirInt, k);

    this.hemiLight.color.lerp(targetHemiSky, k);
    this.hemiLight.groundColor.lerp(targetHemiGround, k);
    this.hemiLight.intensity = THREE.MathUtils.lerp(this.hemiLight.intensity, targetHemiInt, k);

    if (this.bloomPass) {
      this.bloomPass.strength = THREE.MathUtils.lerp(this.bloomPass.strength, targetBloom, k);
    }

    if (this.city) {
      this.city.setWindowGlow(targetGlow, k);
    }
  }
}
