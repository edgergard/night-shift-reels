import type { SymbolId } from './symbols';

export type Strip = readonly SymbolId[];
export type Strips = readonly [Strip, Strip, Strip];

/** What one reel shows when it is at rest: [top, middle, bottom]. */
export type ReelWindow = readonly [SymbolId, SymbolId, SymbolId];

/**
 * Ordered symbol strips, one per reel. A strip is circular: after the last
 * symbol comes the first one again. Every symbol appears on every strip, so a
 * three-of-a-kind on the middle line is always reachable.
 */
export const REEL_STRIPS: Strips = [
  ['moon', 'comet', 'star', 'planet', 'moon', 'rocket', 'comet', 'star', 'moon', 'planet', 'comet', 'rocket'],
  ['comet', 'moon', 'planet', 'comet', 'star', 'rocket', 'moon', 'comet', 'planet', 'moon', 'star', 'rocket'],
  ['star', 'moon', 'comet', 'rocket', 'planet', 'moon', 'comet', 'star', 'moon', 'rocket', 'comet', 'planet'],
];

/** Always-positive modulo: mod(-1, 12) === 11. */
export function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
}

/** Symbol at any (possibly negative or out-of-range) index of a circular strip. */
export function symbolAt(strip: Strip, index: number): SymbolId {
  const symbol = strip[mod(index, strip.length)];
  if (symbol === undefined) throw new Error('Empty reel strip');
  return symbol;
}

/**
 * The stop index is the strip index that lands on the MIDDLE row.
 * The row above shows the previous strip entry, the row below the next one,
 * wrapping around the strip ends.
 */
export function visibleWindow(strip: Strip, stopIndex: number): ReelWindow {
  return [symbolAt(strip, stopIndex - 1), symbolAt(strip, stopIndex), symbolAt(strip, stopIndex + 1)];
}
