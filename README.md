# Night Shift Reels

**Live demo:** https://edgergard.github.io/night-shift-reels/

A compact three-reel browser game with a night-sky theme. Press **Spin**: the reels speed up, stop one after another, and three matching symbols on the **middle row** win. A win plays a short animation on the matching symbols, highlights the line and shows the result as text.

- **Skip animation**: while the reels spin, jumps straight to the final symbols. The result is the same.
- **Show a win (demo)**: when the game is idle, plays a round that is guaranteed to win and is clearly labelled as a demo, so the win animation can be seen on the first try.
- All rounds are free. Nothing is stored, so a page reload starts fresh.

Stack: TypeScript (strict), Vite, PixiJS 8 (scene and symbols), GSAP 3 (reel motion and the win animation, using the CustomEase, Physics2D and SplitText plugins), Vitest (logic). Fonts are Big Shoulders Display, Inter Tight and JetBrains Mono, self-hosted via `@fontsource-variable`.

## Look and motion ("Neon Night City")

"Night shift" taken literally: a rainy city at 3 am, and the reels are a neon sign.

- **Backdrop:** a seeded SVG skyline (`src/view/skyline.ts`) with lit windows, a few of which switch on and off on slow cycles, plus a blinking antenna and wet-street reflections. It is plain DOM + CSS, so it never touches the game canvas, and the street shimmer moves with `transform` only.
- **Board:** a dark sign backplate with a magenta outer tube, mounting screws and cyan payline rails. Every tube is the same shape stroked several times: two wide faint passes (glow), the coloured tube and a thin white core. That "baked" glow is plain geometry, with no filters, redrawn only on resize. A soft shadow is blurred once and cached with `cacheAsTexture`.
- **Symbols:** five original neon-tube symbols. Their centre-lines are SVG path data (`GraphicsPath`) or sampled ellipse arcs, drawn once into a shared `GraphicsContext`. Opaque occluders hide the planet ring's back half and the comet's tails behind its head.
- **Power-on:** the sign flickers on at load with two short stepped dips (`flicker()` keyframes, `ease: 'steps(1)'` on every keyframe).
- **Spin:** a wind-up, then acceleration and cruise. Symbols stretch with reel speed. Each reel brakes with a custom detent ease (`reelSettle`) that overshoots slightly. Landing gives a cyan window flash, a board nudge and a squash. If the first two symbols match, the third reel teases: it spins longer inside an amber tube.
- **Win:** the payline rails surge brighter, the matching symbols pop, sparks in neon colours fall with Physics2D gravity and a light sweeps along the line. The sign "buzzes" (its halo stutters twice) and an `aria-hidden` SplitText "WIN!" banner glows in. Afterwards a calm breathing loop runs until the next spin. Flash counts stay within WCAG 2.3.1 (at most 3 per second).
- **UI:** a dark HUD panel with a status bar that lights cyan while spinning and magenta on a win, a magenta Spin button that hums a few times when it becomes available, cyan-outlined secondary buttons, and solid disabled states that keep AA contrast.
- **Reduced motion:** every decorative animation is off (flicker, shimmer, window blinks, hum, banner, win burst). Rounds glide to their stops in about 0.3 s and a win only lights the line. Turning the OS setting on mid-round skips the spin or settles the win immediately.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # tsc --noEmit
npm test           # Vitest, logic only
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ locally
```

Controls: the buttons work with mouse, touch and keyboard. <kbd>Space</kbd> anywhere on the page spins, or skips while the reels are spinning. With `prefers-reduced-motion: reduce`, reels glide straight to their stops in about 0.3 s, and a win only highlights the line.

## Code map

```
src/
  game/                 pure logic: no Pixi, no GSAP, no DOM
    symbols.ts          symbol ids + display names
    reels.ts            the three ordered strips, visibleWindow()
    round.ts            pickStops(), demoWinStops(), evaluate(), resolveRound()
    controller.ts       RoundController: state machine idle → spinning → result
    spinMath.ts         spinTarget(), reelFrame(): the maths GSAP relies on
    *.test.ts           Vitest suites
  view/
    symbolArt.ts        five original neon-tube symbols (one GraphicsContext each)
    skyline.ts          seeded SVG skyline for the page background (DOM, not Pixi)
    ReelView.ts         one reel, rendered from a single number (+ speed stretch)
    SlotScene.ts        Pixi Application, layout, GSAP timelines, Skip, landing/win FX
    WinFx.ts            pooled sparks, glow bloom and line sweep for wins
    textures.ts         glow + spark textures, generated once
    theme.ts            Pixi colour tokens
    gsapSetup.ts        plugin registration + the `reelSettle` CustomEase
  main.ts               wires HTML buttons + role="status" to controller and scene,
                        status transitions, win banner, intro
```

## Where the result is decided

In `RoundController.spin()` (`src/game/controller.ts`), and only there. That call:

1. refuses to do anything unless the state allows `→ spinning`, so a second Spin during a spin is a no-op;
2. picks one stop index per reel, using the injected `rng` (or fixed `stops` / demo stops);
3. calls the pure `resolveRound()`, which builds the 3×3 grid with `visibleWindow()` and evaluates the middle row;
4. returns an immutable `Round` and switches to `spinning`.

The scene only gets that `Round`. When the reels have stopped, whether the timeline finished or Skip was pressed, the scene calls `game.finish(round.id, by)`. `finish` checks the state is still `spinning` and the id matches the current round, so a late callback from an earlier round is ignored.

The legal moves are declared in `TRANSITIONS`:

```ts
idle → spinning → result → spinning → …
```

## How the GSAP animation lands on the right symbol

Each reel is described by one number, `stripPosition` (see `src/game/spinMath.ts`):

- at an integer `p`, the reel is at rest and `strip[p mod n]` is on the middle row, the same meaning as a stop index;
- **decreasing** `p` slides symbols **down** the screen;
- every frame, `ReelView.render()` draws strip index `base + row` at `y = (row − offset) × cellSize`, using `reelFrame(p)`.

So GSAP never moves sprites. It tweens a plain number toward a target computed up front:

```ts
target = spinTarget(from, stop, n, minLoops)
// target < from, target ≡ stop (mod n), at least minLoops full revolutions away
```

`SlotScene.spin()` builds one timeline per reel: a small wind-up, `power2.in` acceleration, linear cruise, then braking with the `reelSettle` CustomEase. That curve overshoots by about 3.5% but ends at exactly 1, so the tween stops exactly on `target`. The tease only adds whole revolutions to `target`, so it lands on the same stop.

**Effects never touch `stripPosition`.** The flash, board nudge, squash, glows and sparks are separate display objects tweened on the side, so killing them can't change which symbols are shown.

**One clock.** Pixi's own ticker is off (`autoStart: false`). A single `gsap.ticker` listener first lets GSAP update every tween, then calls `reel.render()` and `app.render()`, so a frame never draws last frame's numbers. Later reels travel further, so they stop left to right. The reel timelines are nested in one parent `gsap.timeline()` whose `onComplete` reports the finish.

**Skip** kills that timeline and calls `reel.snapTo(stop)` with the same `round.stops`. Natural completion goes through the same `finishSpin()` code path. Both are covered by tests: `spinMath.test.ts` checks that the frame at `spinTarget()` equals `visibleWindow(strip, stop)`, and `controller.test.ts` checks that Skip and natural completion give identical grids and outcomes.

Because rendering reads `stripPosition` and the current `cellSize` every frame, resizing the window mid-spin just re-runs `layout()` and the reels keep spinning.

## Tests

`npm test` runs reproducible suites (fixed stops or the seeded `seededRng`):

- win, loss, and "only the middle row pays";
- the middle row and its neighbours at both ends of a strip (wrap-around);
- out-of-range stops are rejected; rng edge values stay in range;
- a repeated Spin during a spin is ignored;
- Skip and natural completion with the same stops give the same grid and result;
- a late callback after Skip, or from the previous round, does not change state;
- demo rounds always win; `spinTarget` always lands on the stop.

## Deploy to GitHub Pages

`vite.config.ts` uses `base: './'`, so every asset URL in `dist/index.html` is relative. The same build works at `https://<user>.github.io/<repo>/` with no repository name hard-coded.

1. Create an empty GitHub repository, e.g. `night-shift-reels`.
2. Push this project:
   ```bash
   git add -A
   git commit -m "Night Shift Reels"
   git remote add origin https://github.com/<user>/night-shift-reels.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
4. The workflow `.github/workflows/deploy.yml` runs typecheck, tests and build on every push to `main`, then publishes `dist/`. The URL appears in the run summary and under Settings → Pages.

Live demo: https://edgergard.github.io/night-shift-reels/
