import { describe, expect, it } from 'vitest';
import { RoundController, TRANSITIONS, type GameState } from './controller';
import { seededRng } from './rng';

describe('RoundController', () => {
  it('starts idle and allows only the declared transitions', () => {
    const game = new RoundController();
    expect(game.state.phase).toBe('idle');
    expect(TRANSITIONS).toEqual({ idle: ['spinning'], spinning: ['result'], result: ['spinning'] });
  });

  it('decides the result once, at spin time, from fixed stops', () => {
    const game = new RoundController();
    const round = game.spin({ stops: [0, 1, 2] });
    expect(round?.stops).toEqual([0, 1, 2]);
    expect(game.state).toEqual({ phase: 'spinning', round });
  });

  it('draws stops from the injected rng', () => {
    const a = new RoundController({ rng: seededRng(99) }).spin();
    const b = new RoundController({ rng: seededRng(99) }).spin();
    expect(a?.stops).toEqual(b?.stops);
  });

  it('ignores a second Spin while spinning', () => {
    const game = new RoundController({ rng: seededRng(3) });
    const first = game.spin();
    const seen: GameState[] = [];
    game.subscribe((s) => seen.push(s));

    expect(game.spin()).toBeNull();
    expect(game.spin({ stops: [1, 1, 1] })).toBeNull();
    expect(game.state).toEqual({ phase: 'spinning', round: first });
    expect(seen).toEqual([]);
  });

  it('Skip and natural completion give the same grid and outcome', () => {
    const stops = [4, 7, 11] as const;

    const natural = new RoundController();
    const r1 = natural.spin({ stops });
    natural.finish(r1!.id, 'reels');

    const skipped = new RoundController();
    const r2 = skipped.spin({ stops });
    skipped.finish(r2!.id, 'skip');

    const a = natural.state;
    const b = skipped.state;
    if (a.phase !== 'result' || b.phase !== 'result') throw new Error('expected result phase');
    expect(b.round.columns).toEqual(a.round.columns);
    expect(b.round.middleRow).toEqual(a.round.middleRow);
    expect(b.round.outcome).toEqual(a.round.outcome);
    expect([a.finishedBy, b.finishedBy]).toEqual(['reels', 'skip']);
  });

  it('a Skip followed by the late natural callback finishes only once', () => {
    const game = new RoundController();
    const results: GameState[] = [];
    game.subscribe((s) => s.phase === 'result' && results.push(s));
    const round = game.spin({ stops: [0, 0, 0] })!;

    expect(game.finish(round.id, 'skip')).toBe(true);
    expect(game.finish(round.id, 'reels')).toBe(false);
    expect(results).toHaveLength(1);
  });

  it("a late callback from the previous round does not touch the next round", () => {
    const game = new RoundController({ rng: seededRng(5) });
    const first = game.spin()!;
    game.finish(first.id, 'skip');
    const second = game.spin()!;

    expect(game.finish(first.id, 'reels')).toBe(false);
    expect(game.state).toEqual({ phase: 'spinning', round: second });
    expect(game.finish(second.id, 'reels')).toBe(true);
    expect(game.state.phase).toBe('result');
  });

  it('finish is ignored while idle', () => {
    const game = new RoundController();
    expect(game.finish(1, 'reels')).toBe(false);
    expect(game.state.phase).toBe('idle');
  });

  it('demo spin is labelled and always wins', () => {
    const game = new RoundController({ rng: seededRng(11) });
    for (let i = 0; i < 50; i++) {
      const round = game.spin({ demo: true })!;
      expect(round.demo).toBe(true);
      expect(round.outcome.kind).toBe('win');
      game.finish(round.id, 'reels');
    }
  });
});
