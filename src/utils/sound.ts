/** Every distinct sound cue the game can play, synthesized on the fly via the Web Audio API rather
 * than shipped as audio files — keeps the app dependency-free and asset-free for sound. Each cue is
 * a short, hand-built envelope of oscillators/filtered noise (see the SOUND_RECIPES map at the
 * bottom) rather than a single tone, so they read as distinct even played back to back. */
export type SoundId =
  | "PATH_COMPLETE"
  | "ASTEROID_HIT"
  | "CORRUPT_TILE"
  | "VOID_FORM"
  | "DAMAGE"
  | "SHOOTING_STAR"
  | "ELEMENT_SURGE"
  | "ASTEROID_MOVE"
  | "PURIFY"
  | "COSMIC_DRAW";

/** ============================================================================================
 * SOUND PRIORITY — edit this freely to change which cue "wins" when more than one sound-worthy
 * event happens in the same dispatch (e.g. an asteroid shift that both moves AND destroys a card,
 * or an END_TURN that both decays corruption and resolves an Eclipse card). FIRST entry = highest
 * priority. Only ONE sound ever plays per dispatch — see resolveSoundConflict below — so a lower
 * kind on this list is fully silent whenever a higher one also fires from the same event.
 * ============================================================================================ */
export const SOUND_PRIORITY: SoundId[] = [
  "PATH_COMPLETE",
  "ASTEROID_HIT",
  "CORRUPT_TILE",
  "VOID_FORM",
  "DAMAGE",
  "SHOOTING_STAR",
  "ELEMENT_SURGE",
  "ASTEROID_MOVE",
  "PURIFY",
  "COSMIC_DRAW"
];

/** Picks whichever id in `ids` sits highest in SOUND_PRIORITY (lowest index). Returns null for an
 * empty list. An id missing from the priority list is treated as lowest priority, same fallback
 * behavior as messageKinds.ts's pickTitleKind. */
export function resolveSoundConflict(ids: SoundId[]): SoundId | null {
  if (!ids.length) return null;
  let best = ids[0];
  let bestRank = SOUND_PRIORITY.indexOf(best);
  if (bestRank === -1) bestRank = Infinity;
  for (const id of ids.slice(1)) {
    let rank = SOUND_PRIORITY.indexOf(id);
    if (rank === -1) rank = Infinity;
    if (rank < bestRank) {
      best = id;
      bestRank = rank;
    }
  }
  return best;
}

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Lazily created on first use (never at module load) — browsers refuse to start an AudioContext
 * before a user gesture, and by the time any game sound plays the player has already clicked
 * Start/a tile/a button, so this always succeeds. `resume()` is called defensively every time in
 * case the browser auto-suspended it (e.g. after a long idle tab). */
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** A short buffer of white noise, generated once and reused (via a fresh BufferSourceNode each
 * play — a source node can only be started once) as the raw material for anything noise-based
 * (asteroid rumble/impact, a cosmic-draw swoosh) — cheaper and simpler than synthesizing pink/brown
 * noise, and a BiquadFilterNode shapes plain white noise into whatever tonal character each cue
 * needs anyway. */
function getNoiseBuffer(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const length = c.sampleRate * 1.2;
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

function tone(c: AudioContext, dest: AudioNode, opts: { freq: number; endFreq?: number; type?: OscillatorType; start: number; duration: number; peakGain: number }) {
  const { freq, endFreq, type = "sine", start, duration, peakGain } = opts;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), c.currentTime + start + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(peakGain, c.currentTime + start + Math.min(0.02, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.02);
}

function noise(c: AudioContext, dest: AudioNode, opts: { start: number; duration: number; peakGain: number; filterFreq: number; filterType?: BiquadFilterType; filterEndFreq?: number }) {
  const { start, duration, peakGain, filterFreq, filterType = "lowpass", filterEndFreq } = opts;
  const src = c.createBufferSource();
  src.buffer = getNoiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, c.currentTime + start);
  if (filterEndFreq !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(1, filterEndFreq), c.currentTime + start + duration);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(peakGain, c.currentTime + start + Math.min(0.02, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(c.currentTime + start);
  src.stop(c.currentTime + start + duration + 0.02);
}

/** One recipe per SoundId — `c` is the live AudioContext, `dest` its final output (a per-play
 * master gain, see playSound). Keep each recipe under ~1s so cues never overstay a modal dismissal
 * or overlap the next player's turn. */
const SOUND_RECIPES: Record<SoundId, (c: AudioContext, dest: AudioNode) => void> = {
  // Triumphant ascending triad — the biggest "you did it" moment in the game.
  PATH_COMPLETE: (c, dest) => {
    tone(c, dest, { freq: 523.25, type: "triangle", start: 0, duration: 0.22, peakGain: 0.22 });
    tone(c, dest, { freq: 659.25, type: "triangle", start: 0.09, duration: 0.22, peakGain: 0.22 });
    tone(c, dest, { freq: 783.99, type: "triangle", start: 0.18, duration: 0.45, peakGain: 0.26 });
  },
  // Sharp noise crack plus a low thump — a physical impact.
  ASTEROID_HIT: (c, dest) => {
    noise(c, dest, { start: 0, duration: 0.18, peakGain: 0.3, filterFreq: 3200, filterType: "lowpass", filterEndFreq: 300 });
    tone(c, dest, { freq: 110, endFreq: 45, type: "sine", start: 0, duration: 0.32, peakGain: 0.35 });
  },
  // Descending, slightly detuned minor dyad — ominous, unsettled.
  CORRUPT_TILE: (c, dest) => {
    tone(c, dest, { freq: 293.66, endFreq: 220, type: "sawtooth", start: 0, duration: 0.4, peakGain: 0.14 });
    tone(c, dest, { freq: 349.23, endFreq: 261.63, type: "sawtooth", start: 0.05, duration: 0.42, peakGain: 0.11 });
  },
  // Deep descending sweep with a trailing noise "swallow" — something vanishing into a hole.
  VOID_FORM: (c, dest) => {
    tone(c, dest, { freq: 220, endFreq: 40, type: "sine", start: 0, duration: 0.55, peakGain: 0.28 });
    noise(c, dest, { start: 0.1, duration: 0.4, peakGain: 0.12, filterFreq: 800, filterType: "lowpass", filterEndFreq: 120 });
  },
  // Short harsh square-wave buzz — an unpleasant "ow".
  DAMAGE: (c, dest) => {
    tone(c, dest, { freq: 180, endFreq: 90, type: "square", start: 0, duration: 0.16, peakGain: 0.18 });
  },
  // Twinkly fast ascending arpeggio — collecting a bonus.
  SHOOTING_STAR: (c, dest) => {
    [880, 1108.73, 1318.51, 1760].forEach((freq, i) => {
      tone(c, dest, { freq, type: "triangle", start: i * 0.06, duration: 0.18, peakGain: 0.16 });
    });
  },
  // Bright quick sparkle — an elemental ability firing successfully.
  ELEMENT_SURGE: (c, dest) => {
    tone(c, dest, { freq: 587.33, type: "square", start: 0, duration: 0.1, peakGain: 0.12 });
    tone(c, dest, { freq: 880, type: "square", start: 0.05, duration: 0.16, peakGain: 0.14 });
  },
  // Low filtered noise rumble — something heavy sliding across the board.
  ASTEROID_MOVE: (c, dest) => {
    noise(c, dest, { start: 0, duration: 0.5, peakGain: 0.1, filterFreq: 220, filterType: "lowpass" });
  },
  // Clean bright bell ping — a corrupted card made whole again.
  PURIFY: (c, dest) => {
    tone(c, dest, { freq: 987.77, type: "sine", start: 0, duration: 0.3, peakGain: 0.16 });
    tone(c, dest, { freq: 1975.53, type: "sine", start: 0, duration: 0.2, peakGain: 0.06 });
  },
  // Quick filtered-noise swoosh sweeping upward — cards shuffling away and back.
  COSMIC_DRAW: (c, dest) => {
    noise(c, dest, { start: 0, duration: 0.22, peakGain: 0.14, filterFreq: 400, filterType: "bandpass", filterEndFreq: 2400 });
  }
};

/** Plays exactly one synthesized cue. Safe to call even before any user gesture / in a non-browser
 * environment (tests) — silently no-ops if an AudioContext can't be created. */
export function playSound(id: SoundId) {
  const c = getCtx();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = 1;
  master.connect(c.destination);
  SOUND_RECIPES[id](c, master);
}
