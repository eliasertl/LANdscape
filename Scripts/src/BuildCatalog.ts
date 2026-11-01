import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifest, type CatalogEntry, type CatalogIndex } from '@landscape/shared';
import { writeZip } from '../../Server/src/Apps/ZipWriter';

/**
 * Builds the app catalog: every folder under Catalog/Apps (and
 * Catalog/Template) becomes Catalog/dist/<id>-<version>.zip, and
 * Catalog/index.json lists them with sha256, size and download URL.
 *
 *   npm run catalog
 *
 * The index is read live from GitHub by LANdscape and bundled in the image
 * as the offline fallback, so both the zips and the index are committed.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogDir = path.join(root, 'Catalog');
const distDir = path.join(catalogDir, 'dist');
const BASE_URL = process.env.CATALOG_BASE_URL ?? 'https://raw.githubusercontent.com/eliasertl/LANdscape/main/Catalog/dist';

function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else if (!entry.startsWith('.')) out.push(rel);
  }
  return out.sort();
}

function iconDataUrl(appDir: string, icon: string | undefined): string | null {
  if (!icon) return null;
  const file = path.join(appDir, icon);
  if (!existsSync(file)) return null;
  const ext = icon.split('.').pop()?.toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const bytes = readFileSync(file);
  return bytes.length > 64 * 1024 ? null : `data:${mime};base64,${bytes.toString('base64')}`;
}

const sources = [...(existsSync(path.join(catalogDir, 'Apps')) ? readdirSync(path.join(catalogDir, 'Apps')).map((n) => path.join(catalogDir, 'Apps', n)) : []), path.join(catalogDir, 'Template')].filter(
  (dir) => existsSync(path.join(dir, 'manifest.json')),
);

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
const apps: CatalogEntry[] = [];
for (const dir of sources) {
  const parsed = parseManifest(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (parsed.manifest === null) throw new Error(`${path.relative(root, dir)}: ${parsed.error}`);
  const manifest = parsed.manifest;
  // Deterministic: sorted names, fixed timestamps (ZipWriter), so the sha256 only changes with the content.
  const files = listFiles(dir).map((name) => ({ name, data: readFileSync(path.join(dir, name)) }));
  const zip = writeZip(files);
  const fileName = `${manifest.id}-${manifest.version}.zip`;
  writeFileSync(path.join(distDir, fileName), zip);
  apps.push({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description: manifest.description,
    categories: manifest.categories,
    icon: iconDataUrl(dir, manifest.icon),
    permissions: manifest.permissions,
    sha256: createHash('sha256').update(zip).digest('hex'),
    size: zip.length,
    downloadUrl: `${BASE_URL}/${fileName}`,
    ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
  });
  console.log(`${fileName}  ${zip.length} bytes  ${files.length} files`);
}
apps.sort((a, b) => a.name.localeCompare(b.name));
const previous = existsSync(path.join(catalogDir, 'index.json')) ? (JSON.parse(readFileSync(path.join(catalogDir, 'index.json'), 'utf8')) as CatalogIndex) : null;
const unchanged = previous && JSON.stringify(previous.apps) === JSON.stringify(apps);
const index: CatalogIndex = { schema: 1, generatedAt: unchanged ? previous.generatedAt : new Date().toISOString(), apps };
writeFileSync(path.join(catalogDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Catalog/index.json: ${apps.length} app${apps.length === 1 ? '' : 's'}`);
