import { REEL_STRIPS, type Strips } from './reels';
import { defaultRng, type Rng } from './rng';
import { demoWinStops, pickStops, resolveRound, type Round, type Stops } from './round';

export type Phase = 'idle' | 'spinning' | 'result';

/** The only legal moves. Anything else is rejected, not silently applied. */
export const TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  idle: ['spinning'],
  spinning: ['result'],
  result: ['spinning'],
};

export type FinishedBy = 'reels' | 'skip';

export type GameState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'spinning'; readonly round: Round }
  | { readonly phase: 'result'; readonly round: Round; readonly finishedBy: FinishedBy };

export interface SpinOptions {
  /** Fixed stop indexes (tests, demo). Omit to draw them from the rng. */
  readonly stops?: Stops;
  readonly demo?: boolean;
}

export interface ControllerOptions {
  readonly rng?: Rng;
  readonly strips?: Strips;
}

type Listener = (state: GameState) => void;

/**
 * Pure round state machine. It knows nothing about Pixi, GSAP or the DOM:
 * the view asks it to spin, animates whatever Round it gets back, and reports
 * back with finish(roundId). The roundId guard makes late callbacks harmless.
 */
export class RoundController {
  private current: GameState = { phase: 'idle' };
  private nextId = 1;
  private readonly listeners = new Set<Listener>();
  private readonly rng: Rng;
  private readonly strips: Strips;

  constructor({ rng = defaultRng, strips = REEL_STRIPS }: ControllerOptions = {}) {
    this.rng = rng;
    this.strips = strips;
  }

  get state(): GameState {
    return this.current;
  }

  canSpin(): boolean {
    return TRANSITIONS[this.current.phase].includes('spinning');
  }

  /**
   * Starts a round. The outcome is decided HERE, once, before any animation.
   * Returns null (and changes nothing) if a round is already spinning.
   */
  spin(options: SpinOptions = {}): Round | null {
    if (!this.canSpin()) return null;
    const demo = options.demo ?? false;
    const stops = options.stops ?? (demo ? demoWinStops(this.rng, this.strips) : pickStops(this.rng, this.strips));
    const round = resolveRound(this.nextId++, stops, demo, this.strips);
    this.transition({ phase: 'spinning', round });
    return round;
  }

  /**
   * Called by the view when reels have stopped (naturally or via Skip).
   * Ignored unless that exact round is still spinning.
   */
  finish(roundId: number, finishedBy: FinishedBy): boolean {
    const state = this.current;
    if (state.phase !== 'spinning' || state.round.id !== roundId) return false;
    this.transition({ phase: 'result', round: state.round, finishedBy });
    return true;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private transition(next: GameState): void {
    if (!TRANSITIONS[this.current.phase].includes(next.phase)) {
      throw new Error(`Illegal transition ${this.current.phase} → ${next.phase}`);
    }
    this.current = next;
    this.listeners.forEach((listener) => listener(next));
  }
}
