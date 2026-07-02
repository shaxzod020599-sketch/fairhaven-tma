import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { bottleSpec, labelCrop, motion } from './fhProModel.mjs';

test('bottle proportions match FH PRO reference silhouette', () => {
  const overallHeight = bottleSpec.capTop - bottleSpec.baseY;
  const diameter = bottleSpec.bodyRadius * 2;
  const ratio = overallHeight / diameter;

  assert.ok(ratio >= 1.8 && ratio <= 2.2, `height/width ratio ${ratio} must stay near 2:1`);
  assert.ok(bottleSpec.capRadius / bottleSpec.bodyRadius >= 0.68);
  assert.ok(bottleSpec.capRadius / bottleSpec.bodyRadius <= 0.78);
});

test('label crop stays inside source image and preserves portrait aspect', () => {
  for (const value of Object.values(labelCrop)) {
    assert.ok(value >= 0 && value <= 1, `normalized crop value ${value} must be in [0, 1]`);
  }
  assert.ok(labelCrop.width < labelCrop.height);
  assert.ok(labelCrop.x + labelCrop.width <= 1);
  assert.ok(labelCrop.y + labelCrop.height <= 1);
});

test('motion keeps front label readable', () => {
  assert.ok(motion.maxYaw <= 0.2);
  assert.ok(motion.maxPitch <= 0.12);
});

test('optimized label texture exists and stays lightweight', async () => {
  const path = fileURLToPath(
    new URL('../../public/assets/fh-pro-women-label.jpg', import.meta.url),
  );
  const info = await stat(path);
  assert.ok(info.size > 50_000, 'texture must retain enough detail for label text');
  assert.ok(info.size < 700_000, `texture is too large: ${info.size} bytes`);
});
