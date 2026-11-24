export class Dialogue {
  constructor(sound = null) {
    this.sound = sound;
    this.queue = [];
    this.isShowing = false;
    this.typewriterTimer = null;
    this.advanceTimeout = null;

    this.boxEl = document.getElementById('dialogue-box');
    this.avatarEl = document.getElementById('dialogue-avatar');
    this.speakerEl = document.getElementById('dialogue-speaker');
    this.textEl = document.getElementById('dialogue-text');

    this.speakerConfigs = {
      Mara: {
        name: 'MARA QUINN // EVAC TOWER',
        initial: 'M',
        color: '#00e5ff',
        bg: 'rgba(0, 229, 255, 0.2)'
      },
      Jonah: {
        name: 'OLD JONAH // PRECINCT ALLY',
        initial: 'J',
        color: '#ff9100',
        bg: 'rgba(255, 145, 0, 0.2)'
      },
      Kade: {
        name: 'KADE MERCER // EX-HELIOS GRID',
        initial: 'K',
        color: '#00e676',
        bg: 'rgba(0, 230, 118, 0.2)'
      },
      System: {
        name: 'HELIOS BROADCAST // ALERT',
        initial: 'S',
        color: '#ff1744',
        bg: 'rgba(255, 23, 68, 0.2)'
      }
    };
  }

  setSound(sound) {
    this.sound = sound;
  }

  show(speaker, text, duration = 4000) {
    this.queue.push({ speaker, text, duration });
    if (!this.isShowing) {
      this.playNext();
    }
  }

  queueLines(lines) {
    if (!lines || lines.length === 0) return;
    for (const item of lines) {
      this.queue.push(item);
    }
    if (!this.isShowing) {
      this.playNext();
    }
  }

  playNext() {
    if (this.queue.length === 0) {
      this.isShowing = false;
      if (this.boxEl) this.boxEl.style.display = 'none';
      return;
    }

    this.isShowing = true;
    const current = this.queue.shift();
    const config = this.speakerConfigs[current.speaker] || {
      name: current.speaker.toUpperCase(),
      initial: current.speaker.charAt(0).toUpperCase(),
      color: '#00e5ff',
      bg: 'rgba(0, 229, 255, 0.2)'
    };

    if (this.boxEl) {
      this.boxEl.style.display = 'flex';
      this.boxEl.style.borderColor = config.color;
      this.boxEl.style.boxShadow = `0 0 15px ${config.bg}, inset 0 0 12px ${config.bg}`;
    }

    if (this.avatarEl) {
      this.avatarEl.textContent = config.initial;
      this.avatarEl.style.background = config.bg;
      this.avatarEl.style.borderColor = config.color;
      this.avatarEl.style.color = config.color;
    }

    if (this.speakerEl) {
      this.speakerEl.textContent = config.name;
      this.speakerEl.style.color = config.color;
    }

    // Play radio blip sound
    if (this.sound && typeof this.sound.radioBlip === 'function') {
      this.sound.radioBlip();
    }

    // Typewriter effect
    this.typewrite(current.text, current.duration || 4000);
  }

  typewrite(fullText, duration) {
    if (this.typewriterTimer) clearInterval(this.typewriterTimer);
    if (this.advanceTimeout) clearTimeout(this.advanceTimeout);

    if (!this.textEl) return;

    this.textEl.textContent = '';
    let charIndex = 0;
    const speed = Math.max(12, Math.min(30, Math.floor(1000 / fullText.length)));

    this.typewriterTimer = setInterval(() => {
      charIndex++;
      this.textEl.textContent = fullText.slice(0, charIndex);

      if (charIndex >= fullText.length) {
        clearInterval(this.typewriterTimer);
        this.typewriterTimer = null;

        // Auto advance after duration
        this.advanceTimeout = setTimeout(() => {
          this.playNext();
        }, duration);
      }
    }, speed);
  }

  clear() {
    this.queue = [];
    if (this.typewriterTimer) clearInterval(this.typewriterTimer);
    if (this.advanceTimeout) clearTimeout(this.advanceTimeout);
    this.isShowing = false;
    if (this.boxEl) this.boxEl.style.display = 'none';
  }
}
