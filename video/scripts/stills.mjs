// Render a set of stills from one bundle: node scripts/stills.mjs 0 150 300 ...
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';

const frames = process.argv.slice(2).map(Number);
const scale = Number(process.env.SCALE ?? 0.5);
const chromiumOptions = {gl: 'angle'};
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const browser = await openBrowser('chrome', {chromiumOptions});
const composition = await selectComposition({serveUrl, id: 'FairhavenReel', puppeteerInstance: browser, chromiumOptions});
for (const frame of frames) {
  await renderStill({
    composition,
    serveUrl,
    output: path.resolve(`out/stills/f${String(frame).padStart(3, '0')}.jpg`),
    frame,
    scale,
    imageFormat: 'jpeg',
    jpegQuality: 88,
    puppeteerInstance: browser,
    chromiumOptions,
  });
  process.stdout.write(`${frame} `);
}
await browser.close({silent: true});
console.log('done');
