import '@fontsource-variable/sora';
import '@fontsource-variable/inter';
import './style.css';
import { RoundController, type GameState } from './game/controller';
import type { Round } from './game/round';
import { SYMBOL_NAMES } from './game/symbols';
import { gsap, SplitText } from './view/gsapSetup';
import { SlotScene } from './view/SlotScene';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
}

const stage = byId<HTMLDivElement>('stage');
const status = byId<HTMLDivElement>('status');
const statusTitle = byId<HTMLParagraphElement>('status-title');
const statusDetail = byId<HTMLParagraphElement>('status-detail');
const spinBtn = byId<HTMLButtonElement>('spin');
const skipBtn = byId<HTMLButtonElement>('skip');
const demoBtn = byId<HTMLButtonElement>('demo');
const banner = byId<HTMLDivElement>('win-banner');

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const motion = (): { reducedMotion: boolean } => ({ reducedMotion: reducedMotionQuery.matches });

const game = new RoundController();
const scene = await SlotScene.create(stage);
scene.setMotion(!reducedMotionQuery.matches);
reducedMotionQuery.addEventListener('change', (event) => {
  scene.setMotion(!event.matches);
  if (event.matches) hideBanner();
});

// ───────────── Decorative win banner (aria-hidden; the status text is the accessible result) ─────────────
let split: SplitText | null = null;
let bannerTl: gsap.core.Timeline | null = null;

function hideBanner(): void {
  bannerTl?.kill();
  bannerTl = null;
  split?.revert();
  split = null;
  banner.textContent = '';
  gsap.set(banner, { opacity: 0, scale: 1 });
}

function showBanner(text: string): void {
  hideBanner();
  // Split an inner line, not the grid container itself, so the chars stay on one row.
  const line = document.createElement('span');
  line.className = 'win-line';
  line.textContent = text;
  banner.append(line);
  gsap.set(banner, { opacity: 1, scale: 1 });
  split = SplitText.create(line, { type: 'chars', charsClass: 'win-char', aria: 'none' });
  bannerTl = gsap
    .timeline({ onComplete: hideBanner })
    .fromTo(
      split.chars,
      { yPercent: 120, scale: 0.4, opacity: 0 },
      { yPercent: 0, scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.4)', stagger: 0.05 },
    )
    .to(banner, { opacity: 0, scale: 1.08, duration: 0.3, ease: 'power2.in' }, '+=0.7');
}

// ───────────── Round flow ─────────────
function startRound(demo: boolean): void {
  const round = game.spin({ demo });
  if (!round) return; // already spinning — the controller refuses, nothing to do
  hideBanner();
  // The callback is bound to THIS round's id; if it fires late, finish() ignores it.
  scene.spin(round, motion(), (by) => game.finish(round.id, by));
}

function describe(round: Round): { title: string; detail: string } {
  const names = round.middleRow.map((s) => SYMBOL_NAMES[s]).join(' · ');
  const prefix = round.demo ? 'Demo win (forced result). ' : '';
  if (round.outcome.kind === 'win') {
    return {
      title: round.demo ? 'Demo win!' : 'Win!',
      detail: `${prefix}Round ${round.id}: ${names}. Three ${SYMBOL_NAMES[round.outcome.symbol]}s on the middle line.`,
    };
  }
  return { title: 'No win', detail: `Round ${round.id}: ${names}. Spin again.` };
}

/** Text is set first (so the live region announces it), then only opacity/y are animated. */
function setStatus(title: string, detail: string): void {
  const changed = statusTitle.textContent !== title || statusDetail.textContent !== detail;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
  if (changed && !reducedMotionQuery.matches) {
    gsap.fromTo(
      [statusTitle, statusDetail],
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.28, stagger: 0.05, ease: 'power2.out', overwrite: true },
    );
  }
}

/** Moves focus along with the action so keyboard users never land on a disabled button. */
function handOffFocus(from: HTMLButtonElement, to: HTMLButtonElement): void {
  if (document.activeElement === from) to.focus();
}

function render(state: GameState): void {
  stage.dataset['phase'] = state.phase;
  const spinning = state.phase === 'spinning';
  const wasFocused = document.activeElement;

  spinBtn.disabled = spinning;
  demoBtn.disabled = spinning;
  skipBtn.disabled = !spinning;

  if (spinning) {
    // With reduced motion the round is over in ~0.3 s, so moving focus to Skip
    // and straight back would only make screen readers stutter.
    if (!reducedMotionQuery.matches && (wasFocused === spinBtn || wasFocused === demoBtn)) skipBtn.focus();
    status.dataset['outcome'] = '';
    setStatus('Spinning…', state.round.demo ? 'Demo round: the result is a guaranteed win.' : 'Reels are spinning.');
    return;
  }

  handOffFocus(skipBtn, spinBtn);
  if (state.phase === 'result') {
    const text = describe(state.round);
    status.dataset['outcome'] = state.round.outcome.kind;
    setStatus(text.title, text.detail);
    if (state.round.outcome.kind === 'win') {
      scene.showWin(motion());
      if (!reducedMotionQuery.matches) showBanner(text.title);
    }
  }
}

game.subscribe(render);
render(game.state);

spinBtn.addEventListener('click', () => startRound(false));
demoBtn.addEventListener('click', () => startRound(true));
skipBtn.addEventListener('click', () => scene.skip());

// Space anywhere on the page (except on a focused button, which handles it natively).
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return;
  if (event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (game.state.phase === 'spinning') scene.skip();
  else startRound(false);
});

// Entrance: opacity/transform only, cleared afterwards so nothing stays hidden.
if (!reducedMotionQuery.matches) {
  gsap.from(['.header', '.stage', '.hud'], {
    opacity: 0,
    y: 16,
    duration: 0.5,
    stagger: 0.08,
    ease: 'power3.out',
    clearProps: 'transform,opacity',
  });
}

// Dev-only handle for poking at the state from the console; stripped from production builds.
if (import.meta.env.DEV) Object.assign(window, { __nightShift: { game, scene, gsap } });
