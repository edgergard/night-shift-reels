import { mod } from './reels';

/**
 * Reel motion model (shared by the renderer and the tests).
 *
 * A reel is described by one number, `position`. At an integer position p the
 * reel is at rest and strip[p mod n] sits on the middle row — exactly like a
 * stop index. Between integers the strip is part-way between two rows.
 *
 * DEcreasing the position moves symbols DOWN the screen (the previous strip
 * entry slides from the top row into the middle), which is how reels spin.
 * GSAP therefore only ever tweens a plain number from `from` to `spinTarget()`.
 */

/**
 * Target position for a spin: strictly below `from`, at least `minLoops` full
 * strip revolutions away, and congruent to `stop` modulo the strip length, so
 * the tween is guaranteed to come to rest on the decided symbol.
 */
export function spinTarget(from: number, stop: number, length: number, minLoops: number): number {
  const restingFrom = Math.round(from);
  const distanceToStop = mod(restingFrom - stop, length);
  return restingFrom - distanceToStop - minLoops * length;
}

export interface ReelFrame {
  /** Strip index drawn on the middle row slot. */
  readonly base: number;
  /** 0..1 — how far the strip has slid down from that row. */
  readonly offset: number;
}

/**
 * Converts a position into what to draw: row r (-1 top, 0 middle, 1 bottom,
 * plus ±2 buffer rows that slide in from outside the mask) shows
 * strip[base + r] at y = (r - offset) * cellSize, relative to the middle row.
 * At rest offset is 0, so the rows match visibleWindow(strip, base).
 */
export function reelFrame(position: number, length: number): ReelFrame {
  const floor = Math.floor(position);
  return { base: mod(floor, length), offset: position - floor };
}
