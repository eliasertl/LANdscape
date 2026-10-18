import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database } from '../../Server/src/Db/Database';
import { createRepositories } from '../../Server/src/Db/Repositories';

/**
 * Dev-only: loads shortcuts from Scratch/Seed.json into the local data
 * directory's database. Never used by the product; Scratch/ is gitignored.
 *
 *   npm run seed            (reads DATA_DIR from Scratch/.env, default ./.data)
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const seedFile = path.join(root, 'Scratch', 'Seed.json');
if (!existsSync(seedFile)) {
  console.log(`No ${path.relative(root, seedFile)} found; nothing to seed.`);
  process.exit(0);
}
const dataDir = path.resolve(root, process.env.DATA_DIR ?? '.data');
const dbFile = path.join(dataDir, 'landscape.db');

interface SeedEntry {
  name: string;
  url: string;
}

const entries = JSON.parse(readFileSync(seedFile, 'utf8')) as SeedEntry[];
const db = new Database(dbFile);
const repos = createRepositories(db);
const existing = new Set(repos.shortcuts.list().map((s) => s.url));
let created = 0;
entries.forEach((entry, index) => {
  if (!entry.name || !entry.url || existing.has(entry.url)) return;
  repos.shortcuts.create({
    name: entry.name,
    url: entry.url,
    iconMode: 'favicon',
    iconFile: null,
    x: 24 + Math.floor(index / 6) * 96,
    y: 24 + (index % 6) * 112 + 400,
    embeddable: 'unknown',
    embedReason: 'Seeded; re-check from the context menu.',
    openMode: 'auto',
  });
  created += 1;
});
db.close();
console.log(`${created} shortcut(s) seeded into ${path.relative(root, dbFile)} (${entries.length - created} skipped). Use "Re-check embedding" and "Refresh icon" in the app.`);
