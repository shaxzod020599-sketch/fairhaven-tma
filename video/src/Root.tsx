import React from 'react';
import {Composition} from 'remotion';
import {Reel} from './Reel';
import {FPS, DURATION, W, H} from './brand';

export const Root: React.FC = () => (
  <Composition id="FairhavenReel" component={Reel} durationInFrames={DURATION} fps={FPS} width={W} height={H} />
);
