/** Original local synthesis only: no microphone, samples or network assets. */
export function createImpactAudio() {
  let context, destination; const active = new Set();
  return {
    start() {
      const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return;
      context ??= new AudioContext(); destination ??= context.createMediaStreamDestination();
      if (context.state === 'suspended') void context.resume();
    },
    hit() {
      if (!context || context.state !== 'running') return;
      const oscillator = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(180, now);
      oscillator.frequency.exponentialRampToValueAtTime(45, now + 0.16);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.22, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      oscillator.connect(gain); gain.connect(context.destination); gain.connect(destination);
      active.add(oscillator); oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now); oscillator.stop(now + 0.2);
    },
    tracks() { return destination?.stream.getAudioTracks() ?? []; },
    clear() { for (const oscillator of active) { try { oscillator.stop(); } catch {} } active.clear(); },
    dispose() { this.clear(); void context?.close(); },
  };
}
