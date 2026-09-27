import {loadFont as loadSerif} from '@remotion/google-fonts/DMSerifDisplay';
import {loadFont as loadSans} from '@remotion/google-fonts/DMSans';

export const FPS = 60;
export const DURATION = 900; // 15 s
export const W = 1080;
export const H = 1920;

// 120 BPM grid: one beat = 30 frames at 60 fps. Every cut below lands on the grid.
export const BEAT = 30;

export const T = {
  contact: 150, // sperm meets the ovum -> flash -> pull back from the label icon
  hero: 206, // camera settles on the bottle
  toFamily: 384, // arch folds into the berry circle
  her: 390,
  him: 450,
  family: 510,
  numbers: 568, // iris opens from the family pearl
  n2003: 586,
  n100: 648,
  finale: 720,
  dotLand: 840,
} as const;

// Palette — Fairhaven Health label system (berry = women, blue = men) + site plum.
export const C = {
  night: '#12050b',
  nightPlum: '#2a0b1c',
  deepPlum: '#4a1330',
  plum: '#973961',
  plumDeep: '#6f2346',
  berry: '#b83a6b',
  berryDeep: '#8a1d4b',
  blue: '#2f6cad',
  blueDeep: '#1c4a82',
  rose: '#f4a9c2',
  roseSoft: '#f9d3df',
  blush: '#f4e2e9',
  cream: '#fcf8f4',
  paper: '#ffffff',
  ink: '#1e1a1c',
  inkSoft: '#4a4145',
} as const;

const serif = loadSerif('normal', {weights: ['400'], subsets: ['latin', 'latin-ext']});
loadSerif('italic', {weights: ['400'], subsets: ['latin', 'latin-ext']});
const sans = loadSans('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext']});

export const F = {
  serif: serif.fontFamily,
  sans: sans.fontFamily,
};
