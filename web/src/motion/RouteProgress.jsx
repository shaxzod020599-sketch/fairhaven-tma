import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { EASE_OUT } from './easings.js';
import './motion.css';

// How many things are loading right now: lazy route chunks and product data.
let pending = 0;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const isBusy = () => pending > 0;
const notBusyOnServer = () => false;

/** Runs the top progress bar while `busy` is true (any number of callers; it runs while any is busy). */
export function useRouteBusy(busy) {
  useEffect(() => {
    if (!busy) return undefined;
    pending += 1;
    notify();
    return () => {
      pending -= 1;
      notify();
    };
  }, [busy]);
}

/** Suspense fallback for lazy routes: keeps the page height and runs the progress bar. */
export function RouteFallback() {
  useRouteBusy(true);
  return <div className="route-fallback" />;
}

const SHOW_AFTER = 120; // ms; quick loads never flash the bar

/** Thin sun bar on top of the page. Mount once; it shows only while something calls useRouteBusy. */
export default function RouteProgress() {
  const busy = useSyncExternalStore(subscribe, isBusy, notBusyOnServer);
  const [phase, setPhase] = useState('idle'); // idle -> run -> done -> idle

  useEffect(() => {
    if (busy) {
      const timer = setTimeout(() => setPhase('run'), SHOW_AFTER);
      return () => clearTimeout(timer);
    }
    setPhase((p) => (p === 'run' ? 'done' : 'idle'));
    return undefined;
  }, [busy]);

  return (
    <AnimatePresence>
      {phase !== 'idle' && (
        <m.div
          key="bar"
          className="fx-progress"
          aria-hidden="true"
          initial={{ scaleX: 0, opacity: 1 }}
          // Creeps toward 80% while loading (never claims to be done), then fills and fades.
          animate={phase === 'run' ? { scaleX: 0.8, transition: { duration: 6, ease: EASE_OUT } } : { scaleX: 1, transition: { duration: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.28 } }}
          onAnimationComplete={() => {
            if (phase === 'done') setPhase('idle');
          }}
        />
      )}
    </AnimatePresence>
  );
}
