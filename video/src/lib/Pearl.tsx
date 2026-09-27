import React from 'react';

/** CSS version of the ovum — the recurring "pearl" motif (glowing cell with a white rim). */
export const Pearl: React.FC<{x: number; y: number; r: number; glow?: number; opacity?: number}> = ({x, y, r, glow = 1, opacity = 1}) => {
  if (r <= 0.2 || opacity <= 0) return null;
  const g = Math.max(0, glow);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        opacity,
        background: `radial-gradient(circle at 38% 34%, #fbd0dd 0%, #ef8fae ${18}%, #c8406f 62%, #9b2150 100%)`,
        boxShadow: [
          `0 0 0 ${Math.max(1, r * 0.07)}px rgba(255,244,248,0.95)`,
          `0 0 ${r * 0.35}px ${r * 0.1}px rgba(255,230,240,${0.85 * Math.min(1, g)})`,
          `0 0 ${r * 1.1}px ${r * 0.35}px rgba(255,105,160,${0.55 * g})`,
          `0 0 ${r * 2.6}px ${r * 0.9}px rgba(255,90,150,${0.28 * g})`,
        ].join(','),
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: r * 0.86,
          top: r * 1.18,
          width: r * 0.32,
          height: r * 0.3,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(110,20,52,0.85) 0%, rgba(110,20,52,0.5) 55%, rgba(110,20,52,0) 100%)',
        }}
      />
    </div>
  );
};
