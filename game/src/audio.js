// audio.js — TIDEWARDEN's sound, made in code: a generative WebAudio score (a slow
// dusk progression with a plucked pentatonic melody that darkens when the tide is
// high) and every effect synthesized from oscillators and noise — no audio files.
// The context is created lazily on the player's first gesture, as browsers require;
// in a headless or muted run every call is a safe no-op.

const MELODY = [220, 261.63, 329.63, 392, 440, 523.25, 659.25]; // A minor pentatonic shelf
const PROGRESSION = [ // [root, third, fifth] per bar — Am, F, C, G at dusk
  [110, 220, 261.63], [87.31, 174.61, 220], [130.81, 196, 261.63], [98, 196, 246.94],
];

export function createAudio() {
  const api = {
    ctx: null, master: null, musicGain: null, filter: null,
    bar: 0, nextBarAt: 0, timer: null, highTide: false, muted: false,
    rng: Math.random,

    unlock() {
      if (api.ctx || typeof window === 'undefined' || !window.AudioContext) return;
      const ctx = new window.AudioContext();
      api.ctx = ctx;
      api.master = ctx.createGain();
      api.master.gain.value = 0.5;
      api.master.connect(ctx.destination);
      api.filter = ctx.createBiquadFilter();
      api.filter.type = 'lowpass';
      api.filter.frequency.value = 900;
      api.musicGain = ctx.createGain();
      api.musicGain.gain.value = 0.16;
      api.filter.connect(api.musicGain);
      api.musicGain.connect(api.master);
      api.nextBarAt = ctx.currentTime + 0.1;
      api.timer = setInterval(api.schedule, 200);
    },

    setHighTide(high) {
      api.highTide = high;
      if (api.filter && api.ctx) {
        api.filter.frequency.linearRampToValueAtTime(high ? 520 : 950, api.ctx.currentTime + 1.5);
      }
    },

    // The score: one bar every 2.4 s. A soft pad triad, a bass root, and two or
    // three plucked melody notes chosen from the pentatonic shelf; at high tide a
    // low drum joins and the filter closes, so the flood sounds like weather.
    schedule() {
      if (!api.ctx) return;
      const BAR = 2.4;
      while (api.nextBarAt < api.ctx.currentTime + 0.5) {
        const t = api.nextBarAt;
        const chord = PROGRESSION[api.bar % PROGRESSION.length];
        for (const f of chord) api.tone(f, t, BAR * 0.95, 'triangle', 0.05, api.filter);
        api.tone(chord[0] / 2, t, BAR * 0.9, 'sine', 0.11, api.filter);
        const plucks = 2 + Math.floor(api.rng() * 2);
        for (let i = 0; i < plucks; i++) {
          const note = MELODY[Math.floor(api.rng() * MELODY.length)];
          api.tone(note, t + 0.3 + i * (BAR / plucks) + api.rng() * 0.1, 0.5, 'pluck', 0.06, api.filter);
        }
        if (api.highTide) api.tone(55, t, 0.5, 'sine', 0.16, api.master);
        api.bar += 1;
        api.nextBarAt += BAR;
      }
    },

    tone(freq, at, dur, type, gain, dest) {
      const ctx = api.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type === 'pluck' ? 'square' : type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + (type === 'pluck' ? 0.01 : 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g); g.connect(dest ?? api.master);
      osc.start(at); osc.stop(at + dur + 0.05);
    },

    noise(at, dur, freq, gain) {
      const ctx = api.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(api.master);
      src.start(at);
    },

    // Effects: each a few oscillators or a breath of filtered noise, tuned to read
    // at a glance — a crack for bolts, a sizzle for the coil, a deep thump for the
    // mortar, a bell for gold and a groan for a leak.
    sfx(name) {
      if (!api.ctx || api.muted) return;
      const t = api.ctx.currentTime;
      switch (name) {
        case 'bolt': api.tone(880 + Math.random() * 220, t, 0.07, 'square', 0.03); break;
        case 'frost': api.noise(t, 0.18, 3200, 0.05); break;
        case 'mortar': api.tone(140, t, 0.16, 'sine', 0.10); break;
        case 'storm': api.noise(t, 0.14, 1800, 0.07); api.tone(1200, t, 0.08, 'sawtooth', 0.02); break;
        case 'aura': api.tone(660, t, 0.12, 'sine', 0.03); break;
        case 'boom': api.noise(t, 0.3, 300, 0.16); api.tone(70, t, 0.3, 'sine', 0.14); break;
        case 'kill': api.tone(520, t, 0.06, 'triangle', 0.025); break;
        case 'coin': api.tone(1320, t, 0.09, 'sine', 0.04); break;
        case 'leak': api.tone(160, t, 0.35, 'sawtooth', 0.09); api.tone(110, t + 0.05, 0.4, 'sawtooth', 0.07); break;
        case 'wave': api.noise(t, 0.7, 500, 0.08); api.tone(196, t, 0.5, 'triangle', 0.06); break;
        case 'phase': api.tone(98, t, 0.6, 'sawtooth', 0.10); api.noise(t, 0.5, 240, 0.10); break;
        case 'bossdown': api.noise(t, 0.8, 200, 0.18); api.tone(392, t + 0.1, 0.4, 'triangle', 0.07); api.tone(523, t + 0.25, 0.5, 'triangle', 0.07); break;
        case 'build': api.tone(330, t, 0.1, 'triangle', 0.06); api.tone(495, t + 0.07, 0.12, 'triangle', 0.06); break;
        case 'upgrade': api.tone(440, t, 0.09, 'triangle', 0.06); api.tone(660, t + 0.08, 0.14, 'triangle', 0.06); break;
        case 'sell': api.tone(990, t, 0.08, 'sine', 0.05); api.tone(1320, t + 0.06, 0.1, 'sine', 0.04); break;
        case 'error': api.tone(180, t, 0.14, 'square', 0.05); break;
        case 'click': api.tone(700, t, 0.05, 'sine', 0.04); break;
        case 'win': [523, 659, 784, 1047].forEach((f, i) => api.tone(f, t + i * 0.14, 0.5, 'triangle', 0.07)); break;
        case 'lose': [392, 330, 262, 196].forEach((f, i) => api.tone(f, t + i * 0.18, 0.5, 'triangle', 0.07)); break;
      }
    },
  };
  return api;
}
