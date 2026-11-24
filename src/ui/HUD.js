import { events } from '../core/Events.js';
import { CONFIG } from '../config.js';

export class HUD {
  update(dt) {}

  constructor(game) {
    this.game = game;

    // Cache exact DOM Elements by required IDs
    this.uiLayer = document.getElementById('ui-layer');
    this.crosshair = document.getElementById('crosshair');
    this.vehiclePrompt = document.getElementById('vehicle-prompt');
    this.vehicleHud = document.getElementById('vehicle-hud');
    this.vehicleSpeed = document.getElementById('vehicle-speed');
    this.carHealthBar = document.getElementById('car-health-bar');
    this.objectiveTracker = document.getElementById('objective-tracker');
    this.objArrow = document.getElementById('obj-arrow');
    this.objLabel = document.getElementById('obj-label');
    this.objDist = document.getElementById('obj-dist');
    this.shiftProgress = document.getElementById('shift-progress');
    this.killCounter = document.getElementById('kill-counter');
    this.survivalTimer = document.getElementById('survival-timer');
    this.healthBar = document.getElementById('health-bar');
    this.healthText = document.getElementById('health-text');
    this.weaponName = document.getElementById('weapon-name');
    this.ammoVal = document.getElementById('ammo-val');
    this.reloadBarWrap = document.getElementById('reload-bar-wrap');
    this.reloadProgressBar = document.getElementById('reload-progress-bar');
    this.flareStatusTxt = document.getElementById('flare-status-txt');
    this.flareCdBar = document.getElementById('flare-cd-bar');
    this.damageArc = document.getElementById('damage-direction-arc');

    // Minimap Canvas (160x160)
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
    this.minimapTimer = 0;
    this.minimapInterval = 1 / 30; // 30 FPS target for minimap

    // Internal State
    this.survivalTime = 0;
    this.lastStartTime = null;
    this.damageArcOpacity = 0;
    this.crosshairTimer = null;
    this.lastFrameTime = performance.now();

    // Initial values
    this.initInitialState();
    this.initEvents();

    // Start independent animation loop
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  initInitialState() {
    // Initial health display
    const initialHealth = this.game.player?.health ?? 100;
    const initialMaxHealth = this.game.player?.maxHealth ?? 100;
    this.updateHealth(initialHealth, initialMaxHealth);

    // Initial weapon state
    if (this.weaponName) this.weaponName.textContent = 'PISTOL';
    if (this.ammoVal) this.ammoVal.textContent = '12 / ∞';
    if (this.reloadBarWrap) this.reloadBarWrap.style.display = 'none';
    if (this.reloadProgressBar) this.reloadProgressBar.style.width = '0%';

    // Initial damage indicator & flare status
    if (this.damageArc) this.damageArc.style.opacity = '0';
    if (this.flareStatusTxt) this.flareStatusTxt.textContent = 'READY';
    if (this.flareCdBar) this.flareCdBar.style.width = '0%';
    if (this.killCounter) this.killCounter.textContent = '0';
  }

  initEvents() {
    // 1. Game State Change: payload is a string ('PLAYING', 'PAUSED', 'MENU', 'WIN', 'LOSE')
    events.on('stateChange', (state) => {
      const isPlaying = state === 'PLAYING';
      if (this.uiLayer) {
        this.uiLayer.style.display = isPlaying ? 'block' : 'none';
      }
      if (!isPlaying) {
        if (this.damageArc) {
          this.damageArcOpacity = 0;
          this.damageArc.style.opacity = '0';
        }
        if (this.crosshair) {
          this.crosshair.classList.remove('spread');
        }
      }
    });

    // 2. Weapon State: { name, mag, reserve, isReloading, reloadProgress }
    events.on('weaponState', ({ name, mag, reserve, isReloading, reloadProgress }) => {
      if (this.weaponName && name) {
        this.weaponName.textContent = name.toUpperCase();
      }
      if (this.ammoVal) {
        const reserveText = reserve === Infinity ? '∞' : (reserve ?? 0);
        this.ammoVal.textContent = `${mag ?? 0} / ${reserveText}`;
      }
      if (this.reloadBarWrap && this.reloadProgressBar) {
        if (isReloading) {
          this.reloadBarWrap.style.display = 'block';
          const pct = Math.min(100, Math.max(0, (reloadProgress || 0) * 100));
          this.reloadProgressBar.style.width = `${pct.toFixed(0)}%`;
        } else {
          this.reloadBarWrap.style.display = 'none';
          this.reloadProgressBar.style.width = '0%';
        }
      }
    });

    // 3. Player Hurt: { amount, from (Vector3), health }
    events.on('playerHurt', ({ health, from }) => {
      const maxHp = this.game.player?.maxHealth ?? 100;
      this.updateHealth(health, maxHp);

      if (from && this.damageArc && this.game.player?.mesh?.position) {
        const px = this.game.player.mesh.position.x;
        const pz = this.game.player.mesh.position.z;
        const dx = from.x - px;
        const dz = from.z - pz;
        const pyaw = this.game.player.yaw || 0;

        // Angle formula: rel = (player.yaw + Math.PI) - Math.atan2(dx, dz)
        const rel = (pyaw + Math.PI) - Math.atan2(dx, dz);
        this.damageArc.style.transform = `translate(-50%, -50%) rotate(${rel}rad)`;
        this.damageArcOpacity = 1.0;
        this.damageArc.style.opacity = '1';
      }
    });

    // 4. Player Healed: { health, maxHealth }
    events.on('playerHealed', ({ health, maxHealth }) => {
      this.updateHealth(health, maxHealth ?? this.game.player?.maxHealth ?? 100);
    });

    // 5. Player Shot: toggle crosshair spread
    events.on('playerShot', () => {
      if (this.crosshair) {
        this.crosshair.classList.add('spread');
        clearTimeout(this.crosshairTimer);
        this.crosshairTimer = setTimeout(() => {
          if (this.crosshair) {
            this.crosshair.classList.remove('spread');
          }
        }, 120);
      }
    });

    // 6. Zombie Killed
    events.on('zombieKilled', () => {
      if (this.killCounter && this.game.stats) {
        this.killCounter.textContent = this.game.stats.zombiesKilled ?? 0;
      }
    });
  }

  updateHealth(health, maxHealth = 100) {
    const hp = Math.max(0, health);
    const maxHp = maxHealth || 100;
    const pct = Math.min(100, Math.max(0, (hp / maxHp) * 100));

    if (this.healthBar) {
      this.healthBar.style.width = `${pct}%`;
      this.healthBar.classList.remove('hp-high', 'hp-mid', 'hp-low');
      if (hp > 50) {
        this.healthBar.classList.add('hp-high');
      } else if (hp >= 25) {
        this.healthBar.classList.add('hp-mid');
      } else {
        this.healthBar.classList.add('hp-low');
      }
    }

    if (this.healthText) {
      this.healthText.textContent = `${Math.ceil(hp)} / ${maxHp}`;
    }
  }

  loop(currentTime) {
    const dt = Math.min(0.1, (currentTime - this.lastFrameTime) / 1000);
    this.lastFrameTime = currentTime;

    // Check if stats startTime changed to reset survival timer
    if (this.game.stats) {
      if (this.lastStartTime !== this.game.stats.startTime) {
        this.lastStartTime = this.game.stats.startTime;
        this.survivalTime = 0;
      }
    }

    // Only update gameplay HUD elements when game is active
    if (this.game.state === 'PLAYING') {
      const player = this.game.player;
      const playerPos = player?.mesh?.position;
      const playerYaw = player?.yaw || 0;

      // 1. Survival Timer: increments only during PLAYING
      this.survivalTime += dt;
      if (this.survivalTimer) {
        const m = Math.floor(this.survivalTime / 60).toString().padStart(2, '0');
        const s = Math.floor(this.survivalTime % 60).toString().padStart(2, '0');
        this.survivalTimer.textContent = `${m}:${s}`;
      }

      // 2. Shift Timer Bar: width = timer / cycleDuration (no touch to #shift-icon / #shift-name)
      if (this.shiftProgress && this.game.shift && this.game.shift.cycleDuration > 0) {
        const ratio = Math.min(1, Math.max(0, this.game.shift.timer / this.game.shift.cycleDuration));
        this.shiftProgress.style.width = `${(ratio * 100).toFixed(1)}%`;
      }

      // 3. Flare Cooldown
      if (player) {
        const cdTimer = player.flareCooldownTimer || 0;
        const totalCd = CONFIG?.player?.flareCooldown || 20;
        if (cdTimer > 0) {
          if (this.flareStatusTxt) this.flareStatusTxt.textContent = `${Math.ceil(cdTimer)}s`;
          if (this.flareCdBar) {
            const cdPct = Math.min(100, Math.max(0, (cdTimer / totalCd) * 100));
            this.flareCdBar.style.width = `${cdPct.toFixed(0)}%`;
          }
        } else {
          if (this.flareStatusTxt) this.flareStatusTxt.textContent = 'READY';
          if (this.flareCdBar) this.flareCdBar.style.width = '0%';
        }
      }

      // 4. Damage Direction Arc Fade
      if (this.damageArcOpacity > 0) {
        this.damageArcOpacity = Math.max(0, this.damageArcOpacity - dt * 1.0);
        if (this.damageArc) {
          this.damageArc.style.opacity = this.damageArcOpacity.toFixed(3);
        }
      }

      // 5. Objective Tracker & Direction Arrow
      if (playerPos && this.game.relays) {
        const obj = this.game.relays.getObjective(playerPos);
        if (obj) {
          if (this.objectiveTracker) this.objectiveTracker.style.display = 'flex';
          if (this.objLabel) this.objLabel.textContent = obj.label || 'OBJECTIVE';
          if (this.objDist) this.objDist.textContent = `${Math.round(obj.distance || 0)}m`;

          if (this.objArrow && obj.position) {
            const dx = obj.position.x - playerPos.x;
            const dz = obj.position.z - playerPos.z;
            const rel = (playerYaw + Math.PI) - Math.atan2(dx, dz);
            this.objArrow.style.transform = `rotate(${rel}rad)`;
          }
        } else if (this.objectiveTracker) {
          this.objectiveTracker.style.display = 'none';
        }
      }

      // 6. Vehicle Status & Prompt
      this.updateVehicle(playerPos);

      // 7. Minimap (30 FPS throttle)
      this.minimapTimer += dt;
      if (this.minimapTimer >= this.minimapInterval) {
        this.minimapTimer = 0;
        if (playerPos) {
          this.renderMinimap(playerPos, playerYaw);
        }
      }
    }

    // Keep RAF loop running
    requestAnimationFrame(this.loop);
  }

  updateVehicle(playerPos) {
    const v = this.game.vehicle;
    if (!v) {
      if (this.vehicleHud) this.vehicleHud.style.display = 'none';
      if (this.vehiclePrompt) this.vehiclePrompt.style.display = 'none';
      return;
    }

    const isDriving = !!(v.isDriving || v.isOccupied || v.playerInside);

    if (isDriving) {
      if (this.vehicleHud) this.vehicleHud.style.display = 'block';
      if (this.vehiclePrompt) this.vehiclePrompt.style.display = 'none';

      if (this.vehicleSpeed) {
        const kmh = Math.round(Math.abs(v.speed || 0) * 3.6);
        this.vehicleSpeed.textContent = `${kmh} KM/H`;
      }

      if (this.carHealthBar) {
        const hp = v.health !== undefined ? v.health : 100;
        const maxHp = v.maxHealth || 100;
        const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
        this.carHealthBar.style.width = `${pct}%`;
      }
    } else {
      if (this.vehicleHud) this.vehicleHud.style.display = 'none';

      // Check proximity for enter prompt (3 units)
      if (playerPos && v.mesh?.position) {
        const dist = playerPos.distanceTo(v.mesh.position);
        if (this.vehiclePrompt) {
          this.vehiclePrompt.style.display = dist <= 3 ? 'block' : 'none';
        }
      } else if (this.vehiclePrompt) {
        this.vehiclePrompt.style.display = 'none';
      }
    }
  }

  renderMinimap(playerPos, playerYaw) {
    if (!this.minimapCtx || !this.minimapCanvas) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 1.6; // World to minimap pixel scale
    const radius = w / 2 - 2;

    ctx.clearRect(0, 0, w, h);

    // Circular clipping mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Background fill (Day vs Night tint)
    const isNight = this.game.shift?.isNight || false;
    ctx.fillStyle = isNight ? 'rgba(24, 7, 15, 0.92)' : 'rgba(10, 15, 22, 0.88)';
    ctx.fillRect(0, 0, w, h);

    const px = playerPos.x;
    const pz = playerPos.z;

    // Rotate map with player look heading (ctx.rotate(+player.yaw) so forward is always up)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(+playerYaw);

    // 1. Draw Buildings from game.city.colliders (Box3 with min/max x,z)
    if (this.game.city?.colliders) {
      ctx.fillStyle = 'rgba(70, 75, 85, 0.75)';
      const colliders = this.game.city.colliders;
      for (let i = 0; i < colliders.length; i++) {
        const b = colliders[i];
        if (b && b.min && b.max) {
          const minX = (b.min.x - px) * scale;
          const minZ = (b.min.z - pz) * scale;
          const bw = (b.max.x - b.min.x) * scale;
          const bd = (b.max.z - b.min.z) * scale;
          ctx.fillRect(minX, minZ, bw, bd);
        }
      }
    }

    // 2. Draw Extraction Tower (Green dot)
    if (this.game.relays?.tower) {
      const t = this.game.relays.tower;
      const tx = ((t.position?.x ?? t.x ?? 0) - px) * scale;
      const tz = ((t.position?.z ?? t.z ?? 0) - pz) * scale;
      ctx.fillStyle = '#00ffaa';
      ctx.beginPath();
      ctx.arc(tx, tz, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Draw Relays (Yellow dots)
    const relayList = this.game.relays?.relays || this.game.relays?.relaysList || this.game.relays?.items || [];
    ctx.fillStyle = '#ffdd00';
    for (let i = 0; i < relayList.length; i++) {
      const r = relayList[i];
      if (!r.collected) {
        const rx = ((r.position?.x ?? r.x ?? 0) - px) * scale;
        const rz = ((r.position?.z ?? r.z ?? 0) - pz) * scale;
        ctx.beginPath();
        ctx.arc(rx, rz, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Draw Vehicle (Cyan dot)
    if (this.game.vehicle?.mesh?.position) {
      const vx = (this.game.vehicle.mesh.position.x - px) * scale;
      const vz = (this.game.vehicle.mesh.position.z - pz) * scale;
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.arc(vx, vz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Draw Zombies (!isDead and within 40 units)
    if (this.game.zombies) {
      ctx.fillStyle = '#ff2e4c';
      const zombies = this.game.zombies;
      for (let i = 0; i < zombies.length; i++) {
        const z = zombies[i];
        if (!z.isDead && z.mesh?.position) {
          const dx = z.mesh.position.x - px;
          const dz = z.mesh.position.z - pz;
          if (dx * dx + dz * dz <= 1600) { // 40 units squared
            ctx.beginPath();
            ctx.arc(dx * scale, dz * scale, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    ctx.restore(); // Undo rotation and translation

    // 6. Draw Player Marker at Center (Green forward-facing triangle)
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx - 4, cy + 4);
    ctx.lineTo(cx + 4, cy + 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore(); // Undo circular clip

    // Circular Border Ring
    ctx.strokeStyle = isNight ? 'rgba(255, 60, 60, 0.55)' : 'rgba(0, 255, 136, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
