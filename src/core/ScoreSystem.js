import { CONFIG } from '../config.js';

const STORAGE_KEY = 'sunshift_best_score';

/** Combo score: chain kills quickly, and take the night risk for double points. */
export class ScoreSystem {
  constructor() {
    this.reset();
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.lastPoints = 0;
  }

  addKill(type, isNight) {
    const cfg = CONFIG.score;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = cfg.comboWindow;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.multiplier = Math.min(this.combo, cfg.maxMultiplier) * (isNight ? cfg.nightMultiplier : 1);
    this.lastPoints = (cfg.points[type] || cfg.points.NORMAL) * this.multiplier;
    this.score += this.lastPoints;
  }

  breakCombo() {
    this.combo = 0;
    this.comboTimer = 0;
  }

  update(dt) {
    if (this.comboTimer <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.breakCombo();
  }

  applyRetryPenalty() {
    this.score = Math.floor(this.score * CONFIG.score.retryKeep);
    this.breakCombo();
  }

  addWinBonus(seconds) {
    this.score += 2000 + Math.max(0, Math.round(600 - seconds)) * 10;
  }

  get rank() {
    return CONFIG.score.ranks.find(([, min]) => this.score >= min)[0];
  }

  saveBest() {
    let best = 0;
    try {
      best = Number(localStorage.getItem(STORAGE_KEY)) || 0;
      if (this.score > best) localStorage.setItem(STORAGE_KEY, String(this.score));
    } catch {}
    return { isNewBest: this.score > best, best: Math.max(best, this.score) };
  }
}
