// Cinder Bay — all sound is synthesized with WebAudio: no audio files.
// Rain noise, a low engine hum, a two-tone siren, gunshots, a pad-music loop
// and short UI / mission stings. Everything starts on the first user gesture.
import { G } from './state.js';

let ctx = null, master = null, engineOsc = null, engineGain = null;
let sirenOsc = null, sirenGain = null, sirenTimer = null;
let musicTimer = null, rainSrc = null;
const CHORDS = [
  [110.0, 130.8, 164.8], // Am
  [87.3, 110.0, 130.8],  // F
  [98.0, 123.5, 146.8],  // G
  [82.4, 98.0, 123.5],   // E
];
let chordIdx = 0;

function noiseBuffer(seconds = 2) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = G.muted ? 0 : 0.5;
    master.connect(ctx.destination);
    startRain(); startMusic();
  } catch (e) { ctx = null; }
}

export function setMuted(m) {
  G.muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

function startRain() {
  rainSrc = ctx.createBufferSource();
  rainSrc.buffer = noiseBuffer(3); rainSrc.loop = true;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 900;
  const g = ctx.createGain(); g.gain.value = 0.05;
  rainSrc.connect(filt); filt.connect(g); g.connect(master);
  rainSrc.start();
}

function startMusic() {
  const playChord = () => {
    if (!ctx || G.muted) { musicTimer = setTimeout(playChord, 4000); return; }
    const chord = CHORDS[chordIdx % CHORDS.length]; chordIdx++;
    chord.forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 1.2);
      g.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 4.2);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + 4.3);
    });
    musicTimer = setTimeout(playChord, 4000);
  };
  playChord();
}

export function engineStart() {
  if (!ctx || engineOsc) return;
  engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 320;
  engineGain = ctx.createGain(); engineGain.gain.value = 0.0;
  engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(master);
  engineOsc.start();
}
export function engineSet(speed01) {
  if (!engineOsc) return;
  engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.1);
  engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.05, ctx.currentTime, 0.1);
}
export function engineStop() {
  if (!engineOsc) return;
  try { engineOsc.stop(); } catch (e) {}
  engineOsc = null; engineGain = null;
}

export function sirenStart() {
  if (!ctx || sirenOsc) return;
  sirenOsc = ctx.createOscillator(); sirenOsc.type = 'square'; sirenOsc.frequency.value = 700;
  sirenGain = ctx.createGain(); sirenGain.gain.value = 0.015;
  sirenOsc.connect(sirenGain); sirenGain.connect(master);
  sirenOsc.start();
  let hi = true;
  sirenTimer = setInterval(() => {
    if (!sirenOsc) return;
    hi = !hi;
    sirenOsc.frequency.setTargetAtTime(hi ? 950 : 650, ctx.currentTime, 0.05);
  }, 420);
}
export function sirenStop() {
  if (sirenTimer) clearInterval(sirenTimer);
  sirenTimer = null;
  if (!sirenOsc) return;
  try { sirenOsc.stop(); } catch (e) {}
  sirenOsc = null; sirenGain = null;
}

function blip(freq, dur, type = 'sine', vol = 0.12) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(ctx.currentTime + dur);
}

export function sfxShot() {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.18);
  const filt = ctx.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 800;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.35, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start();
}
export function sfxHit() { blip(220, 0.12, 'square', 0.08); }
export function sfxPickup() { blip(660, 0.12); setTimeout(() => blip(990, 0.18), 90); }
export function sfxMission() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.25), i * 110)); }
export function sfxFail() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle'), i * 130)); }
export function sfxClick() { blip(880, 0.06, 'square', 0.05); }
export function sfxCrash() {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(0.3);
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 300;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.4, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start();
}
