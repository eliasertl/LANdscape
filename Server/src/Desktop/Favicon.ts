import { ICON_UPLOAD_MAX_BYTES } from '@landscape/shared';
import { decodeEntities } from './EmbedCheck';
import { IMAGE_EXTENSIONS, sniffImageType, isSafeSvg } from './DataFiles';
import { assertHttpUrl, fetchFollowing, readBodyLimited } from './SafeFetch';

export interface IconCandidate {
  href: string;
  rel: string;
  /** Largest declared dimension, or 0 when unknown. */
  size: number;
  type: string | null;
}

/**
 * Finds icon candidates in an HTML document, largest first. Prefers
 * apple-touch-icon and explicit sizes; falls back to /favicon.ico.
 */
export function discoverIconCandidates(html: string, baseUrl: string): IconCandidate[] {
  const candidates: IconCandidate[] = [];
  const linkRegex = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const tag = match[0];
    const rel = (readAttribute(tag, 'rel') ?? '').toLowerCase();
    if (!/\bicon\b|apple-touch-icon/.test(rel)) continue;
    if (/\bmask-icon\b/.test(rel)) continue;
    const href = readAttribute(tag, 'href');
    if (!href) continue;
    let resolved: string;
    try {
      resolved = new URL(decodeEntities(href), baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/.test(resolved)) continue;
    const sizes = (readAttribute(tag, 'sizes') ?? '').toLowerCase();
    let size = 0;
    if (sizes === 'any') size = 512;
    for (const part of sizes.split(/\s+/)) {
      const m = /^(\d+)x(\d+)$/.exec(part);
      if (m) size = Math.max(size, Number(m[1]), Number(m[2]));
    }
    if (size === 0 && rel.includes('apple-touch-icon')) size = 180;
    candidates.push({ href: resolved, rel, size, type: readAttribute(tag, 'type')?.toLowerCase() ?? null });
  }
  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  const deduped = candidates.filter((c, i) => candidates.findIndex((d) => d.href === c.href) === i);
  try {
    const fallback = new URL('/favicon.ico', baseUrl).toString();
    if (!deduped.some((c) => c.href === fallback)) deduped.push({ href: fallback, rel: 'fallback', size: 0, type: null });
  } catch {
    // ignore
  }
  return deduped;
}

function scoreCandidate(c: IconCandidate): number {
  let score = c.size;
  if (c.type === 'image/svg+xml' || c.href.toLowerCase().endsWith('.svg')) score += 256;
  if (c.rel.includes('apple-touch-icon')) score += 10;
  return score;
}

export function readAttribute(tag: string, name: string): string | null {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const match = regex.exec(tag);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

export interface FetchedIcon {
  bytes: Buffer;
  mime: string;
  extension: string;
}

/** Downloads the first usable candidate (valid image, within size limits). */
export async function fetchBestIcon(candidates: IconCandidate[]): Promise<FetchedIcon | null> {
  for (const candidate of candidates.slice(0, 6)) {
    try {
      const url = assertHttpUrl(candidate.href);
      const { response } = await fetchFollowing(url, { accept: 'image/*,*/*;q=0.5' });
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      const bytes = await readBodyLimited(response, ICON_UPLOAD_MAX_BYTES);
      if (bytes.length === 0) continue;
      const mime = sniffImageType(bytes);
      if (!mime) continue;
      if (mime === 'image/svg+xml' && !isSafeSvg(bytes.toString('utf8'))) continue;
      const extension = IMAGE_EXTENSIONS[mime];
      if (!extension) continue;
      return { bytes, mime, extension };
    } catch {
      continue;
    }
  }
  return null;
}
