import path from 'node:path';
import { EXTENSION_MIME } from '../Desktop/DataFiles';

/**
 * Builds the document of an app surface. The frame is sandboxed without
 * allow-same-origin, so it could never load the bundle's files itself
 * (no cookie, opaque origin). Instead the server inlines every local
 * script and stylesheet, turns local images and fonts into data: URLs,
 * injects the frame context and the SDK runtime, and the response's CSP
 * forbids all network access. See Docs/AppPlatform.md.
 */
export interface FrameBuildInput {
  html: string;
  /** Resolves a bundle-relative path (relative to the entry's folder) to its bytes, or null when missing. */
  read: (bundlePath: string) => Buffer | null;
  entryDir: string;
  context: Record<string, unknown>;
  runtime: string;
}

export const FRAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
].join('; ');

const DATA_URL_LIMIT = 4 * 1024 * 1024;

function isLocal(src: string): boolean {
  return !/^(https?:|data:|blob:|\/\/|#|javascript:)/i.test(src.trim());
}

function resolveRelative(entryDir: string, src: string): string {
  const clean = src.trim().replace(/^\.\//, '').split(/[?#]/)[0] ?? '';
  if (clean.startsWith('/')) return clean.slice(1);
  return path.posix.normalize(path.posix.join(entryDir, clean));
}

function mimeFor(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[ext] ?? { woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', json: 'application/json', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'video/webm', mp4: 'video/mp4' }[ext] ?? 'application/octet-stream';
}

/** Escapes a string for an inline <script>: "</script>" and "<!--" must not appear. */
function inlineScriptSafe(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

function dataUrl(read: FrameBuildInput['read'], entryDir: string, src: string): string | null {
  const file = resolveRelative(entryDir, src);
  const bytes = read(file);
  if (!bytes || bytes.length > DATA_URL_LIMIT) return null;
  return `data:${mimeFor(file)};base64,${bytes.toString('base64')}`;
}

/** Rewrites url(...) references in CSS to data: URLs. */
function inlineCssUrls(css: string, read: FrameBuildInput['read'], entryDir: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (match, quote: string, src: string) => {
    if (!isLocal(src)) return match;
    const url = dataUrl(read, entryDir, src);
    return url ? `url(${quote}${url}${quote})` : match;
  });
}

export function buildFrameDocument(input: FrameBuildInput): string {
  const { read, entryDir } = input;
  let html = input.html;

  // <script src="local.js"> → inline. Module scripts keep type="module" (inline modules are fine).
  html = html.replace(/<script\b([^>]*)\ssrc=(['"])([^'"]+)\2([^>]*)>\s*<\/script>/gi, (match, before: string, _q: string, src: string, after: string) => {
    if (!isLocal(src)) return '<!-- external script removed: apps have no network access -->';
    const bytes = read(resolveRelative(entryDir, src));
    if (!bytes) return `<!-- missing script: ${src} -->`;
    return `<script${before}${after}>${inlineScriptSafe(bytes.toString('utf8'))}</script>`;
  });
  // <link rel="stylesheet" href="local.css"> → <style>.
  html = html.replace(/<link\b[^>]*rel=(['"])stylesheet\1[^>]*>/gi, (match) => {
    const href = /href=(['"])([^'"]+)\1/i.exec(match)?.[2];
    if (!href || !isLocal(href)) return '<!-- external stylesheet removed -->';
    const bytes = read(resolveRelative(entryDir, href));
    if (!bytes) return `<!-- missing stylesheet: ${href} -->`;
    return `<style>${inlineCssUrls(bytes.toString('utf8'), read, path.posix.dirname(resolveRelative(entryDir, href)))}</style>`;
  });
  // Inline <style> blocks may reference local files too.
  html = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => `<style${attrs}>${inlineCssUrls(css, read, entryDir)}</style>`);
  // <img src>, <source src>, <video/audio src>, <link rel=icon href> → data: URLs.
  html = html.replace(/<(img|source|video|audio|track)\b([^>]*)\ssrc=(['"])([^'"]+)\3/gi, (match, tag: string, before: string, q: string, src: string) => {
    if (!isLocal(src)) return match;
    const url = dataUrl(read, entryDir, src);
    return url ? `<${tag}${before} src=${q}${url}${q}` : match;
  });
  html = html.replace(/<link\b([^>]*)\shref=(['"])([^'"]+)\2([^>]*)>/gi, (match, before: string, q: string, href: string, after: string) => {
    if (!/rel=(['"])(icon|apple-touch-icon)\1/i.test(before + after) || !isLocal(href)) return match;
    const url = dataUrl(read, entryDir, href);
    return url ? `<link${before} href=${q}${url}${q}${after}>` : match;
  });

  const bootstrap = `<script>window.__landscapeFrame=${inlineScriptSafe(JSON.stringify(input.context))};</script><script>${inlineScriptSafe(input.runtime)}</script>`;
  // No <base>: the CSP's base-uri 'none' forbids one, and every local reference was inlined above anyway.
  if (/<head\b[^>]*>/i.test(html)) html = html.replace(/<head\b[^>]*>/i, (m) => `${m}${bootstrap}`);
  else if (/<html\b[^>]*>/i.test(html)) html = html.replace(/<html\b[^>]*>/i, (m) => `${m}<head>${bootstrap}</head>`);
  else html = `<!doctype html><html><head>${bootstrap}</head><body>${html}</body></html>`;
  return html;
}
