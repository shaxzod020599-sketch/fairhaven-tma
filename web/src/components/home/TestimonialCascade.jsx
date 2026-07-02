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

  /* Full mode: scroll-driven cascade. */
  useEffect(() => {
    if (simple) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;

    let raf = 0;
    let scheduled = false;

    const update = () => {
      scheduled = false;
      const vh = window.innerHeight;
      const steps = Array.from(root.querySelectorAll('.cascade-step'));

      let active = -1;
      let activeProgress = 0;

      steps.forEach((step, i) => {
        const rect = step.getBoundingClientRect();
        // 0 when the step's top reaches the viewport bottom, 0.5 when the
        // step is centered, 1 when its bottom clears the viewport top.
        const p = clamp01((vh - rect.top) / (vh + rect.height));
        const card = cardRefs.current[i];
        if (card) {
          // enter: 0→0.38 rises+fades in · hold: 0.38→0.62 · exit: 0.62→1
          const enter = clamp01(p / 0.38);
          const exit = clamp01((p - 0.62) / 0.38);
          const y = (1 - enter) * 14 - exit * 10; // vh units
          const scale = 0.94 + enter * 0.06 - exit * 0.03;
          const opacity = enter * (1 - exit);
          const blur = (1 - enter) * 6 + exit * 4;
          card.style.transform = `translate3d(0, ${y}vh, 0) scale(${scale})`;
          card.style.opacity = opacity.toFixed(3);
          card.style.filter = `blur(${blur.toFixed(2)}px)`;
        }
        if (p > 0.25 && p < 0.75) {
          active = i;
          activeProgress = p;
        }
      });

      scrollBus.activeStep = active;
      scrollBus.stepProgress = activeProgress;

      dotRefs.current.forEach((dot, i) => {
        if (dot) dot.classList.toggle('is-active', i === active);
      });
    };

    const onScroll = () => {
      if (!scheduled) {
        scheduled = true;
        raf = requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
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
