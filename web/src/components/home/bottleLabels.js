import * as THREE from 'three';

/**
 * Procedural Fairhaven-style label textures.
 * Mirrors the real packaging: white ground, "Fairhaven Health" wordmark,
 * category pill, bold product name, subtitle, colored bottom band.
 * Drawn once per bottle on an offscreen canvas → THREE.CanvasTexture.
 */
const SIZE = 1024;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function makeLabelTexture({
  badge = 'FERTILITY',
  name = 'FertilAid',
  subtitle = 'Fertility Multivitamin',
  band = '#8d1748',
  bandText = 'Dietary Supplement',
}) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Ground
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Wordmark — "Fairhaven" ink over "Health" plum, like the real logo
  ctx.fillStyle = '#4a4a4a';
  ctx.font = '600 66px Arial, sans-serif';
  ctx.fillText('Fairhaven', SIZE / 2, 118);
  ctx.fillStyle = '#973961';
  ctx.font = 'italic 600 58px Georgia, serif';
  ctx.fillText('Health', SIZE / 2, 186);

  // Category pill
  ctx.font = '700 34px Arial, sans-serif';
  const pillW = ctx.measureText(badge).width + 76;
  ctx.fillStyle = band;
  roundRect(ctx, (SIZE - pillW) / 2, 246, pillW, 62, 31);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(badge, SIZE / 2, 279);

  // Product name — bold, up to 3 lines
  ctx.fillStyle = '#191b1c';
  ctx.font = '700 96px Arial, sans-serif';
  const lines = wrapLines(ctx, name, SIZE - 180);
  const nameTop = 420 - ((lines.length - 1) * 52);
  lines.forEach((ln, i) => ctx.fillText(ln, SIZE / 2, nameTop + i * 104));

  // Subtitle
  ctx.fillStyle = '#5a5858';
  ctx.font = '400 44px Arial, sans-serif';
  ctx.fillText(subtitle, SIZE / 2, 660);

  // Thin rule
  ctx.strokeStyle = 'rgba(25,27,28,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(SIZE / 2 - 170, 716);
  ctx.lineTo(SIZE / 2 + 170, 716);
  ctx.stroke();

  // Bottom band
  ctx.fillStyle = band;
  ctx.fillRect(0, 790, SIZE, SIZE - 790);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 40px Arial, sans-serif';
  ctx.fillText(bandText, SIZE / 2, 862);
  ctx.font = '400 34px Arial, sans-serif';
  ctx.fillText('90 capsules · 1-month supply', SIZE / 2, 930);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Real product line-up for the descent gallery. */
export const LABEL_SPECS = [
  {
    badge: 'FERTILITY',
    name: 'FertilAid for Men',
    subtitle: 'Male Fertility Supplement',
    band: '#1e4d92',
    bandText: 'Doctor Formulated',
  },
  {
    badge: 'PRENATAL',
    name: 'PeaPod Prenatal',
    subtitle: 'Complete Prenatal Vitamin',
    band: '#2f6f5e',
    bandText: 'With Folate & DHA',
  },
  {
    badge: 'NURSING',
    name: 'Milkies Nursing Blend',
    subtitle: 'Lactation Support',
    band: '#5f4a8f',
    bandText: 'Mom’s Choice Awards®',
  },
  {
    badge: 'MENOPAUSE',
    name: 'Complete Menopause Relief',
    subtitle: 'Multi-Symptom Support',
    band: '#7d2f50',
    bandText: 'Hormone-Free Formula',
  },
  {
    badge: 'FERTILITY',
    name: 'OvaBoost for Women',
    subtitle: 'Egg Quality Support',
    band: '#8d1748',
    bandText: 'With Myo-Inositol & CoQ10',
  },
];
