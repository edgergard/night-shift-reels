export const SYMBOL_IDS = ['moon', 'comet', 'planet', 'star', 'rocket'] as const;

export type SymbolId = (typeof SYMBOL_IDS)[number];

/** Human-readable names, used in the status text and in tests. */
export const SYMBOL_NAMES: Readonly<Record<SymbolId, string>> = {
  moon: 'Crescent Moon',
  comet: 'Comet',
  planet: 'Ringed Planet',
  star: 'North Star',
  rocket: 'Rocket',
};
