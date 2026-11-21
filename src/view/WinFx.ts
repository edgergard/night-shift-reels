import { Container, Sprite, type Texture } from 'pixi.js';
import { gsap } from './gsapSetup';
import { PIXI_COLORS, SPARK_TINTS } from './theme';

const SPARKS_PER_ICON = 24;
const ICONS = 3;

export interface BoardGeometry {
  readonly cell: number;
  readonly pad: number;
  readonly boardW: number;
  readonly midY: number;
}

/**
 * Win celebration layer: pooled sprites (no allocation per win), every tween
 * added to the caller's timeline so one timeline.kill() + stop() cleans up.
 * Lives above the reels and is NOT masked, so sparks can fly out of the board.
 */
export class WinFx {
  readonly container = new Container();
  private readonly sparks: Sprite[];
  private readonly winGlows: Sprite[];
  private readonly sweep: Sprite;

  constructor(glowTexture: Texture, sparkTexture: Texture) {
    const make = (texture: Texture): Sprite => {
      const s = new Sprite(texture);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.alpha = 0;
      return s;
    };
    this.winGlows = Array.from({ length: ICONS }, () => make(glowTexture));
    this.sweep = make(glowTexture);
    this.sweep.tint = PIXI_COLORS.goldPale;
    this.sparks = Array.from({ length: ICONS * SPARKS_PER_ICON }, () => {
      const s = make(sparkTexture);
      s.visible = false;
      return s;
    });
    this.container.addChild(...this.winGlows, this.sweep, ...this.sparks);
  }

  /** Adds the win effects to `tl`. `centres` are the middle-row cell centres in board space. */
  addTo(tl: gsap.core.Timeline, centres: readonly { x: number; y: number }[], g: BoardGeometry, symbolTint: number): void {
    const k = g.cell / 120; // physics scale so phones and desktops look alike
    const R = gsap.utils.random;
    const tints = [...SPARK_TINTS, symbolTint];

    centres.forEach((c, j) => {
      const glow = this.winGlows[j];
      if (!glow) return;
      const at = 0.1 + j * 0.08;
      const s0 = (g.cell * 1.7) / glow.texture.width;
      glow.position.set(c.x, c.y);
      glow.tint = PIXI_COLORS.gold;
      tl.fromTo(glow, { alpha: 0 }, { alpha: 0.55, duration: 0.5, ease: 'power2.out' }, at).fromTo(
        glow.scale,
        { x: s0 * 0.6, y: s0 * 0.6 },
        { x: s0, y: s0, duration: 0.5, ease: 'power2.out' },
        at,
      );

      const t0 = 0.2 + j * 0.08;
      for (let n = 0; n < SPARKS_PER_ICON; n++) {
        const p = this.sparks[j * SPARKS_PER_ICON + n];
        if (!p) continue;
        const size = R(0.35, 0.75);
        tl.set(p, { x: c.x, y: c.y, alpha: 1, rotation: 0, visible: true, tint: tints[n % tints.length] }, t0)
          .fromTo(p.scale, { x: 0.2, y: 0.2 }, { x: size, y: size, duration: 0.25, ease: 'back.out(2)' }, t0)
          .to(
            p,
            {
              physics2D: { velocity: R(180, 420) * k, angle: R(-165, -15), gravity: 520 * k },
              rotation: R(-3, 3),
              duration: R(0.9, 1.4),
              ease: 'none',
            },
            t0,
          )
          .to(p, { alpha: 0, duration: 0.4, ease: 'power1.in' }, t0 + R(0.5, 0.9));
      }
    });

    // A light sweep travelling along the payline, twice.
    this.sweep.y = g.midY;
    this.sweep.width = g.cell * 0.9;
    this.sweep.height = g.cell * 0.95;
    tl.fromTo(this.sweep, { x: g.pad }, { x: g.boardW - g.pad, duration: 0.6, ease: 'power2.inOut', repeat: 1, repeatDelay: 0.25 }, 0.45)
      .fromTo(this.sweep, { alpha: 0 }, { alpha: 0.7, duration: 0.15, yoyo: true, repeat: 1, repeatDelay: 0.3, immediateRender: false }, 0.45)
      .fromTo(this.sweep, { alpha: 0 }, { alpha: 0.7, duration: 0.15, yoyo: true, repeat: 1, repeatDelay: 0.3, immediateRender: false }, 1.3);
  }

  /** Hide everything immediately (next spin, resize, reduced motion). */
  stop(): void {
    for (const s of [...this.sparks, ...this.winGlows, this.sweep]) {
      gsap.killTweensOf(s);
      gsap.killTweensOf(s.scale);
      s.alpha = 0;
    }
    for (const s of this.sparks) s.visible = false;
  }
}
