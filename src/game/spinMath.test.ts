import { describe, expect, it } from 'vitest';
import { REEL_STRIPS, symbolAt, visibleWindow } from './reels';
import { reelFrame, spinTarget } from './spinMath';

const N = 12;

describe('spinTarget', () => {
  it('lands on the stop index after at least minLoops revolutions', () => {
    for (let from = -30; from <= 30; from++) {
      for (let stop = 0; stop < N; stop++) {
        const target = spinTarget(from, stop, N, 2);
        expect(((target % N) + N) % N).toBe(stop);
        expect(from - target).toBeGreaterThanOrEqual(2 * N);
        expect(from - target).toBeLessThan(3 * N);
      }
    }
  });

  it('the frame at the target shows exactly the decided window', () => {
    const strip = REEL_STRIPS[1];
    for (let stop = 0; stop < N; stop++) {
      const { base, offset } = reelFrame(spinTarget(5, stop, N, 3), N);
      expect(offset).toBe(0);
      const drawn = [-1, 0, 1].map((row) => symbolAt(strip, base + row));
      expect(drawn).toEqual(visibleWindow(strip, stop));
    }
  });
});

describe('reelFrame', () => {
  it('splits a position into strip index and sub-row offset', () => {
    expect(reelFrame(3.25, N)).toEqual({ base: 3, offset: 0.25 });
    expect(reelFrame(-0.5, N)).toEqual({ base: 11, offset: 0.5 });
  });

  it('is continuous: symbols slide down as the position decreases', () => {
    // A symbol drawn at y = (row - offset). Track strip index 5 across a step.
    const yOf = (index: number, position: number): number => {
      const { base, offset } = reelFrame(position, N);
      return index - base - offset; // row of `index` relative to the middle
    };
    expect(yOf(5, 5)).toBe(0); // on the middle row
    expect(yOf(5, 4.5)).toBeCloseTo(0.5); // half a row lower
    expect(yOf(5, 4)).toBe(1); // bottom row
  });
});
