import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { events } from '../core/Events.js';

export class RelayManager {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.relays = [];
    this.collectedCount = 0;
    this.totalRelays = CONFIG.relays.total;
    this.bobTimer = 0;
    this.isTowerActive = false;

    // 1. Street intersection relays
    CONFIG.relays.positions.forEach((pos, index) => {
      const group = new THREE.Group();
      group.position.copy(pos);

      const octGeo = new THREE.OctahedronGeometry(0.85);
      const octMat = new THREE.MeshBasicMaterial({ color: 0xffe600, fog: false });
      const octMesh = new THREE.Mesh(octGeo, octMat);
      octMesh.position.y = 1.5;
      group.add(octMesh);

      const beamGeo = new THREE.CylinderGeometry(0.18, 0.45, 60, 16);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xffe600,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        fog: false
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 30;
      group.add(beam);

      this.scene.add(group);
      this.relays.push({
        id: index,
        position: pos.clone(),
        group: group,
        octMesh: octMesh,
        collected: false
      });
    });

    // 2. Central Evacuation Tower
    this.towerGroup = new THREE.Group();
    this.towerGroup.position.copy(CONFIG.relays.towerPosition);

    const towerGeo = new THREE.CylinderGeometry(1.2, 1.8, 22, 16);
    this.towerMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.75 });
    this.towerMesh = new THREE.Mesh(towerGeo, this.towerMat);
    this.towerMesh.position.y = 11;
    this.towerGroup.add(this.towerMesh);

    const towerBeamGeo = new THREE.CylinderGeometry(0.4, 0.9, 80, 16);
    this.towerBeamMat = new THREE.MeshBasicMaterial({
      color: 0x555555,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      fog: false
    });
    this.towerBeam = new THREE.Mesh(towerBeamGeo, this.towerBeamMat);
    this.towerBeam.position.y = 40;
    this.towerGroup.add(this.towerBeam);

    this.scene.add(this.towerGroup);
    this.updateMissionUI();
  }

  reset() {
    this.collectedCount = 0;
    this.isTowerActive = false;

    // Restore all relay groups into the scene
    this.relays.forEach(r => {
      r.collected = false;
      if (!r.group.parent) {
        this.scene.add(r.group);
      }
    });

    // Reset tower visuals
    this.towerMat.color.setHex(0x555555);
    this.towerBeamMat.color.setHex(0x555555);
    this.towerBeamMat.opacity = 0.2;

    this.updateMissionUI();
  }

  update(dt, player, isNight = true, effects = null) {
    this.bobTimer += dt * 3.0;

    this.dormantHintTimer = Math.max(0, (this.dormantHintTimer || 0) - dt);

    for (const relay of this.relays) {
      // Only the visible (current mission) relay can be collected
      if (relay.collected || !relay.group.visible) continue;

      // Dim blue-grey while dormant (day), bright yellow when awake (night)
      const tint = isNight ? 0xffe600 : 0x667788;
      relay.group.children.forEach(child => child.material?.color?.setHex(tint));

      relay.octMesh.rotation.y += dt * (isNight ? 2.0 : 0.4);
      relay.octMesh.position.y = 1.5 + Math.sin(this.bobTimer) * 0.25;

      const dist = player.mesh.position.distanceTo(relay.group.position);
      if (dist < CONFIG.relays.pickupRadius && !isNight) {
        if (this.dormantHintTimer <= 0) {
          this.dormantHintTimer = 4.0;
          effects?.showBanner('RELAY DORMANT: PRESS [V]', '#6ec6ff');
        }
      } else if (dist < CONFIG.relays.pickupRadius) {
        relay.collected = true;
        this.scene.remove(relay.group);
        this.collectedCount++;

        if (this.sound) this.sound.relayPickup();
        events.emit('relayCollected', { count: this.collectedCount, total: this.totalRelays });
        this.updateMissionUI();
      }
    }

    // The ending is decided by MissionManager (tower defence, then final choice)
    if (this.collectedCount >= this.totalRelays) {
      if (!this.isTowerActive) {
        this.isTowerActive = true;
        this.towerMat.color.setHex(0x00ff66);
        this.towerBeamMat.color.setHex(0x00ff66);
        this.towerBeamMat.opacity = 0.55;
        if (this.sound) this.sound.relayPickup();
      }
    }
  }

  getObjective(playerPos) {
    if (this.collectedCount >= this.totalRelays) {
      const pos = CONFIG.relays.towerPosition;
      return {
        position: pos,
        label: 'EVAC TOWER',
        distance: playerPos.distanceTo(pos)
      };
    }

    let closestRelay = null;
    let minDist = Infinity;

    for (const relay of this.relays) {
      if (!relay.collected) {
        const d = playerPos.distanceTo(relay.position);
        if (d < minDist) {
          minDist = d;
          closestRelay = relay;
        }
      }
    }

    if (closestRelay) {
      return {
        position: closestRelay.position,
        label: 'RELAY',
        distance: minDist
      };
    }

    return null;
  }

  updateMissionUI() {
    const textEl = document.getElementById('mission-text');
    if (!textEl) return;

    if (this.collectedCount < this.totalRelays) {
      textEl.innerText = `MISSION: COLLECT RELAYS (${this.collectedCount}/${this.totalRelays})`;
      textEl.style.color = '#ffcc00';
    } else {
      textEl.innerText = 'MISSION: GET TO THE EVAC TOWER!';
      textEl.style.color = '#00ff66';
    }
  }
}
