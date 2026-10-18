import { describe, expect, it } from 'vitest';
import { discoverIconCandidates, readAttribute } from '@server/Desktop/Favicon';
import { isSafeSvg, isValidDataFileName, mimeForFileName, resolveDataFile, sniffImageType } from '@server/Desktop/DataFiles';
import path from 'node:path';

const html = `<!doctype html><html><head>
<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">
<link rel='shortcut icon' href='/favicon.ico'>
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="icon" href="/icon-512.png" sizes="512x512">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="mask-icon" href="/mask.svg" color="#000">
<link rel="stylesheet" href="/style.css">
<link rel=icon href=//cdn.example/unquoted.png sizes=64x64>
</head><body></body></html>`;

describe('favicon discovery', () => {
  it('prefers the largest declared icon, then SVGs, keeps /favicon.ico as the fallback', () => {
    const candidates = discoverIconCandidates(html, 'https://site.example/app/');
    const hrefs = candidates.map((c) => c.href);
    expect(hrefs[0]).toBe('https://site.example/icon-512.png');
    expect(hrefs[1]).toBe('https://site.example/icon.svg');
    expect(hrefs[2]).toBe('https://site.example/apple-touch-icon.png');
    expect(hrefs).toContain('https://cdn.example/unquoted.png');
    expect(hrefs).not.toContain('https://site.example/mask.svg');
    expect(hrefs).not.toContain('https://site.example/style.css');
    expect(hrefs[hrefs.length - 1]).toBe('https://site.example/favicon.ico');
    // the explicit shortcut icon and the fallback are the same URL: deduplicated
    expect(hrefs.filter((h) => h === 'https://site.example/favicon.ico')).toHaveLength(1);
  });

  it('falls back to /favicon.ico for pages without icon links', () => {
    const candidates = discoverIconCandidates('<html></html>', 'http://10.0.0.5:8096/web/index.html');
    expect(candidates).toEqual([{ href: 'http://10.0.0.5:8096/favicon.ico', rel: 'fallback', size: 0, type: null }]);
  });

  it('reads attributes in any quoting style', () => {
    expect(readAttribute('<link rel="icon" href="/a.png">', 'href')).toBe('/a.png');
    expect(readAttribute("<link rel='icon' href='/b.png'>", 'href')).toBe('/b.png');
    expect(readAttribute('<link rel=icon href=/c.png>', 'href')).toBe('/c.png');
    expect(readAttribute('<link rel=icon>', 'href')).toBeNull();
  });
});

describe('data file validation', () => {
  it('accepts simple file names and rejects traversal', () => {
    expect(isValidDataFileName('favicon-abc.png')).toBe(true);
    expect(isValidDataFileName('upload-1a2b.webp')).toBe(true);
    expect(isValidDataFileName('../secret')).toBe(false);
    expect(isValidDataFileName('a/b.png')).toBe(false);
    expect(isValidDataFileName('a\\b.png')).toBe(false);
    expect(isValidDataFileName('.hidden')).toBe(false);
    expect(isValidDataFileName('')).toBe(false);
    expect(isValidDataFileName('x'.repeat(200))).toBe(false);
  });

  it('resolves inside the base directory only', () => {
    const base = path.join('/data', 'icons');
    expect(resolveDataFile(base, 'a.png')).toBe(path.resolve(base, 'a.png'));
    expect(() => resolveDataFile(base, '../landscape.db')).toThrow();
    expect(() => resolveDataFile(base, 'sub/a.png')).toThrow();
  });

  it('sniffs image types from magic bytes', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('image/svg+xml');
    expect(sniffImageType(Buffer.from('<html><svg>'))).toBeNull();
    expect(sniffImageType(Buffer.from('plain text'))).toBeNull();
  });

  it('rejects SVGs with scripts or event handlers', () => {
    expect(isSafeSvg('<svg><circle r="1"/></svg>')).toBe(true);
    expect(isSafeSvg('<svg><script>alert(1)</script></svg>')).toBe(false);
    expect(isSafeSvg('<svg onload="alert(1)"></svg>')).toBe(false);
    expect(isSafeSvg('<svg><a href="javascript:alert(1)"></a></svg>')).toBe(false);
    expect(isSafeSvg('<svg><foreignObject></foreignObject></svg>')).toBe(false);
  });

  it('maps extensions to mime types', () => {
    expect(mimeForFileName('a.PNG')).toBe('image/png');
    expect(mimeForFileName('a.svg')).toBe('image/svg+xml');
    expect(mimeForFileName('a.bin')).toBe('application/octet-stream');
  });
});
