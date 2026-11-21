import { REEL_STRIPS, visibleWindow, type ReelWindow, type Strips } from './reels';
import { randomInt, type Rng } from './rng';
import { SYMBOL_IDS, type SymbolId } from './symbols';

/** One stop index per reel — the single source of truth for a round. */
export type Stops = readonly [number, number, number];

export type Outcome =
  | { readonly kind: 'win'; readonly symbol: SymbolId; readonly line: 'middle' }
  | { readonly kind: 'lose' };

export interface Round {
  readonly id: number;
  readonly stops: Stops;
  /** columns[reel] = [top, middle, bottom] */
  readonly columns: readonly [ReelWindow, ReelWindow, ReelWindow];
  readonly middleRow: readonly [SymbolId, SymbolId, SymbolId];
  readonly outcome: Outcome;
  /** True for the explicitly labelled "Show a win" round. */
  readonly demo: boolean;
}

export function pickStops(rng: Rng, strips: Strips = REEL_STRIPS): Stops {
  return [randomInt(rng, strips[0].length), randomInt(rng, strips[1].length), randomInt(rng, strips[2].length)];
}

/**
 * Stops that are guaranteed to put the same symbol on the middle line.
 * Used only by the clearly labelled demo round.
 */
export function demoWinStops(rng: Rng, strips: Strips = REEL_STRIPS): Stops {
  const candidates = SYMBOL_IDS.filter((symbol) => strips.every((strip) => strip.includes(symbol)));
  const symbol = candidates[randomInt(rng, candidates.length)];
  if (symbol === undefined) throw new Error('No symbol appears on every strip');
  const pick = (reel: 0 | 1 | 2): number => {
    const indexes = strips[reel].flatMap((s, i) => (s === symbol ? [i] : []));
    return indexes[randomInt(rng, indexes.length)] ?? 0;
  };
  return [pick(0), pick(1), pick(2)];
}

export function evaluate(middleRow: readonly [SymbolId, SymbolId, SymbolId]): Outcome {
  const [a, b, c] = middleRow;
  return a === b && b === c ? { kind: 'win', symbol: a, line: 'middle' } : { kind: 'lose' };
}

function assertValidStops(stops: Stops, strips: Strips): void {
  stops.forEach((stop, reel) => {
    const length = strips[reel]?.length ?? 0;
    if (!Number.isInteger(stop) || stop < 0 || stop >= length) {
      throw new RangeError(`Stop ${stop} is out of range for reel ${reel} (length ${length})`);
    }
  });
}

/** Pure: same stops in → same grid and outcome out. */
export function resolveRound(id: number, stops: Stops, demo = false, strips: Strips = REEL_STRIPS): Round {
  assertValidStops(stops, strips);
  const columns = [
    visibleWindow(strips[0], stops[0]),
    visibleWindow(strips[1], stops[1]),
    visibleWindow(strips[2], stops[2]),
  ] as const;
  const middleRow = [columns[0][1], columns[1][1], columns[2][1]] as const;
  return { id, stops, columns, middleRow, outcome: evaluate(middleRow), demo };
}
