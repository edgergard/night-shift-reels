import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Physics2DPlugin } from 'gsap/Physics2DPlugin';
import { SplitText } from 'gsap/SplitText';

// Plugins are registered once, here; everything else imports gsap from this module.
gsap.registerPlugin(CustomEase, Physics2DPlugin, SplitText);

/**
 * Reel brake: fast deceleration, ~3.5% overshoot past the target, then settles
 * exactly on 1. Because the curve ends at 1, the tween still lands on the
 * decided stop — the overshoot is only on the way there.
 */
CustomEase.create('reelSettle', 'M0,0 C0.14,0.62 0.32,1.06 0.56,1.035 0.76,1.01 0.88,1 1,1');

export { gsap, SplitText };
