import type { SymbolId } from '../game/symbols';

/** Pixi-side colour tokens (the CSS tokens live in style.css :root). */
export const PIXI_COLORS = {
  window: 0x04061a,
  glow: 0x8f8bff,
  neonCyan: 0x6ef3ff,
  gold: 0xffd36e,
  gold2: 0xffb84d,
  goldPale: 0xfff1b8,
  white: 0xffffff,
  shadow: 0x000000,
} as const;

/** Inner-light colour behind each symbol. */
export const GLOW_TINT: Readonly<Record<SymbolId, number>> = {
  moon: 0xffc14d,
  comet: 0x5ad8ff,
  planet: 0x9b7bff,
  star: 0xffe27a,
  rocket: 0xff6f91,
};

export const SPARK_TINTS = [0xffd36e, 0xffffff, 0xfff1b8] as const;

/** Resting alpha values for ambient elements. */
export const IDLE = {
  paylineIdle: 0.18,
  paylineIdleMax: 0.3,
  glowMin: 0.55,
  glowMax: 0.9,
  slotGlow: 0.32,
} as const;
