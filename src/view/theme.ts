import type { SymbolId } from '../game/symbols';

/** Pixi-side colour tokens for the "Neon Night City" look (CSS tokens live in style.css :root). */
export const PIXI_COLORS = {
  plate: 0x0b0a11, // sign backplate
  cell: 0x100e19, // reel window; also the occluder fill inside tube symbols
  magenta: 0xff2e88,
  magentaHot: 0xff7ab6,
  cyan: 0x19e3ff,
  cyanHot: 0xa8f6ff,
  amber: 0xffc43d,
  white: 0xffffff,
  shadow: 0x000000,
} as const;

/** Tube colour of each symbol (also tints its soft halo). */
export const SYMBOL_TINT: Readonly<Record<SymbolId, number>> = {
  moon: 0x6fe7ff, // icier than the cyan payline so the two never merge
  comet: 0xff7ab6,
  planet: 0xb77bff,
  star: 0xffc43d,
  rocket: 0x39ffb6,
};

export const SPARK_TINTS = [0xff7ab6, 0xa8f6ff, 0xffffff] as const;

/** Resting alpha values for ambient elements. */
export const IDLE = {
  paylineIdle: 0.75,
  paylineIdleMax: 0.95,
  glowMin: 0.7,
  glowMax: 1,
  slotGlow: 0.16,
} as const;
