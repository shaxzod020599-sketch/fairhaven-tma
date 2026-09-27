import React from 'react';
import {useCurrentFrame} from 'remotion';

/** Mount children only inside [from, to) — frames stay absolute (unlike <Sequence>). */
export const Show: React.FC<{from: number; to: number; children: React.ReactNode}> = ({from, to, children}) => {
  const f = useCurrentFrame();
  return f >= from && f < to ? <>{children}</> : null;
};
