import React, { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { TESTIMONIALS } from './testimonialsData.js';
import { scrollBus } from './scrollBus.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * The descent: one full-viewport sticky step per voice. A rAF-throttled
 * scroll driver writes transforms straight to the DOM (no re-renders) and
 * mirrors progress into scrollBus for the 3D camera.
 *
 * With `simple` (mobile / reduced motion / no WebGL) the steps become
 * normal blocks revealed by IntersectionObserver.
 */
export default function TestimonialCascade({ simple = false }) {
  const { lang } = useI18n();
  const rootRef = useRef(null);
  const cardRefs = useRef([]);
  const dotRefs = useRef([]);

  useEffect(() => {
    scrollBus.stepCount = TESTIMONIALS.length;
  }, []);

  /* Simple mode: reveal-on-intersect. */
  useEffect(() => {
    if (!simple) return undefined;
    const cards = cardRefs.current.filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { threshold: 0.35 }
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [simple]);

  /* Full mode: continuous eased loop — wheel jumps glide instead of snap. */
  useEffect(() => {
    if (simple) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    const eased = new Array(TESTIMONIALS.length).fill(0);
    let raf = 0;
    let running = true;
    let last = performance.now();

    const frame = (now) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // Frame-rate independent exponential glide toward the true position.
      const k = 1 - Math.exp(-dt * 5.5);

      const vh = window.innerHeight;
      const steps = root.querySelectorAll('.cascade-step');

      let active = -1;
      let activeProgress = 0;

      steps.forEach((step, i) => {
        const rect = step.getBoundingClientRect();
        // 0 = step top at viewport bottom · 0.5 = centered · 1 = gone above.
        const target = clamp01((vh - rect.top) / (vh + rect.height));
        eased[i] += (target - eased[i]) * k;
        const p = eased[i];

        const card = cardRefs.current[i];
        if (card) {
          // enter: 0→0.38 rises+fades in · hold: 0.38→0.62 · exit: 0.62→1
          const enter = clamp01(p / 0.38);
          const exit = clamp01((p - 0.62) / 0.38);
          const y = (1 - enter) * 10 - exit * 8; // vh units
          const scale = 0.95 + enter * 0.05 - exit * 0.025;
          const opacity = enter * (1 - exit);
          const blur = (1 - enter) * 4 + exit * 3;
          card.style.transform = `translate3d(0, ${y}vh, 0) scale(${scale})`;
          card.style.opacity = opacity.toFixed(3);
          card.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
        }
        if (target > 0.25 && target < 0.75) {
          active = i;
          activeProgress = target;
        }
      });

      scrollBus.activeStep = active;
      scrollBus.stepProgress = activeProgress;

      dotRefs.current.forEach((dot, i) => {
        if (dot) dot.classList.toggle('is-active', i === active);
      });
    };

    // Only burn frames while the cascade is anywhere near the viewport.
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    }, { rootMargin: '30% 0px' });
    io.observe(root);

    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [simple]);

  return (
    <div
      className={`cascade ${simple ? 'cascade-simple' : 'cascade-full'}`}
      ref={rootRef}
    >
      {!simple && (
        <div className="cascade-rail" aria-hidden="true">
          {TESTIMONIALS.map((_, i) => (
            <span
              className="cascade-dot"
              key={i}
              ref={(el) => { dotRefs.current[i] = el; }}
            />
          ))}
        </div>
      )}

      {TESTIMONIALS.map((item, i) => {
        const copy = lang === 'uz' ? item.uz : item.ru;
        return (
          <section className="cascade-step" key={i}>
            <figure
              className={`voice-card voice-${item.kind} voice-accent-${item.accent} ${i % 2 ? 'voice-right' : 'voice-left'}`}
              ref={(el) => { cardRefs.current[i] = el; }}
            >
              <span className="voice-mark" aria-hidden="true">
                {item.kind === 'research' ? '§' : item.kind === 'award' ? '✦' : '“'}
              </span>

              {item.kind === 'research' && (
                <div className="voice-stat" aria-hidden="true">
                  <strong>{item.stat}</strong>
                  <span>{copy.statLabel}</span>
                </div>
              )}

              <blockquote className="voice-text">{copy.text}</blockquote>

              <figcaption className="voice-author">
                <strong>{copy.name}</strong>
                <span>{copy.role}</span>
              </figcaption>
            </figure>
          </section>
        );
      })}
    </div>
  );
}
