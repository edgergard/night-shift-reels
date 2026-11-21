import { Application, BlurFilter, Container, FillGradient, Graphics, Rectangle } from 'pixi.js';
import type { FinishedBy } from '../game/controller';
import { REEL_STRIPS, mod } from '../game/reels';
import type { Round } from '../game/round';
import { spinTarget } from '../game/spinMath';
import { gsap } from './gsapSetup';
import { ReelView } from './ReelView';
import { createSymbolContexts } from './symbolArt';
import { createGlowTexture, createSparkTexture } from './textures';
import { SYMBOL_TINT, IDLE, PIXI_COLORS } from './theme';
import { WinFx, type BoardGeometry } from './WinFx';

/** Symbols per second while cruising. */
const CRUISE_SPEED = 22;
/** Minimum travel of reel 0, and extra travel each later reel adds, in symbols. */
const MIN_TRAVEL = 14;
const STAGGER_TRAVEL = 8;
/** Extra travel / slower cruise / longer brake for the "tease" on the last reel. */
const TEASE_TRAVEL = 6;
const TEASE_CRUISE = 0.85;
const BRAKE = 0.62;
const TEASE_BRAKE = 0.85;

// Gradients are created once and mapped onto each shape's own bounds.
const grad = (stops: [number, string][], x1: number, y1: number): FillGradient =>
  new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: x1, y: y1 },
    colorStops: stops.map(([offset, color]) => ({ offset, color })),
    textureSpace: 'local',
  });
const FADE_TOP = grad([[0, 'rgba(16,14,25,1)'], [1, 'rgba(16,14,25,0)']], 0, 1);
const FADE_BOTTOM = grad([[0, 'rgba(16,14,25,0)'], [1, 'rgba(16,14,25,1)']], 0, 1);

/**
 * Neon tube = the same shape stroked several times: two wide faint passes (glow),
 * the coloured tube, then a thin white core. Sizes scale with the cell so the
 * sign looks the same on a phone and a desktop. No filters involved.
 */
function tubePasses(cell: number, color: number): { width: number; color: number; alpha: number }[] {
  return [
    { width: cell * 0.16, color, alpha: 0.06 },
    { width: cell * 0.075, color, alpha: 0.18 },
    { width: Math.max(2.5, cell * 0.028), color, alpha: 1 },
    { width: Math.max(1, cell * 0.009), color: PIXI_COLORS.white, alpha: 0.8 },
  ];
}

function neonRoundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number, cell: number, color: number): void {
  for (const pass of tubePasses(cell, color)) g.roundRect(x, y, w, h, r).stroke(pass);
}

/**
 * Neon flicker as GSAP array keyframes: [alpha, duration] pairs, each snapping to
 * its value (ease steps(1) on EVERY keyframe). A single top-level ease would apply
 * to the whole keyframe timeline instead and skip the dips entirely.
 */
function flicker(steps: readonly (readonly [number, number])[]): gsap.TweenVars[] {
  return steps.map(([alpha, duration]) => ({ alpha, duration, ease: 'steps(1)' }));
}

function neonLine(g: Graphics, x1: number, x2: number, y: number, cell: number, color: number): void {
  for (const pass of tubePasses(cell, color)) g.moveTo(x1, y).lineTo(x2, y).stroke({ ...pass, cap: 'round' });
}

/**
 * Pixi + GSAP presentation. It never decides anything: it is handed a Round
 * whose stops are already fixed and animates the reels onto them.
 *
 * Rule of thumb for every effect below: GSAP tweens exactly one logical value
 * per reel (`stripPosition`). Everything else — landing flash, board nudge,
 * squash, glows, sparks — is a separate display object animated on the side,
 * so skipping or killing effects can never change which symbols are shown.
 */
export class SlotScene {
  /** Only .y is tweened (landing nudge); board position is set in layout(). */
  private readonly shake = new Container();
  private readonly board = new Container();
  private readonly shadow = new Graphics();
  private readonly boardGlow = new Container();
  private readonly glowRing = new Graphics();
  private readonly panel = new Graphics();
  private readonly shade = new Graphics();
  private readonly flashes = [new Graphics(), new Graphics(), new Graphics()] as const;
  private readonly anticipation = new Graphics();
  private readonly paylineIdle = new Graphics();
  private readonly paylineWin = new Graphics();
  private readonly reels: ReelView[];
  private readonly winFx: WinFx;

  private geom: BoardGeometry = { cell: 100, pad: 14, boardW: 340, midY: 164 };
  private motionOn = true;
  /** Something changed outside a running animation; draw on the next frame. */
  private dirty = true;
  private ambient: gsap.core.Tween[] = [];
  private spinTimeline: gsap.core.Timeline | null = null;
  private winTimeline: gsap.core.Timeline | null = null;
  private winLoop: gsap.core.Timeline | null = null;
  private antTween: gsap.core.Tween | null = null;
  private activeSpin: { round: Round; done: (by: FinishedBy) => void } | null = null;
  private lastRound: Round | null = null;

  private constructor(private readonly app: Application) {
    const glowTexture = createGlowTexture();
    const sparkTexture = createSparkTexture(app.renderer);
    const contexts = createSymbolContexts(); // created ONCE and shared by all 15 slots
    this.reels = REEL_STRIPS.map((strip) => new ReelView(strip, contexts, glowTexture));
    this.winFx = new WinFx(glowTexture, sparkTexture);

    // One blurred shadow, baked into a texture and re-baked only on resize.
    this.shadow.filters = [new BlurFilter({ strength: 24, quality: 3 })];
    this.shadow.cacheAsTexture(true);
    this.glowRing.blendMode = 'add';
    this.boardGlow.addChild(this.glowRing);
    this.flashes.forEach((f) => {
      f.blendMode = 'add';
      f.alpha = 0;
    });
    this.anticipation.alpha = 0;
    this.paylineWin.alpha = 0;
    this.paylineIdle.alpha = IDLE.paylineIdle;

    this.board.addChild(
      this.shadow,
      this.boardGlow,
      this.panel,
      ...this.reels,
      this.shade,
      ...this.flashes,
      this.anticipation,
      this.paylineIdle,
      this.paylineWin,
      this.winFx.container,
    );
    this.shake.addChild(this.board);
    app.stage.addChild(this.shake);

    // ONE clock: GSAP's ticker updates every tween first, then we draw the
    // frame from the fresh stripPosition values. Pixi's own ticker is off
    // (autoStart: false), so the reels are never drawn from last frame's numbers.
    gsap.ticker.add((_time, deltaMs) => {
      // With motion on, ambient tweens change something every frame. With reduced
      // motion the board is static, so only draw while a spin runs or after a change.
      if (!this.motionOn && !this.spinTimeline && !this.dirty) return;
      this.dirty = false;
      this.reels.forEach((reel) => reel.render(deltaMs));
      app.render();
    });
    app.renderer.on('resize', () => this.layout());
    this.layout();
  }

  static async create(host: HTMLElement): Promise<SlotScene> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoStart: false, // frames are driven by gsap.ticker (see constructor)
    });
    app.canvas.setAttribute('aria-hidden', 'true'); // the role="status" text is the accessible view
    // The accessible UI is plain HTML (buttons + role="status"). On touch devices Pixi's
    // AccessibilitySystem adds an invisible, focusable "enable accessibility" button —
    // an empty Tab stop. Nothing in this canvas is accessible-enabled, so shut it down.
    (app.renderer as unknown as { accessibility?: { destroy(): void } }).accessibility?.destroy();
    host.appendChild(app.canvas);
    return new SlotScene(app);
  }

  private requestRender(): void {
    this.dirty = true;
  }

  /**
   * Neon sign switching on at page load: starts lit (so a throttled or hidden tab
   * never shows an empty board), then two short dips. Skipped with reduced motion.
   */
  powerOn(): void {
    if (!this.motionOn) return;
    gsap.to(this.board, {
      keyframes: flicker([
        [1, 0.25],
        [0.35, 0.06],
        [1, 0.12],
        [0.6, 0.06],
        [1, 0.1],
      ]),
    });
  }

  /** Ambient idle motion on/off (prefers-reduced-motion). */
  setMotion(on: boolean): void {
    this.requestRender();
    this.motionOn = on;
    this.reels.forEach((reel) => (reel.motionFx = on));
    this.ambient.forEach((t) => t.kill());
    this.ambient = [];
    if (on) {
      this.ambient = [
        gsap.fromTo(this.boardGlow, { alpha: IDLE.glowMin }, { alpha: IDLE.glowMax, duration: 2.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }),
        gsap.fromTo(
          this.paylineIdle,
          { alpha: IDLE.paylineIdle },
          { alpha: IDLE.paylineIdleMax, duration: 2.6, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.3 },
        ),
      ];
    } else {
      this.boardGlow.alpha = IDLE.glowMax;
      this.paylineIdle.alpha = IDLE.paylineIdleMax;
      gsap.killTweensOf(this.board); // stop a power-on flicker in progress
      this.board.alpha = 1;
      // Respect the preference immediately, even mid-round:
      if (this.activeSpin) this.skip(); // same stops, effects reset
      this.winLoop?.kill();
      this.winLoop = null;
      if (this.winTimeline) {
        // Jump the burst to its end (onComplete sees motionOn=false and starts no loop),
        // then leave the static reduced-motion win state.
        this.winTimeline.progress(1);
        this.winFx.stop();
        this.paylineWin.alpha = 1;
        const scales = this.allIconScales();
        gsap.killTweensOf(scales);
        scales.forEach((s) => s.set(1));
      }
    }
  }

  /** Fits the board into the host. Runs on every resize, including mid-spin. Never per frame. */
  private layout(): void {
    const { width, height } = this.app.screen;
    const cell = Math.max(40, Math.floor(Math.min(width / 3.75, height / 3.65)));
    const gap = Math.round(cell * 0.08);
    const pad = Math.round(cell * 0.14);
    const radius = Math.round(cell * 0.2);
    const boardW = cell * 3 + gap * 2 + pad * 2;
    const boardH = cell * 3 + pad * 2;
    const midY = pad + cell * 1.5;
    const winR = radius * 0.55;
    this.geom = { cell, pad, boardW, midY };

    this.board.position.set(Math.round((width - boardW) / 2), Math.round((height - boardH) / 2));

    this.shadow
      .clear()
      .roundRect(cell * 0.04, cell * 0.18, boardW - cell * 0.08, boardH, radius)
      .fill({ color: PIXI_COLORS.shadow, alpha: 0.55 });
    // Pad the cached area by ~3× the blur strength, or the soft edge gets clipped hard.
    const blurPad = 72;
    this.shadow.boundsArea = new Rectangle(
      cell * 0.04 - blurPad,
      cell * 0.18 - blurPad,
      boardW - cell * 0.08 + blurPad * 2,
      boardH + blurPad * 2,
    );
    this.shadow.updateCacheTexture();

    // Soft magenta halo around the sign (additive), breathing in the ambient loop.
    this.glowRing
      .clear()
      .roundRect(-cell * 0.06, -cell * 0.06, boardW + cell * 0.12, boardH + cell * 0.12, radius + cell * 0.06)
      .stroke({ width: cell * 0.3, color: PIXI_COLORS.magenta, alpha: 0.07 })
      .roundRect(-cell * 0.02, -cell * 0.02, boardW + cell * 0.04, boardH + cell * 0.04, radius + cell * 0.02)
      .stroke({ width: cell * 0.12, color: PIXI_COLORS.magenta, alpha: 0.12 });

    // The sign: dark backplate, outer magenta tube, mounting screws.
    const p = this.panel.clear();
    p.roundRect(0, 0, boardW, boardH, radius).fill(PIXI_COLORS.plate);
    neonRoundRect(p, 0, 0, boardW, boardH, radius, cell, PIXI_COLORS.magentaHot);
    const screw = Math.max(2, cell * 0.025);
    for (const [sx, sy] of [[pad * 0.5, pad * 0.5], [boardW - pad * 0.5, pad * 0.5], [pad * 0.5, boardH - pad * 0.5], [boardW - pad * 0.5, boardH - pad * 0.5]] as const) {
      p.circle(sx, sy, screw).fill(0x2a2633);
    }

    const s = this.shade.clear();
    this.reels.forEach((reel, i) => {
      const x = pad + i * (cell + gap);
      p.roundRect(x, pad, cell, cell * 3, winR).fill(PIXI_COLORS.cell).stroke({ width: 1, color: PIXI_COLORS.white, alpha: 0.05 });
      // Depth fades: symbols recede into a cylinder instead of a hard cut.
      s.rect(x, pad, cell, cell * 0.55).fill(FADE_TOP);
      s.rect(x, pad + cell * 2.45, cell, cell * 0.55).fill(FADE_BOTTOM);
      this.flashes[i]?.clear().roundRect(x, pad, cell, cell * 3, winR).fill(PIXI_COLORS.cyanHot);
      reel.position.set(x + cell / 2, midY);
      reel.layout(cell);
    });

    const x2 = pad + 2 * (cell + gap);
    const a = this.anticipation.clear();
    neonRoundRect(a, x2 - 3, pad - 3, cell + 6, cell * 3 + 6, winR + 3, cell, PIXI_COLORS.amber);

    // Payline: two cyan tube rails framing the middle row, plus end chevrons.
    const railX1 = pad * 0.6;
    const railX2 = boardW - pad * 0.6;
    const top = midY - cell / 2;
    const bottom = midY + cell / 2;
    const m = cell * 0.09;
    const chevrons = (g: Graphics, color: number): void => {
      g.poly([0, midY - m, m * 1.1, midY, 0, midY + m]).fill(color);
      g.poly([boardW, midY - m, boardW - m * 1.1, midY, boardW, midY + m]).fill(color);
    };
    const idle = this.paylineIdle.clear();
    neonLine(idle, railX1, railX2, top, cell * 0.7, PIXI_COLORS.cyan);
    neonLine(idle, railX1, railX2, bottom, cell * 0.7, PIXI_COLORS.cyan);
    chevrons(idle, PIXI_COLORS.cyan);
    // Win state: a faint lit band + hotter, thicker rails.
    const win = this.paylineWin.clear();
    win.rect(railX1, top, railX2 - railX1, cell).fill({ color: PIXI_COLORS.cyan, alpha: 0.07 });
    neonLine(win, railX1, railX2, top, cell * 1.2, PIXI_COLORS.cyanHot);
    neonLine(win, railX1, railX2, bottom, cell * 1.2, PIXI_COLORS.cyanHot);
    chevrons(win, PIXI_COLORS.cyanHot);

    // Sparks/sweep hold old pixel positions; payline + icon win state survive (alpha/scale only).
    if (this.winTimeline || this.winLoop) this.winFx.stop();
    this.requestRender();
  }

  /**
   * Animates the reels onto round.stops. `done` is called exactly once per
   * spin — by the timeline's onComplete or by skip(), whichever comes first.
   */
  spin(round: Round, done: (by: FinishedBy) => void): void {
    const reducedMotion = !this.motionOn; // single source of truth: setMotion()
    this.clearWin();
    this.resetSpinFx();
    this.spinTimeline?.kill();
    this.activeSpin = { round, done };
    this.lastRound = round;

    const timeline = gsap.timeline({ onComplete: () => this.finishSpin('reels') });
    // Tease: if the first two middle symbols already match, the last reel spins longer.
    const tease = !reducedMotion && round.middleRow[0] === round.middleRow[1];
    if (!reducedMotion) {
      // Charge pulse: dip and come back, so the idle glow is the same before and after a spin.
      gsap.fromTo(this.glowRing, { alpha: 1 }, { alpha: 0.6, duration: 0.25, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: true });
    }
    let previousTravel = 0;

    this.reels.forEach((reel, i) => {
      const n = reel.strip.length;
      const stop = round.stops[i] ?? 0;
      const from = mod(Math.round(reel.stripPosition), n);
      reel.snapTo(from);

      if (reducedMotion) {
        // No acceleration, no loops, no bounce: a short glide straight to the stop.
        const target = spinTarget(from, stop, n, 0);
        timeline.to(reel, { stripPosition: target, duration: 0.18, ease: 'power1.out' }, i * 0.06);
        return;
      }

      const isTease = tease && i === 2;
      // Travel grows reel by reel, so reels stop left → right with a clear gap.
      let target = spinTarget(from, stop, n, 0);
      const minTravel = Math.max(MIN_TRAVEL + i * STAGGER_TRAVEL, previousTravel + STAGGER_TRAVEL) + (isTease ? TEASE_TRAVEL : 0);
      while (from - target < minTravel) target -= n; // whole revolutions only: still lands on `stop`
      previousTravel = from - target;

      const brake = isTease ? TEASE_BRAKE : BRAKE;
      const cruise = CRUISE_SPEED * (isTease ? TEASE_CRUISE : 1);
      const accelEnd = from - 2;
      const brakeStart = target + 3;
      const reelTl = gsap
        .timeline()
        .to(reel, { stripPosition: from + 0.25, duration: 0.12, ease: 'power1.out' }) // wind-up
        .to(reel, { stripPosition: accelEnd, duration: 0.28, ease: 'power2.in' }) // accelerate
        .to(reel, { stripPosition: brakeStart, duration: (accelEnd - brakeStart) / cruise, ease: 'none' }) // cruise
        .to(reel, { stripPosition: target, duration: brake, ease: 'reelSettle' }) // brake, detent, settle
        // Landing feedback fires near the detent peak; a negative offset never lengthens the timeline.
        .call(() => this.onReelLand(i, tease), undefined, `-=${(brake * 0.45).toFixed(3)}`);
      timeline.add(reelTl, i * 0.08);
    });

    this.spinTimeline = timeline;
  }

  /** Feedback only: touches flashes, shake.y and icon scale — NEVER stripPosition. */
  private onReelLand(i: number, tease: boolean): void {
    const flash = this.flashes[i];
    const reel = this.reels[i];
    if (flash) gsap.fromTo(flash, { alpha: 0.22 }, { alpha: 0, duration: 0.35, ease: 'power2.out' });
    gsap.fromTo(this.shake, { y: this.geom.cell * 0.015 }, { y: 0, duration: 0.4, ease: 'elastic.out(1,0.45)', overwrite: true });
    if (reel) {
      const scales = reel.icons.map((icon) => icon.scale);
      gsap.fromTo(scales, { x: 1.08, y: 0.92 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    }
    if (tease && i === 1) {
      this.antTween = gsap.fromTo(this.anticipation, { alpha: 0 }, { alpha: 1, duration: 0.35, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
    if (i === 2) this.stopAnticipation();
  }

  private resetSpinFx(): void {
    this.stopAnticipation();
    const scales = this.allIconScales();
    gsap.killTweensOf([this.shake, ...this.flashes, ...scales]);
    this.shake.y = 0;
    this.flashes.forEach((f) => (f.alpha = 0));
    scales.forEach((s) => s.set(1));
  }

  private allIconScales() {
    return this.reels.flatMap((r) => r.icons.map((icon) => icon.scale));
  }

  private stopAnticipation(): void {
    this.antTween?.kill();
    this.antTween = null;
    this.anticipation.alpha = 0;
  }

  /** Jumps every reel to the SAME stops the timeline was heading to. */
  skip(): void {
    if (!this.activeSpin) return;
    this.spinTimeline?.kill();
    this.finishSpin('skip');
  }

  private finishSpin(by: FinishedBy): void {
    const active = this.activeSpin;
    if (!active) return; // guard: done() exactly once
    this.activeSpin = null;
    this.spinTimeline = null;
    // Skip cuts every in-flight effect; a natural finish lets the last reel's
    // landing flash/nudge/squash play out (they are already at their end values soon).
    if (by === 'skip') this.resetSpinFx();
    else this.stopAnticipation();
    this.reels.forEach((reel, i) => reel.snapTo(active.round.stops[i] ?? 0));
    this.requestRender();
    active.done(by);
  }

  showWin(): void {
    this.clearWin();
    const icons = this.reels.map((r) => r.middleIcon);
    const scales = icons.map((icon) => icon.scale);
    const glows = this.reels.map((r) => r.middleGlow);
    const tl = gsap.timeline();
    this.winTimeline = tl;

    if (!this.motionOn) {
      tl.set(this.paylineWin, { alpha: 1 }).set(glows, { alpha: 0.8 });
      this.requestRender();
      return;
    }

    // Payline rails surge on (two slow pulses: well under 3 flashes per second).
    tl.fromTo(this.paylineWin, { alpha: 0.2 }, { alpha: 1, duration: 0.25, repeat: 3, yoyo: true, ease: 'sine.inOut' }, 0)
      .set(this.paylineWin, { alpha: 1 })
      .to(scales, { x: 1.22, y: 1.22, duration: 0.35, ease: 'back.out(2.2)', stagger: 0.08 }, 0)
      .to(scales, { x: 1.1, y: 1.1, duration: 0.3, ease: 'power2.out' }, 0.6)
      .to(glows, { alpha: 0.9, duration: 0.3, stagger: 0.08 }, 0)
      // The sign "buzzes": its magenta halo stutters twice, like a tube on a tired transformer.
      .to(
        this.glowRing,
        {
          keyframes: flicker([
            [0.35, 0.05],
            [1, 0.07],
            [0.55, 0.05],
            [1, 0.1],
          ]),
        },
        1.05, // after the payline pulses, so flashes stay spread out (WCAG 2.3.1: max 3 per second)
      );

    const centres = this.reels.map((r) => ({ x: r.x, y: r.y })); // reel origin = middle-cell centre, board space
    const symbol = this.lastRound?.outcome.kind === 'win' ? this.lastRound.outcome.symbol : 'star';
    this.winFx.addTo(tl, centres, this.geom, SYMBOL_TINT[symbol]);

    // After the burst, a calm breathing loop until the next spin.
    tl.eventCallback('onComplete', () => {
      if (!this.motionOn) return;
      this.winLoop = gsap
        .timeline({ repeat: -1, yoyo: true })
        .to(this.paylineWin, { alpha: 0.75, duration: 1.4, ease: 'sine.inOut' }, 0)
        .to(scales, { x: 1.14, y: 1.14, duration: 1.2, ease: 'sine.inOut' }, 0);
    });
  }

  clearWin(): void {
    this.requestRender();
    this.winTimeline?.kill();
    this.winTimeline = null;
    this.winLoop?.kill();
    this.winLoop = null;
    this.winFx.stop();
    this.paylineWin.alpha = 0;
    gsap.killTweensOf(this.glowRing);
    this.glowRing.alpha = 1;
    const scales = this.allIconScales();
    gsap.killTweensOf(scales);
    scales.forEach((s) => s.set(1));
    this.reels.forEach((r) => {
      r.middleIcon.rotation = 0;
      r.resetGlows();
    });
  }
}
