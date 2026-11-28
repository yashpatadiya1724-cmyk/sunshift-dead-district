import * as THREE from 'three';
import { MISSIONS } from './missions.js';
import { events } from '../core/Events.js';
import { CONFIG } from '../config.js';

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.currentMissionIndex = 0;
    this.missions = MISSIONS;
    this.isActive = false;

    // Checkpoint state
    this.checkpoint = {
      missionIndex: 0,
      playerPos: new THREE.Vector3(0, 0, 0),
      playerYaw: 0
    };

    // Mission 3 state
    this.m3Timer = 0;
    this.m3ShiftDone = false;
    this.m3StartDist = 0;

    // Mission 4 state
    this.m4Zombies = [];
    this.m4Cleared = false;

    // Mission 5 state
    this.m5Zombies = [];
    this.m5HiveSpawned = false;

    // Mission 6 Tower Defense state
    this.towerCharge = 0; // 0 to 100
    this.towerDefended = false;
    this.waveSpawned = [false, false, false];

    // Mission 7 Ending Choice state
    this.endingChosen = false;
    this.chosenEnding = null;

    // DOM Elements
    this.missionTextEl = document.getElementById('mission-text');
    this.objArrowEl = document.getElementById('obj-arrow');
    this.objLabelEl = document.getElementById('obj-label');
    this.objDistEl = document.getElementById('obj-dist');
    this.chargeWrapEl = document.getElementById('tower-charge-wrap');
    this.chargeBarEl = document.getElementById('tower-charge-bar');
    this.chargeTextEl = document.getElementById('tower-charge-text');
    this.choicePromptEl = document.getElementById('ending-choice-prompt');

    this.onKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.onKeyDown);

    // Listen for relay collections
    this.unsubscribeRelay = events.on('relayCollected', (data) => {
      this.onRelayCollected(data);
    });
  }

  start() {
    this.isActive = true;
    this.currentMissionIndex = 0;
    this.towerCharge = 0;
    this.towerDefended = false;
    this.waveSpawned = [false, false, false];
    this.endingChosen = false;
    this.chosenEnding = null;

    this.checkpoint = {
      missionIndex: 0,
      playerPos: new THREE.Vector3(0, 0, 0),
      playerYaw: 0
    };

    this.initMission(0);
  }

  reset() {
    this.start();
  }

  get currentMissionId() {
    return this.getCurrentMission()?.id || 1;
  }

  getCurrentMission() {
    return this.missions[this.currentMissionIndex] || null;
  }

  initMission(index) {
    if (index >= this.missions.length) return;
    this.currentMissionIndex = index;
    const m = this.missions[index];

    // Save checkpoint
    if (this.game.player) {
      this.checkpoint = {
        missionIndex: index,
        playerPos: this.game.player.mesh.position.clone(),
        playerYaw: this.game.player.yaw
      };
    }

    // Hide or show relays so only active mission relay is visible
    this.updateRelaysVisibility();

    // Reset tower charge UI
    if (this.chargeWrapEl) {
      this.chargeWrapEl.style.display = (m.id === 6) ? 'block' : 'none';
    }
    if (this.choicePromptEl) {
      this.choicePromptEl.style.display = (m.id === 7) ? 'block' : 'none';
    }

    // Dialogue on start
    if (m.dialogues && m.dialogues.length > 0 && this.game.dialogue) {
      this.game.dialogue.queueLines(m.dialogues);
    }

    // Mission 3 setup
    if (m.id === 3) {
      this.m3Timer = 0;
      this.m3ShiftDone = false;
      if (this.game.player) {
        this.m3StartDist = this.game.player.mesh.position.distanceTo(m.targetPos);
      }
    }

    // Mission 4 setup: spawn 6 zombies around Jonah's barricade (Relay 2)
    if (m.id === 4) {
      this.m4Cleared = false;
      this.spawnJonahZombies();
    }

    // Mission 5 setup: spawn 8 hive zombies around Relay 3
    if (m.id === 5) {
      this.spawnHiveZombies();
      // Unlock Rifle upon discovering nest
      if (this.game.player) {
        this.game.player.unlockWeapon('rifle');
      }
    }

    // Mission 6 setup
    if (m.id === 6) {
      this.towerCharge = 0;
      this.waveSpawned = [false, false, false];
      // Force tower beam visibility
      if (this.game.relays) {
        this.game.relays.towerGroup.visible = true;
        this.game.relays.towerMat.color.setHex(0x00e5ff);
        this.game.relays.towerBeamMat.color.setHex(0x00e5ff);
        this.game.relays.towerBeamMat.opacity = 0.45;
      }
    }

    this.updateHUD();
  }

  updateRelaysVisibility() {
    if (!this.game.relays || !this.game.relays.relays) return;
    const m = this.getCurrentMission();

    this.game.relays.relays.forEach((r, idx) => {
      // In M1: all relays hidden
      // In M2: Relay 0 visible
      // In M3: Relay 1 visible
      // In M4: Relay 2 visible only after barricade cleared (or visible during)
      // In M5: Relay 3 visible
      if (!m || m.relayIndex === null || m.relayIndex === undefined) {
        r.group.visible = false;
      } else {
        r.group.visible = (idx === m.relayIndex && !r.collected);
      }
    });

    // Evac Tower
    if (this.game.relays.towerGroup) {
      // Visible in M6 and M7
      this.game.relays.towerGroup.visible = (m && (m.id === 6 || m.id === 7));
    }
  }

  spawnJonahZombies() {
    const center = new THREE.Vector3(17, 0, 39);
    this.m4Zombies = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const dist = 5 + Math.random() * 4;
      const pos = new THREE.Vector3(center.x + Math.cos(angle) * dist, 0, center.z + Math.sin(angle) * dist);
      const z = this.game.spawnCustomZombie(pos, 'NORMAL');
      if (z) this.m4Zombies.push(z);
    }
  }

  spawnHiveZombies() {
    const center = new THREE.Vector3(-27, 0, 39);
    this.m5Zombies = [];
    const archetypes = ['RUNNER', 'RUNNER', 'RUNNER', 'BRUTE', 'BRUTE', 'NORMAL', 'NORMAL', 'NORMAL'];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 4 + Math.random() * 5;
      const pos = new THREE.Vector3(center.x + Math.cos(angle) * dist, 0, center.z + Math.sin(angle) * dist);
      const z = this.game.spawnCustomZombie(pos, archetypes[i]);
      if (z) this.m5Zombies.push(z);
    }
  }

  spawnTowerWave(waveIndex) {
    const towerPos = CONFIG.relays.towerPosition;
    const waveArchetypes = [
      ['RUNNER', 'RUNNER', 'NORMAL', 'NORMAL', 'NORMAL', 'BRUTE'],
      ['RUNNER', 'RUNNER', 'RUNNER', 'BRUTE', 'BRUTE', 'NORMAL'],
      ['BRUTE', 'BRUTE', 'BRUTE', 'RUNNER', 'RUNNER', 'RUNNER']
    ];
    const archetypes = waveArchetypes[waveIndex] || waveArchetypes[0];

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 38 + Math.random() * 8; // 35+ units away
      const pos = new THREE.Vector3(towerPos.x + Math.cos(angle) * dist, 0, towerPos.z + Math.sin(angle) * dist);
      this.game.spawnCustomZombie(pos, archetypes[i]);
    }

    if (this.game.sound) {
      this.game.sound.warningBeep();
    }
    if (this.game.dialogue) {
      const msgs = [
        "Infected wave detected! Defend the uplink dish!",
        "Second wave incoming! Brutes and Runners spotted!",
        "Final wave! Hold the perimeter! Almost there!"
      ];
      this.game.dialogue.show('Mara', msgs[waveIndex] || msgs[0], 3500);
    }
  }

  update(dt) {
    if (!this.isActive || !this.game.player) return;
    const m = this.getCurrentMission();
    if (!m) return;

    const pPos = this.game.player.mesh.position;

    // Mission 1: Reach muscle car
    if (m.id === 1) {
      const distToCar = pPos.distanceTo(m.targetPos);
      if (distToCar < m.targetRadius || this.game.player.isInVehicle) {
        this.completeMission(1);
        return;
      }
    }

    // Mission 3: Night Run dynamic shift
    if (m.id === 3 && !this.m3ShiftDone) {
      this.m3Timer += dt;
      const currentDist = pPos.distanceTo(m.targetPos);
      const coveredHalf = this.m3StartDist > 0 && currentDist <= (this.m3StartDist * 0.55);

      if ((coveredHalf || this.m3Timer >= 15.0) && !this.game.shift.isNight) {
        this.m3ShiftDone = true;
        this.game.shift.triggerShift();
        if (this.game.dialogue) {
          this.game.dialogue.show('Mara', 'The sun is flipping. Move NOW, they run at night!', 4000);
        }
      }
    }

    // Mission 4: Jonah's barricade check
    if (m.id === 4 && !this.m4Cleared) {
      const aliveJonahZombies = this.m4Zombies.filter(z => !z.isDead && !z.isRemoved);
      if (aliveJonahZombies.length === 0) {
        this.m4Cleared = true;
        // Unlock shotgun
        if (this.game.player) {
          this.game.player.unlockWeapon('shotgun');
          this.game.player.switchWeapon('shotgun');
        }
        if (m.clearedDialogues && this.game.dialogue) {
          this.game.dialogue.queueLines(m.clearedDialogues);
        }
        // Ensure Relay 2 is visible now
        this.updateRelaysVisibility();
      }
    }

    // Mission 6: Tower Defense
    if (m.id === 6) {
      const distToTower = pPos.distanceTo(m.targetPos);
      const isInside = distToTower <= m.targetRadius;

      if (isInside) {
        // 60 seconds total: dt / 60 * 100
        this.towerCharge = Math.min(100, this.towerCharge + (dt / 60.0) * 100);

        // Wave 1 at 2%
        if (this.towerCharge >= 2 && !this.waveSpawned[0]) {
          this.waveSpawned[0] = true;
          this.spawnTowerWave(0);
        }
        // Wave 2 at 35% (approx 20 sec)
        if (this.towerCharge >= 35 && !this.waveSpawned[1]) {
          this.waveSpawned[1] = true;
          this.spawnTowerWave(1);
        }
        // Wave 3 at 70% (approx 40 sec)
        if (this.towerCharge >= 70 && !this.waveSpawned[2]) {
          this.waveSpawned[2] = true;
          this.spawnTowerWave(2);
        }

        // Tower visual feedback
        if (this.game.relays) {
          this.game.relays.towerBeamMat.opacity = 0.3 + (this.towerCharge / 100) * 0.45;
        }
      }

      // Update Tower Charge UI
      if (this.chargeBarEl) {
        this.chargeBarEl.style.width = `${Math.round(this.towerCharge)}%`;
      }
      if (this.chargeTextEl) {
        this.chargeTextEl.textContent = isInside
          ? `UPLINK: ${Math.round(this.towerCharge)}%`
          : `PAUSED (${Math.round(this.towerCharge)}%) — ENTER TOWER RADIUS`;
      }

      if (this.towerCharge >= 100) {
        this.completeMission(6);
        return;
      }
    }

    if (m.id === 7 && this.game.player) {
      this.game.player.health = 100;
    }

    this.updateHUD();
  }

  onRelayCollected(data) {
    const m = this.getCurrentMission();
    if (!m) return;

    // Check if collected relay corresponds to active mission
    if (m.relayIndex !== null && m.relayIndex !== undefined) {
      if (m.id === 2 && data.count === 1) {
        if (m.onCompleteDialogues && this.game.dialogue) {
          this.game.dialogue.queueLines(m.onCompleteDialogues);
        }
        this.completeMission(2);
      } else if (m.id === 3 && data.count === 2) {
        this.completeMission(3);
      } else if (m.id === 4 && data.count === 3) {
        this.completeMission(4);
      } else if (m.id === 5 && data.count === 4) {
        this.completeMission(5);
      }
    }
  }

  completeMission(missionId) {
    const nextIdx = this.currentMissionIndex + 1;
    if (this.game.sound) {
      this.game.sound.relayPickup();
    }
    if (this.game.effects) {
      this.game.effects.showBanner(`MISSION ${missionId} COMPLETE`, '#00e5ff');
    }

    if (nextIdx < this.missions.length) {
      this.initMission(nextIdx);
    }
  }

  handleKeyDown(e) {
    const m = this.getCurrentMission();
    if (!m || m.id !== 7 || this.endingChosen) return;

    if (e.key === 'e' || e.key === 'E') {
      this.triggerEnding('A');
    } else if (e.key === 'g' || e.key === 'G') {
      this.triggerEnding('B');
    }
  }

  triggerEnding(type) {
    this.endingChosen = true;
    this.chosenEnding = type;

    if (this.choicePromptEl) {
      this.choicePromptEl.style.display = 'none';
    }

    const endingData = (type === 'A')
      ? {
          type: 'A',
          title: 'SURVIVOR — EVACUATION SUCCESSFUL',
          text: 'The helicopter lifts off. Haven City burns below, but you are alive. Some nights you still hear the Shift.'
        }
      : {
          type: 'B',
          title: 'REDEEMER — THE SHIFT ENDS',
          text: 'The Array dies. The sky stops flipping. Dawn finally stays. You stay too, to rebuild what you broke.'
        };

    events.emit('gameWon', endingData);
  }

  retryFromCheckpoint() {
    if (!this.game.player) return;

    // Reset player position and health
    this.game.player.health = 100;
    this.game.player.mesh.position.copy(this.checkpoint.playerPos);
    this.game.player.yaw = this.checkpoint.playerYaw;
    this.game.player.isDead = false;
    events.emit('playerHealed', { health: 100, maxHealth: this.game.player.maxHealth });

    // Clear nearby aggro zombies to give player safe restart
    this.game.zombies.forEach(z => {
      const d = z.mesh.position.distanceTo(this.checkpoint.playerPos);
      if (d < 25) {
        z.destroy();
      }
    });

    // Re-init mission at checkpoint index
    this.initMission(this.checkpoint.missionIndex);
  }

  getObjective(playerPos) {
    const m = this.getCurrentMission();
    if (!m) return null;
    return {
      position: m.targetPos,
      label: (m.id === 1) ? 'CAR' : (m.id === 6 || m.id === 7) ? 'TOWER' : 'RELAY',
      distance: playerPos.distanceTo(m.targetPos)
    };
  }

  updateHUD() {
    const m = this.getCurrentMission();
    if (!m || !this.game.player) return;

    const pPos = this.game.player.mesh.position;
    const dist = Math.round(pPos.distanceTo(m.targetPos));

    // Update Mission Text
    if (this.missionTextEl) {
      this.missionTextEl.textContent = `M${m.id}: ${m.title.toUpperCase()} — ${m.objective.toUpperCase()}`;
      this.missionTextEl.style.color = (m.id === 6 || m.id === 7) ? '#00e5ff' : '#ffcc00';
    }

    // Update Objective Tracker
    if (this.objLabelEl) {
      this.objLabelEl.textContent = (m.id === 1) ? 'CAR' : (m.id === 6 || m.id === 7) ? 'TOWER' : 'RELAY';
    }
    if (this.objDistEl) {
      this.objDistEl.textContent = `${dist}m`;
    }

    // Rotate arrow towards target
    if (this.objArrowEl && this.game.player) {
      const dx = m.targetPos.x - pPos.x;
      const dz = m.targetPos.z - pPos.z;
      const targetAngle = Math.atan2(dx, dz);
      const relAngle = targetAngle - this.game.player.yaw;
      this.objArrowEl.style.transform = `rotate(${relAngle}rad)`;
    }
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.unsubscribeRelay) {
      this.unsubscribeRelay();
      this.unsubscribeRelay = null;
    }
  }
}
