import { GraphicsContext, GraphicsPath, Matrix } from 'pixi.js';
import type { SymbolId } from '../game/symbols';
import { PIXI_COLORS, SYMBOL_TINT } from './theme';

/**
 * Original neon-tube symbols. Each is the centre-line of a bent glass tube,
 * written as SVG path data in a 100×100 box (the same paths as the HTML mockup),
 * then stroked several times: wide faint passes for the glow, the coloured tube,
 * and a thin white-hot core on top.
 *
 * That "baked" glow costs nothing at runtime: no filters, just geometry drawn
 * once into a GraphicsContext and shared by every reel slot.
 */

/** Centre the 100×100 art on (0, 0), optionally rotated about its centre. */
const place = (rotation = 0): Matrix => new Matrix().translate(-50, -50).rotate(rotation);

const path = (d: string): GraphicsPath => new GraphicsPath(d).transform(place());

/**
 * Elliptical arc sampled into a polyline, in art coordinates, with the rotation
 * applied to every point. (Transforming an SVG "A" command or a circle shape
 * after the fact only moves its end points/centre, not its radii, so rotated
 * ellipses and circles are built point by point instead.)
 */
function ellipseArc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fromDeg: number,
  toDeg: number,
  rotation = 0,
  close = false,
): GraphicsPath {
  const m = place(rotation);
  const steps = Math.max(8, Math.ceil(Math.abs(toDeg - fromDeg) / 6));
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    const p = m.apply({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
    pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  }
  return new GraphicsPath(pts.join(' ') + (close ? ' Z' : ''));
}

const circle = (x: number, y: number, r: number, rotation = 0): GraphicsPath => ellipseArc(x, y, r, r, 0, 360, rotation, true);

/** Glow passes from outside in; the last coloured pass is the tube itself. */
const PASSES = [
  { width: 15, alpha: 0.08 },
  { width: 9.5, alpha: 0.2 },
  { width: 5, alpha: 1 },
] as const;
const CORE = { width: 1.8, alpha: 0.85 } as const;

function tube(ctx: GraphicsContext, paths: readonly GraphicsPath[], color: number): GraphicsContext {
  for (const pass of PASSES) {
    for (const p of paths) ctx.path(p).stroke({ width: pass.width, color, alpha: pass.alpha, cap: 'round', join: 'round' });
  }
  for (const p of paths) ctx.path(p).stroke({ width: CORE.width, color: PIXI_COLORS.white, alpha: CORE.alpha, cap: 'round', join: 'round' });
  return ctx;
}

/** Opaque fill in the window colour, so tubes behind it (planet ring, comet tails) stay hidden. */
const occlude = (ctx: GraphicsContext, p: GraphicsPath): GraphicsContext => ctx.path(p).fill(PIXI_COLORS.cell);

function moon(): GraphicsContext {
  return tube(new GraphicsContext(), [path('M64 16 A36 36 0 1 0 84 62 A28 28 0 0 1 64 16 Z')], SYMBOL_TINT.moon);
}

function comet(): GraphicsContext {
  const ctx = new GraphicsContext();
  // Three near-parallel streaks in a narrow fan, then the head drawn over them.
  tube(ctx, [path('M56.8 43.2 L16 84'), path('M54.5 29 L27 53'), path('M71 45.5 L47 73')], SYMBOL_TINT.comet);
  occlude(ctx, circle(66, 34, 13));
  return tube(ctx, [circle(66, 34, 13)], SYMBOL_TINT.comet);
}

function planet(): GraphicsContext {
  const tilt = (-18 * Math.PI) / 180;
  const ctx = new GraphicsContext();
  // Ring: ellipse centre (50,50), radii 42×13, tilted. Angles in degrees; y grows downward,
  // so 180→360° is the far (upper) half and 0→180° the near (lower) half.
  // Back half, split where it meets the planet's limb (≈245° and ≈295°)...
  tube(ctx, [ellipseArc(50, 50, 42, 13, 180, 245.6, tilt), ellipseArc(50, 50, 42, 13, 294.4, 360, tilt)], SYMBOL_TINT.planet);
  // ...hidden behind the body, then the body and the front half of the ring.
  occlude(ctx, circle(50, 50, 21, tilt));
  return tube(ctx, [circle(50, 50, 21, tilt), ellipseArc(50, 50, 42, 13, 0, 180, tilt)], SYMBOL_TINT.planet);
}

function star(): GraphicsContext {
  return tube(
    new GraphicsContext(),
    [path('M50 8 L58.5 41.5 L92 50 L58.5 58.5 L50 92 L41.5 58.5 L8 50 L41.5 41.5 Z')],
    SYMBOL_TINT.star,
  );
}

function rocket(): GraphicsContext {
  return tube(
    new GraphicsContext(),
    [
      path('M50 8 C63 20 67 40 63 64 L37 64 C33 40 37 20 50 8 Z'), // body
      circle(50, 36, 7), // window
      path('M37 48 L24 68 L37 64'), // fins
      path('M63 48 L76 68 L63 64'),
      path('M44 72 L50 90 L56 72'), // flame
    ],
    SYMBOL_TINT.rocket,
  );
}

export function createSymbolContexts(): Record<SymbolId, GraphicsContext> {
  return { moon: moon(), comet: comet(), planet: planet(), star: star(), rocket: rocket() };
}
