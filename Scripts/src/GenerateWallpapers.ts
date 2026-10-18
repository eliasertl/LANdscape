import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * Generates LANdscape's bundled wallpapers procedurally: soft mesh gradients in
 * the spirit of macOS defaults. No third-party images are downloaded, so there
 * is nothing to license. Output: Client/public/wallpapers/<name>.webp
 *
 *   npm run wallpapers            # skips files that already exist
 *   npm run wallpapers -- --force # regenerate everything
 */

interface Blob {
  cx: number; // 0..1
  cy: number; // 0..1
  r: number; // 0..1 relative to width
  color: string;
  opacity?: number;
}

interface WallpaperSpec {
  name: string;
  base: [string, string]; // top → bottom gradient
  angle?: number;
  blobs: Blob[];
  grain?: number; // 0..1
}

const specs: WallpaperSpec[] = [
  {
    name: 'aurora',
    base: ['#0b1a3a', '#1d0f3f'],
    blobs: [
      { cx: 0.2, cy: 0.25, r: 0.42, color: '#3b7cff' },
      { cx: 0.78, cy: 0.3, r: 0.38, color: '#b24cff' },
      { cx: 0.55, cy: 0.85, r: 0.45, color: '#19d2c3', opacity: 0.8 },
      { cx: 0.9, cy: 0.9, r: 0.3, color: '#ff5fa2', opacity: 0.6 },
    ],
  },
  {
    name: 'sunrise',
    base: ['#2a0f3d', '#ff7a4d'],
    blobs: [
      { cx: 0.5, cy: 0.95, r: 0.55, color: '#ffb347' },
      { cx: 0.15, cy: 0.4, r: 0.35, color: '#ff4f8b', opacity: 0.8 },
      { cx: 0.85, cy: 0.2, r: 0.35, color: '#6a3fd6', opacity: 0.8 },
    ],
  },
  {
    name: 'sequoia',
    base: ['#0d3b4f', '#06161f'],
    blobs: [
      { cx: 0.3, cy: 0.7, r: 0.5, color: '#1e9c8a' },
      { cx: 0.8, cy: 0.25, r: 0.4, color: '#2c6fd6', opacity: 0.9 },
      { cx: 0.65, cy: 0.9, r: 0.35, color: '#c9f27e', opacity: 0.45 },
    ],
  },
  {
    name: 'monterey',
    base: ['#0a1e5a', '#3a0d6b'],
    blobs: [
      { cx: 0.25, cy: 0.35, r: 0.45, color: '#2d8cff' },
      { cx: 0.75, cy: 0.65, r: 0.45, color: '#ff4db8' },
      { cx: 0.5, cy: 0.05, r: 0.3, color: '#7dd3ff', opacity: 0.6 },
    ],
  },
  {
    name: 'sonoma',
    base: ['#0f3d2e', '#082018'],
    blobs: [
      { cx: 0.2, cy: 0.8, r: 0.5, color: '#2fbf71' },
      { cx: 0.8, cy: 0.2, r: 0.42, color: '#3aa7d6' },
      { cx: 0.6, cy: 0.6, r: 0.3, color: '#f5e663', opacity: 0.35 },
    ],
  },
  {
    name: 'graphite',
    base: ['#2b2b2f', '#0b0b0d'],
    blobs: [
      { cx: 0.3, cy: 0.3, r: 0.5, color: '#6b6b74', opacity: 0.7 },
      { cx: 0.8, cy: 0.8, r: 0.45, color: '#3c3c44', opacity: 0.9 },
      { cx: 0.7, cy: 0.15, r: 0.25, color: '#9a9aa6', opacity: 0.35 },
    ],
    grain: 0.08,
  },
  {
    name: 'midnight',
    base: ['#070b1f', '#01030c'],
    blobs: [
      { cx: 0.2, cy: 0.2, r: 0.45, color: '#1a2f7a' },
      { cx: 0.85, cy: 0.75, r: 0.5, color: '#0f3b66', opacity: 0.9 },
      { cx: 0.55, cy: 0.5, r: 0.25, color: '#4a3cc9', opacity: 0.45 },
    ],
    grain: 0.05,
  },
  {
    name: 'ember',
    base: ['#3a0a0a', '#120404'],
    blobs: [
      { cx: 0.3, cy: 0.75, r: 0.5, color: '#ff5a1f' },
      { cx: 0.8, cy: 0.3, r: 0.4, color: '#ff2e63', opacity: 0.85 },
      { cx: 0.6, cy: 0.1, r: 0.25, color: '#ffc14d', opacity: 0.5 },
    ],
  },
  {
    name: 'mint',
    base: ['#d8f7f0', '#9fe3d6'],
    blobs: [
      { cx: 0.25, cy: 0.3, r: 0.45, color: '#7fe0c8' },
      { cx: 0.8, cy: 0.7, r: 0.45, color: '#5cc6ff', opacity: 0.7 },
      { cx: 0.6, cy: 0.15, r: 0.25, color: '#ffffff', opacity: 0.7 },
    ],
  },
  {
    name: 'lavender',
    base: ['#e9e3ff', '#c9b8ff'],
    blobs: [
      { cx: 0.3, cy: 0.7, r: 0.5, color: '#b79cff' },
      { cx: 0.8, cy: 0.25, r: 0.4, color: '#ff9ad5', opacity: 0.7 },
      { cx: 0.55, cy: 0.45, r: 0.25, color: '#ffffff', opacity: 0.6 },
    ],
  },
  {
    name: 'sand',
    base: ['#f6e7d2', '#e2c39b'],
    blobs: [
      { cx: 0.2, cy: 0.3, r: 0.45, color: '#f7c58a' },
      { cx: 0.8, cy: 0.75, r: 0.5, color: '#d99a6c', opacity: 0.8 },
      { cx: 0.6, cy: 0.2, r: 0.28, color: '#ffffff', opacity: 0.55 },
    ],
    grain: 0.06,
  },
  {
    name: 'ocean',
    base: ['#0a4f8a', '#02213f'],
    blobs: [
      { cx: 0.25, cy: 0.25, r: 0.45, color: '#1fa0e6' },
      { cx: 0.8, cy: 0.8, r: 0.5, color: '#0b7a7f' },
      { cx: 0.6, cy: 0.5, r: 0.25, color: '#9fe8ff', opacity: 0.35 },
    ],
  },
];

const WIDTH = 3840;
const HEIGHT = 2160;

function toSvg(spec: WallpaperSpec): string {
  const blur = Math.round(WIDTH * 0.09);
  const blobs = spec.blobs
    .map(
      (b) =>
        `<circle cx="${(b.cx * WIDTH).toFixed(0)}" cy="${(b.cy * HEIGHT).toFixed(0)}" r="${(b.r * WIDTH).toFixed(0)}" fill="${b.color}" fill-opacity="${b.opacity ?? 1}" />`,
    )
    .join('\n      ');
  const grain =
    spec.grain && spec.grain > 0
      ? `<rect width="${WIDTH}" height="${HEIGHT}" filter="url(#grain)" opacity="${spec.grain}" />`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${spec.base[0]}" />
      <stop offset="1" stop-color="${spec.base[1]}" />
    </linearGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="${blur}" />
    </filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#base)" />
  <g filter="url(#soft)">
      ${blobs}
  </g>
  ${grain}
</svg>`;
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outDir = path.join(root, 'Client', 'public', 'wallpapers');
  mkdirSync(outDir, { recursive: true });

  const existing = new Set(existsSync(outDir) ? readdirSync(outDir) : []);
  let generated = 0;
  for (const spec of specs) {
    const file = `${spec.name}.webp`;
    if (!force && existing.has(file)) continue;
    const started = Date.now();
    const svg = Buffer.from(toSvg(spec));
    const image = await sharp(svg, { density: 72 })
      .resize(WIDTH, HEIGHT, { fit: 'cover' })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    writeFileSync(path.join(outDir, file), image);
    generated += 1;
    console.log(`wallpaper ${file} (${Math.round(image.length / 1024)} KB, ${Date.now() - started} ms)`);
  }
  console.log(`${generated} generated, ${specs.length - generated} already present → ${path.relative(root, outDir)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
