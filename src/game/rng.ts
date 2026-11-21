/** A source of randomness returning a float in [0, 1), like Math.random. */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

/** Deterministic PRNG (mulberry32) for reproducible tests. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, max). Clamped so a misbehaving rng can never go out of range. */
export function randomInt(rng: Rng, max: number): number {
  const value = Math.floor(rng() * max);
  return Math.min(Math.max(value, 0), max - 1);
}
