import { describe, expect, it } from "vitest";
import { hashStringToSeed, mulberry32, randomSeedString } from "./rng";

describe("mulberry32", () => {
  it("produces the exact same sequence of values for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("always stays within [0, 1)", () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("hashStringToSeed", () => {
  it("is deterministic for the same string", () => {
    expect(hashStringToSeed("dragon-moon")).toBe(hashStringToSeed("dragon-moon"));
  });

  it("produces different hashes for different strings (no trivial collisions on common inputs)", () => {
    const hashes = new Set(["a", "b", "seed1", "seed2", "celestial", "alignment"].map(hashStringToSeed));
    expect(hashes.size).toBe(6);
  });
});

describe("randomSeedString", () => {
  it("generates a non-empty, reasonably short string", () => {
    const s = randomSeedString();
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(10);
  });
});
