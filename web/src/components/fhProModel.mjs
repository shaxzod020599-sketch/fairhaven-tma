export const bottleSpec = Object.freeze({
  baseY: -1.34,
  bodyRadius: 0.68,
  neckTop: 0.96,
  capRadius: 0.49,
  capTop: 1.38,
  labelBottom: -0.98,
  labelTop: 0.54,
  labelRadius: 0.687,
  labelArc: 2.3,
});

// Crop measured from supplied 1600×1600 product reference.
export const labelCrop = Object.freeze({
  x: 405 / 1600,
  y: 450 / 1600,
  width: 815 / 1600,
  height: 940 / 1600,
});

export const motion = Object.freeze({
  maxYaw: 0.16,
  maxPitch: 0.09,
  floatIntensity: 0.07,
});
