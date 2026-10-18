// Small, local chiptune effects. No audio requests or background music.
export class ArcadeSound {
  constructor() {
    this.enabled = true;
    try { this.enabled = localStorage.getItem('pachinko-sound') !== 'off'; } catch {}
    this.context = null;
    this.lastHit = 0;
  }
  unlock() {
    if (!this.enabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!this.context) {
        this.context = new Audio();
        this.gain = this.context.createGain(); this.gain.gain.value = 0.055;
        this.gain.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
    } catch { /* Audio is optional; gameplay must work without it. */ }
  }
  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem('pachinko-sound', this.enabled ? 'on' : 'off'); } catch {}
    if (this.enabled) { this.unlock(); this.play('select'); }
    else if (this.context) this.context.suspend().catch(() => {});
    return this.enabled;
  }
  tone(frequency, duration = 0.07, delay = 0, type = 'square', volume = 1) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    oscillator.type = type; oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, t); envelope.gain.linearRampToValueAtTime(volume, t + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.001, t + duration);
    oscillator.connect(envelope); envelope.connect(this.gain);
    oscillator.start(t); oscillator.stop(t + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
  play(kind, index = 0) {
    if (!this.enabled || document.hidden) return;
    if (kind === 'hit') {
      const now = performance.now(); if (now - this.lastHit < 85) return;
      this.lastHit = now; this.tone([523, 659, 784, 988][Math.abs(index) % 4], .035, 0, 'triangle', .5); return;
    }
    if (kind === 'settle' || kind === 'jackpot') {
      const now = performance.now(); if (now - (this.lastSettle || 0) < 120) return;
      this.lastSettle = now;
    }
    const sequences = {
      launch: [196, 294, 392], select: [660, 880], settle: [523, 784],
      jackpot: [523, 659, 784, 1047, 1319], shop: [392, 523, 659],
      rent: [440, 554, 659], won: [523, 659, 784, 1047, 784, 1047], lost: [392, 330, 262, 196]
    };
    const notes = sequences[kind] || sequences.select;
    notes.forEach((frequency, i) => this.tone(frequency, .095, i * .065, 'square', kind === 'settle' ? .35 : .65));
  }
}
