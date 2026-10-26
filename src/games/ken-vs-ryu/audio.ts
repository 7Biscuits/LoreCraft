/** Tiny synthesized arcade cues; no downloads, keys, or external assets. */
export class DuelAudio {
  private context?: AudioContext;
  enabled = true;
  unlock(): void {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  play(name: string): void {
    const c = this.context; if (!this.enabled || !c || c.state !== 'running') return;
    const tone = c.createOscillator(), gain = c.createGain(); tone.connect(gain); gain.connect(c.destination);
    const frequencies: Record<string, number> = { swing: 170, hit: 100, block: 440, fireball: 340, uppercut: 210, ko: 85, start: 640, jump: 260 };
    tone.type = name === 'block' ? 'triangle' : 'sawtooth'; const t = c.currentTime;
    tone.frequency.setValueAtTime(frequencies[name] ?? 180, t); tone.frequency.exponentialRampToValueAtTime(name === 'uppercut' ? 720 : name === 'start' ? 960 : 45, t + .13);
    gain.gain.setValueAtTime(.035, t); gain.gain.exponentialRampToValueAtTime(.001, t + .16); tone.start(t); tone.stop(t + .17);
  }
  dispose(): void { void this.context?.close(); this.context = undefined; }
}
