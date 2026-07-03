/**
 * Shared scroll-progress bus for the scrollytelling homepage.
 * The DOM scroll driver writes here every animation frame; the R3F scene
 * reads it inside useFrame. A plain mutable object keeps React out of the
 * per-frame hot path entirely.
 */
export const scrollBus = {
  /** 0→1 across the whole scrolly journey (hero top → finale bottom). */
  journey: 0,
  /** 0→1 within the hero act. */
  hero: 0,
  /** Index of the testimonial step currently in focus (-1 before cascade). */
  activeStep: -1,
  /** 0→1 within the active step. */
  stepProgress: 0,
  /** Total number of testimonial steps (set by the cascade on mount). */
  stepCount: 0,
  /** Journey fraction at which each cascade step is viewport-centered
      (measured from the DOM by the journey driver; resize-aware). */
  stepCenters: [],
};

export function resetScrollBus() {
  scrollBus.journey = 0;
  scrollBus.hero = 0;
  scrollBus.activeStep = -1;
  scrollBus.stepProgress = 0;
  scrollBus.stepCount = 0;
}
