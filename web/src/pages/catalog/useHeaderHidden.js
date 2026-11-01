import { useEffect, useState } from 'react';

// Same thresholds as the header's own scroll state (components/Header.jsx), which does not publish it:
// past 400 px a scroll down tucks the header away, a scroll up brings it back.
const HIDE_AFTER = 400;
const NUDGE = 6;

/** True while the site header is tucked away, so the sticky goal rail can slide up into its place. */
export function useHeaderHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const read = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const delta = y - last;
      setHidden((was) => (y <= HIDE_AFTER ? false : delta > NUDGE ? true : delta < -NUDGE ? false : was));
      if (Math.abs(delta) > NUDGE || y <= HIDE_AFTER) last = y;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return hidden;
}
