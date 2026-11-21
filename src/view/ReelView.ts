import { Container, Graphics, Sprite, type GraphicsContext, type Texture } from 'pixi.js';
import { mod, symbolAt, type Strip } from '../game/reels';
import { reelFrame } from '../game/spinMath';
import { SYMBOL_IDS, type SymbolId } from '../game/symbols';
import { SYMBOL_TINT, IDLE } from './theme';

/** Rows relative to the middle line. ±2 are buffer rows hidden by the mask. */
const ROWS = [-2, -1, 0, 1, 2] as const;
const MIDDLE_SLOT = ROWS.indexOf(0);
const ART_SIZE = 100; // symbolArt is drawn in a 100×100 box
const ART_SCALE = 0.8; // art occupies 80% of a cell
const GLOW_SIZE = 120; // in art units; a cell is 125 art units, so the glow fades inside the mask
/** Symbols per second that counts as "full speed" for the motion stretch. */
const FULL_SPEED = 22;

interface Slot {
  /** Glow row holder (in glowLayer): moved/stretched every frame. */
  readonly glowHolder: Container;
  /** Soft additive light behind the symbol, tinted per symbol. */
  readonly glow: Sprite;
  /** Symbol row holder (in iconLayer): moved/stretched every frame. */
  readonly holder: Container;
  /** Scaled by landing squash / win pop, independent of layout. */
  readonly icon: Container;
  readonly art: Readonly<Record<SymbolId, Graphics>>;
  shown: SymbolId | null;
}

/**
 * One reel. Its whole logical state is `stripPosition` (see game/spinMath.ts):
 * GSAP tweens that single number, render() turns it into slot positions.
 * The stretch/fade while spinning is derived from how fast that number
 * changes — purely visual, it never writes back to stripPosition.
 *
 * All additive glows live in one layer and all symbols in another, so Pixi
 * draws each reel in two batches instead of switching blend mode per slot.
 * Local origin = centre of the middle cell.
 */
export class ReelView extends Container {
  stripPosition = 0;
  /** Off under prefers-reduced-motion: no stretch or fade. */
  motionFx = true;
  private cell = ART_SIZE;
  private baseScale = ART_SCALE;
  private lastPos = 0;
  /** Smoothed 0..1 speed, drives the stretch. */
  private speed = 0;
  private readonly slots: Slot[];
  private readonly glowLayer = new Container();
  private readonly iconLayer = new Container();
  private readonly maskShape = new Graphics();

  constructor(
    readonly strip: Strip,
    contexts: Readonly<Record<SymbolId, GraphicsContext>>,
    glowTexture: Texture,
  ) {
    super();
    this.slots = ROWS.map(() => {
      const glowHolder = new Container();
      const glow = new Sprite(glowTexture);
      glow.anchor.set(0.5);
      glow.width = glow.height = GLOW_SIZE;
      glow.blendMode = 'add';
      glow.alpha = IDLE.slotGlow;
      glowHolder.addChild(glow);
      this.glowLayer.addChild(glowHolder);

      const holder = new Container();
      const icon = new Container();
      const art = Object.fromEntries(
        SYMBOL_IDS.map((id) => {
          const g = new Graphics(contexts[id]); // shares geometry with every other slot
          icon.addChild(g);
          return [id, g];
        }),
      ) as Record<SymbolId, Graphics>;
      holder.addChild(icon);
      this.iconLayer.addChild(holder);
      return { glowHolder, glow, holder, icon, art, shown: null };
    });
    this.addChild(this.glowLayer, this.iconLayer, this.maskShape);
    this.mask = this.maskShape;
  }

  /** Called on every resize — safe mid-spin because render() reads `cell`. */
  layout(cell: number): void {
    this.cell = cell;
    this.maskShape.clear().rect(-cell / 2, -cell * 1.5, cell, cell * 3).fill(0xffffff);
    this.baseScale = (cell / ART_SIZE) * ART_SCALE;
    this.render();
  }

  /** dtMs is passed only by the frame loop; layout() and snapTo() redraw without touching speed. */
  render(dtMs?: number): void {
    if (dtMs !== undefined) {
      // Every discontinuous jump goes through snapTo(), which syncs lastPos, so any
      // remaining delta is real motion — even across a long (hitchy) frame.
      const distance = Math.abs(this.stripPosition - this.lastPos);
      const target = this.motionFx ? Math.min(((distance / Math.max(dtMs, 1)) * 1000) / FULL_SPEED, 1) : 0;
      this.speed += (target - this.speed) * 0.3;
      if (this.speed < 0.001) this.speed = 0;
    }
    this.lastPos = this.stripPosition;

    const { base, offset } = reelFrame(this.stripPosition, this.strip.length);
    const stretchY = this.baseScale * (1 + this.speed * 0.24);
    const alpha = 1 - this.speed * 0.2;
    this.slots.forEach((slot, i) => {
      const row = ROWS[i] ?? 0;
      const y = (row - offset) * this.cell;
      for (const h of [slot.holder, slot.glowHolder]) {
        h.y = y;
        h.scale.set(this.baseScale, stretchY);
        h.alpha = alpha;
      }
      const id = symbolAt(this.strip, base + row);
      if (id !== slot.shown) {
        for (const s of SYMBOL_IDS) slot.art[s].visible = s === id;
        slot.glow.tint = SYMBOL_TINT[id];
        slot.shown = id;
      }
    });
  }

  /** Put the reel exactly at rest on a stop index (used by Skip and on complete). */
  snapTo(stop: number): void {
    this.stripPosition = mod(stop, this.strip.length);
    this.lastPos = this.stripPosition;
    this.speed = 0;
    this.render();
  }

  private get middleSlot(): Slot {
    const slot = this.slots[MIDDLE_SLOT];
    if (!slot) throw new Error('Missing middle slot');
    return slot;
  }

  /** The icon on the middle line while at rest — target of the win pop. */
  get middleIcon(): Container {
    return this.middleSlot.icon;
  }

  get middleGlow(): Sprite {
    return this.middleSlot.glow;
  }

  /**
   * Every symbol container of this reel. The landing squash scales all of them
   * together: during the brake overshoot the landed symbol is drawn by a
   * neighbouring slot, so squashing one fixed slot would hit the wrong symbol.
   */
  get icons(): Container[] {
    return this.slots.map((slot) => slot.icon);
  }

  /** Win tweens own glow alpha; this puts every glow back to its resting value. */
  resetGlows(): void {
    this.slots.forEach((slot) => (slot.glow.alpha = IDLE.slotGlow));
  }
}
