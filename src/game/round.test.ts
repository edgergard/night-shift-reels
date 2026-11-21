import { describe, expect, it } from 'vitest';
import { REEL_STRIPS, visibleWindow, type Strips } from './reels';
import { seededRng } from './rng';
import { demoWinStops, evaluate, pickStops, resolveRound } from './round';

const TEST_STRIPS: Strips = [
  ['moon', 'comet', 'star', 'planet'],
  ['star', 'moon', 'rocket', 'comet'],
  ['comet', 'planet', 'moon', 'rocket'],
];

describe('resolveRound', () => {
  it('wins when the middle row is three of a kind', () => {
    // moon is at index 0 / 1 / 2 on the three test strips
    const round = resolveRound(1, [0, 1, 2], false, TEST_STRIPS);
    expect(round.middleRow).toEqual(['moon', 'moon', 'moon']);
    expect(round.outcome).toEqual({ kind: 'win', symbol: 'moon', line: 'middle' });
  });

  it('loses when the middle row differs, even if another row matches', () => {
    // top row is planet/star/comet, middle moon/moon/planet — no win
    const round = resolveRound(1, [0, 1, 1], false, TEST_STRIPS);
    expect(round.middleRow).toEqual(['moon', 'moon', 'planet']);
    expect(round.outcome).toEqual({ kind: 'lose' });
  });

  it('only the middle row counts: a matching top row is not a win', () => {
    const strips: Strips = [
      ['star', 'moon', 'comet'],
      ['star', 'comet', 'moon'],
      ['star', 'rocket', 'planet'],
    ];
    const round = resolveRound(1, [1, 1, 1], false, strips);
    expect(round.columns.map((c) => c[0])).toEqual(['star', 'star', 'star']);
    expect(round.outcome.kind).toBe('lose');
  });

  it('wraps the window correctly at both ends of the strip', () => {
    const strip = TEST_STRIPS[0];
    // stop 0: top row comes from the END of the strip
    expect(visibleWindow(strip, 0)).toEqual(['planet', 'moon', 'comet']);
    // last stop: bottom row comes from the START of the strip
    expect(visibleWindow(strip, 3)).toEqual(['star', 'planet', 'moon']);

    const round = resolveRound(7, [0, 3, 3], false, TEST_STRIPS);
    expect(round.columns).toEqual([
      ['planet', 'moon', 'comet'],
      ['rocket', 'comet', 'star'],
      ['moon', 'rocket', 'comet'],
    ]);
    expect(round.middleRow).toEqual(['moon', 'comet', 'rocket']);
  });

  it('rejects stop indexes outside the strip', () => {
    expect(() => resolveRound(1, [4, 0, 0], false, TEST_STRIPS)).toThrow(RangeError);
    expect(() => resolveRound(1, [-1, 0, 0], false, TEST_STRIPS)).toThrow(RangeError);
    expect(() => resolveRound(1, [0.5, 0, 0], false, TEST_STRIPS)).toThrow(RangeError);
  });

  it('evaluate is independent of the rest of the grid', () => {
    expect(evaluate(['comet', 'comet', 'comet']).kind).toBe('win');
    expect(evaluate(['comet', 'comet', 'star']).kind).toBe('lose');
  });
});

describe('stop selection', () => {
  it('is reproducible with a seeded rng', () => {
    expect(pickStops(seededRng(42))).toEqual(pickStops(seededRng(42)));
  });

  it('always lands inside each strip', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 500; i++) {
      pickStops(rng).forEach((stop, reel) => {
        expect(stop).toBeGreaterThanOrEqual(0);
        expect(stop).toBeLessThan(REEL_STRIPS[reel]?.length ?? 0);
      });
    }
  });

  it('handles an rng that returns its edge values', () => {
    expect(pickStops(() => 0)).toEqual([0, 0, 0]);
    expect(pickStops(() => 0.9999999)).toEqual([11, 11, 11]);
  });

  it('demo stops always produce a win on the real strips', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 200; i++) {
      expect(resolveRound(i, demoWinStops(rng), true).outcome.kind).toBe('win');
    }
  });
});
