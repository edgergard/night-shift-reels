import { Graphics, Texture, type Renderer } from 'pixi.js';

/**
 * Soft white radial dot. One 128px texture is reused by every glow sprite;
 * colour comes from `sprite.tint`, which costs nothing per frame.
 */
export function createGlowTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return Texture.from(canvas);
}

/** Small four-point sparkle baked once into a texture for the win particles. */
export function createSparkTexture(renderer: Renderer): Texture {
  const g = new Graphics().star(0, 0, 4, 16, 3).fill(0xffffff).circle(0, 0, 3).fill(0xffffff);
  const texture = renderer.generateTexture({ target: g, resolution: 2 });
  g.destroy();
  return texture;
}
