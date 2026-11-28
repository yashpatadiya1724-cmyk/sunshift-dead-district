// Relay + Sun Shift rules, tested against the real RelayManager
import assert from 'node:assert';
import * as THREE from 'three';
import { CONFIG } from '../src/config.js';
import { events } from '../src/core/Events.js';
import { RelayManager } from '../src/world/Relays.js';

globalThis.document = { getElementById: () => null };

const relays = new RelayManager(new THREE.Scene(), null);
let wins = 0;
events.on('gameWon', () => wins++);

const playerAt = (pos) => ({ mesh: { position: pos.clone() } });
const first = playerAt(CONFIG.relays.positions[0]);

relays.update(0.016, first, false);
assert.strictEqual(relays.collectedCount, 0, 'Dormant relay must not be collected by day');

relays.relays.forEach((r) => { r.group.visible = false; });
relays.update(0.016, first, true);
assert.strictEqual(relays.collectedCount, 0, 'Hidden (inactive mission) relay must not be collected');

relays.relays.forEach((r) => { r.group.visible = true; });
relays.update(0.016, first, true);
assert.strictEqual(relays.collectedCount, 1, 'Visible relay must be collected at night');

CONFIG.relays.positions.forEach((pos) => relays.update(0.016, playerAt(pos), true));
relays.update(0.016, playerAt(CONFIG.relays.towerPosition), true);
assert.strictEqual(wins, 0, 'Reaching the tower must not skip the tower defence and final choice');

console.log('Relay + Sun Shift tests passed.');
