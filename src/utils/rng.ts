export type Rng = () => number;

/** A small, fast, deterministic PRNG (mulberry32) — given the same 32-bit seed it always produces
 * the same sequence of [0,1) floats, so a whole game's board/deck generation can be replayed
 * exactly by reusing the same seed. Not cryptographically secure; that's not the goal here. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hashes an arbitrary string (e.g. a user-typed seed) down to a 32-bit unsigned int suitable for
 * mulberry32 — lets players share/replay a board via a short, memorable seed instead of a raw
 * number. (xmur3) */
export function hashStringToSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Generates a short, easy-to-share random seed string (base36) for when the player doesn't
 * specify their own. */
export function randomSeedString(): string {
  return Math.floor(Math.random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
}
