import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame} from 'remotion';
import {rand} from './anim';

/** Animated film grain — a tiled noise texture jittered every frame. */
export const Grain: React.FC<{opacity: number; blend?: React.CSSProperties['mixBlendMode']}> = ({opacity, blend = 'overlay'}) => {
  const frame = useCurrentFrame();
  const ox = Math.floor(rand(frame * 2 + 1) * 512);
  const oy = Math.floor(rand(frame * 2 + 2) * 512);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url(${staticFile('grain.png')})`,
        backgroundSize: '512px 512px',
        backgroundPosition: `${ox}px ${oy}px`,
        mixBlendMode: blend,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};
