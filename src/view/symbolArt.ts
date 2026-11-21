import { FillGradient, GraphicsContext } from 'pixi.js';
import type { SymbolId } from '../game/symbols';

/**
 * Original vector symbols, drawn once into a GraphicsContext each.
 * Every reel slot creates `new Graphics(context)` — the geometry is shared,
 * only the transform differs. All art fits a 100×100 box centred on (0, 0).
 * Gradients use textureSpace 'local', so 0..1 maps onto each shape's bounds.
 */

type Stops = readonly (readonly [number, string])[];

const toStops = (stops: Stops) => stops.map(([offset, color]) => ({ offset, color }));

const lin = (stops: Stops, x0 = 0, y0 = 0, x1 = 0, y1 = 1): FillGradient =>
  new FillGradient({
    type: 'linear',
    start: { x: x0, y: y0 },
    end: { x: x1, y: y1 },
    colorStops: toStops(stops),
    textureSpace: 'local',
  });

const rad = (stops: Stops, cx = 0.5, cy = 0.5): FillGradient =>
  new FillGradient({
    type: 'radial',
    center: { x: cx, y: cy },
    innerRadius: 0,
    outerCenter: { x: cx, y: cy },
    outerRadius: 0.5,
    colorStops: toStops(stops),
    textureSpace: 'local',
  });

/** Half-ellipse (lower arc) from (-a, cy) to (a, cy) via (0, cy + b), as two cubic quarters. */
function lowerArc(ctx: GraphicsContext, a: number, b: number, cy: number): GraphicsContext {
  const k = 0.5523; // cubic Bézier approximation of a quarter ellipse
  return ctx
    .moveTo(-a, cy)
    .bezierCurveTo(-a, cy + b * k, -a * k, cy + b, 0, cy + b)
    .bezierCurveTo(a * k, cy + b, a, cy + b * k, a, cy);
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => ((a % TAU) + TAU) % TAU;
/** Does the arc from `start` to `end` (in the given direction) pass through `angle`? */
const sweeps = (start: number, end: number, angle: number, ccw: boolean): boolean =>
  ccw ? wrap(start - angle) < wrap(start - end) : wrap(angle - start) < wrap(end - start);

/**
 * Crescent = outer circle minus an overlapping inner circle, drawn as ONE closed
 * path of two arcs between the circles' intersection points. (An explicit path
 * avoids hole-cutting artefacts at the rim when a gradient fill is used.)
 */
function crescent(ctx: GraphicsContext, x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): GraphicsContext {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(r1 * r1 - a * a);
  const mx = x1 + (a * dx) / d;
  const my = y1 + (a * dy) / d;
  const pA = { x: mx + (h * dy) / d, y: my - (h * dx) / d };
  const pB = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
  // Outer arc: the side of circle 1 facing AWAY from circle 2.
  const a1 = Math.atan2(pA.y - y1, pA.x - x1);
  const b1 = Math.atan2(pB.y - y1, pB.x - x1);
  const ccw1 = sweeps(a1, b1, Math.atan2(dy, dx), false);
  // Inner arc: the side of circle 2 lying INSIDE circle 1, back to the start.
  const b2 = Math.atan2(pB.y - y2, pB.x - x2);
  const a2 = Math.atan2(pA.y - y2, pA.x - x2);
  const ccw2 = !sweeps(b2, a2, Math.atan2(-dy, -dx), false);
  return ctx.moveTo(pA.x, pA.y).arc(x1, y1, r1, a1, b1, ccw1).arc(x2, y2, r2, b2, a2, ccw2).closePath();
}

function moon(): GraphicsContext {
  return crescent(new GraphicsContext(), -4, 2, 36, 14, -10, 31)
    .fill(rad([[0, '#fff6cf'], [0.55, '#ffd36e'], [1, '#f08a24']], 0.3, 0.35))
    .circle(-24, 12, 4)
    .fill({ color: 0xd98f2a, alpha: 0.55 })
    .circle(-26, -8, 3)
    .fill({ color: 0xd98f2a, alpha: 0.55 })
    .circle(-10, 28, 2.5)
    .fill({ color: 0xd98f2a, alpha: 0.55 })
    .circle(-31, 4, 2.5)
    .fill({ color: 0xffffff, alpha: 0.5 });
}

function comet(): GraphicsContext {
  return new GraphicsContext()
    .poly([8, -36, 34, -10, -42, 42])
    .fill(lin([[0, 'rgba(90,216,255,0)'], [1, 'rgba(90,216,255,0.7)']], 0, 1, 1, 0))
    .poly([12, -28, 26, -14, -30, 30])
    .fill(lin([[0, 'rgba(191,246,255,0)'], [1, 'rgba(191,246,255,1)']], 0, 1, 1, 0))
    .circle(22, -22, 16)
    .fill(rad([[0, '#ffffff'], [0.45, '#bff6ff'], [1, '#2aa8ff']], 0.4, 0.4))
    .circle(18, -26, 4)
    .fill(0xffffff);
}

function planet(): GraphicsContext {
  const ring = lin([[0, '#ffd08a'], [0.5, '#ff8f6b'], [1, '#ffd08a']], 0, 0, 1, 0);
  const ctx = new GraphicsContext()
    .ellipse(0, 4, 46, 13)
    .stroke({ width: 6, fill: ring }) // back of the ring
    .circle(0, 0, 26)
    .fill(rad([[0, '#efe6ff'], [0.4, '#a98bff'], [1, '#4b2fb8']], 0.35, 0.3))
    .rect(-22, 4, 44, 4)
    .fill({ color: 0x6a4bd6, alpha: 0.55 })
    .rect(-18, -10, 36, 3)
    .fill({ color: 0x6a4bd6, alpha: 0.55 });
  // Front half of the ring, drawn over the planet body.
  return lowerArc(ctx, 46, 13, 4).stroke({ width: 6, fill: ring });
}

function star(): GraphicsContext {
  return new GraphicsContext()
    .circle(0, 0, 32)
    .fill({ color: 0xfff3b0, alpha: 0.12 })
    .star(0, 0, 4, 47, 10)
    .fill(rad([[0, '#ffffff'], [0.35, '#fff3b0'], [1, '#ffb83d']]))
    .star(0, 0, 4, 22, 5, Math.PI / 4)
    .fill(0xffffff)
    .circle(0, 0, 6)
    .fill(0xffffff);
}

function rocket(): GraphicsContext {
  const fin = lin([[0, '#ff9cc0'], [1, '#e0457a']]);
  return new GraphicsContext()
    .poly([-9, 24, 0, 48, 9, 24])
    .fill(lin([[0, '#fff3b0'], [0.5, '#ff9a3d'], [1, 'rgba(255,77,109,0)']])) // flame
    .poly([-14, 2, -30, 26, -14, 20])
    .fill(fin)
    .poly([14, 2, 30, 26, 14, 20])
    .fill(fin)
    .poly([0, -46, 15, -24, 15, 22, -15, 22, -15, -24])
    .fill(lin([[0, '#ffffff'], [0.55, '#dfe6ff'], [1, '#8f9ad6']], 0, 0, 1, 0)) // body
    .poly([0, -46, 10, -31, -10, -31])
    .fill(0xff6f91) // nose cone
    .circle(0, -8, 8)
    .fill(rad([[0, '#bff6ff'], [0.5, '#4fb6ff'], [1, '#1b3a8a']], 0.35, 0.35))
    .stroke({ width: 3, color: 0xffffff });
}

export function createSymbolContexts(): Record<SymbolId, GraphicsContext> {
  return { moon: moon(), comet: comet(), planet: planet(), star: star(), rocket: rocket() };
}
