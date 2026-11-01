import type { Settings } from '@landscape/shared';

/**
 * Plays the startup sound: a short original two-note chime synthesized with
 * WebAudio (no file), or an uploaded clip. Browsers block audio before a
 * user gesture; on page load we try only when the page already had one and
 * fail silently otherwise.
 */
export async function playStartupSound(sound: Settings['startup']['sound'], userGesture: boolean): Promise<void> {
  const volume = Math.max(0, Math.min(1, sound.volume / 100));
  if (volume === 0) return;
  const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? userGesture;
  if (!userGesture && !activated) return;
  try {
    if (sound.kind === 'upload' && sound.file) {
      const audio = new Audio(`/startup/${sound.file}`);
      audio.volume = volume;
      await audio.play();
      return;
    }
    if (sound.kind === 'chime') await playChime(volume);
  } catch {
    // Autoplay blocked or the file failed: stay silent.
  }
}

async function playChime(volume: number): Promise<void> {
  const Context = window.AudioContext;
  if (!Context) return;
  const context = new Context();
  if (context.state === 'suspended') await context.resume();
  const master = context.createGain();
  master.gain.value = volume * 0.5;
  master.connect(context.destination);
  const now = context.currentTime;
  // Two soft sine notes a fifth apart with a slow release, like a calm boot chime.
  for (const [frequency, start, length] of [
    [523.25, 0, 1.4],
    [783.99, 0.18, 1.6],
  ] as const) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(1, now + start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + start + length);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + start);
    osc.stop(now + start + length + 0.05);
  }
  window.setTimeout(() => void context.close(), 2500);
}
