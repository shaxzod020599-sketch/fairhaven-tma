import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, F, T} from '../brand';
import {clamp, ease, mix, prog, springAt} from '../lib/anim';
import {Pearl} from '../lib/Pearl';

const SIZE = 300;
const CY = 900; // vertical centre of the numerals

/** One odometer drum: rolls through `cycles` full turns and lands on `digit`. */
const Drum: React.FC<{digit: number; start: number; out: number; frame: number; cycles: number}> = ({digit, start, out, frame, cycles}) => {
  const p = ease.swift(prog(frame, start, 34));
  const pOut = ease.inCubic(prog(frame, out, 11));
  const total = cycles * 10 + digit;
  const idx = p * total + pOut * 3;
  const speed = Math.abs(ease.swift(prog(frame + 1, start, 34)) - p) * total + pOut * 0.4;
  const cells = [];
  for (let k = 0; k <= total + 4; k++) {
    cells.push(
      <div key={k} style={{height: SIZE, lineHeight: `${SIZE}px`, textAlign: 'center'}}>
        {k % 10}
      </div>,
    );
  }
  return (
    <div
      style={{
        height: SIZE,
        overflow: 'hidden',
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)',
        opacity: clamp((frame - start) / 6) * (1 - pOut),
      }}
    >
      <div style={{transform: `translateY(${-idx * SIZE}px)`, filter: speed > 0.05 ? `blur(${Math.min(7, speed * 9).toFixed(2)}px)` : undefined}}>
        {cells}
      </div>
    </div>
  );
};

const Stat: React.FC<{
  digits: number[];
  suffix?: string;
  start: number;
  out: number;
  label: string;
  index: string;
  frame: number;
}> = ({digits, suffix, start, out, label, index, frame}) => {
  if (frame < start - 2 || frame > out + 24) return null;
  const labelIn = ease.swift(prog(frame, start + 10, 30));
  const labelOut = ease.inCubic(prog(frame, out, 12));
  const suf = springAt(frame, start + 12 + digits.length * 3, {damping: 11, stiffness: 160});
  const sufOut = ease.inCubic(prog(frame, out, 14));
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: CY - SIZE / 2 - 128,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: F.sans,
          fontWeight: 500,
          fontSize: 22,
          letterSpacing: '0.34em',
          color: C.roseSoft,
          opacity: 0.7 * labelIn * (1 - labelOut),
        }}
      >
        {index}
      </div>
      <div
        style={{
          position: 'absolute',
          top: CY - SIZE / 2,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          fontFamily: F.serif,
          fontSize: SIZE,
          color: C.cream,
          letterSpacing: '-0.02em',
        }}
      >
        {digits.map((d, i) => (
          <div key={i} style={{width: SIZE * 0.56}}>
            <Drum digit={d} start={start + i * 3} out={out + i} frame={frame} cycles={1 + ((i + d) % 2)} />
          </div>
        ))}
        {suffix && (
          <div
            style={{
              height: SIZE,
              lineHeight: `${SIZE}px`,
              fontStyle: 'italic',
              color: C.rose,
              transform: `translateY(${(1 - suf) * 60 - sufOut * 80}px) scale(${mix(0.4, 1, suf)})`,
              opacity: clamp(suf * 2) * (1 - sufOut),
              marginLeft: SIZE * 0.02,
            }}
          >
            {suffix}
          </div>
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          top: CY + SIZE / 2 + 44,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: F.sans,
          fontWeight: 600,
          fontSize: 30,
          letterSpacing: '0.3em',
          color: C.cream,
          opacity: labelIn * (1 - labelOut),
          transform: `translateY(${(1 - labelIn) * 24 - labelOut * 18}px)`,
        }}
      >
        {label}
      </div>
    </>
  );
};

export const Numbers: React.FC = () => {
  const frame = useCurrentFrame();

  // ring around 100%
  const R = 400;
  const draw = ease.inOutCubic(prog(frame, T.n100 + 6, 52));
  const collapse = ease.inOutCubic(prog(frame, T.finale - 14, 26));
  const ringR = mix(R, 70, collapse);
  const ringOpacity = clamp((frame - T.n100 - 2) / 6) * (1 - ease.inCubic(prog(frame, T.finale + 4, 12)));
  const circ = 2 * Math.PI * ringR;
  const a = -Math.PI / 2 + draw * Math.PI * 2;
  const tipX = 540 + Math.cos(a) * ringR;
  const tipY = CY + Math.sin(a) * ringR;
  const bgFade = 1 - ease.inOutCubic(prog(frame, T.finale - 4, 26));

  return (
    <AbsoluteFill style={{opacity: bgFade}}>
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 45%, #a8426f 0%, #973961 45%, #5a1734 100%)'}} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${mix(20, 80, prog(frame, T.numbers, 150))}% 30%, rgba(255,190,215,0.18) 0%, rgba(255,190,215,0) 45%)`,
        }}
      />
      <Stat digits={[2, 0, 0, 3]} start={T.n2003} out={T.n100 - 6} label="AQSHDA ASOS SOLINGAN" index="01 — 02" frame={frame} />
      <Stat digits={[1, 0, 0]} suffix="%" start={T.n100} out={T.finale - 18} label="ORIGINAL MAHSULOT" index="02 — 02" frame={frame} />
      {ringOpacity > 0 && (
        <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, opacity: ringOpacity}}>
          <circle cx={540} cy={CY} r={ringR} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={2} />
          <circle
            cx={540}
            cy={CY}
            r={ringR}
            fill="none"
            stroke={C.rose}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeDasharray={`${circ * draw} ${circ}`}
            transform={`rotate(-90 540 ${CY})`}
          />
        </svg>
      )}
      {ringOpacity > 0 && draw > 0.01 && <Pearl x={tipX} y={tipY} r={mix(13, 30, collapse)} glow={1.2} opacity={ringOpacity} />}
    </AbsoluteFill>
  );
};
