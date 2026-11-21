import { seededRng } from '../game/rng';

/**
 * Decorative night skyline for the page background (plain DOM/SVG + CSS, not Pixi):
 * it never changes per round, so the compositor animates it for free.
 *
 * Built from a fixed seed, so every visitor sees the same city. A few windows get
 * a flicker class that CSS switches on and off on slow, offset cycles.
 */
const WIDTH = 1440;
const HEIGHT = 420;

export function skylineSvg(seed = 3_12): string {
  const rng = seededRng(seed);
  const parts: string[] = [];
  let x = -10;
  while (x < WIDTH) {
    const w = 48 + Math.floor(rng() * 80);
    const h = 120 + Math.floor(rng() * 260);
    const top = HEIGHT - h;
    parts.push(`<rect class="b" x="${x}" y="${top}" width="${w}" height="${h + 2}"/>`);
    if (rng() < 0.25) {
      const ax = x + Math.floor(w / 2);
      parts.push(`<rect class="b" x="${ax}" y="${top - 14}" width="1" height="14"/>`);
      parts.push(`<rect class="antenna" x="${ax - 1}" y="${top - 18}" width="3" height="4"/>`);
    }
    const cool = rng() < 0.45; // some towers have cool office light, others warm flats
    for (let wy = top + 12; wy < HEIGHT - 10; wy += 14) {
      for (let wx = x + 8; wx < x + w - 8; wx += 11) {
        const r = rng();
        if (r > 0.28) continue; // most windows are dark at 3 am
        const flicker = r < 0.03 ? ' f1' : r < 0.05 ? ' f2' : r < 0.065 ? ' f3' : '';
        parts.push(`<rect class="w${cool ? ' t' : ''}${flicker}" x="${wx}" y="${wy}" width="5" height="7"/>`);
      }
    }
    x += w + 2 + Math.floor(rng() * 6);
  }
  return `<svg class="skyline" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><g id="skyline-city">${parts.join('')}</g></svg>
<div class="street"></div>
<svg class="reflection" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><use href="#skyline-city"/></svg>`;
}
