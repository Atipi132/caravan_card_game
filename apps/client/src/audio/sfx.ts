/**
 * Procedurally synthesised sound effects (no third-party audio assets):
 * card flicks / slides / shuffles, Pip-Boy style UI blips and a low desert-wind ambience.
 */
import { settingsStore } from '../settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let ambience: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
/** Browsers only allow audio after a user gesture. */
let unlocked = false;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !unlocked) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  if (master) master.gain.value = settingsStore.get().volume;
  return ctx;
}

function enabled(): boolean {
  return settingsStore.get().sound;
}

function noiseBurst(opts: { at?: number; dur: number; freq: number; q?: number; gain: number; sweepTo?: number; type?: BiquadFilterType }): void {
  const a = audio();
  if (!a || !master || !noiseBuffer) return;
  const t = a.currentTime + (opts.at ?? 0);
  const src = a.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq, t);
  if (opts.sweepTo) filter.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + opts.dur);
  filter.Q.value = opts.q ?? 1;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain, t + Math.min(0.01, opts.dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t, Math.random() * 1.5);
  src.stop(t + opts.dur + 0.05);
}

function tone(opts: { at?: number; dur: number; freq: number; gain: number; type?: OscillatorType; slideTo?: number }): void {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + (opts.at ?? 0);
  const osc = a.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + opts.dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + opts.dur + 0.05);
}

export const sfx = {
  /** Card snapped onto the table. */
  place(delay = 0) {
    if (!enabled()) return;
    noiseBurst({ at: delay, dur: 0.07, freq: 2600, q: 0.8, gain: 0.5 });
    noiseBurst({ at: delay + 0.005, dur: 0.12, freq: 380, q: 1.2, gain: 0.35, type: 'lowpass' });
  },
  /** Card sliding across the wood. */
  slide(delay = 0) {
    if (!enabled()) return;
    noiseBurst({ at: delay, dur: 0.22, freq: 1800, sweepTo: 900, q: 0.6, gain: 0.16 });
  },
  /** Drawing a card from the deck. */
  draw(delay = 0) {
    if (!enabled()) return;
    noiseBurst({ at: delay, dur: 0.12, freq: 3200, sweepTo: 1800, q: 0.7, gain: 0.18 });
  },
  shuffle() {
    if (!enabled()) return;
    for (let i = 0; i < 14; i++) noiseBurst({ at: i * 0.035 + Math.random() * 0.01, dur: 0.05, freq: 2500 + Math.random() * 1500, q: 1, gain: 0.22 });
  },
  /** Cards discarded / removed by a Jack or Joker. */
  remove(delay = 0) {
    if (!enabled()) return;
    noiseBurst({ at: delay, dur: 0.3, freq: 1400, sweepTo: 500, q: 0.5, gain: 0.22 });
  },
  /** Pip-Boy menu blip. */
  blip() {
    if (!enabled()) return;
    tone({ dur: 0.05, freq: 1350, gain: 0.07, type: 'square' });
  },
  select() {
    if (!enabled()) return;
    tone({ dur: 0.06, freq: 900, gain: 0.08, type: 'square' });
    tone({ at: 0.04, dur: 0.06, freq: 1350, gain: 0.06, type: 'square' });
  },
  error() {
    if (!enabled()) return;
    tone({ dur: 0.16, freq: 180, gain: 0.12, type: 'sawtooth', slideTo: 120 });
  },
  win() {
    if (!enabled()) return;
    [523, 659, 784, 1046].forEach((f, i) => tone({ at: i * 0.12, dur: 0.3, freq: f, gain: 0.09, type: 'triangle' }));
  },
  lose() {
    if (!enabled()) return;
    [392, 330, 262, 196].forEach((f, i) => tone({ at: i * 0.16, dur: 0.38, freq: f, gain: 0.09, type: 'triangle' }));
  },
  turn() {
    if (!enabled()) return;
    tone({ dur: 0.08, freq: 660, gain: 0.05, type: 'triangle' });
  },
};

/** Low, slowly modulated wind noise. */
export function setAmbience(on: boolean): void {
  const a = audio();
  if (!a || !master || !noiseBuffer) return;
  const want = on && settingsStore.get().sound && settingsStore.get().ambience;
  if (want && !ambience) {
    const src = a.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.7;
    const lfo = a.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = a.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(lp.frequency);
    const gain = a.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.06, a.currentTime + 3);
    src.connect(lp).connect(gain).connect(master);
    src.start();
    lfo.start();
    ambience = { src, gain };
  } else if (!want && ambience) {
    const { src, gain } = ambience;
    gain.gain.linearRampToValueAtTime(0, a.currentTime + 0.8);
    src.stop(a.currentTime + 0.9);
    ambience = null;
  }
}

/** Must be called from a user gesture once to unlock audio on some browsers. */
export function unlockAudio(): void {
  unlocked = true;
  audio();
}
