import React from 'react';
import {useCurrentFrame} from 'remotion';
import {F} from '../brand';
import {clamp, ease} from './anim';

export type Seg = {t: string; italic?: boolean; color?: string};

type Props = {
  segs: Seg[];
  start: number;
  exit?: number;
  y: number; // top of the line box in px
  size: number;
  color: string;
  font?: 'serif' | 'sans';
  weight?: number;
  tracking?: number; // em
  stagger?: number; // frames per character
  dur?: number;
  exitDur?: number;
  exitMode?: 'up' | 'down' | 'blur';
  x?: number; // horizontal offset from centre
  upper?: boolean;
  lineHeight?: number;
  shadow?: string;
};

/**
 * One line of kinetic type: characters rise out of a baseline mask with a staggered
 * expo settle, de-blurring as they land; exit lifts them out the top of the mask.
 */
export const Kinetic: React.FC<Props> = ({
  segs,
  start,
  exit,
  y,
  size,
  color,
  font = 'serif',
  weight = 400,
  tracking = -0.01,
  stagger = 1.6,
  dur = 34,
  exitDur = 16,
  exitMode = 'up',
  x = 0,
  upper = false,
  lineHeight = 1.18,
  shadow,
}) => {
  const frame = useCurrentFrame();
  if (frame < start - 1) return null;
  if (exit !== undefined && frame > exit + exitDur + 60) return null;

  let ci = 0;
  const words: {chars: {ch: string; i: number}[]; seg: Seg}[] = [];
  for (const seg of segs) {
    const parts = seg.t.split(/(\s+)/);
    for (const part of parts) {
      if (part.length === 0) continue;
      if (/^\s+$/.test(part)) {
        words.push({chars: [{ch: ' ', i: ci}], seg});
        ci += 1;
        continue;
      }
      const chars = Array.from(upper ? part.toUpperCase() : part).map((ch) => ({ch, i: ci++}));
      words.push({chars, seg});
    }
  }
  const total = ci;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        transform: `translateX(${x}px)`,
        textAlign: 'center',
        fontFamily: font === 'serif' ? F.serif : F.sans,
        fontWeight: weight,
        fontSize: size,
        lineHeight,
        letterSpacing: `${tracking}em`,
        color,
        whiteSpace: 'pre',
        textShadow: shadow,
      }}
    >
      {words.map((w, wi) => (
        <span
          key={wi}
          style={{
            display: 'inline-block',
            overflow: 'hidden',
            verticalAlign: 'bottom',
            paddingRight: w.seg.italic ? '0.12em' : '0.02em',
            marginRight: w.seg.italic ? '-0.1em' : '-0.02em',
            paddingBottom: '0.08em',
            marginBottom: '-0.08em',
          }}
        >
          {w.chars.map(({ch, i}) => {
            const local = frame - (start + i * stagger);
            const p = ease.swift(clamp(local / dur));
            const fade = clamp(local / (dur * 0.35));
            let ty = (1 - p) * 108;
            let op = fade;
            let blur = (1 - p) * 10;
            if (exit !== undefined) {
              const e = clamp((frame - (exit + (exitMode === 'up' ? i : total - i) * stagger * 0.6)) / exitDur);
              const pe = ease.inCubic(e);
              if (exitMode === 'up') ty -= pe * 108;
              if (exitMode === 'down') ty += pe * 108;
              op *= 1 - (exitMode === 'blur' ? pe : pe * 0.5);
              blur += pe * (exitMode === 'blur' ? 18 : 2);
            }
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  transform: `translateY(${ty}%)`,
                  opacity: op,
                  filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
                  fontStyle: w.seg.italic ? 'italic' : 'normal',
                  color: w.seg.color ?? color,
                }}
              >
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </div>
  );
};
